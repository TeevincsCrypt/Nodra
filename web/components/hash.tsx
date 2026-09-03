'use client';

import { useCallback, useEffect, useState } from 'react';

import { truncateHash } from '@/lib/format';
import { cn } from './primitives';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context, permissions). Fail quietly —
      // the full value is always rendered in the title attribute as a fallback.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `${label}: ${value}`}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line text-ink-muted transition-colors',
        'hover:border-blue-500/40 hover:text-blue-400',
        copied && 'border-ok/40 text-ok',
      )}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5v-1a1.5 1.5 0 00-1.5-1.5H4a1.5 1.5 0 00-1.5 1.5v5A1.5 1.5 0 004 11h1" />
        </svg>
      )}
    </button>
  );
}

/**
 * Renders a hash or address. When an explorer URL is available it links out; when it is
 * not, it degrades to a copyable value rather than inventing an explorer domain.
 */
export function TransactionHash({
  value,
  href,
  lead = 8,
  tail = 6,
  className,
  showCopy = true,
}: {
  value: string;
  href?: string | null;
  lead?: number;
  tail?: number;
  className?: string;
  showCopy?: boolean;
}) {
  const display = truncateHash(value, lead, tail);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className="group inline-flex items-center gap-1 font-mono text-xs text-blue-400 transition-colors hover:text-blue-300"
        >
          {display}
          <svg
            viewBox="0 0 12 12"
            className="h-2.5 w-2.5 opacity-60 transition-opacity group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M4.5 2h5.5v5.5M10 2L2.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : (
        <span title={value} className="font-mono text-xs text-ink-secondary">
          {display}
        </span>
      )}
      {showCopy ? <CopyButton value={value} /> : null}
    </span>
  );
}

/** A labelled key/value row for technical metadata. */
export function DataRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={cn('text-xs text-ink-primary', mono && 'font-mono')}>{children}</span>
    </div>
  );
}
