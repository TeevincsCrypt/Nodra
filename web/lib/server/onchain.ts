import 'server-only';

import { Contract, JsonRpcProvider, solidityPackedKeccak256, type Log } from 'ethers';

import { NETWORKS } from '@/lib/protocol';
import { RECORDED_SETTLEMENT } from '@/lib/data';
import { getCreditcoinConfig, getSourceChainConfig, RPC_TIMEOUT_MS } from './config';
import { DEVICE_REGISTRY_ABI, INCENTIVE_CONTROLLER_ABI } from './abi';

/**
 * Live on-chain reads for the Nodra dashboard.
 *
 * Every exported read here is independent and non-throwing: a dead RPC, a rate limit, or
 * a malformed response degrades that single field to `undefined` rather than crashing the
 * page. Callers decide how to fall back (typically to the recorded Phase 2 settlement in
 * `lib/data.ts`).
 *
 * Nothing here regenerates or re-verifies an Attestcoin proof — that would misrepresent what
 * the browser is doing. `verifyRecordedTransactions` only confirms that the two known,
 * already-verified transaction hashes still resolve on-chain to the values we display.
 */

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Runs `promise` to completion, converting a throw into a tuple instead of propagating it. */
async function settle<T>(promise: Promise<T>): Promise<[T | undefined, string | undefined]> {
  try {
    return [await promise, undefined];
  } catch (err) {
    return [undefined, describeError(err)];
  }
}

function makeProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
  // staticNetwork skips ethers' automatic eth_chainId probe on first use — one fewer
  // round trip per page render, and it never has to guess the network from a slow RPC.
  return new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
}

export interface ActivityEventDTO {
  sessionId: number;
  activityUnits: number;
  txHash: string;
  blockNumber: number;
}

export interface SourceChainSnapshot {
  reachable: boolean;
  error?: string;
  deviceOperator?: string;
  nextSessionId?: number;
  activityEvents?: ActivityEventDTO[];
  recordedTxConfirmed?: boolean;
}

export interface SettlementEventDTO {
  deviceId: string;
  sessionId: number;
  operator: string;
  activityUnits: number;
  rewardWei: bigint;
  txHash: string;
  blockNumber: number;
}

export interface CreditcoinSnapshot {
  reachable: boolean;
  error?: string;
  owner?: string;
  paused?: boolean;
  rewardRatePerUnit?: bigint;
  sourceDeviceRegistry?: string;
  deviceOperator?: string;
  pendingRewardsWei?: bigint;
  totalActivityUnitsSettled?: number;
  totalRewardsAccruedWei?: bigint;
  recordedActivitySettled?: boolean;
  settlementEvents?: SettlementEventDTO[];
  recordedTxConfirmed?: boolean;
}

export interface LiveChainSnapshot {
  source: SourceChainSnapshot;
  creditcoin: CreditcoinSnapshot;
  fetchedAt: number;
}

/**
 * How far back a single `eth_getLogs` call is allowed to reach. Bounded so a public RPC
 * that caps log-query ranges (common on free tiers) fails one field, not the whole page.
 * The known recorded activity always sits inside this window relative to itself, so the
 * anchor block below is always covered.
 */
const LOG_LOOKBACK_BLOCKS = 50_000;

/**
 * NOTE: the log-lookback anchor and the recorded-tx cross-check both reference
 * `RECORDED_SETTLEMENT` rather than a value scoped to `deviceId`. Correct today because
 * exactly one device (NODE-001) is registered and it IS that settlement; if a second
 * device is registered, this should be parameterised per-device rather than reused as-is.
 */
async function readSourceChain(deviceId: string): Promise<SourceChainSnapshot> {
  const { rpcUrl, contractAddress } = getSourceChainConfig();
  if (!rpcUrl) {
    return { reachable: false, error: 'SOURCE_CHAIN_RPC_URL is not configured on the server.' };
  }

  const provider = makeProvider(rpcUrl, NETWORKS.sepolia.chainId);
  const registry = new Contract(contractAddress, DEVICE_REGISTRY_ABI, provider);

  const [blockNumber, blockNumberErr] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'sepolia:getBlockNumber'),
  );
  if (blockNumber === undefined) {
    return { reachable: false, error: blockNumberErr };
  }

  const deviceOperatorP = settle(
    withTimeout(registry.deviceOperator(deviceId) as Promise<string>, RPC_TIMEOUT_MS, 'sepolia:deviceOperator'),
  );
  const nextSessionIdP = settle(
    withTimeout(registry.nextSessionId(deviceId) as Promise<bigint>, RPC_TIMEOUT_MS, 'sepolia:nextSessionId'),
  );

  const fromBlock = Math.max(0, RECORDED_SETTLEMENT.sourceBlock - 1, blockNumber - LOG_LOOKBACK_BLOCKS);
  const activityFilter = registry.filters.DeviceActivityReported(deviceId);
  const eventsP = settle(
    withTimeout(
      registry.queryFilter(activityFilter, fromBlock, blockNumber) as Promise<Log[]>,
      RPC_TIMEOUT_MS,
      'sepolia:queryFilter(DeviceActivityReported)',
    ),
  );
  const receiptP = settle(
    withTimeout(
      provider.getTransactionReceipt(RECORDED_SETTLEMENT.sourceTxHash),
      RPC_TIMEOUT_MS,
      'sepolia:getTransactionReceipt',
    ),
  );

  const [[deviceOperator], [nextSessionIdRaw], [events], [receipt]] = await Promise.all([
    deviceOperatorP,
    nextSessionIdP,
    eventsP,
    receiptP,
  ]);

  const activityEvents: ActivityEventDTO[] | undefined = events
    ?.map((log) => {
      const parsed = registry.interface.parseLog(log);
      if (!parsed) return null;
      return {
        sessionId: Number(parsed.args.sessionId),
        activityUnits: Number(parsed.args.activityUnits),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    })
    .filter((e): e is ActivityEventDTO => e !== null)
    .sort((a, b) => b.blockNumber - a.blockNumber);

  const recordedTxConfirmed =
    receipt?.status === 1 && receipt.blockNumber === RECORDED_SETTLEMENT.sourceBlock ? true : undefined;

  return {
    reachable: true,
    deviceOperator,
    nextSessionId: nextSessionIdRaw === undefined ? undefined : Number(nextSessionIdRaw),
    activityEvents,
    recordedTxConfirmed,
  };
}

async function readCreditcoin(deviceId: string, sessionId: number, rewardOperator: string): Promise<CreditcoinSnapshot> {
  const { rpcUrl, contractAddress } = getCreditcoinConfig();
  if (!rpcUrl) {
    return { reachable: false, error: 'CREDITCOIN_RPC_URL is not configured on the server.' };
  }

  const provider = makeProvider(rpcUrl, NETWORKS.creditcoin.chainId);
  const controller = new Contract(contractAddress, INCENTIVE_CONTROLLER_ABI, provider);

  const [blockNumber, blockNumberErr] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'creditcoin:getBlockNumber'),
  );
  if (blockNumber === undefined) {
    return { reachable: false, error: blockNumberErr };
  }

  // keccak256(abi.encodePacked(deviceId, sessionId)) — mirrors _settleActivity's activityKey.
  const settledKey = solidityPackedKeccak256(['bytes32', 'uint256'], [deviceId, sessionId]);

  const ownerP = settle(withTimeout(controller.owner() as Promise<string>, RPC_TIMEOUT_MS, 'creditcoin:owner'));
  const pausedP = settle(withTimeout(controller.paused() as Promise<boolean>, RPC_TIMEOUT_MS, 'creditcoin:paused'));
  const rateP = settle(
    withTimeout(controller.rewardRatePerUnit() as Promise<bigint>, RPC_TIMEOUT_MS, 'creditcoin:rewardRatePerUnit'),
  );
  const sourceRegistryP = settle(
    withTimeout(controller.sourceDeviceRegistry() as Promise<string>, RPC_TIMEOUT_MS, 'creditcoin:sourceDeviceRegistry'),
  );
  const deviceOperatorP = settle(
    withTimeout(controller.deviceOperator(deviceId) as Promise<string>, RPC_TIMEOUT_MS, 'creditcoin:deviceOperator'),
  );
  const pendingRewardsP = settle(
    withTimeout(
      controller.pendingRewards(rewardOperator) as Promise<bigint>,
      RPC_TIMEOUT_MS,
      'creditcoin:pendingRewards',
    ),
  );
  const totalUnitsP = settle(
    withTimeout(
      controller.totalActivityUnitsSettled() as Promise<bigint>,
      RPC_TIMEOUT_MS,
      'creditcoin:totalActivityUnitsSettled',
    ),
  );
  const totalRewardsP = settle(
    withTimeout(
      controller.totalRewardsAccrued() as Promise<bigint>,
      RPC_TIMEOUT_MS,
      'creditcoin:totalRewardsAccrued',
    ),
  );
  const settledP = settle(
    withTimeout(
      controller.settledActivities(settledKey) as Promise<boolean>,
      RPC_TIMEOUT_MS,
      'creditcoin:settledActivities',
    ),
  );

  const fromBlock = Math.max(0, RECORDED_SETTLEMENT.settlementBlock - 1, blockNumber - LOG_LOOKBACK_BLOCKS);
  const settlementFilter = controller.filters.ActivitySettled(deviceId);
  const eventsP = settle(
    withTimeout(
      controller.queryFilter(settlementFilter, fromBlock, blockNumber) as Promise<Log[]>,
      RPC_TIMEOUT_MS,
      'creditcoin:queryFilter(ActivitySettled)',
    ),
  );
  const receiptP = settle(
    withTimeout(
      provider.getTransactionReceipt(RECORDED_SETTLEMENT.settlementTxHash),
      RPC_TIMEOUT_MS,
      'creditcoin:getTransactionReceipt',
    ),
  );

  const [
    [owner],
    [paused],
    [rewardRatePerUnit],
    [sourceDeviceRegistry],
    [deviceOperator],
    [pendingRewardsWei],
    [totalActivityUnitsSettledRaw],
    [totalRewardsAccruedWei],
    [recordedActivitySettled],
    [events],
    [receipt],
  ] = await Promise.all([
    ownerP,
    pausedP,
    rateP,
    sourceRegistryP,
    deviceOperatorP,
    pendingRewardsP,
    totalUnitsP,
    totalRewardsP,
    settledP,
    eventsP,
    receiptP,
  ]);

  const settlementEvents: SettlementEventDTO[] | undefined = events
    ?.map((log) => {
      const parsed = controller.interface.parseLog(log);
      if (!parsed) return null;
      return {
        deviceId: parsed.args.deviceId as string,
        sessionId: Number(parsed.args.sessionId),
        operator: parsed.args.operator as string,
        activityUnits: Number(parsed.args.activityUnits),
        rewardWei: parsed.args.reward as bigint,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    })
    .filter((e): e is SettlementEventDTO => e !== null)
    .sort((a, b) => b.blockNumber - a.blockNumber);

  const recordedTxConfirmed =
    receipt?.status === 1 && receipt.blockNumber === RECORDED_SETTLEMENT.settlementBlock ? true : undefined;

  return {
    reachable: true,
    owner,
    paused,
    rewardRatePerUnit,
    sourceDeviceRegistry,
    deviceOperator,
    pendingRewardsWei,
    totalActivityUnitsSettled:
      totalActivityUnitsSettledRaw === undefined ? undefined : Number(totalActivityUnitsSettledRaw),
    totalRewardsAccruedWei,
    recordedActivitySettled,
    settlementEvents,
    recordedTxConfirmed,
  };
}

/**
 * Fetches everything the dashboard needs in one pass. Not cached at this layer — callers
 * (page components) are responsible for request-level memoisation (`react`'s `cache`) and
 * route-level revalidation (`export const revalidate`), so a single Next.js render never
 * issues the same RPC call twice and the RPC endpoints are not hit on every request.
 */
export async function fetchLiveChainSnapshot(
  deviceId: string,
  sessionId: number,
  rewardOperator: string,
): Promise<LiveChainSnapshot> {
  const [source, creditcoin] = await Promise.all([
    readSourceChain(deviceId),
    readCreditcoin(deviceId, sessionId, rewardOperator),
  ]);

  return { source, creditcoin, fetchedAt: Date.now() };
}
