import 'server-only';

import { CONTRACTS } from '@/lib/protocol';

/**
 * Server-only chain configuration.
 *
 * RPC URLs and contract addresses are read from environment variables so they are
 * configurable per-deployment (Vercel project settings) without touching source. None of
 * these variables are prefixed NEXT_PUBLIC_ — they are resolved only on the server and are
 * never sent to the browser.
 *
 * Contract address variables fall back to the known public contract address already
 * recorded in `lib/protocol.ts` if unset (these are public addresses, not secrets, so a
 * source fallback is safe) — this keeps the dashboard working on a fresh deployment where
 * only the RPC URLs have been configured.
 *
 * RPC URLs have no fallback: an unset RPC URL means "we cannot read this chain right now",
 * and every reader in this module is written to degrade gracefully in that case rather than
 * throw.
 */

export interface ChainServerConfig {
  rpcUrl: string | null;
  contractAddress: string;
}

export function getSourceChainConfig(): ChainServerConfig {
  return {
    rpcUrl: process.env.SOURCE_CHAIN_RPC_URL?.trim() || null,
    contractAddress:
      process.env.NODRA_DEVICE_REGISTRY_ADDRESS?.trim() || CONTRACTS.deviceRegistry.address,
  };
}

export function getCreditcoinConfig(): ChainServerConfig {
  return {
    rpcUrl: process.env.CREDITCOIN_RPC_URL?.trim() || null,
    contractAddress:
      process.env.NODRA_INCENTIVE_CONTROLLER_ADDRESS?.trim() || CONTRACTS.incentiveController.address,
  };
}

/** Per-call RPC timeout. Long enough for a slow public endpoint, short enough that a
 *  dead RPC cannot stall page generation — every call site races this against the request. */
export const RPC_TIMEOUT_MS = 8_000;
