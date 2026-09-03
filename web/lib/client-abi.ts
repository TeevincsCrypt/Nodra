/**
 * Write-function ABI fragment for the one on-chain action a visitor's own wallet ever
 * signs directly: registering a device on Sepolia. Kept out of `lib/server/abi.ts`
 * (which is `server-only` and cannot be imported from a Client Component) — nothing here
 * is a secret, but this file exists specifically so it's safe to bundle into the browser.
 *
 * The corresponding Creditcoin registration is NOT signed by the visitor's wallet — it is
 * onlyOwner on-chain, so it is performed server-side (see lib/server/registration.ts)
 * after independently verifying the visitor's Sepolia transaction.
 */
export const DEVICE_REGISTRY_WRITE_ABI = ['function registerDevice(bytes32 deviceId) external'] as const;
