'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';

import { WALLET_NETWORKS, type NetworkId } from '@/lib/protocol';

/**
 * Minimal EIP-1193 wallet connection — deliberately not wagmi/RainbowKit. This app needs
 * exactly one write flow (sign a Sepolia `registerDevice` call), so a full wallet-kit
 * dependency isn't worth the bundle size or the abstraction. Talks to whatever the
 * browser injects at `window.ethereum` (MetaMask, and most other extension wallets).
 */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface WalletState {
  available: boolean;
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    available: false,
    address: null,
    chainId: null,
    connecting: false,
    error: null,
  });

  useEffect(() => {
    const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
    setState((s) => ({ ...s, available: Boolean(eth) }));
    if (!eth) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setState((s) => ({ ...s, address: accounts[0] ?? null }));
    };
    const onChainChanged = (...args: unknown[]) => {
      const chainIdHex = args[0] as string;
      setState((s) => ({ ...s, chainId: parseInt(chainIdHex, 16) }));
    };

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);
    return () => {
      eth.removeListener('accountsChanged', onAccountsChanged);
      eth.removeListener('chainChanged', onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setState((s) => ({ ...s, error: 'No wallet extension found.' }));
      return;
    }
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string;
      setState((s) => ({
        ...s,
        connecting: false,
        address: accounts[0] ?? null,
        chainId: parseInt(chainIdHex, 16),
      }));
    } catch (err) {
      setState((s) => ({ ...s, connecting: false, error: describeWalletError(err) }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((s) => ({ ...s, address: null }));
  }, []);

  /** Prompts a network switch, adding the network to the wallet first if it doesn't know it.
   *  EIP-3326 defines code 4902 for "unrecognized chain", but wallets are inconsistent about
   *  actually returning it for that case (some just throw a plain "Unrecognized chain ID ..."
   *  error with no code, or a different one) — so rather than gate the add-chain fallback on
   *  a specific error code, we try it after ANY switch failure except an explicit user
   *  rejection. Adding a chain the wallet already knows is a harmless no-op per EIP-3085. */
  const ensureNetwork = useCallback(async (network: NetworkId) => {
    const eth = window.ethereum;
    if (!eth) return false;
    const params = WALLET_NETWORKS[network];
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainIdHex }] });
      return true;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        setState((s) => ({ ...s, error: describeWalletError(err) }));
        return false;
      }
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: params.chainIdHex,
              chainName: params.chainName,
              nativeCurrency: params.nativeCurrency,
              rpcUrls: params.rpcUrls,
            },
          ],
        });
        return true;
      } catch (addErr) {
        setState((s) => ({ ...s, error: describeWalletError(addErr) }));
        return false;
      }
    }
  }, []);

  /** Signs and sends a transaction via the connected wallet; returns the tx hash on success.
   *  Throws if the wallet rejects it OR if it mines but reverts on-chain — ethers'
   *  `wait()` resolves either way, so the status check here is load-bearing. */
  const sendTransaction = useCallback(async (to: string, data: string): Promise<string> => {
    const eth = window.ethereum;
    if (!eth) throw new Error('No wallet extension found.');
    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    const tx = await signer.sendTransaction({ to, data });
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error(`Transaction ${tx.hash} was mined but reverted.`);
    }
    return tx.hash;
  }, []);

  return { ...state, connect, disconnect, ensureNetwork, sendTransaction };
}

function describeWalletError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message: unknown }).message);
    // Most wallets prefix user-cancelled actions consistently enough to detect.
    if (/user rejected/i.test(message)) return 'Request cancelled.';
    return message.slice(0, 200);
  }
  return 'Something went wrong talking to your wallet.';
}
