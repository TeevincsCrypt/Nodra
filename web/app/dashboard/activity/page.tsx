import Link from 'next/link';

import { TransactionHash } from '@/components/hash';
import { SectionHeading } from '@/components/metrics';
import { EmptyState, Panel, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { getLiveDashboardData } from '@/lib/server/live-data';
import { explorerUrl, formatNumber, formatWei } from '@/lib/format';
import { NETWORKS } from '@/lib/protocol';

export const metadata = { title: 'Activity — Nodra' };
export const revalidate = 30;

export default async function ActivityPage() {
  const { settlements: SETTLEMENTS } = await getLiveDashboardData();

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Activity"
        description="Every unit of work that has passed through verification and settled."
        action={<ProvenanceTag provenance={SETTLEMENTS[0]?.provenance ?? 'recorded'} />}
      />

      {SETTLEMENTS.length === 0 ? (
        <Panel>
          <EmptyState
            title="No activity yet"
            description="Once infrastructure begins reporting work, verified activity will appear here."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Device', 'Session', 'Activity', 'Source', 'Status', 'Reward'].map((heading) => (
                    <th key={heading} className="px-5 py-3 label-xs font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SETTLEMENTS.map((item) => (
                  <tr key={`${item.deviceId}-${item.sessionId}`} className="transition-colors hover:bg-raised">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/devices/${item.deviceLabel}`}
                        className="font-mono text-sm text-blue-400 transition-colors hover:text-blue-300"
                      >
                        {item.deviceLabel}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-ink-secondary">#{item.sessionId}</td>
                    <td className="px-5 py-4 font-mono text-sm text-ink-primary tabular-nums">
                      {formatNumber(item.activityUnits)} units
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-secondary">{NETWORKS.sepolia.label}</td>
                    <td className="px-5 py-4">
                      <StatusBadge label="Settled" tone="ok" />
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-ink-primary tabular-nums">
                      {formatWei(item.rewardWei)}
                      <span className="ml-1 text-2xs text-ink-muted">wei</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — no horizontal scrolling for the primary record */}
          <ul className="divide-y divide-line md:hidden">
            {SETTLEMENTS.map((item) => (
              <li key={`${item.deviceId}-${item.sessionId}`} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/dashboard/devices/${item.deviceLabel}`}
                    className="font-mono text-sm text-blue-400"
                  >
                    {item.deviceLabel}
                  </Link>
                  <StatusBadge label="Settled" tone="ok" />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="label-xs">Session</dt>
                    <dd className="mt-1 font-mono text-sm text-ink-primary">#{item.sessionId}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Activity</dt>
                    <dd className="mt-1 font-mono text-sm text-ink-primary">
                      {formatNumber(item.activityUnits)} units
                    </dd>
                  </div>
                  <div>
                    <dt className="label-xs">Source</dt>
                    <dd className="mt-1 text-sm text-ink-secondary">{NETWORKS.sepolia.label}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Reward</dt>
                    <dd className="mt-1 font-mono text-sm text-ink-primary">
                      {formatWei(item.rewardWei)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Detail strip */}
          {SETTLEMENTS.map((item) => (
            <div
              key={`detail-${item.deviceId}-${item.sessionId}`}
              className="border-t border-line bg-surface/50 px-5 py-4"
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="label-xs">Session #{item.sessionId} evidence</span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  Source
                  <TransactionHash
                    value={item.sourceTxHash}
                    href={explorerUrl('sepolia', 'tx', item.sourceTxHash)}
                  />
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-muted">
                  Settlement
                  <TransactionHash
                    value={item.settlementTxHash}
                    href={explorerUrl('creditcoin', 'tx', item.settlementTxHash)}
                  />
                </span>
                <Link
                  href="/dashboard/proofs"
                  className="text-xs text-blue-400 transition-colors hover:text-blue-300"
                >
                  Inspect proof →
                </Link>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
