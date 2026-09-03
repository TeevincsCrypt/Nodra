import type { ReactNode } from 'react';

import { cn, Panel, ProvenanceTag } from './primitives';

export function MetricCard({
  label,
  value,
  unit,
  sublabel,
  provenance,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sublabel?: ReactNode;
  provenance?: 'live' | 'recorded' | 'derived';
  accent?: boolean;
}) {
  return (
    <Panel className={cn('p-4 transition-colors duration-200 sm:p-5', accent && 'border-blue-500/25 bg-blue-500/[0.04]')}>
      <div className="flex items-start justify-between gap-3">
        <span className="label-xs">{label}</span>
        {provenance ? <ProvenanceTag provenance={provenance} /> : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-mono text-2xl font-medium tracking-tight tabular-nums sm:text-3xl',
            accent ? 'text-blue-300' : 'text-ink-primary',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-xs font-medium text-ink-muted">{unit}</span> : null}
      </div>

      {sublabel ? <div className="mt-2 text-xs text-ink-muted">{sublabel}</div> : null}
    </Panel>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-primary">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-ink-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
