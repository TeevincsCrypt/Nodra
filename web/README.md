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

- **Live** — read from chain during this request.
- **Recorded** — a real, verified testnet transaction captured from the Phase 2 end-to-end run.
  Real, but a snapshot rather than a fresh read. The proof record itself (transaction hashes,
  blocks, Merkle/continuity metadata) is always recorded — Nodra never regenerates a proof in
  the browser — but is cross-checked against a live receipt lookup where possible.
- **Derived** — computed from a mix of the above (totals, reward maths).

The baseline dataset in `lib/data.ts` is the genuine Phase 2 settlement: NODE-001, 250 activity
units, attested by Attestcoin and settled on Creditcoin. Nothing is fabricated.

## Live data

`lib/server/` is a server-only data-access layer (every file starts with `import 'server-only'`,
so an accidental import from client code fails at build time, not silently in production):

- `config.ts` — resolves RPC URLs and contract addresses from environment variables, with the
  known public contract addresses as a fallback (never RPC URLs — an unset RPC URL means "read
  this chain live," not "guess an endpoint").
- `abi.ts` — minimal ABI fragments copied verbatim from `contracts/sol/` at the repo root.
- `onchain.ts` — the actual `eth_call`/`eth_getLogs`/`eth_getTransactionReceipt` reads, via
  `ethers`. Every read is independent and race-timed (`RPC_TIMEOUT_MS`, currently 8s); a slow or
  dead RPC degrades that one field to `undefined` rather than throwing.
- `live-data.ts` — maps the raw on-chain snapshot onto the exact same DTOs (`Device`,
  `Settlement`, `NetworkTotals`, `RewardAccount`) the dashboard already rendered, falling back to
  the recorded constants field-by-field and setting `provenance` truthfully. Wrapped in React's
  `cache()` so one request never issues the same RPC call twice.

Every dashboard page calls the single entry point, `getLiveDashboardData()`, and exports
`revalidate = 30` — pages are static at build time and regenerate in the background at most every
30 seconds (Next.js ISR), so the RPC endpoints are never hit on every request. If both chains are
unreachable the dashboard shows the recorded Phase 2 settlement and a small inline notice; it
never crashes or shows a blank page.

`lib/data.ts` still holds the recorded constants (used as the fallback, and directly by the
landing page and `generateStaticParams`) — it is the seam this layer falls back to, not something
it replaces.

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

## Environment variables

See `.env.example` for the full, commented list. Summary:

| Variable | Where it's read | Required |
|---|---|---|
| `SOURCE_CHAIN_RPC_URL` | Server only | No — live Sepolia reads disabled without it |
| `CREDITCOIN_RPC_URL` | Server only | No — live Creditcoin reads disabled without it |
| `NODRA_DEVICE_REGISTRY_ADDRESS` | Server only | No — falls back to the known deployed address |
| `NODRA_INCENTIVE_CONTROLLER_ADDRESS` | Server only | No — falls back to the known deployed address |
| `NEXT_PUBLIC_CREDITCOIN_EXPLORER_URL` | Server + browser | No — Creditcoin hashes stay copyable without it |

## Security

This app is read-only and requires no wallet. It holds no keys and signs nothing.

Only public data reaches the browser: contract addresses, chain ids, and public transaction
hashes. Never add a private key, RPC secret, or API key here — anything prefixed `NEXT_PUBLIC_`
is bundled into the client and is world-readable. RPC URLs are read only in `lib/server/`
(guarded by the `server-only` package) and are never passed to a client component.
