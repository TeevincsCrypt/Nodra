import { DataRow, TransactionHash } from '@/components/hash';
import { SectionHeading } from '@/components/metrics';
import { ProofTimeline, type TimelineStep } from '@/components/proof-timeline';
import { EmptyState, Panel, PanelHeader, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { SETTLEMENTS } from '@/lib/data';
import { explorerUrl, formatNumber, formatWei } from '@/lib/format';
import { CONTRACTS, NETWORKS, SOURCE_CHAIN_KEY } from '@/lib/protocol';

export const metadata = { title: 'Proofs — Nodra' };

export default function ProofsPage() {
  const proofs = SETTLEMENTS;

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Cross-chain proofs"
        description="Nodra does not trust an API. Every reward is gated on a proof the Creditcoin runtime verifies itself."
        action={
          <div className="flex items-center gap-2">
            <StatusBadge label={`${proofs.length} verified`} tone="ok" />
            <ProvenanceTag provenance="recorded" />
          </div>
        }
      />

      {proofs.length === 0 ? (
        <Panel>
          <EmptyState
            title="No proofs yet"
            description="When a device reports work and Attestcoin attests the source block, the resulting proof will appear here."
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {proofs.map((proof) => {
            const steps: TimelineStep[] = [
              {
                title: 'Source event',
                network: NETWORKS.sepolia.label,
                description: `NodraDeviceRegistry emitted DeviceActivityReported for ${proof.deviceLabel}, session #${proof.sessionId}, ${formatNumber(proof.activityUnits)} units.`,
                evidence: (
                  <TransactionHash
                    value={proof.sourceTxHash}
                    href={explorerUrl('sepolia', 'tx', proof.sourceTxHash)}
                  />
                ),
              },
              {
                title: 'Source receipt',
                network: NETWORKS.sepolia.label,
                description:
                  'The transaction receipt records status 1 and the emitted logs. Nodra rejects any proved transaction whose receipt status is not 1, so a reverted source call can never settle.',
              },
              {
                title: 'Attestcoin attestation',
                network: 'Attestcoin',
                description: `Independent attestors reached consensus on Sepolia block ${formatNumber(proof.sourceBlock)} and committed it to Creditcoin. No single operator can forge this.`,
              },
              {
                title: 'Merkle inclusion + continuity proof',
                network: 'Attestcoin',
                description: `The proof builder produced a ${proof.proof.merkleSiblings}-sibling Merkle path proving the transaction sits in that block, plus a continuity proof chaining the block back to an attested digest.`,
              },
              {
                title: 'Creditcoin verification',
                network: NETWORKS.creditcoin.label,
                description:
                  'ASCBase passed both proofs to the native query verifier precompile at 0xFD2. This is a hard gate: if verification returns false, the transaction reverts before any Nodra logic executes.',
                evidence: (
                  <TransactionHash value={CONTRACTS.attestcoinVerifier.address} lead={10} tail={4} />
                ),
              },
              {
                title: 'Nodra settlement',
                network: 'Nodra',
                description: `Only then did the controller decode the log, confirm the emitter and event signature, check the device registration and bounds, and accrue ${formatWei(proof.rewardWei)} wei CTC.`,
                evidence: (
                  <TransactionHash
                    value={proof.settlementTxHash}
                    href={explorerUrl('creditcoin', 'tx', proof.settlementTxHash)}
                  />
                ),
              },
            ];

            return (
              <Panel key={`${proof.deviceId}-${proof.sessionId}`} className="overflow-hidden">
                <PanelHeader
                  title={`${proof.deviceLabel} · session #${proof.sessionId}`}
                  meta="Sepolia → Attestcoin → Creditcoin"
                  action={<StatusBadge label="Verified" tone="ok" pulse />}
                />

                {/* Summary strip */}
                <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-card p-5">
                    <span className="label-xs">Source</span>
                    <div className="mt-2 text-sm font-medium text-ink-primary">
                      {NETWORKS.sepolia.label}
                    </div>
                    <div className="mt-1 font-mono text-xs text-ink-muted">
                      Block {formatNumber(proof.sourceBlock)}
                    </div>
                  </div>
                  <div className="bg-card p-5">
                    <span className="label-xs">Transaction</span>
                    <div className="mt-2">
                      <TransactionHash
                        value={proof.sourceTxHash}
                        href={explorerUrl('sepolia', 'tx', proof.sourceTxHash)}
                      />
                    </div>
                  </div>
                  <div className="bg-card p-5">
                    <span className="label-xs">Attestcoin</span>
                    <div className="mt-2 flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-sm font-medium text-ok">Verified</span>
                    </div>
                  </div>
                  <div className="bg-card p-5">
                    <span className="label-xs">Creditcoin</span>
                    <div className="mt-2 flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ok" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-sm font-medium text-ok">Settled</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <div className="bg-card p-5">
                    <h3 className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Chain of custody
                    </h3>
                    <ProofTimeline steps={steps} />
                  </div>

                  <div className="bg-card p-5">
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Proof parameters
                    </h3>
                    <dl>
                      <DataRow label="Chain key" mono>
                        {SOURCE_CHAIN_KEY}
                      </DataRow>
                      <DataRow label="Header number" mono>
                        {formatNumber(proof.proof.headerNumber)}
                      </DataRow>
                      <DataRow label="Transaction index" mono>
                        {proof.proof.transactionIndex}
                      </DataRow>
                      <DataRow label="Merkle siblings" mono>
                        {proof.proof.merkleSiblings}
                      </DataRow>
                      <DataRow label="Continuity roots" mono>
                        {proof.proof.continuityRoots}
                      </DataRow>
                      <DataRow label="Verifier">
                        <TransactionHash
                          value={CONTRACTS.attestcoinVerifier.address}
                          lead={10}
                          tail={4}
                          showCopy={false}
                        />
                      </DataRow>
                    </dl>

                    <div className="mt-5 rounded-md border border-blue-500/25 bg-blue-500/[0.05] p-4">
                      <p className="text-xs leading-relaxed text-ink-secondary">
                        <span className="font-medium text-blue-300">Why this matters. </span>
                        The chain key is Attestcoin&apos;s identifier for Sepolia — not its EVM chain
                        id. The Merkle path proves the transaction was in the block; the continuity
                        proof proves the block belongs to the attested chain. Nodra&apos;s contract
                        cannot skip either check: both are enforced by the runtime precompile, not by
                        Solidity we control.
                      </p>
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
