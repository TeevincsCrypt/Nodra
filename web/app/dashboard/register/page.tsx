import { SectionHeading } from '@/components/metrics';
import { Panel } from '@/components/primitives';
import { RegisterForm } from '@/components/register-form';
import { CONTRACTS } from '@/lib/protocol';

export const metadata = { title: 'Register a device — Nodra' };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeading
        title="Register a device"
        description="Bring your own infrastructure onto Nodra. Two steps, no CLI required."
      />

      <Panel className="overflow-hidden">
        <RegisterForm
          registryAddress={CONTRACTS.deviceRegistry.address}
        />
      </Panel>

      <div className="mt-6 space-y-3 text-xs leading-relaxed text-ink-muted">
        <p>
          <span className="font-medium text-ink-secondary">Step 1 — Sepolia.</span> Your wallet
          signs a transaction directly against the Nodra device registry. This is permissionless:
          no one approves it, and Nodra never sees or needs your private key.
        </p>
        <p>
          <span className="font-medium text-ink-secondary">Step 2 — Creditcoin.</span> Registering
          a device to receive rewards is an owner-gated call on the Creditcoin contract, by
          design — it stops anyone from squatting on a device id and redirecting someone else's
          rewards to themselves. Once your Sepolia transaction confirms, this app automatically
          verifies it on-chain and completes the Creditcoin side for you — no manual approval
          step, and no data beyond your transaction hash is taken on trust.
        </p>
        <p>
          If automatic Creditcoin registration isn&apos;t available on this deployment (its owner
          key isn&apos;t configured), step 1 still succeeds independently and the project owner
          can complete step 2 manually.
        </p>
      </div>
    </div>
  );
}
