import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ZeroAddress } from 'ethers';

import { DataRow, TransactionHash } from '@/components/hash';
import { ProofTimeline, type TimelineStep } from '@/components/proof-timeline';
import { Panel, PanelHeader, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { RetryCreditcoinRegistration } from '@/components/retry-creditcoin';
import { getDeviceDetail } from '@/lib/server/live-data';
import { explorerUrl, formatNumber, formatWei, weiToCtc } from '@/lib/format';
import { CONTRACTS, NETWORKS } from '@/lib/protocol';

// See the comment on dashboard/devices/page.tsx — forced dynamic so this page reflects a
// device's current on-chain state on every visit, not a build-time (or last-revalidated)
// snapshot. No generateStaticParams either: every device, known or newly discovered, is
// resolved by the same fresh lookup below — there is no separate "known labels" list to
// pre-render, and force-dynamic would bypass any such pre-render anyway.
export const dynamic = 'force-dynamic';

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const label = decodeURIComponent(deviceId);

  const { device, settlements } = await getDeviceDetail(label);
  if (!device) notFound();

  const latest = settlements[0];

  const creditcoinRegistered = device.rewardOperator.toLowerCase() !== ZeroAddress.toLowerCase();
  const awaitingCreditcoin = !creditcoinRegistered && Boolean(device.registrationTxHash);

  const journey: TimelineStep[] = latest
    ? [
        {
          title: 'Source event',
          network: NETWORKS.sepolia.label,
          description: `${device.label} reported ${formatNumber(latest.activityUnits)} activity units as session #${latest.sessionId}. The registry assigns the session id, so this pair can only ever be emitted once.`,
          evidence: (
            <TransactionHash
              value={latest.sourceTxHash}
              href={explorerUrl('sepolia', 'tx', latest.sourceTxHash)}
            />
          ),
        },
        {
          title: 'Attestcoin attestation',
          network: 'Attestcoin',
          description: `An independent attestor set reached consensus on Sepolia block ${formatNumber(latest.sourceBlock)}, producing a Merkle inclusion proof and a continuity proof back to an attested digest.`,
        },
        {
          title: 'Creditcoin verification',
          network: NETWORKS.creditcoin.label,
          description:
            'The 0xFD2 precompile checked both proofs. Verification is a hard gate — a failure reverts before any Nodra logic runs.',
          evidence: <TransactionHash value={CONTRACTS.attestcoinVerifier.address} lead={10} tail={4} />,
        },
        {
          title: 'Nodra settlement',
          network: 'Nodra',
          description: `The controller confirmed the emitter, event signature, receipt status and device registration, then accrued ${formatWei(latest.rewardWei)} wei CTC to the operator.`,
          evidence: (
            <TransactionHash
              value={latest.settlementTxHash}
              href={explorerUrl('creditcoin', 'tx', latest.settlementTxHash)}
            />
          ),
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/devices"
        className="mb-5 inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink-primary"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9.5 3.5L5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Devices
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink-primary">
              {device.label}
            </h1>
            <StatusBadge
              label={device.status === 'active' ? 'Active' : 'Idle'}
              tone={device.status === 'active' ? 'ok' : 'muted'}
              pulse={device.status === 'active'}
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-ink-muted">Device ID</span>
            <TransactionHash value={device.id} lead={12} tail={8} />
          </div>
        </div>
        <ProvenanceTag provenance={device.provenance} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: 'Activity', value: formatNumber(device.totalActivityUnits), unit: 'units' },
          { label: 'Sessions', value: formatNumber(device.sessions), unit: '' },
          { label: 'Source chain', value: NETWORKS.sepolia.label, unit: '', check: true },
          { label: 'Kind', value: device.kind, unit: '' },
        ].map((item) => (
          <Panel key={item.label} className="p-5">
            <span className="label-xs">{item.label}</span>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-lg font-medium text-ink-primary tabular-nums">
                {item.value}
              </span>
              {item.unit ? <span className="text-xs text-ink-muted">{item.unit}</span> : null}
              {item.check ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Verification journey" meta="Source event through to settled reward" />
          <div className="p-5">
            {journey.length > 0 ? (
              <ProofTimeline steps={journey} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-muted">
                No verified activity for this device yet.
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <PanelHeader title="Reward" />
            <div className="p-5">
              {latest ? (
                <>
                  <div className="font-mono text-2xl font-medium tracking-tight text-blue-300 tabular-nums">
                    {formatWei(latest.rewardWei)}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    wei CTC · {weiToCtc(latest.rewardWei)} CTC
                  </div>
                  <dl className="mt-5">
                    <DataRow label="Reward operator">
                      <TransactionHash value={latest.rewardOperator} lead={8} tail={6} />
                    </DataRow>
                    <DataRow label="Rate">1e12 wei / unit</DataRow>
                    <DataRow label="Units" mono>
                      {formatNumber(latest.activityUnits)}
                    </DataRow>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-ink-muted">No rewards accrued yet.</p>
              )}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Status" />
            <div className="p-5">
              <dl>
                {device.registrationTxHash ? (
                  <DataRow label="Registration">
                    <span className="flex items-center gap-2">
                      <TransactionHash
                        value={device.registrationTxHash}
                        href={explorerUrl('sepolia', 'tx', device.registrationTxHash)}
                        lead={6}
                        tail={4}
                      />
                      <ProvenanceTag provenance={device.registrationConfirmedLive ? 'live' : 'recorded'} />
                    </span>
                  </DataRow>
                ) : null}
                <DataRow label="Source chain">
                  <span className="flex items-center gap-2">
                    <span className="text-ok">Confirmed</span>
                    <ProvenanceTag provenance={latest?.sourceConfirmedLive ? 'live' : 'recorded'} />
                  </span>
                </DataRow>
                <DataRow label="Attestation">
                  <span className="text-ok">Verified</span>
                </DataRow>
                <DataRow label="Destination">
                  <span className="flex items-center gap-2">
                    <span className="text-ok">Settled</span>
                    <ProvenanceTag provenance={latest?.settlementConfirmedLive ? 'live' : 'recorded'} />
                  </span>
                </DataRow>
                <DataRow label="Operator (source)">
                  <TransactionHash value={device.sourceOperator} lead={6} tail={4} />
                </DataRow>
                <DataRow label="Creditcoin registration">
                  {creditcoinRegistered ? (
                    <span className="flex items-center gap-2 text-ok">Registered</span>
                  ) : (
                    <span className="text-warn">Pending</span>
                  )}
                </DataRow>
              </dl>
              {awaitingCreditcoin && device.registrationTxHash ? (
                <RetryCreditcoinRegistration sepoliaTxHash={device.registrationTxHash} />
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
