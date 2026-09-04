import Link from 'next/link';

import { TransactionHash } from '@/components/hash';
import { SectionHeading } from '@/components/metrics';
import { EmptyState, Panel, PanelHeader, ProvenanceTag, StatusBadge } from '@/components/primitives';
import { getLiveDashboardData } from '@/lib/server/live-data';
import { explorerUrl, formatNumber, formatWei, weiToCtc } from '@/lib/format';
import { REWARD } from '@/lib/protocol';

export const metadata = { title: 'Rewards — Nodra' };
// See the comment on dashboard/devices/page.tsx — forced dynamic so a device's freshly
// accrued reward shows up immediately rather than only after a background ISR revalidation.
export const dynamic = 'force-dynamic';

export default async function RewardsPage() {
  const { settlements: SETTLEMENTS, totals, rewardAccounts: accounts } = await getLiveDashboardData();

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Rewards"
        description="Incentives accrued to operators for verified physical work."
        action={<ProvenanceTag provenance="derived" />}
      />

      <Panel className="overflow-hidden border-blue-500/25 bg-blue-500/[0.04]">
        <div className="p-6">
          <span className="label-xs">Total rewards</span>
          <div className="mt-3 font-mono text-3xl font-medium tracking-tight text-blue-300 tabular-nums sm:text-4xl">
            {formatWei(totals.totalRewardWei)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span>wei CTC</span>
            <span className="text-ink-faint">·</span>
            <span className="font-mono">{weiToCtc(totals.totalRewardWei)} CTC</span>
          </div>
          <p className="mt-4 max-w-lg text-xs leading-relaxed text-ink-muted">
            Calculated on-chain as{' '}
            <span className="font-mono text-ink-secondary">activityUnits × rewardRatePerUnit</span>,
            where the rate is {REWARD.ratePerUnit.toString()} wei per unit. The rate is bounded by
            MAX_REWARD_RATE_PER_UNIT so it cannot be set arbitrarily high.
          </p>
        </div>
      </Panel>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Reward history" meta={`${SETTLEMENTS.length} settlement(s)`} />
          {SETTLEMENTS.length === 0 ? (
            <EmptyState
              title="No rewards yet"
              description="Rewards appear here once verified device activity settles on Creditcoin."
            />
          ) : (
            <ul className="divide-y divide-line">
              {SETTLEMENTS.map((item) => (
                <li key={`${item.deviceId}-${item.sessionId}`} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/dashboard/devices/${item.deviceLabel}`}
                        className="font-mono text-sm text-blue-400 transition-colors hover:text-blue-300"
                      >
                        {item.deviceLabel}
                      </Link>
                      <div className="mt-1 text-xs text-ink-muted">
                        {formatNumber(item.activityUnits)} units · session #{item.sessionId}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-ink-primary tabular-nums">
                        {formatWei(item.rewardWei)}
                      </div>
                      <div className="text-2xs text-ink-muted">wei CTC</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <StatusBadge label="Settled" tone="ok" />
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      Settlement
                      <TransactionHash
                        value={item.settlementTxHash}
                        href={explorerUrl('creditcoin', 'tx', item.settlementTxHash)}
                      />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader title="Recipients" meta="Operators credited on Creditcoin" />
          {accounts.length === 0 ? (
            <EmptyState title="No recipients" description="No operator has accrued rewards yet." />
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((account) => (
                <li key={account.operator} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="label-xs">Operator</span>
                    <ProvenanceTag provenance={account.provenance} />
                  </div>
                  <div className="mt-2">
                    <TransactionHash
                      value={account.operator}
                      href={explorerUrl('creditcoin', 'address', account.operator)}
                      lead={10}
                      tail={6}
                    />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="font-mono text-lg font-medium text-ink-primary tabular-nums">
                        {formatWei(account.totalWei)}
                      </div>
                      <div className="text-2xs text-ink-muted">wei CTC</div>
                    </div>
                    <div className="text-right text-xs text-ink-muted">
                      {account.settlements} settlement{account.settlements === 1 ? '' : 's'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
