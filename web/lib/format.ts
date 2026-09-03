import { NETWORKS, type NetworkId } from './protocol';

/** Groups a wei amount with thousands separators: 250000000000000 -> "250,000,000,000,000". */
export function formatWei(wei: bigint): string {
  return wei.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Exact decimal conversion from wei to CTC (18 decimals). No floating point, so the
 * displayed value is mathematically exact rather than rounded.
 * 250000000000000n -> "0.00025"
 */
export function weiToCtc(wei: bigint): string {
  const DECIMALS = 18n;
  const divisor = 10n ** DECIMALS;
  const whole = wei / divisor;
  const fraction = wei % divisor;

  if (fraction === 0n) return whole.toString();

  const fractionStr = fraction.toString().padStart(Number(DECIMALS), '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

/** Compact metric form for dashboard tiles, e.g. 250000000000000 -> "250T". */
export function compactWei(wei: bigint): string {
  const units: [bigint, string][] = [
    [10n ** 18n, 'E'],
    [10n ** 15n, 'P'],
    [10n ** 12n, 'T'],
    [10n ** 9n, 'G'],
    [10n ** 6n, 'M'],
    [10n ** 3n, 'K'],
  ];

  for (const [size, suffix] of units) {
    if (wei >= size) {
      const whole = wei / size;
      const remainder = ((wei % size) * 10n) / size;
      return remainder > 0n ? `${whole}.${remainder}${suffix}` : `${whole}${suffix}`;
    }
  }
  return wei.toString();
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** 0xabcdef…123456 — keeps enough on each side to be recognisable. */
export function truncateHash(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export type ExplorerKind = 'tx' | 'address' | 'block';

/**
 * Builds an explorer URL, or returns null when we have no verified explorer for that
 * network. Never guesses a domain — a null result makes the UI fall back to a copyable hash.
 */
export function explorerUrl(network: NetworkId, kind: ExplorerKind, value: string): string | null {
  const base = NETWORKS[network].explorerUrl;
  if (!base) return null;

  const path = kind === 'tx' ? 'tx' : kind === 'address' ? 'address' : 'block';
  return `${base}/${path}/${value}`;
}
