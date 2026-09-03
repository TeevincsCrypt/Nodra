import Link from 'next/link';

import { TransactionHash } from '@/components/hash';
import { SectionHeading } from '@/components/metrics';
import { ButtonLink, EmptyState, Panel, StatusBadge } from '@/components/primitives';
import { DEVICES } from '@/lib/data';
import { formatNumber } from '@/lib/format';
import { NETWORKS } from '@/lib/protocol';

export const metadata = { title: 'Devices — Nodra' };

export default function DevicesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        title="Devices"
        description="Physical infrastructure registered to report verifiable work."
      />

      {DEVICES.length === 0 ? (
        <Panel>
          <EmptyState
            title="No devices registered"
            description="Register infrastructure on the source chain and with the Nodra controller to begin earning verified rewards."
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {DEVICES.map((device) => (
            <Panel key={device.id} className="flex flex-col p-5 panel-hover">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-base font-medium text-ink-primary">{device.label}</div>
                  <div className="mt-1 text-xs text-ink-muted">{device.kind}</div>
                </div>
                <StatusBadge label="Active" tone="ok" pulse />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <dt className="label-xs">Device ID</dt>
                  <dd className="mt-1">
                    <TransactionHash value={device.id} lead={10} tail={6} />
                  </dd>
                </div>
                <div>
                  <dt className="label-xs">Source</dt>
                  <dd className="mt-1 text-sm text-ink-primary">
                    {NETWORKS[device.sourceNetwork].label}
                  </dd>
                </div>
                <div>
                  <dt className="label-xs">Activity</dt>
                  <dd className="mt-1 font-mono text-sm text-ink-primary tabular-nums">
                    {formatNumber(device.totalActivityUnits)} units
                  </dd>
                </div>
                <div>
                  <dt className="label-xs">Sessions</dt>
                  <dd className="mt-1 font-mono text-sm text-ink-primary tabular-nums">
                    {formatNumber(device.sessions)}
                  </dd>
                </div>
                <div>
                  <dt className="label-xs">Last activity</dt>
                  <dd className="mt-1 font-mono text-sm text-ink-primary">
                    {device.lastSessionId === null ? '—' : `Session #${device.lastSessionId}`}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="label-xs">Operator</dt>
                  <dd className="mt-1">
                    <TransactionHash value={device.sourceOperator} lead={8} tail={6} />
                  </dd>
                </div>
              </dl>

              <div className="mt-6 pt-1">
                <ButtonLink
                  href={`/dashboard/devices/${device.label}`}
                  variant="secondary"
                  className="w-full"
                >
                  View Device
                </ButtonLink>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        Devices are registered on both chains: the source registry authorises who may report work,
        and the Creditcoin controller records who receives the reward.{' '}
        <Link href="/dashboard/protocol" className="text-blue-400 hover:text-blue-300">
          See protocol details
        </Link>
        .
      </p>
    </div>
  );
}
