import { DataRow, TransactionHash } from '@/components/hash';
import { SectionHeading } from '@/components/metrics';
import { CheckLine, Panel, PanelHeader, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { getLiveDashboardData } from '@/lib/server/live-data';
import { formatWei } from '@/lib/format';
import { explorerUrl } from '@/lib/format';
import { CONTRACTS, NETWORKS, REWARD, SECURITY_PROPERTIES, SOURCE_CHAIN_KEY } from '@/lib/protocol';

export const metadata = { title: 'Protocol — Nodra' };
// See the comment on dashboard/devices/page.tsx — forced dynamic for the same reason: this
// reads live contract state (owner, paused, rate) that must not lag behind a stale build.
export const dynamic = 'force-dynamic';

const CONTRACT_LIST = [
  { ...CONTRACTS.deviceRegistry, network: 'sepolia' as const },
  { ...CONTRACTS.incentiveController, network: 'creditcoin' as const },
  { ...CONTRACTS.attestcoinVerifier, network: 'creditcoin' as const },
];

export default async function ProtocolPage() {
  const { protocolState } = await getLiveDashboardData();

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Protocol"
        description="Deployed contracts, networks, reward configuration and the security properties enforced on-chain."
        action={<StatusBadge label="Testnet" tone="blue" />}
      />

      {/* Contracts */}
      <Panel className="overflow-hidden">
        <PanelHeader title="Contracts" meta="Live testnet deployments" />
        <ul className="divide-y divide-line">
          {CONTRACT_LIST.map((contract) => (
            <li key={contract.address} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-primary">{contract.name}</div>
                  <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-ink-muted">
                    {contract.role}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-line bg-raised px-2 py-1 text-2xs text-ink-secondary">
                  {NETWORKS[contract.network].label}
                </span>
              </div>
              <div className="mt-3">
                <TransactionHash
                  value={contract.address}
                  href={explorerUrl(contract.network, 'address', contract.address)}
                  lead={14}
                  tail={8}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Live contract state */}
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Live contract state"
          meta="Read directly from NodraIncentiveController on Creditcoin"
          action={<ProvenanceTag provenance={protocolState.provenance} />}
        />
        <div className="p-5">
          <dl>
            <DataRow label="Owner">
              {protocolState.owner ? (
                <TransactionHash
                  value={protocolState.owner}
                  href={explorerUrl('creditcoin', 'address', protocolState.owner)}
                  lead={8}
                  tail={6}
                />
              ) : (
                <span className="text-ink-faint">unavailable</span>
              )}
            </DataRow>
            <DataRow label="Paused">
              {protocolState.paused === undefined ? (
                <span className="text-ink-faint">unavailable</span>
              ) : (
                <StatusBadge
                  label={protocolState.paused ? 'Paused' : 'Not paused'}
                  tone={protocolState.paused ? 'danger' : 'ok'}
                />
              )}
            </DataRow>
            <DataRow label="Reward rate per unit" mono>
              {protocolState.rewardRatePerUnitWei !== undefined
                ? `${formatWei(protocolState.rewardRatePerUnitWei)} wei`
                : 'unavailable'}
            </DataRow>
            <DataRow label="Source device registry">
              {protocolState.sourceDeviceRegistry ? (
                <TransactionHash
                  value={protocolState.sourceDeviceRegistry}
                  href={explorerUrl('sepolia', 'address', protocolState.sourceDeviceRegistry)}
                  lead={8}
                  tail={6}
                />
              ) : (
                <span className="text-ink-faint">unavailable</span>
              )}
            </DataRow>
          </dl>
          {protocolState.provenance === 'recorded' ? (
            <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
              Live read from Creditcoin was unavailable this request, so this section could not be
              refreshed. It will retry automatically on the next revalidation.
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        {/* Networks */}
        <Panel className="overflow-hidden">
          <PanelHeader title="Networks" />
          <div className="p-5">
            <dl>
              <DataRow label="Source chain">{NETWORKS.sepolia.label}</DataRow>
              <DataRow label="Source chain ID" mono>
                {NETWORKS.sepolia.chainId}
              </DataRow>
              <DataRow label="Attestcoin chain key" mono>
                {SOURCE_CHAIN_KEY}
              </DataRow>
              <DataRow label="Destination chain">{NETWORKS.creditcoin.label}</DataRow>
              <DataRow label="Destination chain ID" mono>
                {NETWORKS.creditcoin.chainId}
              </DataRow>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              The Attestcoin chain key ({SOURCE_CHAIN_KEY}) identifies Sepolia on Creditcoin. It is
              deliberately not the EVM chain id ({NETWORKS.sepolia.chainId}) — confusing the two is a
              common integration mistake.
            </p>
            {!NETWORKS.creditcoin.explorerUrl ? (
              <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
                No verified block explorer is configured for {NETWORKS.creditcoin.label}. Creditcoin
                hashes render as copyable values rather than links. Set
                NEXT_PUBLIC_CREDITCOIN_EXPLORER_URL to enable linking.
              </p>
            ) : null}
          </div>
        </Panel>

        {/* Reward configuration */}
        <Panel className="overflow-hidden">
          <PanelHeader title="Reward configuration" />
          <div className="p-5">
            <div className="rounded-md border border-line bg-raised/50 p-4 text-center">
              <div className="font-mono text-sm text-ink-primary">1 activity unit</div>
              <div className="my-2 text-ink-faint">=</div>
              <div className="font-mono text-lg font-medium text-blue-300">
                {formatWei(REWARD.ratePerUnit)}
              </div>
              <div className="mt-1 text-2xs text-ink-muted">wei CTC</div>
            </div>
            <dl className="mt-4">
              <DataRow label="Rate per unit" mono>
                1e12 wei
              </DataRow>
              <DataRow label="Max activity units" mono>
                {formatWei(REWARD.maxActivityUnits)}
              </DataRow>
              <DataRow label="Max rate per unit" mono>
                1e18 wei (1 CTC)
              </DataRow>
            </dl>
          </div>
        </Panel>
      </div>

      {/* Security */}
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Security properties"
          meta="Enforced by the contracts, not by the interface"
        />
        <div className="p-5">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY_PROPERTIES.map((item) => (
              <CheckLine key={item.label} label={item.label} detail={item.detail} />
            ))}
          </ul>

          <div className="mt-6 rounded-md border border-blue-500/25 bg-blue-500/[0.05] p-4">
            <p className="text-xs leading-relaxed text-ink-secondary">
              <span className="font-medium text-blue-300">The load-bearing check. </span>
              Attestcoin proves that an event happened; source-emitter validation proves it happened
              in <em>our</em> registry. Without it, anyone could deploy a contract emitting an
              identical event with any device id, obtain a perfectly valid proof, and mint themselves
              rewards. Both checks are required, and both run before any reward is written.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
