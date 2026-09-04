'use server';

import { Contract } from 'ethers';
import { revalidatePath } from 'next/cache';

import { validateDeviceLabel, toDeviceId } from '@/lib/device-id';
import { getCreditcoinConfig, getSourceChainConfig, RPC_TIMEOUT_MS } from './config';
import { getRegistrationSigner } from './admin-wallet';
import { DEVICE_REGISTRY_ABI, INCENTIVE_CONTROLLER_ABI } from './abi';
import { describeError, makeProvider, settle, withTimeout } from './onchain';
import { NETWORKS } from '@/lib/protocol';

/**
 * Self-service device registration, in two independently-verified steps:
 *
 *   1. The visitor's own wallet signs `registerDevice(deviceId)` on Sepolia directly
 *      (client-side — see components/register-form.tsx). That call is permissionless;
 *      no server involvement needed or possible.
 *   2. Once that transaction confirms, the client calls `approveCreditcoinRegistration`
 *      below with ONLY the transaction hash. This function independently re-derives the
 *      deviceId and operator from the transaction's own on-chain event log — it never
 *      trusts a client-supplied deviceId or operator — then signs
 *      `registerDevice(deviceId, operator)` on Creditcoin with the owner-held key from
 *      lib/server/admin-wallet.ts. That contract call is onlyOwner; this is the one
 *      place in the app that can satisfy it without a human clicking "approve".
 *
 * Because step 2 only ever acts on what a verified Sepolia event actually says, it is
 * safe to call for anyone's registration, by anyone — the result is identical regardless
 * of who triggers it, since it is derived from on-chain truth, not from caller identity.
 */

export interface DeviceAvailability {
  deviceId: string;
  sepoliaRegistered: boolean;
  sepoliaOperator: string | null;
  creditcoinRegistered: boolean;
  reachable: { sepolia: boolean; creditcoin: boolean };
  error?: string;
}

export async function checkDeviceAvailability(label: string): Promise<DeviceAvailability> {
  const validation = validateDeviceLabel(label);
  if (!validation.valid) {
    return {
      deviceId: '',
      sepoliaRegistered: false,
      sepoliaOperator: null,
      creditcoinRegistered: false,
      reachable: { sepolia: false, creditcoin: false },
      error: validation.error,
    };
  }

  const deviceId = toDeviceId(label);
  const source = getSourceChainConfig();
  const creditcoin = getCreditcoinConfig();

  const sepoliaP = source.rpcUrl
    ? settle(
        (async () => {
          const provider = makeProvider(source.rpcUrl!, NETWORKS.sepolia.chainId);
          const registry = new Contract(source.contractAddress, DEVICE_REGISTRY_ABI, provider);
          return (await withTimeout(
            registry.deviceOperator(deviceId) as Promise<string>,
            RPC_TIMEOUT_MS,
            'sepolia:deviceOperator',
          )) as string;
        })(),
      )
    : Promise.resolve([undefined, 'SOURCE_CHAIN_RPC_URL is not configured.'] as const);

  const creditcoinP = creditcoin.rpcUrl
    ? settle(
        (async () => {
          const provider = makeProvider(creditcoin.rpcUrl!, NETWORKS.creditcoin.chainId);
          const controller = new Contract(creditcoin.contractAddress, INCENTIVE_CONTROLLER_ABI, provider);
          return (await withTimeout(
            controller.deviceOperator(deviceId) as Promise<string>,
            RPC_TIMEOUT_MS,
            'creditcoin:deviceOperator',
          )) as string;
        })(),
      )
    : Promise.resolve([undefined, 'CREDITCOIN_RPC_URL is not configured.'] as const);

  const [[sepoliaOperator], [creditcoinOperator]] = await Promise.all([sepoliaP, creditcoinP]);
  const ZERO = '0x0000000000000000000000000000000000000000';

  return {
    deviceId,
    sepoliaRegistered: Boolean(sepoliaOperator && sepoliaOperator !== ZERO),
    sepoliaOperator: sepoliaOperator && sepoliaOperator !== ZERO ? sepoliaOperator : null,
    creditcoinRegistered: Boolean(creditcoinOperator && creditcoinOperator !== ZERO),
    reachable: { sepolia: sepoliaOperator !== undefined, creditcoin: creditcoinOperator !== undefined },
  };
}

export interface ApproveResult {
  success: boolean;
  alreadyRegistered?: boolean;
  deviceId?: string;
  operator?: string;
  creditcoinTxHash?: string;
  error?: string;
}

// Best-effort, single-instance-only guard against accidental double submission (e.g. a
// double click while the first request is still in flight). This is NOT a substitute for
// real rate limiting — Vercel can run this function on a fresh instance per request with
// no shared memory, so a determined caller can still bypass it. Fine for a testnet demo;
// a production deployment would want a persisted, distributed lock here instead.
const inFlight = new Set<string>();

export async function approveCreditcoinRegistration(sepoliaTxHash: string): Promise<ApproveResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(sepoliaTxHash)) {
    return { success: false, error: 'That does not look like a transaction hash.' };
  }

  if (inFlight.has(sepoliaTxHash)) {
    return { success: false, error: 'Already processing this transaction — please wait.' };
  }
  inFlight.add(sepoliaTxHash);

  try {
    const source = getSourceChainConfig();
    if (!source.rpcUrl) {
      return { success: false, error: 'SOURCE_CHAIN_RPC_URL is not configured on the server.' };
    }

    const sourceProvider = makeProvider(source.rpcUrl, NETWORKS.sepolia.chainId);
    const [receipt, receiptErr] = await settle(
      withTimeout(sourceProvider.getTransactionReceipt(sepoliaTxHash), RPC_TIMEOUT_MS, 'sepolia:getTransactionReceipt'),
    );
    if (!receipt) {
      return { success: false, error: receiptErr ?? 'Could not fetch that transaction.' };
    }
    if (receipt.status !== 1) {
      return { success: false, error: 'That transaction did not succeed on-chain.' };
    }
    if (receipt.to?.toLowerCase() !== source.contractAddress.toLowerCase()) {
      return { success: false, error: 'That transaction was not sent to the Nodra device registry.' };
    }

    const registryInterface = new Contract(source.contractAddress, DEVICE_REGISTRY_ABI, sourceProvider).interface;
    const registeredLog = receipt.logs
      .filter((log) => log.address.toLowerCase() === source.contractAddress.toLowerCase())
      .map((log) => {
        try {
          return registryInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === 'DeviceRegistered');

    if (!registeredLog) {
      return { success: false, error: 'No DeviceRegistered event was found in that transaction.' };
    }

    const deviceId = registeredLog.args.deviceId as string;
    const operator = registeredLog.args.operator as string;

    const signer = getRegistrationSigner();
    if (!signer) {
      return {
        success: false,
        deviceId,
        operator,
        error:
          'Your Sepolia registration succeeded, but automatic Creditcoin registration is not ' +
          'configured on this deployment yet. The project owner can complete it manually.',
      };
    }

    const controller = new Contract(getCreditcoinConfig().contractAddress, INCENTIVE_CONTROLLER_ABI, signer);

    const [existingOperator] = await settle(
      withTimeout(
        controller.deviceOperator(deviceId) as Promise<string>,
        RPC_TIMEOUT_MS,
        'creditcoin:deviceOperator(pre-check)',
      ),
    );
    const ZERO = '0x0000000000000000000000000000000000000000';
    if (existingOperator && existingOperator !== ZERO) {
      revalidatePath('/dashboard', 'layout');
      return { success: true, alreadyRegistered: true, deviceId, operator: existingOperator };
    }

    const registerFn = controller.getFunction('registerDevice(bytes32,address)');
    const tx = await withTimeout(
      registerFn(deviceId, operator) as Promise<{ hash: string; wait: () => Promise<{ status: number | null }> }>,
      RPC_TIMEOUT_MS,
      'creditcoin:registerDevice',
    );
    const creditcoinReceipt = await withTimeout(tx.wait(), RPC_TIMEOUT_MS, 'creditcoin:registerDevice:wait');
    if (creditcoinReceipt?.status !== 1) {
      return { success: false, deviceId, operator, error: 'The Creditcoin registration transaction failed.' };
    }

    revalidatePath('/dashboard', 'layout');
    return { success: true, deviceId, operator, creditcoinTxHash: tx.hash };
  } catch (err) {
    return { success: false, error: describeError(err) };
  } finally {
    inFlight.delete(sepoliaTxHash);
  }
}
