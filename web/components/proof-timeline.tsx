import { cn } from './primitives';

export interface TimelineStep {
  title: string;
  network: string;
  description: string;
  evidence?: React.ReactNode;
}

/**
 * The proof journey, rendered as an explicit chain of custody. The point it must make:
 * Nodra is not trusting an API — each step is checked, and the Creditcoin step is
 * enforced by a precompile our contract cannot bypass.
 */
export function ProofTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-2xs',
                  isLast
                    ? 'border-ok/40 bg-ok/12 text-ok'
                    : 'border-blue-500/35 bg-blue-500/10 text-blue-300',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              {!isLast ? <span className="mt-1 w-px flex-1 bg-line-strong" aria-hidden="true" /> : null}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm font-medium text-ink-primary">{step.title}</h3>
                <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-2xs text-ink-muted">
                  {step.network}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{step.description}</p>
              {step.evidence ? <div className="mt-2.5">{step.evidence}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
