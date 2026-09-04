'use client';

import { useState } from 'react';

import { Button } from './primitives';
import { TransactionHash } from './hash';
import { approveCreditcoinRegistration } from '@/lib/server/registration';
import { explorerUrl } from '@/lib/format';

/**
 * Lets anyone re-trigger the Creditcoin half of registration for a device that's already
 * confirmed on Sepolia — for when the first attempt failed (server misconfigured at the
 * time, a transient RPC error, etc.) and the person is no longer on the /register success
 * screen that originally offered the retry. Safe to expose here for the same reason it's
 * safe on that screen: approveCreditcoinRegistration only ever acts on what the given
 * Sepolia transaction hash actually says on-chain, never on anything supplied by the caller.
 */
export function RetryCreditcoinRegistration({ sepoliaTxHash }: { sepoliaTxHash: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditcoinTxHash, setCreditcoinTxHash] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const result = await approveCreditcoinRegistration(sepoliaTxHash);
      if (result.success) {
        setCreditcoinTxHash(result.creditcoinTxHash ?? null);
        setAlreadyRegistered(Boolean(result.alreadyRegistered));
      } else {
        setError(result.error ?? 'Creditcoin registration did not complete.');
      }
    } catch (err) {
      setError((err as Error).message || 'Creditcoin registration did not complete.');
    }
    setPending(false);
  }

  if (creditcoinTxHash || alreadyRegistered) {
    return (
      <div className="mt-3 rounded-md border border-ok/25 bg-ok/[0.05] p-3">
        <p className="text-xs text-ok">
          {alreadyRegistered ? 'Already registered on Creditcoin.' : 'Creditcoin registration complete.'}
        </p>
        {creditcoinTxHash ? (
          <div className="mt-2">
            <TransactionHash
              value={creditcoinTxHash}
              href={explorerUrl('creditcoin', 'tx', creditcoinTxHash)}
              lead={6}
              tail={4}
            />
          </div>
        ) : null}
        <p className="mt-2 text-2xs text-ink-muted">This page picks it up next time its data refreshes.</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Button variant="secondary" onClick={retry} loading={pending} className="w-full">
        Retry Creditcoin registration
      </Button>
      {error ? <p className="mt-2 text-2xs leading-relaxed text-danger">{error}</p> : null}
    </div>
  );
}
