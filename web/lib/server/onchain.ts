import 'server-only';

import { Contract, JsonRpcProvider, solidityPackedKeccak256, type Log } from 'ethers';

import { NETWORKS } from '@/lib/protocol';
import { DEVICES, SETTLEMENTS } from '@/lib/data';
import { fromDeviceId } from '@/lib/device-id';
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

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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
export async function settle<T>(promise: Promise<T>): Promise<[T | undefined, string | undefined]> {
  try {
    return [await promise, undefined];
  } catch (err) {
    return [undefined, describeError(err)];
  }
}

export function makeProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
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
  /** True when the recorded DeviceRegistered transaction still resolves on-chain to the
   *  expected operator. Undefined when the device has no recorded registration tx, or the
   *  check could not be completed. */
  registrationConfirmedLive?: boolean;
}

export interface SettlementEventDTO {
  deviceId: string;
  sessionId: number;
  operator: string;
  activityUnits: number;
  rewardWei: bigint;
  queryId: string;
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
  /** queryId decoded from the recorded settlement transaction's own ActivitySettled log. */
  recordedQueryId?: string;
}

export interface LiveChainSnapshot {
  source: SourceChainSnapshot;
  creditcoin: CreditcoinSnapshot;
  fetchedAt: number;
}

/**
 * How far back discovery is willing to look, in total. The known recorded activity always
 * sits inside this window relative to itself, so the anchor block below is always covered.
 */
const LOG_LOOKBACK_BLOCKS = 50_000;

/**
 * A single `eth_getLogs` call over LOG_LOOKBACK_BLOCKS is attempted first — cheap and fast
 * when the RPC allows it. Many public/free-tier providers cap the range far below that
 * (sometimes as low as 2,000-10,000 blocks) and just reject anything wider, which would
 * otherwise make every discovery query fail outright rather than merely miss old data. This
 * is the chunk size used to retry as a fallback: small enough that essentially every known
 * provider accepts it.
 */
const LOG_QUERY_FALLBACK_CHUNK_BLOCKS = 2_000;

/**
 * Queries logs over [fromBlock, toBlock], first as a single wide call, falling back to
 * parallel smaller chunks only if that's rejected — so a provider with a narrow range cap
 * degrades to more requests instead of finding nothing at all. One chunk failing doesn't
 * sink the scan; its logs are just missing, same as any other partial-data degradation in
 * this file. Returns the same [value, error] shape `settle()` does.
 */
async function queryLogsResilient(
  contract: Contract,
  filter: Parameters<Contract['queryFilter']>[0],
  fromBlock: number,
  toBlock: number,
  label: string,
): Promise<[Log[] | undefined, string | undefined]> {
  const wide = await settle(
    withTimeout(contract.queryFilter(filter, fromBlock, toBlock) as Promise<Log[]>, RPC_TIMEOUT_MS, label),
  );
  if (wide[0] !== undefined) return wide;
  if (toBlock - fromBlock <= LOG_QUERY_FALLBACK_CHUNK_BLOCKS) return wide;

  const chunks: Array<[number, number]> = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_QUERY_FALLBACK_CHUNK_BLOCKS) {
    chunks.push([start, Math.min(start + LOG_QUERY_FALLBACK_CHUNK_BLOCKS - 1, toBlock)]);
  }

  const results = await Promise.all(
    chunks.map(([from, to]) =>
      settle(withTimeout(contract.queryFilter(filter, from, to) as Promise<Log[]>, RPC_TIMEOUT_MS, `${label}(chunk ${from}-${to})`)),
    ),
  );

  const anyChunkSucceeded = results.some(([logs]) => logs !== undefined);
  if (!anyChunkSucceeded) return [undefined, `${wide[1]} (chunked retry also failed)`];

  return [results.flatMap(([logs]) => logs ?? []), undefined];
}

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

  // Scoped to THIS device's own recorded settlement, if it has one — NODE-001's genesis
  // block has no bearing on how far back a different device's log scan needs to reach, and
  // the tx-hash cross-check below only means anything for the settlement it's verifying.
  const recordedForDevice = SETTLEMENTS.find((s) => s.deviceId === deviceId);
  const fromBlock = Math.max(0, (recordedForDevice?.sourceBlock ?? 1) - 1, blockNumber - LOG_LOOKBACK_BLOCKS);
  const activityFilter = registry.filters.DeviceActivityReported(deviceId);
  const eventsP = queryLogsResilient(
    registry,
    activityFilter,
    fromBlock,
    blockNumber,
    'sepolia:queryFilter(DeviceActivityReported)',
  );
  const receiptP = recordedForDevice
    ? settle(
        withTimeout(
          provider.getTransactionReceipt(recordedForDevice.sourceTxHash),
          RPC_TIMEOUT_MS,
          'sepolia:getTransactionReceipt',
        ),
      )
    : Promise.resolve([undefined, undefined] as const);

  const deviceRecord = DEVICES.find((d) => d.id === deviceId);
  const registrationReceiptP = deviceRecord?.registrationTxHash
    ? settle(
        withTimeout(
          provider.getTransactionReceipt(deviceRecord.registrationTxHash),
          RPC_TIMEOUT_MS,
          'sepolia:getTransactionReceipt(registration)',
        ),
      )
    : Promise.resolve([undefined, undefined] as const);

  const [[deviceOperator], [nextSessionIdRaw], [events], [receipt], [registrationReceipt]] = await Promise.all([
    deviceOperatorP,
    nextSessionIdP,
    eventsP,
    receiptP,
    registrationReceiptP,
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
    recordedForDevice && receipt?.status === 1 && receipt.blockNumber === recordedForDevice.sourceBlock
      ? true
      : undefined;

  // Confirm the recorded DeviceRegistered log itself resolves on-chain to the expected
  // device/operator pair — a genuine live cross-check, not a re-derivation of anything.
  let registrationConfirmedLive: boolean | undefined;
  if (registrationReceipt && deviceRecord) {
    const registeredLog = registrationReceipt.logs
      .map((log) => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === 'DeviceRegistered');

    registrationConfirmedLive =
      registrationReceipt.status === 1 &&
      String(registeredLog?.args.deviceId ?? '').toLowerCase() === deviceId.toLowerCase() &&
      typeof registeredLog?.args.operator === 'string' &&
      registeredLog.args.operator.toLowerCase() === deviceRecord.sourceOperator.toLowerCase()
        ? true
        : undefined;
  }

  return {
    reachable: true,
    deviceOperator,
    nextSessionId: nextSessionIdRaw === undefined ? undefined : Number(nextSessionIdRaw),
    activityEvents,
    recordedTxConfirmed,
    registrationConfirmedLive,
  };
}

async function readCreditcoin(deviceId: string, sessionId: number, rewardOperator: string): Promise<CreditcoinSnapshot> {
  const { rpcUrl, contractAddress } = getCreditcoinConfig();
  if (!rpcUrl) {
    return { reachable: false, error: 'CREDITCOIN_RPC_URL is not configured on the server.' };
  }

  const provider = makeProvider(rpcUrl, NETWORKS.creditcoin.chainId);
  const controller = new Contract(contractAddress, INCENTIVE_CONTROLLER_ABI, provider);

  // Scoped to this exact (deviceId, sessionId)'s own recorded settlement, if it has one —
  // see the matching comment in readSourceChain above for why this must not default to
  // NODE-001's regardless of which device is actually being read.
  const recordedForDevice = SETTLEMENTS.find((s) => s.deviceId === deviceId && s.sessionId === sessionId);

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

  const fromBlock = Math.max(0, (recordedForDevice?.settlementBlock ?? 1) - 1, blockNumber - LOG_LOOKBACK_BLOCKS);
  const settlementFilter = controller.filters.ActivitySettled(deviceId);
  const eventsP = queryLogsResilient(
    controller,
    settlementFilter,
    fromBlock,
    blockNumber,
    'creditcoin:queryFilter(ActivitySettled)',
  );
  const receiptP = recordedForDevice
    ? settle(
        withTimeout(
          provider.getTransactionReceipt(recordedForDevice.settlementTxHash),
          RPC_TIMEOUT_MS,
          'creditcoin:getTransactionReceipt',
        ),
      )
    : Promise.resolve([undefined, undefined] as const);

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
        queryId: parsed.args.queryId as string,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    })
    .filter((e): e is SettlementEventDTO => e !== null)
    .sort((a, b) => b.blockNumber - a.blockNumber);

  const recordedTxConfirmed =
    recordedForDevice && receipt?.status === 1 && receipt.blockNumber === recordedForDevice.settlementBlock
      ? true
      : undefined;

  // Decode the recorded settlement transaction's own ActivitySettled log to recover its
  // on-chain queryId, so the mapper can confirm it matches the recorded value rather than
  // trusting it blindly.
  let recordedQueryId: string | undefined;
  if (receipt) {
    const settledLog = receipt.logs
      .map((log) => {
        try {
          return controller.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === 'ActivitySettled');
    recordedQueryId = settledLog ? (settledLog.args.queryId as string) : undefined;
  }

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
    recordedQueryId,
  };
}

export interface DiscoveredDeviceDTO {
  deviceId: string;
  label: string;
  sourceOperator: string;
  registrationTxHash: string;
  registrationBlock: number;
}

export interface DeviceDiscoveryResult {
  devices: DiscoveredDeviceDTO[];
  reachable: boolean;
  error?: string;
}

/**
 * Scans Sepolia for every `DeviceRegistered` event, so a device someone registers
 * through the UI shows up on the dashboard without a code change or a database. Bounded
 * to a rolling window rather than genesis: there is no indexer behind this, so a device
 * registered longer ago than that window will stop appearing in this list even though
 * its on-chain state (and its own detail page, reachable by direct URL) is unaffected.
 * Registrations are a rare event, so this trades unlimited history for a bounded,
 * predictable RPC cost.
 */
export async function discoverRegisteredDevices(): Promise<DeviceDiscoveryResult> {
  const { rpcUrl, contractAddress } = getSourceChainConfig();
  if (!rpcUrl) {
    return { devices: [], reachable: false, error: 'SOURCE_CHAIN_RPC_URL is not configured.' };
  }

  const provider = makeProvider(rpcUrl, NETWORKS.sepolia.chainId);
  const registry = new Contract(contractAddress, DEVICE_REGISTRY_ABI, provider);

  const [blockNumber, blockNumberErr] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'sepolia:getBlockNumber(discover)'),
  );
  if (blockNumber === undefined) {
    return { devices: [], reachable: false, error: blockNumberErr };
  }

  const fromBlock = Math.max(0, blockNumber - LOG_LOOKBACK_BLOCKS);
  const [events, eventsErr] = await queryLogsResilient(
    registry,
    registry.filters.DeviceRegistered(),
    fromBlock,
    blockNumber,
    'sepolia:queryFilter(DeviceRegistered)',
  );
  if (events === undefined) {
    return { devices: [], reachable: true, error: eventsErr };
  }

  const devices: DiscoveredDeviceDTO[] = events
    .map((log) => {
      const parsed = registry.interface.parseLog(log);
      if (!parsed) return null;
      const deviceId = parsed.args.deviceId as string;
      let label: string;
      try {
        label = fromDeviceId(deviceId);
      } catch {
        label = deviceId;
      }
      if (!label) label = deviceId;
      return {
        deviceId,
        label,
        sourceOperator: parsed.args.operator as string,
        registrationTxHash: log.transactionHash,
        registrationBlock: log.blockNumber,
      };
    })
    .filter((d): d is DiscoveredDeviceDTO => d !== null);

  return { devices, reachable: true };
}

export interface DiscoveredSettlementDTO {
  deviceId: string;
  sessionId: number;
  operator: string;
  activityUnits: number;
  rewardWei: bigint;
  queryId: string;
  settlementTxHash: string;
  settlementBlock: number;
}

export interface SettlementDiscoveryResult {
  settlements: DiscoveredSettlementDTO[];
  reachable: boolean;
  error?: string;
}

/**
 * Scans Creditcoin for every `ActivitySettled` event, across every device — not just the
 * one baked-in recorded settlement — so any device's real, verified reward shows up on
 * Activity/Rewards/Proofs. Same rolling-window and no-indexer tradeoffs as
 * discoverRegisteredDevices() above.
 */
export async function discoverSettlements(): Promise<SettlementDiscoveryResult> {
  const { rpcUrl, contractAddress } = getCreditcoinConfig();
  if (!rpcUrl) {
    return { settlements: [], reachable: false, error: 'CREDITCOIN_RPC_URL is not configured.' };
  }

  const provider = makeProvider(rpcUrl, NETWORKS.creditcoin.chainId);
  const controller = new Contract(contractAddress, INCENTIVE_CONTROLLER_ABI, provider);

  const [blockNumber, blockNumberErr] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'creditcoin:getBlockNumber(discoverSettlements)'),
  );
  if (blockNumber === undefined) {
    return { settlements: [], reachable: false, error: blockNumberErr };
  }

  const fromBlock = Math.max(0, blockNumber - LOG_LOOKBACK_BLOCKS);
  const [events, eventsErr] = await queryLogsResilient(
    controller,
    controller.filters.ActivitySettled(),
    fromBlock,
    blockNumber,
    'creditcoin:queryFilter(ActivitySettled,all)',
  );
  if (events === undefined) {
    return { settlements: [], reachable: true, error: eventsErr };
  }

  const settlements: DiscoveredSettlementDTO[] = events
    .map((log) => {
      const parsed = controller.interface.parseLog(log);
      if (!parsed) return null;
      return {
        deviceId: parsed.args.deviceId as string,
        sessionId: Number(parsed.args.sessionId),
        operator: parsed.args.operator as string,
        activityUnits: Number(parsed.args.activityUnits),
        rewardWei: parsed.args.reward as bigint,
        queryId: parsed.args.queryId as string,
        settlementTxHash: log.transactionHash,
        settlementBlock: log.blockNumber,
      };
    })
    .filter((s): s is DiscoveredSettlementDTO => s !== null);

  return { settlements, reachable: true };
}

export interface SourceEventRef {
  sourceTxHash: string;
  sourceBlock: number;
}

/**
 * Batch-resolves the Sepolia `DeviceActivityReported` log a discovered settlement points
 * back to. Both deviceId and sessionId are indexed on that event, so each lookup is a
 * precise, cheap filter rather than a wide scan — safe to run one per settlement in
 * parallel. Keyed as `${deviceId}:${sessionId}` (lowercased) in the returned map.
 */
export async function findSourceEvents(
  pairs: Array<{ deviceId: string; sessionId: number }>,
): Promise<Map<string, SourceEventRef>> {
  const result = new Map<string, SourceEventRef>();
  if (pairs.length === 0) return result;

  const { rpcUrl, contractAddress } = getSourceChainConfig();
  if (!rpcUrl) return result;

  const provider = makeProvider(rpcUrl, NETWORKS.sepolia.chainId);
  const registry = new Contract(contractAddress, DEVICE_REGISTRY_ABI, provider);

  const [blockNumber, blockNumberErr] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'sepolia:getBlockNumber(findSourceEvents)'),
  );
  if (blockNumber === undefined) return result;

  const fromBlock = Math.max(0, blockNumber - LOG_LOOKBACK_BLOCKS);
  await Promise.all(
    pairs.map(async ({ deviceId, sessionId }) => {
      const [events] = await queryLogsResilient(
        registry,
        registry.filters.DeviceActivityReported(deviceId, sessionId),
        fromBlock,
        blockNumber,
        'sepolia:queryFilter(DeviceActivityReported,pair)',
      );
      const log = events?.[0];
      if (log) {
        result.set(`${deviceId.toLowerCase()}:${sessionId}`, {
          sourceTxHash: log.transactionHash,
          sourceBlock: log.blockNumber,
        });
      }
    }),
  );

  return result;
}

export interface RegistrationEventRef {
  registrationTxHash: string;
  registrationBlock: number;
}

/**
 * Precise, single-device lookup for the DeviceRegistered event that registered `deviceId` —
 * both deviceId and operator are indexed, so this is a narrow filter, not the wide
 * every-device scan discoverRegisteredDevices() does. Used by the device detail page, which
 * only ever needs one device's registration record, not the whole registry's history.
 */
export async function findRegistrationEvent(deviceId: string): Promise<RegistrationEventRef | undefined> {
  const { rpcUrl, contractAddress } = getSourceChainConfig();
  if (!rpcUrl) return undefined;

  const provider = makeProvider(rpcUrl, NETWORKS.sepolia.chainId);
  const registry = new Contract(contractAddress, DEVICE_REGISTRY_ABI, provider);

  const [blockNumber] = await settle(
    withTimeout(provider.getBlockNumber(), RPC_TIMEOUT_MS, 'sepolia:getBlockNumber(findRegistrationEvent)'),
  );
  if (blockNumber === undefined) return undefined;

  const fromBlock = Math.max(0, blockNumber - LOG_LOOKBACK_BLOCKS);
  const [events] = await queryLogsResilient(
    registry,
    registry.filters.DeviceRegistered(deviceId),
    fromBlock,
    blockNumber,
    'sepolia:queryFilter(DeviceRegistered,single)',
  );
  const log = events?.[0];
  if (!log) return undefined;
  return { registrationTxHash: log.transactionHash, registrationBlock: log.blockNumber };
}

/**
 * Fetches everything the dashboard needs in one pass. Not cached at this layer — callers
 * (page components) are responsible for request-level memoisation (`react`'s `cache`), so a
 * single Next.js render never issues the same RPC call twice. Every dashboard page is
 * `force-dynamic` (see live-data.ts), so this does run fresh on every request — accuracy
 * (a newly discovered device must show up immediately) matters more than shaving RPC calls
 * here, and RPC_TIMEOUT_MS plus graceful per-field degradation keep the cost bounded.
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
