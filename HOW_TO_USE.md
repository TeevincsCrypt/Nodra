# How to use Nodra

The short version: Nodra proves that a physical device really did some work, then pays it
automatically — without asking anyone to trust anyone else's word for it.

This doc has two guides. Pick the one that matches you:

- **"I just found this link"** — you want to look around. Two minutes, no wallet, no risk.
- **"I want to run a device through the real flow myself"** — you're comfortable with a terminal
  and testnet wallets, and you want to reproduce the whole thing end to end.

---

## The idea, in plain words

Imagine a delivery drone. It flies a package and wants to get paid. The problem: how does anyone
know it really did the work, and isn't just lying to get paid?

Nodra's answer:

1. The drone leaves a **receipt** on one blockchain — Sepolia. "I did 250 units of work."
2. A **referee** called Attestcoin checks that receipt is real: not faked, not edited, actually
   mined, actually happened.
3. Once the referee stamps it, a **piggy bank** on a *different* blockchain — Creditcoin — sees
   the stamp and automatically drops in the coins. No human approves it. Nobody can forge the
   stamp to steal a payout.

That's the whole trick: prove real-world activity happened, then pay for it automatically.

### The one real drone in this story

There's exactly one so far, and it's not a demo fake: **`NODE-001`**. It really reported 250 units
of work on Sepolia, Attestcoin really attested the block it happened in, Creditcoin really verified
the proof through its `0xFD2` precompile, and the operator really got paid `250,000,000,000,000`
wei of testnet CTC. Every hash below is real and checkable:

| What | Value |
|---|---|
| Device | `NODE-001` |
| Activity reported | 250 units, session `#0` |
| Source transaction (Sepolia) | `0x7bea5e02ea3faab3470c3af2d1f029b0f25b6b0c13eee5f1feafdd31dc75eb6d` |
| Source block | `11,628,740` |
| Settlement transaction (Creditcoin) | `0x058d58d7e0655f6bd06e44d3722c79cab866e184e760bbdf28b09ef877d0e200` |
| Reward | `250,000,000,000,000` wei CTC |

---

## Guide 1 — "I just found this link"

You don't need a wallet, an account, or any testnet funds. The dashboard is **read-only by
design** — there is nothing to click that spends anything or breaks anything.

1. Open the dashboard: **`<your Vercel deployment URL>`**
   *(fill this in once you know it — see "Where things live" below for why it isn't printed here)*
2. **Overview** — the front page of the app. At the top: the whole NODE-001 → reward story as one
   vertical checklist. Below that: network totals and the settlement pipeline.
3. **Devices → NODE-001** — the device's identity: its ID, who operates it on each chain, how many
   sessions it's reported, and its full verification journey.
4. **Proofs** — the showcase page. A step-by-step chain of custody: source event → source receipt
   → Attestcoin attestation → Merkle proof → Creditcoin verification → Nodra settlement. Every step
   that has a transaction hash lets you copy it or open it on a block explorer.
5. **Rewards** — the actual payout: `250,000,000,000,000` wei CTC, who received it, and the exact
   formula (`activity units × reward rate`) that produced that number.
6. **Protocol** — the deployed contract addresses, the reward configuration, and the security
   properties the contracts enforce (replay protection, source-emitter validation, pause
   protection, and so on).

### One thing worth understanding: the little tags

Every number on the dashboard carries a small tag:

- **Live** — read from the blockchain right at this moment.
- **Recorded** — a real, already-verified transaction from the one genuine run above. Real, but a
  snapshot rather than a fresh read.
- **Derived** — calculated from the other two (totals, reward math).

If the dashboard's server can't reach the testnets when you load a page, everything falls back to
**Recorded** rather than showing something fake or crashing. You'll see a small note saying so.
That's intentional — the whole point of this project is that it never pretends.

---

## Guide 2 — "I want to run a device through the real flow myself"

Registering your own device now has a browser option — see **Guide 2a** below. But reporting
activity and proving it happened is still a terminal-and-testnet-wallets job: there's no
"report activity" or "submit proof" button in the UI, on purpose — those are the steps that
actually talk to Attestcoin's attestor set, and doing that from a server-side click would mean
someone other than the device holding the private key that signs it. You'll be running the same
scripts that produced the NODE-001 run above, against your own device label and your own wallets.

You'll need:
- Node.js 20+, [Foundry](https://getfoundry.sh/) (`forge`, `cast`)
- A Sepolia wallet funded with testnet ETH
- A Creditcoin CC3 Testnet wallet funded with testnet CTC
- About 10–20 minutes of waiting during step 4 — that's how long Attestcoin's attestor set takes
  to reach consensus on your Sepolia block. It's not a bug, it's the actual security mechanism.

### Guide 2a — Register through the dashboard instead of the CLI

Open **Register a device** in the dashboard nav, connect a Sepolia wallet, and pick a label.
Two things happen, and only the first one needs your wallet:

1. Your wallet signs `registerDevice(deviceId)` directly against `NodraDeviceRegistry` on Sepolia
   — permissionless, nobody approves it, Nodra never sees or needs your private key.
2. Registering a device on the Creditcoin side (so it has somewhere to receive rewards) is
   `onlyOwner` on `NodraIncentiveController`, by design — it's what stops a stranger from
   squatting on your device id and redirecting your rewards to themselves. Once your Sepolia
   transaction confirms, the dashboard's server independently re-checks that transaction on-chain
   and completes the Creditcoin side for you automatically — no manual approval step, and it
   trusts nothing from your browser except the transaction hash.

If a deployment hasn't configured that server-side step, step 1 still succeeds on its own and the
project owner can finish step 2 manually. Either way, you still need Guide 2's CLI for reporting
activity and proving it — registration only gets a device onto both chains, it doesn't make up
work for it to have done.

### 1. Clone and install

```bash
git clone https://github.com/TeevincsCrypt/Nodra
cd Nodra
npm install
forge build
```

### 2. Configure your wallets

```bash
cp .env.example .env
```

Fill in the three values `.env.example` marks "User-provided": `SOURCE_CHAIN_RPC_URL`,
`SOURCE_CHAIN_WALLET_PRIVATE_KEY`, `CREDITCOIN_WALLET_PRIVATE_KEY`. Everything else — the RPC
defaults, the deployed contract addresses — is already filled in and verified. Never commit `.env`
or paste a private key into a chat, an issue, or a pull request.

Check everything is wired up before spending any time waiting:

```bash
npm run nodra:check_setup
```

### 3. Register your device

```bash
npm run nodra:register_device -- MY-DEVICE-001
```

This registers `MY-DEVICE-001` on both Sepolia and Creditcoin in one step. (Prefer a browser?
Guide 2a above does the same thing through the dashboard — skip this step if you used that.)

### 4. Report activity, then prove it happened

```bash
npm run nodra:report_activity -- MY-DEVICE-001 250
```

This prints a Sepolia transaction hash. Feed it into:

```bash
npm run nodra:submit_proof -- <the transaction hash from the previous command>
```

This is the real end-to-end path: it waits for Attestcoin to attest your Sepolia block, fetches
the inclusion + continuity proof, and submits it to `NodraIncentiveController` on Creditcoin. If
the proof doesn't check out, this step fails loudly — there is no fallback path here, by design.

### 5. Check the result

```bash
npm run nodra:inspect -- MY-DEVICE-001
```

For the full walkthrough with expected output at every step, see
[`docs/PHASE2-RUNBOOK.md`](docs/PHASE2-RUNBOOK.md).

---

## Where things live

| Thing | Where |
|---|---|
| Dashboard source | `web/` (see `web/README.md`) |
| Contracts + CLI scripts | repo root (see `docs/PHASE1-RESEARCH.md`, `docs/PHASE2-RUNBOOK.md`) |
| `NodraDeviceRegistry` (Sepolia) | `0xacC1Cd54c174b0F87D26E88132A28f7dC1983CF6` |
| `NodraIncentiveController` (Creditcoin) | `0x0dD97a8C7Dc1F143f682BD5c306BF00efc9396B9` |
| Attestcoin verifier precompile | `0x0000000000000000000000000000000000000FD2` |

The dashboard's production URL isn't hardcoded into this doc because this file ships in the repo
and a URL can move; fill it in above once you have it, or check the project's Vercel settings.
Likewise, no Creditcoin block-explorer link appears anywhere in this project — none is recorded as
verified, so Creditcoin transaction hashes are always shown as copyable text instead of a guessed
link.
