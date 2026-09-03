/**
 * Nodra data layer.
 *
 * Every value the UI renders carries a `provenance` marker so the interface can never
 * present recorded data as if it were a live read:
 *
 *   'recorded' — a real, verified transaction that actually happened on testnet. Real, but
 *                captured at a point in time rather than fetched just now.
 *   'live'     — fetched from chain during this request.
 *   'derived'  — computed from the above (e.g. totals, reward maths).
 *
 * Nothing in this file is invented. The recorded settlement below is the genuine Phase 2
 * end-to-end run: a Sepolia activity event, attested by Attestcoin, verified through the
 * 0xFD2 precompile, and settled on Creditcoin.
 *
 * This module is the seam for going fully dynamic later: replace the bodies of the
 * `get*` functions with on-chain reads and the UI needs no changes.
 */

import { REWARD, SOURCE_CHAIN_KEY } from './protocol';

export type Provenance = 'live' | 'recorded' | 'derived';

export interface ProofDetail {
  chainKey: number;
  headerNumber: number;
  transactionIndex: number;
  merkleSiblings: number;
  continuityRoots: number;
}

export interface Settlement {
  deviceId: string;
  deviceLabel: string;
  sessionId: number;
  activityUnits: number;
  rewardWei: bigint;
  sourceTxHash: string;
  sourceBlock: number;
  settlementTxHash: string;
  settlementBlock: number;
  sourceOperator: string;
  rewardOperator: string;
  proof: ProofDetail;
  provenance: Provenance;
}

export interface Device {
  id: string;
  label: string;
  kind: string;
  sourceNetwork: 'sepolia';
  sourceOperator: string;
  rewardOperator: string;
  status: 'active' | 'idle';
  totalActivityUnits: number;
  sessions: number;
  lastSessionId: number | null;
  provenance: Provenance;
}

/**
 * The verified Phase 2 settlement. Real transactions, recorded from the live run.
 *
 * Proof metadata (transactionIndex, merkleSiblings, continuityRoots) is reported by the
 * Attestcoin proof builder for this exact transaction.
 */
export const RECORDED_SETTLEMENT: Settlement = {
  deviceId: '0x4e4f44452d303031000000000000000000000000000000000000000000000000',
  deviceLabel: 'NODE-001',
  sessionId: 0,
  activityUnits: 250,
  rewardWei: 250_000_000_000_000n,
  sourceTxHash: '0x7bea5e02ea3faab3470c3af2d1f029b0f25b6b0c13eee5f1feafdd31dc75eb6d',
  sourceBlock: 11_628_740,
  settlementTxHash: '0x058d58d7e0655f6bd06e44d3722c79cab866e184e760bbdf28b09ef877d0e200',
  settlementBlock: 5_425_099,
  sourceOperator: '0x554C30D56c6B6E5b5cF8D3783BF12d5b860aEa8b',
  rewardOperator: '0x1bb2Bf0eD3f218E29039432F0494380f892AfCB0',
  proof: {
    chainKey: SOURCE_CHAIN_KEY,
    headerNumber: 11_628_740,
    transactionIndex: 146,
    merkleSiblings: 8,
    continuityRoots: 1,
  },
  provenance: 'recorded',
};

export const DEVICES: Device[] = [
  {
    id: RECORDED_SETTLEMENT.deviceId,
    label: 'NODE-001',
    kind: 'Connectivity node',
    sourceNetwork: 'sepolia',
    sourceOperator: RECORDED_SETTLEMENT.sourceOperator,
    rewardOperator: RECORDED_SETTLEMENT.rewardOperator,
    status: 'active',
    totalActivityUnits: RECORDED_SETTLEMENT.activityUnits,
    sessions: 1,
    lastSessionId: RECORDED_SETTLEMENT.sessionId,
    provenance: 'recorded',
  },
];

export const SETTLEMENTS: Settlement[] = [RECORDED_SETTLEMENT];

export interface NetworkTotals {
  deviceCount: number;
  activeDeviceCount: number;
  totalActivityUnits: number;
  verifiedProofs: number;
  totalRewardWei: bigint;
  provenance: Provenance;
}

export function getTotals(): NetworkTotals {
  const totalActivityUnits = SETTLEMENTS.reduce((sum, s) => sum + s.activityUnits, 0);
  const totalRewardWei = SETTLEMENTS.reduce((sum, s) => sum + s.rewardWei, 0n);

  return {
    deviceCount: DEVICES.length,
    activeDeviceCount: DEVICES.filter((d) => d.status === 'active').length,
    totalActivityUnits,
    verifiedProofs: SETTLEMENTS.length,
    totalRewardWei,
    provenance: 'derived',
  };
}

export function getDevice(label: string): Device | undefined {
  return DEVICES.find((d) => d.label.toLowerCase() === label.toLowerCase());
}

export function getSettlementsForDevice(deviceId: string): Settlement[] {
  return SETTLEMENTS.filter((s) => s.deviceId === deviceId);
}

/** Reward maths, mirroring `activityUnits * rewardRatePerUnit` in the controller. */
export function expectedRewardWei(activityUnits: number): bigint {
  return BigInt(activityUnits) * REWARD.ratePerUnit;
}

export interface RewardAccount {
  operator: string;
  totalWei: bigint;
  settlements: number;
  provenance: Provenance;
}

export function getRewardAccounts(): RewardAccount[] {
  const byOperator = new Map<string, RewardAccount>();

  for (const settlement of SETTLEMENTS) {
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
