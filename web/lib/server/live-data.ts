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
import { fromDeviceId } from '@/lib/device-id';
import {
  discoverRegisteredDevices,
  discoverSettlements,
  fetchLiveChainSnapshot,
  findSourceEvents,
  type LiveChainSnapshot,
} from './onchain';

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
    const key = settlement.rewardOperator.toLowerCase();
    const isThisOperator = key === RECORDED_SETTLEMENT.rewardOperator.toLowerCase();
    // pendingRewardsWei, when it applies, is already the contract's own running total for
    // this operator across every settlement it has — summing settlement.rewardWei on top of
    // it as more of that operator's settlements are seen would double-count.
    const livePending = isThisOperator ? creditcoin.pendingRewardsWei : undefined;
    const isLive = livePending !== undefined || settlement.provenance === 'live';

    const existing = byOperator.get(key);
    if (existing) {
      existing.settlements += 1;
      if (livePending === undefined) existing.totalWei += settlement.rewardWei;
      if (isLive) existing.provenance = 'live';
      continue;
    }

    const liveSettlementsForOperator = creditcoin.settlementEvents?.filter(
      (e) => e.operator.toLowerCase() === key,
    );

    byOperator.set(key, {
      operator: settlement.rewardOperator,
      totalWei: livePending ?? settlement.rewardWei,
      settlements: liveSettlementsForOperator?.length || 1,
      provenance: isLive ? 'live' : 'recorded',
    });
  }

  return [...byOperator.values()];
}

async function loadDiscoveredDevices(): Promise<Device[]> {
  const knownIds = new Set(DEVICES.map((d) => d.id.toLowerCase()));
  const { devices: discovered } = await discoverRegisteredDevices();
  const fresh = discovered.filter((d) => !knownIds.has(d.deviceId.toLowerCase()));
  if (fresh.length === 0) return [];

  // Full snapshot per device, same as a known device gets — not just its registration
  // status — so a self-registered device's real activity/sessions show up here too,
  // instead of being stuck at 0 forever. The rewardOperator argument only feeds this
  // snapshot's (unused, for our purposes) pendingRewards(...) read, so sourceOperator is a
  // safe placeholder when we don't yet know whether — or to whom — Creditcoin registered it.
  const snapshots = await Promise.all(
    fresh.map((d) => fetchLiveChainSnapshot(d.deviceId, 0, d.sourceOperator)),
  );

  return fresh.map((discoveredDevice, i): Device => {
    const snapshot = snapshots[i];
    const rewardOperator = isRegistered(snapshot.creditcoin.deviceOperator)
      ? snapshot.creditcoin.deviceOperator
      : ZeroAddress;
    const registered = isRegistered(discoveredDevice.sourceOperator) && isRegistered(rewardOperator);
    const liveUnits =
      snapshot.source.activityEvents?.reduce((sum, e) => sum + e.activityUnits, 0) ??
      snapshot.creditcoin.settlementEvents?.reduce((sum, e) => sum + e.activityUnits, 0);
    const liveSessions = snapshot.source.nextSessionId;

    return {
      id: discoveredDevice.deviceId,
      label: discoveredDevice.label,
      kind: 'Registered device',
      sourceNetwork: 'sepolia',
      sourceOperator: discoveredDevice.sourceOperator,
      rewardOperator,
      status: registered ? 'active' : 'idle',
      totalActivityUnits: liveUnits ?? 0,
      sessions: liveSessions ?? 0,
      lastSessionId: liveSessions !== undefined ? (liveSessions > 0 ? liveSessions - 1 : null) : null,
      provenance: 'live',
      registrationTxHash: discoveredDevice.registrationTxHash,
      registrationConfirmedLive: true,
    };
  });
}

/**
 * Scans Creditcoin for every ActivitySettled event and turns any not already covered by
 * the static SETTLEMENTS list into full Settlement records, so a device's real reward
 * shows up on Activity/Rewards/Proofs without a code change. `proof` stays undefined for
 * these — this dashboard never re-queries Attestcoin's proof builder, so it only has real
 * Merkle/continuity parameters for the one recorded run.
 */
async function loadDiscoveredSettlements(devices: Device[]): Promise<Settlement[]> {
  const knownPairs = new Set(SETTLEMENTS.map((s) => `${s.deviceId.toLowerCase()}:${s.sessionId}`));
  const { settlements: discovered } = await discoverSettlements();
  const fresh = discovered.filter((s) => !knownPairs.has(`${s.deviceId.toLowerCase()}:${s.sessionId}`));
  if (fresh.length === 0) return [];

  const sourceRefs = await findSourceEvents(fresh.map((s) => ({ deviceId: s.deviceId, sessionId: s.sessionId })));
  const deviceById = new Map(devices.map((d) => [d.id.toLowerCase(), d]));

  return fresh
    .map((s): Settlement | null => {
      const ref = sourceRefs.get(`${s.deviceId.toLowerCase()}:${s.sessionId}`);
      // Without the matching source event we'd have to render an empty tx hash/link —
      // skip it rather than show something broken. Rare: it only happens if the report
      // was further back than the rolling lookback window while the settlement wasn't.
      if (!ref) return null;

      const device = deviceById.get(s.deviceId.toLowerCase());
      let label = device?.label;
      if (!label) {
        try {
          label = fromDeviceId(s.deviceId) || s.deviceId;
        } catch {
          label = s.deviceId;
        }
      }

      return {
        deviceId: s.deviceId,
        deviceLabel: label,
        sessionId: s.sessionId,
        activityUnits: s.activityUnits,
        rewardWei: s.rewardWei,
        sourceTxHash: ref.sourceTxHash,
        sourceBlock: ref.sourceBlock,
        settlementTxHash: s.settlementTxHash,
        settlementBlock: s.settlementBlock,
        sourceOperator: device?.sourceOperator ?? s.operator,
        rewardOperator: s.operator,
        proof: undefined,
        queryId: s.queryId,
        provenance: 'live',
        sourceConfirmedLive: true,
        settlementConfirmedLive: true,
        queryIdConfirmedLive: true,
      };
    })
    .filter((s): s is Settlement => s !== null);
}

async function loadDashboardData(): Promise<LiveDashboardData> {
  // Exactly one baked-in device (the recorded Phase 2 settlement); fetching per-device
  // keeps this correct as more are registered, at the cost of one extra pair of RPC round
  // trips per additional known device. Devices registered through the UI beyond this list
  // are found separately, by loadDiscoveredDevices() below.
  const [snapshots, discoveredDevices] = await Promise.all([
    Promise.all(
      DEVICES.map((device) => {
        const settlement = SETTLEMENTS.find((s) => s.deviceId === device.id) ?? RECORDED_SETTLEMENT;
        return fetchLiveChainSnapshot(device.id, settlement.sessionId, device.rewardOperator);
      }),
    ),
    loadDiscoveredDevices(),
  ]);

  const snapshotByDeviceId = new Map(DEVICES.map((device, i) => [device.id, snapshots[i]]));
  const primarySnapshot = snapshots[0];

  const devices = [
    ...DEVICES.map((device) => {
      const snapshot = snapshotByDeviceId.get(device.id);
      return snapshot ? mapDevice(device, snapshot) : device;
    }),
    ...discoveredDevices,
  ];

  // Static settlements first, so settlements[0] (the Overview page's featured "NODE-001 ->
  // Reward" story) is always the recorded one, never whichever discovered device happened
  // to settle most recently.
  const settlements = [
    ...SETTLEMENTS.map((settlement) => {
      const snapshot = snapshotByDeviceId.get(settlement.deviceId);
      return snapshot ? mapSettlement(settlement, snapshot) : settlement;
    }),
    ...(await loadDiscoveredSettlements(devices)),
  ];

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
 * rendering the layout and the page in the same request does not double the RPC calls.
 *
 * Every dashboard page sets `export const dynamic = 'force-dynamic'` rather than a
 * time-based `revalidate` — this data reflects on-chain discovery (which devices exist,
 * what they've done), and a device registered or settled after a page's last static build
 * must show up on the very next request, not whenever a background ISR revalidation
 * happens to fire. The cost is a fresh RPC round trip per page load; RPC_TIMEOUT_MS and the
 * graceful per-field degradation throughout onchain.ts keep that bounded and non-fatal.
 */
export const getLiveDashboardData = cache(loadDashboardData);
