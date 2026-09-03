# Nodra Phase 2 — End-to-End Attestcoin Runbook

Goal: prove the critical path is real.

```
Sepolia activity  ->  Attestcoin attestation  ->  proof generation
                  ->  Creditcoin CC3 Testnet  ->  ASCBase verification (0xFD2)
                  ->  NodraIncentiveController accrues a reward
```

There is **no fallback path**. If Attestcoin cannot attest or prove the transaction, every script
fails loudly. Nothing in this phase fabricates a proof or a "verified" state.

---

## 0. Prerequisites

```bash
# Node 20+
node --version

# Foundry (pinned to the version the official Attestcoin examples use)
curl -L https://foundry.paradigm.xyz | bash
foundryup --version v1.2.3
forge --version
```

## 1. Install

```bash
git clone <this repo> nodra && cd nodra
npm install
forge install foundry-rs/forge-std      # only if lib/forge-std is absent
forge build
```

`forge build` writes `out/`, which the TypeScript scripts read ABIs from — so the scripts can
never drift from the compiled contracts. Run it before any script.

## 2. Wallets and faucets

You need **two funded accounts** (they may be the same key, used on both chains):

| Variable | Chain | Needs | Purpose |
|---|---|---|---|
| `SOURCE_CHAIN_WALLET_PRIVATE_KEY` | Sepolia | Sepolia ETH | deploy registry, emit activity |
| `CREDITCOIN_WALLET_PRIVATE_KEY` | CC3 Testnet | testnet CTC | deploy controller, submit proofs |

- **Sepolia ETH**: any public Sepolia faucet.
- **Testnet CTC**: use the CC3 Testnet faucet linked from the Creditcoin docs.
  I could not verify the faucet URL from my environment (`docs.creditcoin.org` is blocked by the
  network egress policy here), so please take it from the official docs rather than a guess.

## 3. Configure `.env`

```bash
cp .env.example .env
```

Verified defaults (already filled in):

```env
CREDITCOIN_RPC_URL="https://rpc.cc3-testnet.creditcoin.network"
PROOF_BUILDER_URL="https://prover.cc3-testnet.creditcoin.network"
SOURCE_CHAIN_KEY=1          # Sepolia. NOT the chain id (11155111).
```

You fill in:

```env
SOURCE_CHAIN_RPC_URL="https://sepolia.infura.io/v3/<key>"   # or any Sepolia RPC
SOURCE_CHAIN_WALLET_PRIVATE_KEY="0x..."
CREDITCOIN_WALLET_PRIVATE_KEY="0x..."
```

`NODRA_DEVICE_REGISTRY_ADDRESS` and `NODRA_INCENTIVE_CONTROLLER_ADDRESS` are filled in after step 5.

## 4. Build and test

```bash
forge build
forge test -vv
```

Expect all tests in `NodraDeviceRegistryTest` and `NodraIncentiveControllerSecurityTest` to pass.

Note on the unit tests: they install a stand-in for the `0xFD2` verifier that returns **false**,
never true. They assert that an unverified proof is *rejected* and exercise Nodra's own decoding,
authorization and replay logic directly. They never fabricate a successful Attestcoin proof —
genuine verification is what steps 6–8 below prove on testnet.

## 5. Deploy

Load the environment:

```bash
set -a && source .env && set +a
```

**Sepolia — NodraDeviceRegistry:**

```bash
forge create \
    --broadcast \
    --rpc-url $SOURCE_CHAIN_RPC_URL \
    --private-key $SOURCE_CHAIN_WALLET_PRIVATE_KEY \
    contracts/sol/NodraDeviceRegistry.sol:NodraDeviceRegistry
```

**Creditcoin CC3 Testnet — NodraIncentiveController:**

```bash
forge create \
    --broadcast \
    --rpc-url $CREDITCOIN_RPC_URL \
    --private-key $CREDITCOIN_WALLET_PRIVATE_KEY \
    contracts/sol/NodraIncentiveController.sol:NodraIncentiveController \
    --constructor-args 1000000000000
```

`1000000000000` (1e12) is the initial `rewardRatePerUnit`.

> **On the `--libraries` flag.** The official loan tutorial links `EvmV1Decoder` at deploy time.
> Nodra does **not** need that: every function in `EvmV1Decoder` is `internal`, so solc inlines
> them. I verified this — the compiled `NodraIncentiveController` bytecode contains no link
> placeholders. Passing `--libraries` anyway is harmless if you prefer parity with the tutorial.

Record both addresses in `.env`:

```env
NODRA_DEVICE_REGISTRY_ADDRESS="0x..."
NODRA_INCENTIVE_CONTROLLER_ADDRESS="0x..."
```

Then re-source: `set -a && source .env && set +a`

## 6. Wire up and register a device

Bind the controller to the Sepolia registry (this is the check that stops anyone from proving a
look-alike event from a contract they control):

```bash
cast send $NODRA_INCENTIVE_CONTROLLER_ADDRESS \
    "setSourceDeviceRegistry(address)" $NODRA_DEVICE_REGISTRY_ADDRESS \
    --rpc-url $CREDITCOIN_RPC_URL --private-key $CREDITCOIN_WALLET_PRIVATE_KEY
```

Register the device on both chains:

```bash
npm run nodra:register_device -- NODE-001
```

Pre-flight check before spending 8 minutes on an attestation:

```bash
npm run nodra:check_setup
```

This verifies both RPCs, both balances, the Attestcoin **ChainInfo precompile** (`0xFD3`), that
your `SOURCE_CHAIN_KEY` is in the supported-chain list, and that the proof builder is reachable.

## 7. Emit device activity on Sepolia

```bash
npm run nodra:report_activity -- NODE-001 250
```

Expected output:

```
Reporting 250 activity units for NODE-001 (0x4e4f44452d303031...)...
Submitted: 0x<sepolia_tx_hash>
Confirmed in block 1234567
Session id: 0

Next step:
  yarn nodra:submit_proof 0x<sepolia_tx_hash>
```

## 8. Attest, prove, and settle on Creditcoin

This is the critical path. It generates a **real** Attestcoin proof and submits it.

```bash
npm run nodra:submit_proof -- 0x<sepolia_tx_hash>
```

Expected output:

```
[1/4] Waiting for 0x... to be mined on the source chain...
      Mined in block 1234567

[2/4] Latest attested height for chain key 1: 1234500
      Waiting for block 1234567 to be attested (typically ~8 min, timeout 20 min)...
      Block 1234567 attested by the Attestcoin attestor set.

[3/4] Requesting proof from the Attestcoin proof builder...
      Proof generated.
        chainKey            : 1
        headerNumber        : 1234567
        txIndex             : 12
        merkle siblings     : 7
        continuity roots    : 3

[4/4] Submitting execute() to NodraIncentiveController at 0x...
      Estimated gas 812345, using 1096665
      Creditcoin tx submitted: 0x<creditcoin_tx_hash>
      Confirmed in block 98765

--- Events ---
  [Attestcoin 0xFD2] TransactionVerified
      emitted by : 0x0000000000000000000000000000000000000FD2
      chainKey   : 1
      height     : 1234567
  [Nodra] ActivitySettled
      deviceId      : 0x4e4f44452d303031...
      sessionId     : 0
      operator      : 0x...
      activityUnits : 250
      reward        : 250000000000000
      queryId       : 0x...
```

**Step 2 is the slow one — roughly 8 minutes in practice.** That is the attestor set reaching
consensus on the Sepolia block. It is not a bug.

## 9. Confirming Attestcoin actually verified the event

Four independent confirmations, strongest first.

### 9.1 The `TransactionVerified` event came from the precompile

Only the Attestcoin verifier precompile can emit this, and only on successful verification:

```bash
cast receipt 0x<creditcoin_tx_hash> --rpc-url $CREDITCOIN_RPC_URL
```

Look for a log whose `address` is `0x0000000000000000000000000000000000000FD2` and whose
`topics[0]` is `TransactionVerified(uint64,uint64,uint64)`:

```bash
cast keccak "TransactionVerified(uint64,uint64,uint64)"
```

Our contract cannot forge this log — it is emitted by the node's precompile, not by Solidity.

You can also confirm the deployed controller is bound to the real precompile (`ASCBase` stores it
as an immutable):

```bash
cast call $NODRA_INCENTIVE_CONTROLLER_ADDRESS "VERIFIER()(address)" --rpc-url $CREDITCOIN_RPC_URL
# -> 0x0000000000000000000000000000000000000FD2
```

### 9.2 Nodra recorded the settlement

```bash
npm run nodra:inspect -- NODE-001
```

```
  totalActivityUnitsSettled: 250
  totalRewardsAccrued      : 250000000000000
Device NODE-001 (0x...)
  pendingRewards : 250000000000000
```

### 9.3 Negative control — replay is rejected

Re-run the exact same command:

```bash
npm run nodra:submit_proof -- 0x<sepolia_tx_hash>
```

It must fail with `Query already processed` (ASCBase's queryId dedupe) or `Activity already
settled` (Nodra's own activity-level guard). A system that accepted this twice would be paying
twice for one event.

### 9.4 Negative control — a tampered proof is rejected

Flip one byte of any proof field and resubmit; the precompile rejects it and the transaction
reverts with `Proof of inclusion verification failed` before any Nodra logic runs. This is the
clearest demonstration that the reward is gated on Attestcoin and not on our own say-so.

---

## If something fails

Report the failure rather than working around it — there is deliberately no bypass.

| Symptom | Meaning |
|---|---|
| `waitUntilHeightAttested` times out after 20 min | Attestor set has not attested that Sepolia height. Check `npm run nodra:check_setup` latest attested height; retry with a newer transaction. |
| `Proof generation failed` | Prover has the attestation but not the transaction. Confirm the tx is on the chain matching `SOURCE_CHAIN_KEY`. |
| `Proof of inclusion verification failed` | The precompile rejected the proof. Do not work around this — it is the security property doing its job. |
| `Activity event not emitted by registered source registry!` | `setSourceDeviceRegistry` was not called, or points at the wrong address. |
| `Device not registered with Nodra` | Run `npm run nodra:register_device -- NODE-001`. |
| Gas estimation warning, then a size-based limit | Expected. `pallet-evm` does not always propagate revert reasons during estimation against precompiles. |
