import 'server-only';

import { JsonRpcProvider, Wallet } from 'ethers';

import { NETWORKS } from '@/lib/protocol';
import { getCreditcoinConfig, getRegistrationOwnerPrivateKey, RPC_TIMEOUT_MS } from './config';

/**
 * The only place `CREDITCOIN_OWNER_PRIVATE_KEY` is turned into something that can sign a
 * transaction. Everything else in this app reads chain state; this is the one exception,
 * and it exists solely to let `lib/server/registration.ts` complete a device's
 * Creditcoin-side registration automatically after verifying the visitor's Sepolia
 * transaction — see the comment on `getRegistrationOwnerPrivateKey` in ./config.ts for the
 * security reasoning.
 */
export function getRegistrationSigner(): Wallet | null {
  const privateKey = getRegistrationOwnerPrivateKey();
  const { rpcUrl } = getCreditcoinConfig();
  if (!privateKey || !rpcUrl) return null;

  const provider = new JsonRpcProvider(rpcUrl, NETWORKS.creditcoin.chainId, { staticNetwork: true });
  return new Wallet(privateKey, provider);
}

// RPC_TIMEOUT_MS is re-exported so registration.ts doesn't need a second import from
// ./config purely for this one constant.
export { RPC_TIMEOUT_MS };
