'use client';

import { useEffect } from 'react';

import { Panel } from '@/components/primitives';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <Panel className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 6.5v4M10 13.5h.01" strokeLinecap="round" />
            <circle cx="10" cy="10" r="7.5" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-ink-primary">Could not load protocol data</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          The dashboard failed to render this view. Protocol state on-chain is unaffected.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-2xs text-ink-faint">Digest: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-md border border-line-strong px-4 py-2 text-sm text-ink-primary transition-colors hover:border-blue-500/50 hover:bg-blue-500/[0.06]"
        >
          Try again
        </button>
      </Panel>
    </div>
  );
}
