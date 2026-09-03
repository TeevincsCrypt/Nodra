import { ButtonLink } from '@/components/primitives';
import { Wordmark } from '@/components/brand';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
      <div className="pointer-events-none absolute inset-0 grid-backdrop grid-fade" aria-hidden="true" />
      <div className="relative z-10 text-center">
        <Wordmark href={null} />
        <h1 className="mt-6 font-mono text-5xl font-medium text-ink-primary">404</h1>
        <p className="mt-3 text-sm text-ink-muted">This route does not exist.</p>
        <div className="mt-7 flex justify-center gap-3">
          <ButtonLink href="/">Home</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Dashboard
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
