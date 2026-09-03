import Link from 'next/link';

import { cn } from './primitives';

export function Wordmark({ className, href = '/' }: { className?: string; href?: string | null }) {
  const content = (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className="text-base font-semibold tracking-[0.16em] text-ink-primary">NODRA</span>
      <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(46,124,246,0.9)]" />
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {content}
    </Link>
  );
}
