# Nodra — Web

The Nodra frontend: a landing page and a read-only protocol dashboard.

This is a **standalone Next.js app**. It is deliberately isolated from the protocol tooling at
the repository root — it has its own `package.json`, its own dependencies, and its own build.
Nothing here touches the Solidity contracts, the Foundry configuration, or the proof-submission
scripts.

## Run

```bash
cd web
npm install
npm run dev     # http://localhost:3000
```

```bash
npm run build   # production build
npm run start   # serve the production build
npm run typecheck
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing: what Nodra is, the settlement path, protocol status, latest settlement |
| `/dashboard` | Overview: metrics and the interactive settlement pipeline |
| `/dashboard/devices` | Registered infrastructure |
| `/dashboard/devices/[deviceId]` | One device and its full verification journey |
| `/dashboard/activity` | Verified activity, table on desktop and cards on mobile |
| `/dashboard/proofs` | Cross-chain proof detail — the Attestcoin chain of custody |
| `/dashboard/rewards` | Accrued rewards and recipients |
| `/dashboard/protocol` | Contracts, networks, reward config, security properties |

## Data provenance

Every value the UI renders is tagged so recorded data can never masquerade as a live read:

- **Live** — read from chain during the request.
- **Recorded** — a real, verified testnet transaction captured from the Phase 2 end-to-end run.
  Real, but a snapshot rather than a fresh read.
- **Derived** — computed from the above (totals, reward maths).

The current dataset is the genuine Phase 2 settlement: NODE-001, 250 activity units, attested by
Attestcoin and settled on Creditcoin. Nothing is fabricated.

`lib/data.ts` is the seam for going fully dynamic. Replace the bodies of the `get*` functions with
on-chain reads and flip `provenance` to `'live'`; no component needs to change.

## Block explorers

`lib/format.ts` builds explorer links only for networks with a **verified** explorer URL, and
never guesses a domain.

- Sepolia links to `sepolia.etherscan.io`.
- Creditcoin CC3 Testnet has no explorer URL recorded anywhere in this repository, so it stays
  unset. Creditcoin hashes render as copyable values instead of links.

To enable Creditcoin links once you have a verified URL:

```bash
# web/.env.local
NEXT_PUBLIC_CREDITCOIN_EXPLORER_URL="https://<verified-creditcoin-explorer>"
```

## Security

This app is read-only and requires no wallet. It holds no keys and signs nothing.

Only public data reaches the browser: contract addresses, chain ids, and public transaction
hashes. Never add a private key, RPC secret, or API key here — anything prefixed `NEXT_PUBLIC_`
is bundled into the client and is world-readable.
