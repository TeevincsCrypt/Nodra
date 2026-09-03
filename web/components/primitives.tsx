import Link from 'next/link';
import type { ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ Panel */

export function Panel({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <As className={cn('panel shadow-card', className)}>{children}</As>;
}

export function PanelHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
        {meta ? <div className="mt-1 text-xs text-ink-muted">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Status */

type Tone = 'ok' | 'blue' | 'muted' | 'warn' | 'danger';

const TONE_STYLES: Record<Tone, { dot: string; text: string; ring: string }> = {
  ok: { dot: 'bg-ok', text: 'text-ok', ring: 'bg-ok/12 border-ok/25' },
  blue: { dot: 'bg-blue-500', text: 'text-blue-400', ring: 'bg-blue-500/12 border-blue-500/25' },
  muted: { dot: 'bg-ink-muted', text: 'text-ink-secondary', ring: 'bg-white/[0.04] border-line' },
  warn: { dot: 'bg-warn', text: 'text-warn', ring: 'bg-warn/12 border-warn/25' },
  danger: { dot: 'bg-danger', text: 'text-danger', ring: 'bg-danger/12 border-danger/25' },
};

export function StatusBadge({
  label,
  tone = 'ok',
  pulse = false,
  className,
}: {
  label: string;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-2xs font-medium',
        styles.ring,
        styles.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', styles.dot, pulse && 'animate-pulse-dot')} />
      {label}
    </span>
  );
}

export function CheckLine({ label, detail }: { label: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <svg
        viewBox="0 0 16 16"
        className="mt-0.5 h-4 w-4 shrink-0 text-ok"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="min-w-0">
        <div className="text-sm text-ink-primary">{label}</div>
        {detail ? <div className="mt-0.5 text-xs leading-relaxed text-ink-muted">{detail}</div> : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ Buttons */

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  external = false,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  external?: boolean;
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-200';
  const styles =
    variant === 'primary'
      ? 'bg-blue-500 text-white hover:bg-blue-400 shadow-[0_0_24px_-8px_rgba(46,124,246,0.8)] hover:shadow-[0_0_32px_-6px_rgba(46,124,246,0.9)]'
      : 'border border-line-strong text-ink-primary hover:border-blue-500/50 hover:bg-blue-500/[0.06]';

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(base, styles, className)}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cn(base, styles, className)}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ States */

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-ink-muted">
        {icon ?? (
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <path d="M3 9h14" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-ink-muted">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-white/[0.035]" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Provenance */

/**
 * Marks where a value came from. This is a correctness feature, not decoration:
 * recorded data is real but captured, and must never masquerade as a live read.
 */
export function ProvenanceTag({ provenance }: { provenance: 'live' | 'recorded' | 'derived' }) {
  const config = {
    live: { label: 'Live', tone: 'ok' as const, title: 'Read from chain during this request.' },
    recorded: {
      label: 'Recorded',
      tone: 'blue' as const,
      title:
        'A real, verified testnet transaction captured from the Phase 2 end-to-end run — not a live read, and not simulated.',
    },
    derived: {
      label: 'Derived',
      tone: 'muted' as const,
      title: 'Computed from recorded and live values.',
    },
  }[provenance];

  return (
    <span
      title={config.title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium',
        TONE_STYLES[config.tone].ring,
        TONE_STYLES[config.tone].text,
      )}
    >
      {config.label}
    </span>
  );
}
