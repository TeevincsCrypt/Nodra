import Link from 'next/link';

import { TransactionHash } from '@/components/hash';
import { MetricCard } from '@/components/metrics';
import { NetworkPipeline, type Stage } from '@/components/pipeline';
import { Panel, PanelHeader, StatusBadge } from '@/components/primitives';
import { DEVICES, RECORDED_SETTLEMENT, getTotals } from '@/lib/data';
import { compactWei, explorerUrl, formatNumber, formatWei, weiToCtc } from '@/lib/format';
import { CONTRACTS, NETWORKS, SOURCE_CHAIN_KEY } from '@/lib/protocol';

export const metadata = { title: 'Overview — Nodra' };

const settlement = RECORDED_SETTLEMENT;

const STAGES: Stage[] = [
  {
    key: 'source',
    label: 'Source',
    network: NETWORKS.sepolia.label,
    detail: 'Device reports measurable work as an on-chain event.',
    meta: [
      { label: 'Contract', value: CONTRACTS.deviceRegistry.address },
      { label: 'Chain ID', value: String(NETWORKS.sepolia.chainId) },
      { label: 'Block', value: formatNumber(settlement.sourceBlock) },
      { label: 'Event', value: 'DeviceActivityReported' },
    ],
  },
  {
    key: 'attestation',
    label: 'Attestation',
    network: 'Attestcoin',
    detail: 'Independent attestors reach consensus on the source block.',
    meta: [
      { label: 'Chain key', value: String(SOURCE_CHAIN_KEY) },
      { label: 'Header number', value: formatNumber(settlement.proof.headerNumber) },
      { label: 'Merkle siblings', value: String(settlement.proof.merkleSiblings) },
      { label: 'Continuity roots', value: String(settlement.proof.continuityRoots) },
    ],
  },
  {
    key: 'destination',
    label: 'Destination',
    network: NETWORKS.creditcoin.label,
    detail: 'The 0xFD2 precompile verifies inclusion and continuity.',
    meta: [
      { label: 'Verifier', value: CONTRACTS.attestcoinVerifier.address },
      { label: 'Chain ID', value: String(NETWORKS.creditcoin.chainId) },
      { label: 'Block', value: formatNumber(settlement.settlementBlock) },
      { label: 'Tx index', value: String(settlement.proof.transactionIndex) },
    ],
  },
  {
    key: 'incentive',
    label: 'Incentive',
    network: 'Nodra',
    detail: 'Reward accrues only after verification succeeds.',
    meta: [
      { label: 'Controller', value: CONTRACTS.incentiveController.address },
      { label: 'Rate', value: '1e12 wei / unit' },
      { label: 'Units', value: formatNumber(settlement.activityUnits) },
      { label: 'Reward', value: `${formatWei(settlement.rewardWei)} wei` },
    ],
  },
];

export default function OverviewPage() {
  const totals = getTotals();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="text-sm text-ink-muted">Good morning</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">Nodra Network</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Devices"
          value={formatNumber(totals.deviceCount)}
          sublabel={`${totals.activeDeviceCount} active`}
          provenance="recorded"
        />
        <MetricCard
          label="Activity"
          value={formatNumber(totals.totalActivityUnits)}
          unit="units"
          sublabel="Verified work reported"
          provenance="recorded"
        />
        <MetricCard
          label="Proofs"
          value={formatNumber(totals.verifiedProofs)}
          sublabel="Verified through Attestcoin"
          provenance="recorded"
        />
        <MetricCard
          label="Rewards"
          value={compactWei(totals.totalRewardWei)}
          unit="wei"
          sublabel={`${formatWei(totals.totalRewardWei)} wei · ${weiToCtc(totals.totalRewardWei)} CTC`}
          provenance="derived"
          accent
        />
      </div>

      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Settlement path"
          meta="Select a stage for its technical detail"
          action={<StatusBadge label="Operational" tone="ok" pulse />}
        />
        <NetworkPipeline stages={STAGES} />
      </Panel>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Registered devices"
            action={
              <Link
                href="/dashboard/devices"
                className="text-xs text-blue-400 transition-colors hover:text-blue-300"
              >
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {DEVICES.map((device) => (
              <li key={device.id}>
                <Link
                  href={`/dashboard/devices/${device.label}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-ink-primary">{device.label}</span>
                      <StatusBadge label="Active" tone="ok" />
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {device.kind} · {NETWORKS[device.sourceNetwork].label}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm text-ink-primary tabular-nums">
                      {formatNumber(device.totalActivityUnits)}
                    </div>
                    <div className="text-2xs text-ink-muted">units</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Latest settlement"
            action={
              <Link
                href="/dashboard/activity"
                className="text-xs text-blue-400 transition-colors hover:text-blue-300"
              >
                View activity
              </Link>
            }
          />
          <div className="p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="font-mono text-sm text-ink-primary">{settlement.deviceLabel}</div>
                <div className="mt-1 text-xs text-ink-muted">Session #{settlement.sessionId}</div>
              </div>
              <StatusBadge label="Settled" tone="ok" />
            </div>

            <div className="mt-5 rounded-md border border-line bg-raised/50 p-4">
              <span className="label-xs">Reward</span>
              <div className="mt-2 font-mono text-xl font-medium text-blue-300 tabular-nums">
                {formatWei(settlement.rewardWei)}
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                wei CTC · {weiToCtc(settlement.rewardWei)} CTC
              </div>
            </div>

            <dl className="mt-4 space-y-0">
              <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
                <dt className="text-xs text-ink-muted">Source tx</dt>
                <dd>
                  <TransactionHash
                    value={settlement.sourceTxHash}
                    href={explorerUrl('sepolia', 'tx', settlement.sourceTxHash)}
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-xs text-ink-muted">Settlement tx</dt>
                <dd>
                  <TransactionHash
                    value={settlement.settlementTxHash}
                    href={explorerUrl('creditcoin', 'tx', settlement.settlementTxHash)}
                  />
                </dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>
    </div>
  );
}
