'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Wordmark } from './brand';
import { cn } from './primitives';
import { NETWORKS } from '@/lib/protocol';

const NAV = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/devices', label: 'Devices' },
  { href: '/dashboard/activity', label: 'Activity' },
  { href: '/dashboard/proofs', label: 'Proofs' },
  { href: '/dashboard/rewards', label: 'Rewards' },
  { href: '/dashboard/protocol', label: 'Protocol' },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center rounded-md px-3 py-2 text-sm transition-colors duration-150',
              active
                ? 'bg-blue-500/[0.1] text-blue-300'
                : 'text-ink-secondary hover:bg-white/[0.03] hover:text-ink-primary',
            )}
          >
            {active ? (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-blue-500" />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NetworkStatus() {
  return (
    <div className="rounded-md border border-line bg-raised/60 px-3 py-2.5">
      <div className="text-xs font-medium text-ink-primary">{NETWORKS.creditcoin.label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse-dot" />
        <span className="text-2xs text-ok">Connected</span>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      {/* ------------------------------------------------ Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface/60 lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t border-line p-3">
          <NetworkStatus />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* ------------------------------------------------ Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-base/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
              </svg>
            </button>
            <Wordmark />
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-md border border-line bg-raised/60 px-2.5 py-1.5 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse-dot" />
              <span className="text-2xs text-ink-secondary">Read-only</span>
            </span>
            <Link
              href="/"
              className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
            >
              Home
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      {/* ------------------------------------------------ Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-line bg-surface animate-rise">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <Wordmark />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-secondary"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="border-t border-line p-3">
              <NetworkStatus />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
