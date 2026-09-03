import Link from 'next/link';

import { Wordmark } from '@/components/brand';
import { TransactionHash } from '@/components/hash';
import { HeroPipeline } from '@/components/pipeline';
import { ButtonLink, CheckLine, Panel, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { RECORDED_SETTLEMENT } from '@/lib/data';
import { explorerUrl, formatNumber, formatWei, weiToCtc } from '@/lib/format';
import { CONTRACTS, NETWORKS, PROTOCOL } from '@/lib/protocol';

const PILLARS = [
  {
    step: '01',
    title: 'Verify work',
    body: 'Physical infrastructure reports measurable activity on a source chain. The event is signed, mined, and permanent — a device cannot claim work it did not do.',
  },
  {
    step: '02',
    title: 'Prove it',
    body: 'Attestcoin provides the cross-chain proof that the source-chain event actually happened. An independent attestor set reaches consensus on the source block; no centralised oracle sits in the path.',
  },
  {
    step: '03',
    title: 'Reward it',
    body: 'Nodra verifies that proof on Creditcoin through a native precompile and calculates the incentive. If verification fails, the reward is never written.',
  },
];

export default function LandingPage() {
  const settlement = RECORDED_SETTLEMENT;
  const sourceTxUrl = explorerUrl('sepolia', 'tx', settlement.sourceTxHash);
  const settlementTxUrl = explorerUrl('creditcoin', 'tx', settlement.settlementTxHash);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-backdrop grid-fade" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full opacity-[0.13] blur-[120px]"
        style={{ background: 'radial-gradient(circle, #2E7CF6 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      {/* ---------------------------------------------------------- Nav */}
      <header className="relative z-10 border-b border-line">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Wordmark href={null} />
          <div className="flex items-center gap-2">
            <Link
              href="#protocol"
              className="hidden rounded-md px-3 py-2 text-sm text-ink-secondary transition-colors hover:text-ink-primary sm:block"
            >
              Protocol
            </Link>
            <Link
              href="/dashboard/proofs"
              className="hidden rounded-md px-3 py-2 text-sm text-ink-secondary transition-colors hover:text-ink-primary sm:block"
            >
              Proofs
            </Link>
            <ButtonLink href="/dashboard" className="px-3.5 py-2">
              Launch Dashboard
            </ButtonLink>
          </div>
        </nav>
      </header>

      {/* ---------------------------------------------------------- Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
          <div className="max-w-2xl">
            <StatusBadge label="Live on Creditcoin Testnet" tone="blue" pulse />

            <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-ink-primary sm:text-6xl">
              Trustless incentives
              <br />
              for the{' '}
              <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                physical internet.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-secondary sm:text-lg">
              Verify physical work. Coordinate infrastructure. Reward operators anywhere.
            </p>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
              Nodra turns verifiable real-world activity into programmable cross-chain incentives —
              proven by the Attestcoin Protocol and settled on Creditcoin.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/dashboard">Launch Dashboard</ButtonLink>
              <ButtonLink href="#protocol" variant="secondary">
                Explore Protocol
              </ButtonLink>
            </div>
          </div>

          <div className="lg:pt-4">
            <HeroPipeline />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Pillars */}
      <section id="protocol" className="relative z-10 border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            A reward is only as trustworthy as the proof behind it.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">
            Most DePIN incentives rely on a backend that says the work happened. Nodra removes that
            assumption entirely.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Panel key={pillar.step} className="p-6 panel-hover">
                <span className="font-mono text-2xs text-blue-400">{pillar.step}</span>
                <h3 className="mt-3 text-base font-semibold text-ink-primary">{pillar.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{pillar.body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Status */}
      <section className="relative z-10 border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-14">
            <div>
              <span className="label-xs">Protocol status</span>
              <div className="mt-3 flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-ok animate-pulse-dot shadow-[0_0_10px_rgba(46,212,122,0.8)]" />
                <span className="text-2xl font-semibold tracking-tight text-ink-primary">Operational</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                All three legs of the settlement path are deployed and have carried a verified
                end-to-end transaction.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Source chain', value: NETWORKS.sepolia.label, note: 'Device activity' },
                { label: 'Attestation', value: 'Attestcoin', note: 'Cross-chain proof' },
                { label: 'Destination', value: NETWORKS.creditcoin.label, note: 'Reward settlement' },
              ].map((item) => (
                <Panel key={item.label} className="relative p-5 panel-hover">
                  <span className="label-xs">{item.label}</span>
                  <div className="mt-3 text-sm font-medium text-ink-primary">{item.value}</div>
                  <div className="mt-1 text-xs text-ink-muted">{item.note}</div>
                  <span className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-ok" />
                </Panel>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Latest settlement */}
      <section className="relative z-10 border-t border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="label-xs">Latest settlement</span>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
                One device. One proof. One reward.
              </h2>
            </div>
            <ProvenanceTag provenance="recorded" />
          </div>

          <Panel className="overflow-hidden">
            <div className="grid gap-px bg-line md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-medium text-ink-primary">
                    {settlement.deviceLabel}
                  </span>
                  <StatusBadge label="Settled" tone="ok" />
                </div>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-mono text-4xl font-medium tracking-tight text-ink-primary tabular-nums">
                    {formatNumber(settlement.activityUnits)}
                  </span>
                  <span className="text-sm text-ink-muted">activity units</span>
                </div>

                <ul className="mt-6 space-y-2.5">
                  <CheckLine label="Source event confirmed" />
                  <CheckLine label="Attested by Attestcoin" />
                  <CheckLine label="Verified on Creditcoin" />
                  <CheckLine label="Reward settled" />
                </ul>
              </div>

              <div className="bg-card p-6">
                <span className="label-xs">Reward</span>
                <div className="mt-3">
                  <div className="font-mono text-2xl font-medium tracking-tight text-blue-300 tabular-nums">
                    {formatWei(settlement.rewardWei)}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    wei CTC · {weiToCtc(settlement.rewardWei)} CTC
                  </div>
                </div>

                <dl className="mt-6 space-y-0">
                  <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                    <dt className="text-xs text-ink-muted">Sepolia activity</dt>
                    <dd>
                      <TransactionHash value={settlement.sourceTxHash} href={sourceTxUrl} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                    <dt className="text-xs text-ink-muted">Creditcoin settlement</dt>
                    <dd>
                      <TransactionHash value={settlement.settlementTxHash} href={settlementTxUrl} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-xs text-ink-muted">Reward operator</dt>
                    <dd>
                      <TransactionHash
                        value={settlement.rewardOperator}
                        href={explorerUrl('creditcoin', 'address', settlement.rewardOperator)}
                        lead={6}
                        tail={4}
                      />
                    </dd>
                  </div>
                </dl>

                {!settlementTxUrl ? (
                  <p className="mt-4 text-2xs leading-relaxed text-ink-faint">
                    No verified block explorer is configured for {NETWORKS.creditcoin.label}, so
                    Creditcoin hashes are shown as copyable values rather than links.
                  </p>
                ) : null}
              </div>
            </div>
          </Panel>

          <div className="mt-6">
            <ButtonLink href="/dashboard/proofs" variant="secondary">
              Inspect the proof
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Footer */}
      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Wordmark href={null} />
            <p className="mt-2 text-xs text-ink-muted">{PROTOCOL.tagline}</p>
          </div>
          <div className="flex flex-col gap-1.5 text-2xs text-ink-faint sm:items-end">
            <span>
              Registry · <span className="font-mono">{CONTRACTS.deviceRegistry.address}</span>
            </span>
            <span>
              Controller · <span className="font-mono">{CONTRACTS.incentiveController.address}</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
