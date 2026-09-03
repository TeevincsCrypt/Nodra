'use client';

import { useState } from 'react';

import { cn, ProvenanceTag } from './primitives';

export interface Stage {
  key: string;
  label: string;
  network: string;
  detail: string;
  meta?: { label: string; value: string }[];
}

/* ---------------------------------------------------------- Landing hero pipeline */

const HERO_STAGES = [
  { label: 'Physical device', hint: 'Measurable work' },
  { label: 'Sepolia', hint: 'Source-chain event' },
  { label: 'Attestcoin', hint: 'Cross-chain proof' },
  { label: 'Creditcoin', hint: 'On-chain verification' },
  { label: 'Nodra rewards', hint: 'Operator incentive' },
];

export function HeroPipeline() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <ol className="relative">
        {HERO_STAGES.map((stage, index) => {
          const isLast = index === HERO_STAGES.length - 1;
          return (
            <li key={stage.label} className="relative">
              <div
                className="flex items-center gap-4 rounded-lg border border-line bg-card/70 px-4 py-3 backdrop-blur-sm animate-rise"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-2xs',
                    isLast
                      ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                      : 'border-line-strong bg-raised text-ink-muted',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-primary">{stage.label}</div>
                  <div className="text-xs text-ink-muted">{stage.hint}</div>
                </div>
              </div>

              {!isLast ? (
                <div className="relative ml-[1.9rem] h-7 w-px overflow-hidden bg-line-strong">
                  {/* Packet travelling down the wire — the only motion on the page. */}
                  <span
                    className="absolute inset-x-0 top-0 h-2 w-px bg-blue-400 animate-flow-y"
                    style={{ animationDelay: `${index * 0.55}s` }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------- Full journey (Overview) */

export interface JourneyStep {
  key: string;
  title: string;
  subtitle: string;
  complete: boolean;
  provenance?: 'live' | 'recorded' | 'derived';
  evidence?: React.ReactNode;
}

/**
 * The complete NODE-001 -> reward story, one row per stage, in the order it actually
 * happens. Each stage carries its own truthful provenance rather than one blanket tag for
 * the whole pipeline, since some stages (a live eth_call) and others (the Attestcoin
 * attestation itself, which no contract exposes to query) are necessarily recorded.
 */
export function JourneyPipeline({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.key} className="relative">
            <div
              className={cn(
                'flex items-start gap-4 rounded-lg border px-4 py-3.5 transition-colors duration-200 animate-rise',
                step.complete
                  ? 'border-line bg-raised/50'
                  : 'border-line bg-raised/20',
              )}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-2xs',
                  step.complete
                    ? 'border-ok/40 bg-ok/12 text-ok'
                    : 'border-line-strong bg-raised text-ink-muted',
                )}
                aria-hidden="true"
              >
                {step.complete ? (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-ink-primary">{step.title}</span>
                  {step.provenance ? <ProvenanceTag provenance={step.provenance} /> : null}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-ink-muted">{step.subtitle}</div>
                {step.evidence ? <div className="mt-2">{step.evidence}</div> : null}
              </div>
            </div>

            {!isLast ? (
              <div className="relative ml-4 h-5 w-px overflow-hidden bg-line-strong" aria-hidden="true">
                <span
                  className="absolute inset-x-0 top-0 h-2 w-px bg-blue-400 animate-flow-y"
                  style={{ animationDelay: `${index * 0.4}s` }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------- Dashboard pipeline */

export function NetworkPipeline({ stages }: { stages: Stage[] }) {
  const [active, setActive] = useState<string | null>(null);
  const selected = stages.find((s) => s.key === active) ?? null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))] lg:gap-0">
        {stages.map((stage, index) => {
          const isActive = active === stage.key;
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.key} className="flex items-stretch lg:contents">
              <div className={cn('flex w-full items-stretch', !isLast && 'lg:pr-0')}>
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : stage.key)}
                  aria-expanded={isActive}
                  className={cn(
                    'group flex-1 rounded-lg border px-4 py-4 text-left transition-all duration-200',
                    isActive
                      ? 'border-blue-500/50 bg-blue-500/[0.07] shadow-glow'
                      : 'border-line bg-raised/60 hover:border-line-strong hover:bg-raised',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="label-xs">{stage.label}</span>
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 shrink-0 text-ok"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="mt-2 text-sm font-medium text-ink-primary">{stage.network}</div>
                  <div className="mt-1 text-xs leading-relaxed text-ink-muted">{stage.detail}</div>
                </button>

                {/* Connector: horizontal on desktop only. */}
                {!isLast ? (
                  <div className="hidden w-8 shrink-0 items-center lg:flex" aria-hidden="true">
                    <div className="relative h-px w-full overflow-hidden bg-line-strong">
                      <span
                        className="absolute inset-y-0 left-0 h-px w-2 bg-blue-400 animate-flow-x"
                        style={{ animationDelay: `${index * 0.5}s` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selected ? (
        <div className="border-t border-line bg-surface/60 px-5 py-4 animate-rise">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span className="text-xs font-medium text-ink-primary">{selected.network}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {(selected.meta ?? []).map((item) => (
              <div key={item.label} className="flex justify-between gap-4 border-b border-line py-2">
                <dt className="text-xs text-ink-muted">{item.label}</dt>
                <dd className="truncate font-mono text-xs text-ink-primary">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
