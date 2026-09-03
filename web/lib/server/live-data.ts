import 'server-only';

import { cache } from 'react';
import { ZeroAddress } from 'ethers';

import {
  DEVICES,
  SETTLEMENTS,
  RECORDED_SETTLEMENT,
  type Device,
  type Settlement,
  type NetworkTotals,
  type RewardAccount,
} from '@/lib/data';
import { fetchLiveChainSnapshot, type LiveChainSnapshot } from './onchain';

/**
 * Maps live chain reads onto the exact DTO shapes the dashboard already renders
 * (`Device`, `Settlement`, `NetworkTotals`, `RewardAccount` from `lib/data.ts`), so no
 * component needs to change — only the page-level data source does.
 *
 * Every field falls back to the recorded Phase 2 settlement if its live read failed, and
 * `provenance` is set per the truthful rule the dashboard promises:
 *   - 'live'     the value was read from chain during this request
 *   - 'recorded' we fell back to the known verified historical record
 *   - 'derived'  computed from a mix of the above
 *
 * The proof record itself (tx hashes, blocks, Merkle/continuity metadata) is never
 * reconstructed here — it always comes from the recorded settlement, per product
 * requirement: Nodra does not regenerate a proof in the browser.
 */

export interface DegradedState {
  source: boolean;
  creditcoin: boolean;
  sourceError?: string;
  creditcoinError?: string;
}

export interface ProtocolLiveState {
  owner?: string;
  paused?: boolean;
  rewardRatePerUnitWei?: bigint;
  sourceDeviceRegistry?: string;
  provenance: 'live' | 'recorded';
}

export interface LiveDashboardData {
  devices: Device[];
  settlements: Settlement[];
  totals: NetworkTotals;
  rewardAccounts: RewardAccount[];
  protocolState: ProtocolLiveState;
  degraded: DegradedState;
  fetchedAt: number;
}

function isRegistered(address: string | undefined): address is string {
  return typeof address === 'string' && address !== ZeroAddress;
}

function mapDevice(recorded: Device, snapshot: LiveChainSnapshot): Device {
  const { source, creditcoin } = snapshot;

  const sourceOperator = isRegistered(source.deviceOperator) ? source.deviceOperator : recorded.sourceOperator;
  const rewardOperator = isRegistered(creditcoin.deviceOperator)
    ? creditcoin.deviceOperator
    : recorded.rewardOperator;

  const liveIdentity = isRegistered(source.deviceOperator) && isRegistered(creditcoin.deviceOperator);

  // Prefer summing live per-device events (Sepolia activity, or Creditcoin settlements as a
  // second source) over the recorded total; only fall back when both are unavailable.
  const liveUnitsFromSource = source.activityEvents?.reduce((sum, e) => sum + e.activityUnits, 0);
  const liveUnitsFromSettlement = creditcoin.settlementEvents?.reduce((sum, e) => sum + e.activityUnits, 0);
  const liveUnits = liveUnitsFromSource ?? liveUnitsFromSettlement;

  const liveSessions = source.nextSessionId;
  const registered = isRegistered(sourceOperator) && isRegistered(rewardOperator);

  return {
    ...recorded,
    sourceOperator,
    rewardOperator,
    status: registered ? 'active' : 'idle',
    totalActivityUnits: liveUnits ?? recorded.totalActivityUnits,
    sessions: liveSessions ?? recorded.sessions,
    lastSessionId: liveSessions !== undefined ? (liveSessions > 0 ? liveSessions - 1 : null) : recorded.lastSessionId,
    provenance: liveIdentity && liveUnits !== undefined ? 'live' : 'recorded',
    registrationConfirmedLive: source.registrationConfirmedLive,
  };
}

/** The settlement/proof record. Tx hashes, blocks, and proof metadata stay recorded by
 *  design; we only attach a live cross-check confirming the same hash still resolves
 *  on-chain, never a re-derived or regenerated proof. */
function mapSettlement(recorded: Settlement, snapshot: LiveChainSnapshot): Settlement {
  const liveQueryId = snapshot.creditcoin.recordedQueryId;
  return {
    ...recorded,
    // provenance intentionally stays 'recorded': this is the historical proof this
    // dashboard exists to display, not a value we re-derive on every request.
    sourceConfirmedLive: snapshot.source.recordedTxConfirmed,
    settlementConfirmedLive: snapshot.creditcoin.recordedTxConfirmed,
    queryIdConfirmedLive: liveQueryId ? liveQueryId.toLowerCase() === recorded.queryId.toLowerCase() : undefined,
  };
}

function mapTotals(devices: Device[], settlements: Settlement[], snapshot: LiveChainSnapshot): NetworkTotals {
  const { creditcoin } = snapshot;

  const totalActivityUnits =
    creditcoin.totalActivityUnitsSettled ?? settlements.reduce((sum, s) => sum + s.activityUnits, 0);
  const totalRewardWei = creditcoin.totalRewardsAccruedWei ?? settlements.reduce((sum, s) => sum + s.rewardWei, 0n);
  const verifiedProofs = Math.max(creditcoin.settlementEvents?.length ?? 0, settlements.length);

  return {
    deviceCount: devices.length,
    activeDeviceCount: devices.filter((d) => d.status === 'active').length,
    totalActivityUnits,
    verifiedProofs,
    totalRewardWei,
    provenance: 'derived',
  };
}

function mapRewardAccounts(settlements: Settlement[], snapshot: LiveChainSnapshot): RewardAccount[] {
  const { creditcoin } = snapshot;
  const byOperator = new Map<string, RewardAccount>();

  for (const settlement of settlements) {
    const existing = byOperator.get(settlement.rewardOperator);
    const liveSettlementsForOperator = creditcoin.settlementEvents?.filter(
      (e) => e.operator.toLowerCase() === settlement.rewardOperator.toLowerCase(),
    );

    if (existing) {
      existing.settlements += 1;
      continue;
    }

    const isThisOperator = settlement.rewardOperator.toLowerCase() === RECORDED_SETTLEMENT.rewardOperator.toLowerCase();
    const livePending = isThisOperator ? creditcoin.pendingRewardsWei : undefined;

    byOperator.set(settlement.rewardOperator, {
      operator: settlement.rewardOperator,
      totalWei: livePending ?? settlement.rewardWei,
      settlements: liveSettlementsForOperator?.length || 1,
      provenance: livePending !== undefined ? 'live' : 'recorded',
    });
  }

  return [...byOperator.values()];
}

async function loadDashboardData(): Promise<LiveDashboardData> {
  // Exactly one registered device today; fetching per-device keeps this correct if a
  // second device is registered later, at the cost of one extra pair of RPC round trips
  // per additional device.
  const snapshots = await Promise.all(
    DEVICES.map((device) => {
      const settlement = SETTLEMENTS.find((s) => s.deviceId === device.id) ?? RECORDED_SETTLEMENT;
      return fetchLiveChainSnapshot(device.id, settlement.sessionId, device.rewardOperator);
    }),
  );

  const snapshotByDeviceId = new Map(DEVICES.map((device, i) => [device.id, snapshots[i]]));
  const primarySnapshot = snapshots[0];

  const devices = DEVICES.map((device) => {
    const snapshot = snapshotByDeviceId.get(device.id);
    return snapshot ? mapDevice(device, snapshot) : device;
  });

  const settlements = SETTLEMENTS.map((settlement) => {
    const snapshot = snapshotByDeviceId.get(settlement.deviceId);
    return snapshot ? mapSettlement(settlement, snapshot) : settlement;
  });

  const totals = primarySnapshot ? mapTotals(devices, settlements, primarySnapshot) : mapTotalsRecorded(devices, settlements);
  const rewardAccounts = primarySnapshot ? mapRewardAccounts(settlements, primarySnapshot) : mapRewardAccountsRecorded(settlements);
  const protocolState = mapProtocolState(primarySnapshot);

  return {
    devices,
    settlements,
    totals,
    rewardAccounts,
    protocolState,
    degraded: {
      source: !primarySnapshot?.source.reachable,
      creditcoin: !primarySnapshot?.creditcoin.reachable,
      sourceError: primarySnapshot?.source.error,
      creditcoinError: primarySnapshot?.creditcoin.error,
    },
    fetchedAt: primarySnapshot?.fetchedAt ?? Date.now(),
  };
}

function mapProtocolState(snapshot: LiveChainSnapshot | undefined): ProtocolLiveState {
  const cc = snapshot?.creditcoin;
  const live =
    cc?.owner !== undefined &&
    cc?.paused !== undefined &&
    cc?.rewardRatePerUnit !== undefined &&
    cc?.sourceDeviceRegistry !== undefined;

  return {
    owner: cc?.owner,
    paused: cc?.paused,
    rewardRatePerUnitWei: cc?.rewardRatePerUnit,
    sourceDeviceRegistry: cc?.sourceDeviceRegistry,
    provenance: live ? 'live' : 'recorded',
  };
}

function mapTotalsRecorded(devices: Device[], settlements: Settlement[]): NetworkTotals {
  return {
    deviceCount: devices.length,
    activeDeviceCount: devices.filter((d) => d.status === 'active').length,
    totalActivityUnits: settlements.reduce((sum, s) => sum + s.activityUnits, 0),
    totalRewardWei: settlements.reduce((sum, s) => sum + s.rewardWei, 0n),
    verifiedProofs: settlements.length,
    provenance: 'derived',
  };
}

function mapRewardAccountsRecorded(settlements: Settlement[]): RewardAccount[] {
  const byOperator = new Map<string, RewardAccount>();
  for (const settlement of settlements) {
    const existing = byOperator.get(settlement.rewardOperator);
    if (existing) {
      existing.totalWei += settlement.rewardWei;
      existing.settlements += 1;
    } else {
      byOperator.set(settlement.rewardOperator, {
        operator: settlement.rewardOperator,
        totalWei: settlement.rewardWei,
        settlements: 1,
        provenance: 'derived',
      });
    }
  }
  return [...byOperator.values()];
}

/**
 * Single entry point for every dashboard page. Cached per-request (React `cache()`) so
 * rendering the layout and the page in the same request does not double the RPC calls;
 * route-level `export const revalidate` in each page throttles calls across requests.
 */
export const getLiveDashboardData = cache(loadDashboardData);
