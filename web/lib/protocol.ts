/**
 * Public protocol configuration.
 *
 * Everything here is public on-chain data (addresses, chain ids, public RPC URLs).
 * No secrets, no private keys. Never add a private key or an API secret to this file —
 * it is bundled into the browser.
 */

export const PROTOCOL = {
  name: 'Nodra',
  tagline: 'Trustless incentives for the physical internet.',
  secondary: 'Verify work. Coordinate infrastructure. Reward anywhere.',
} as const;

/** Deployed contracts. These are live testnet deployments — do not change. */
export const CONTRACTS = {
  deviceRegistry: {
    name: 'NodraDeviceRegistry',
    address: '0xacC1Cd54c174b0F87D26E88132A28f7dC1983CF6',
    network: 'sepolia',
    role: 'Source-chain registry. Emits the DeviceActivityReported event that Attestcoin attests.',
  },
  incentiveController: {
    name: 'NodraIncentiveController',
    address: '0x0dD97a8C7Dc1F143f682BD5c306BF00efc9396B9',
    network: 'creditcoin',
    role: 'Creditcoin ASC. Verifies the proof through the Attestcoin precompile, then accrues the reward.',
  },
  attestcoinVerifier: {
    name: 'Attestcoin Native Query Verifier',
    address: '0x0000000000000000000000000000000000000FD2',
    network: 'creditcoin',
    role: 'Creditcoin precompile. Checks Merkle inclusion and continuity against attested block digests.',
  },
} as const;

export type NetworkId = 'sepolia' | 'creditcoin';

export interface NetworkInfo {
  id: NetworkId;
  label: string;
  role: string;
  chainId: number;
  /**
   * Block-explorer base URL, or null when we do not have a verified one.
   *
   * We deliberately do NOT guess explorer domains. Sepolia's is universally known.
   * The Creditcoin CC3 Testnet explorer is not recorded anywhere in this repository,
   * so it stays null until it is supplied via NEXT_PUBLIC_CREDITCOIN_EXPLORER_URL.
   * When null, the UI shows a copyable hash instead of a link.
   */
  explorerUrl: string | null;
}

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  sepolia: {
    id: 'sepolia',
    label: 'Sepolia',
    role: 'Source chain',
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  creditcoin: {
    id: 'creditcoin',
    label: 'Creditcoin Testnet',
    role: 'Destination chain',
    chainId: 102031,
    explorerUrl: process.env.NEXT_PUBLIC_CREDITCOIN_EXPLORER_URL?.replace(/\/$/, '') || null,
  },
};

/** Attestcoin's identifier for Sepolia on Creditcoin. Not the EVM chain id. */
export const SOURCE_CHAIN_KEY = 1;

/** Reward configuration, mirroring NodraIncentiveController. */
export const REWARD = {
  /** wei of CTC accrued per activity unit. Constructor arg: 1e12. */
  ratePerUnit: 1_000_000_000_000n,
  maxActivityUnits: 1_000_000n,
  /** MAX_REWARD_RATE_PER_UNIT = 1 ether */
  maxRatePerUnit: 1_000_000_000_000_000_000n,
} as const;

/** Security properties enforced on-chain, surfaced on the Protocol page. */
export const SECURITY_PROPERTIES = [
  {
    label: 'Receipt status validation',
    detail: 'A source transaction that reverted can never settle: receiptStatus must equal 1.',
  },
  {
    label: 'Event signature validation',
    detail: 'topics[0] must equal keccak256("DeviceActivityReported(bytes32,uint256,uint256)").',
  },
  {
    label: 'Source emitter validation',
    detail: 'The log must originate from the registered source registry, not a look-alike contract.',
  },
  {
    label: 'Registered-device validation',
    detail: 'Rewards accrue only for devices registered with an operator on Creditcoin.',
  },
  {
    label: 'Activity bounds',
    detail: 'activityUnits must be greater than zero and at most MAX_ACTIVITY_UNITS.',
  },
  {
    label: 'Replay protection',
    detail: "ASCBase dedupes by queryId, and Nodra dedupes again per (deviceId, sessionId).",
  },
  { label: 'Access control', detail: 'Device registration and configuration are Ownable-gated.' },
  { label: 'Pause protection', detail: 'Settlement halts immediately when the contract is paused.' },
  {
    label: 'Bounded reward rate',
    detail: 'The reward rate is capped at MAX_REWARD_RATE_PER_UNIT so it cannot be set arbitrarily high.',
  },
] as const;
