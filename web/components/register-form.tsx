'use client';

import { useEffect, useMemo, useState } from 'react';
import { Interface } from 'ethers';

import { Button, ProvenanceTag, StatusBadge } from './primitives';
import { TransactionHash } from './hash';
import { useWallet } from './wallet';
import { toDeviceId, validateDeviceLabel } from '@/lib/device-id';
import { DEVICE_REGISTRY_WRITE_ABI } from '@/lib/client-abi';
import { approveCreditcoinRegistration, checkDeviceAvailability, type DeviceAvailability } from '@/lib/server/registration';
import { explorerUrl } from '@/lib/format';
import { NETWORKS } from '@/lib/protocol';

type Phase = 'idle' | 'sepolia-pending' | 'creditcoin-pending' | 'done';

export function RegisterForm({ registryAddress }: { registryAddress: string }) {
  const wallet = useWallet();
  const [label, setLabel] = useState('');
  const [availability, setAvailability] = useState<DeviceAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sepoliaTxHash, setSepoliaTxHash] = useState<string | null>(null);
  const [creditcoinTxHash, setCreditcoinTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditcoinNote, setCreditcoinNote] = useState<string | null>(null);

  const validation = useMemo(() => validateDeviceLabel(label), [label]);
  const onCorrectNetwork = wallet.chainId === NETWORKS.sepolia.chainId;

  // Debounced availability check — only fires for a label that already passes the
  // cheap client-side shape validation, so we don't hit the server on every keystroke.
  useEffect(() => {
    if (!validation.valid) {
      setAvailability(null);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      checkDeviceAvailability(label)
        .then(setAvailability)
        .finally(() => setChecking(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [label, validation.valid]);

  const alreadyTaken = availability?.sepoliaRegistered ?? false;
  const canSubmit =
    wallet.address !== null &&
    onCorrectNetwork &&
    validation.valid &&
    !alreadyTaken &&
    phase === 'idle' &&
    !checking;

  async function handleRegister() {
    if (!validation.valid) return;
    setError(null);
    setCreditcoinNote(null);

    let deviceId: string;
    try {
      deviceId = toDeviceId(label);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setPhase('sepolia-pending');
    let txHash: string;
    try {
      const data = new Interface(DEVICE_REGISTRY_WRITE_ABI).encodeFunctionData('registerDevice', [deviceId]);
      txHash = await wallet.sendTransaction(registryAddress, data);
      setSepoliaTxHash(txHash);
    } catch (err) {
      setError((err as Error).message || 'The Sepolia transaction failed.');
      setPhase('idle');
      return;
    }

    setPhase('creditcoin-pending');
    try {
      const result = await approveCreditcoinRegistration(txHash);
      if (result.success) {
        setCreditcoinTxHash(result.creditcoinTxHash ?? null);
        if (result.alreadyRegistered) setCreditcoinNote('Already registered on Creditcoin.');
      } else {
        setCreditcoinNote(result.error ?? 'Creditcoin registration did not complete.');
      }
    } catch (err) {
      setCreditcoinNote((err as Error).message || 'Creditcoin registration did not complete.');
    }
    setPhase('done');
  }

  async function retryCreditcoin() {
    if (!sepoliaTxHash) return;
    setPhase('creditcoin-pending');
    setCreditcoinNote(null);
    try {
      const result = await approveCreditcoinRegistration(sepoliaTxHash);
      if (result.success) {
        setCreditcoinTxHash(result.creditcoinTxHash ?? null);
        if (result.alreadyRegistered) setCreditcoinNote('Already registered on Creditcoin.');
      } else {
        setCreditcoinNote(result.error ?? 'Creditcoin registration did not complete.');
      }
    } catch (err) {
      setCreditcoinNote((err as Error).message || 'Creditcoin registration did not complete.');
    }
    setPhase('done');
  }

  // ---------------------------------------------------------------- Not connected
  if (!wallet.address) {
    return (
      <div className="p-6 text-center">
        {!wallet.available ? (
          <p className="text-sm text-ink-secondary">
            No wallet extension found.{' '}
            <a
              href="https://metamask.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              Install MetaMask
            </a>{' '}
            or another browser wallet to continue.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-secondary">
              Connect a wallet to register a device. Nothing is read or written until you do.
            </p>
            <Button onClick={wallet.connect} loading={wallet.connecting}>
              Connect Wallet
            </Button>
            {wallet.error ? <p className="mt-3 text-xs text-danger">{wallet.error}</p> : null}
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- Wrong network
  if (!onCorrectNetwork) {
    return (
      <div className="p-6 text-center">
        <p className="mb-4 text-sm text-ink-secondary">
          Your wallet is on the wrong network. Device registration happens on{' '}
          <span className="text-ink-primary">{NETWORKS.sepolia.label}</span>.
        </p>
        <Button onClick={() => wallet.ensureNetwork('sepolia')}>Switch to Sepolia</Button>
        {wallet.error ? <p className="mt-3 text-xs text-danger">{wallet.error}</p> : null}
      </div>
    );
  }

  // ---------------------------------------------------------------- Done
  if (phase === 'done') {
    return (
      <div className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <StatusBadge label="Sepolia registered" tone="ok" />
          {creditcoinTxHash ? (
            <StatusBadge label="Creditcoin registered" tone="ok" />
          ) : (
            <StatusBadge label="Creditcoin pending" tone="warn" />
          )}
        </div>

        <dl>
          <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
            <dt className="text-xs text-ink-muted">Sepolia transaction</dt>
            <dd>
              {sepoliaTxHash ? (
                <TransactionHash value={sepoliaTxHash} href={explorerUrl('sepolia', 'tx', sepoliaTxHash)} />
              ) : null}
            </dd>
          </div>
          {creditcoinTxHash ? (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-xs text-ink-muted">Creditcoin transaction</dt>
              <dd>
                <TransactionHash value={creditcoinTxHash} href={explorerUrl('creditcoin', 'tx', creditcoinTxHash)} />
              </dd>
            </div>
          ) : null}
        </dl>

        {creditcoinNote ? (
          <div className="mt-4 rounded-md border border-warn/25 bg-warn/[0.05] p-4">
            <p className="text-xs leading-relaxed text-ink-secondary">{creditcoinNote}</p>
            {sepoliaTxHash ? (
              <Button variant="secondary" className="mt-3" onClick={retryCreditcoin}>
                Retry Creditcoin registration
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Your device is live on both chains. Look for it under{' '}
            <span className="text-ink-primary">Devices</span> once this page's data refreshes.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- Form
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="label-xs">Connected</span>
        <TransactionHash value={wallet.address} lead={6} tail={4} showCopy={false} />
      </div>

      <label className="label-xs mb-2 block" htmlFor="device-label">
        Device label
      </label>
      <input
        id="device-label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="MY-DEVICE-001"
        disabled={phase !== 'idle'}
        className="w-full rounded-md border border-line bg-raised px-3 py-2.5 font-mono text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-faint focus:border-blue-500/50 disabled:opacity-50"
      />

      <div className="mt-2 min-h-[1.25rem] text-xs">
        {label.length === 0 ? null : !validation.valid ? (
          <span className="text-danger">{validation.error}</span>
        ) : checking ? (
          <span className="text-ink-muted">Checking availability…</span>
        ) : alreadyTaken ? (
          <span className="flex items-center gap-2 text-danger">
            Already registered
            {availability?.sepoliaOperator ? (
              <TransactionHash value={availability.sepoliaOperator} lead={6} tail={4} showCopy={false} />
            ) : null}
          </span>
        ) : availability ? (
          <span className="flex items-center gap-2 text-ok">
            Available
            <ProvenanceTag provenance={availability.reachable.sepolia ? 'live' : 'recorded'} />
          </span>
        ) : null}
      </div>

      <Button
        className="mt-5 w-full"
        onClick={handleRegister}
        disabled={!canSubmit}
        loading={phase === 'sepolia-pending' || phase === 'creditcoin-pending'}
      >
        {phase === 'sepolia-pending'
          ? 'Confirm in your wallet…'
          : phase === 'creditcoin-pending'
            ? 'Completing Creditcoin registration…'
            : 'Register on Sepolia'}
      </Button>

      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
