import Link from 'next/link';

import { TransactionHash } from '@/components/hash';
import { MetricCard } from '@/components/metrics';
import { JourneyPipeline, NetworkPipeline, type JourneyStep, type Stage } from '@/components/pipeline';
import { Panel, PanelHeader, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { RECORDED_SETTLEMENT, type Device, type RewardAccount, type Settlement } from '@/lib/data';
import { getLiveDashboardData } from '@/lib/server/live-data';
import { compactWei, explorerUrl, formatNumber, formatWei, weiToCtc } from '@/lib/format';
import { CONTRACTS, NETWORKS, SOURCE_CHAIN_KEY } from '@/lib/protocol';

export const metadata = { title: 'Overview — Nodra' };

// Bakes the page at build time, then regenerates in the background at most every 30s —
// live enough to feel current without hammering the RPC endpoints on every request.
export const revalidate = 30;

function buildJourney(device: Device, settlement: Settlement, rewardAccount: RewardAccount | undefined): JourneyStep[] {
  return [
    {
      key: 'device',
      title: device.label,
      subtitle: 'Registered infrastructure reporting verifiable work.',
      complete: device.status === 'active',
      provenance: device.provenance,
    },
    {
      key: 'registry',
      title: 'Sepolia Device Registry',
      subtitle: device.registrationTxHash
        ? 'Device registration confirmed on-chain.'
        : 'No recorded registration transaction.',
      complete: Boolean(device.registrationTxHash),
      provenance: device.registrationTxHash
        ? device.registrationConfirmedLive
          ? 'live'
          : 'recorded'
        : undefined,
      evidence: device.registrationTxHash ? (
        <TransactionHash
          value={device.registrationTxHash}
          href={explorerUrl('sepolia', 'tx', device.registrationTxHash)}
        />
      ) : undefined,
    },
    {
      key: 'activity',
      title: 'Device Activity',
      subtitle: `${formatNumber(settlement.activityUnits)} units reported as session #${settlement.sessionId}.`,
      complete: true,
      provenance: settlement.sourceConfirmedLive ? 'live' : 'recorded',
      evidence: (
        <TransactionHash value={settlement.sourceTxHash} href={explorerUrl('sepolia', 'tx', settlement.sourceTxHash)} />
      ),
    },
    {
      key: 'attestation',
      title: 'Attestcoin Verification',
      subtitle: `Independent attestors reached consensus on Sepolia block ${formatNumber(settlement.sourceBlock)}.`,
      complete: true,
      provenance: 'recorded',
    },
    {
      key: 'proof',
      title: 'Proof',
      subtitle: `Merkle inclusion (${settlement.proof.merkleSiblings} siblings) + continuity proof generated.`,
      complete: true,
      provenance: 'recorded',
    },
    {
      key: 'controller',
      title: 'Creditcoin Incentive Controller',
      subtitle: 'Verified via the native query verifier precompile at 0xFD2.',
      complete: true,
      provenance: settlement.settlementConfirmedLive ? 'live' : 'recorded',
      evidence: (
        <TransactionHash
          value={settlement.settlementTxHash}
          href={explorerUrl('creditcoin', 'tx', settlement.settlementTxHash)}
        />
      ),
    },
    {
      key: 'reward',
      title: 'Reward Settlement',
      subtitle: `${formatWei(settlement.rewardWei)} wei CTC credited to the operator.`,
      complete: true,
      provenance: rewardAccount?.provenance ?? 'recorded',
    },
  ];
}

function buildStages(settlement: Settlement): Stage[] {
  return [
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
}

export default async function OverviewPage() {
  const { devices, settlements, totals, rewardAccounts, degraded } = await getLiveDashboardData();
  const settlement = settlements[0] ?? RECORDED_SETTLEMENT;
  const primaryDevice = devices[0];
  const primaryRewardAccount = rewardAccounts.find(
    (a) => a.operator.toLowerCase() === settlement.rewardOperator.toLowerCase(),
  );
  const stages = buildStages(settlement);
  const journey = primaryDevice ? buildJourney(primaryDevice, settlement, primaryRewardAccount) : [];
  const metricsLive = !degraded.creditcoin;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="text-sm text-ink-muted">Good morning</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary">Nodra Network</h1>
      </div>

      {journey.length > 0 ? (
        <Panel className="mb-6 overflow-hidden border-blue-500/20 shadow-glow">
          <PanelHeader
            title="NODE-001 → Reward"
            meta="The complete verified path, in order"
            action={<StatusBadge label="Operational" tone="ok" pulse />}
          />
          <div className="p-5">
            <JourneyPipeline steps={journey} />
          </div>
        </Panel>
      ) : null}

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
          provenance={metricsLive ? 'live' : 'recorded'}
        />
        <MetricCard
          label="Proofs"
          value={formatNumber(totals.verifiedProofs)}
          sublabel="Verified through Attestcoin"
          provenance={metricsLive ? 'live' : 'recorded'}
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

      {degraded.source || degraded.creditcoin ? (
        <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
          Live reads from {degraded.source && degraded.creditcoin ? 'Sepolia and Creditcoin' : degraded.source ? 'Sepolia' : 'Creditcoin'} were unavailable this request — showing the verified recorded settlement instead.
        </p>
      ) : null}

      <Panel className="mt-6 overflow-hidden">
        <PanelHeader
          title="Settlement path"
          meta="Select a stage for its technical detail"
          action={<StatusBadge label="Operational" tone="ok" pulse />}
        />
        <NetworkPipeline stages={stages} />
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
            {devices.map((device) => (
              <li key={device.id}>
                <Link
                  href={`/dashboard/devices/${device.label}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-ink-primary">{device.label}</span>
                      <StatusBadge
                        label={device.status === 'active' ? 'Active' : 'Idle'}
                        tone={device.status === 'active' ? 'ok' : 'muted'}
                      />
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
