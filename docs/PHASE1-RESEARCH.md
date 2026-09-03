# Nodra — Phase 1 Research Findings

Status: research only. No product code written yet.

All findings below are derived from **primary sources**: the published Attestcoin/Creditcoin
npm packages and the official `gluwa/attestcoin-protocol-examples` repository. Nothing here is
inferred or invented.

## Sources used

| Source | Version | How obtained |
|---|---|---|
| `@gluwa/usc-sdk` | 0.18.0 (2026-06-22) | npm tarball (full `src/`, `examples/`, `tests/`) |
| `@gluwa/asc-contracts` | 0.2.1 | npm tarball (full Solidity source) |
| `@gluwa/usc-contracts` | 0.2.0 | npm tarball |
| `gluwa/attestcoin-protocol-examples` | HEAD | git clone (official tutorials) |

`attestcoin.org`, `docs.attestcoin.org`, `creditcoin.org` and `docs.creditcoin.org` are blocked by
this environment's egress policy and could **not** be read. See "Risks".

## Trust model

Independent attestors reach consensus on source-chain block histories and commit them to
Creditcoin. A Creditcoin contract proves a source-chain transaction happened by supplying:

1. a **Merkle inclusion proof** (tx is in a block), and
2. a **continuity proof** (that block chains back to an attested/checkpointed block digest)

Both are checked by the **Native Query Verifier precompile at `0xFD2` (4050)**. There is no
centralized oracle and no privileged relayer: proof submission is permissionless because the proof
is self-validating.

## Verified contract interfaces

### `INativeQueryVerifier` — precompile `0x0000000000000000000000000000000000000FD2`
(`@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol`)

```solidity
struct MerkleProofEntry { bytes32 hash; bool isLeft; }
struct MerkleProof      { bytes32 root; MerkleProofEntry[] siblings; }
struct ContinuityProof  { bytes32 lowerEndpointDigest; bytes32[] roots; }

event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 transactionIndex);

function verify(uint64 chainKey, uint64 height, bytes calldata encodedTransaction,
                MerkleProof calldata, ContinuityProof calldata) external view returns (bool);
function verifyAndEmit(uint64 chainKey, uint64 height, bytes calldata encodedTransaction,
                MerkleProof calldata, ContinuityProof calldata) external returns (bool);
function calculateTxIndex(MerkleProof calldata) external view returns (uint64);
```

`NativeQueryVerifierLib.isCreditcoinChainId` recognises chain IDs `102030`, `102031`, `102032`.

### `ASCBase` — the intended integration point
(`@gluwa/asc-contracts/contracts/readability/ASCBase.sol`)

Documented in-source as *"the whitepaper base layer for teams building their own Application Smart
Contracts on Creditcoin."* It verifies the proof via `0xFD2`, dedupes by query id, then calls the
app hook:

```solidity
function execute(
    uint8 action, uint64 chainKey, uint64 blockHeight, bytes calldata encodedTransaction,
    bytes32 merkleRoot, INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest, bytes32[] calldata continuityRoots
) external returns (bool);

function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
    internal virtual;   // <-- app logic goes here
```

Built-in guarantees: `require(!processedQueries[queryId])` (replay protection, keyed on
chainKey+blockHeight+txIndex) and `require(verified)` (proof must pass).

### `EvmV1Decoder` — on-chain log extraction
(`@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol`, `internal pure` library)

```solidity
function getTransactionType(bytes memory) internal pure returns (uint8);
function isValidTransactionType(uint8) internal pure returns (bool);
function decodeReceiptFields(bytes memory) internal pure returns (ReceiptFields memory);
function getLogsByEventSignature(ReceiptFields memory, bytes32) internal pure returns (LogEntry[] memory);

struct ReceiptFields { uint8 receiptStatus; uint64 receiptGasUsed; LogEntry[] receiptLogs; bytes receiptLogsBloom; }
struct LogEntry      { address address_; bytes32[] topics; bytes data; }
```

Only `decodeTransactionType0` (legacy) and `decodeTransactionType2` (EIP-1559) have full Solidity
implementations. `decodeReceiptFields` works for all types and is the log-based readability path.

Pre-deployed on CC3 Testnet at `0x04B9ae8562D8Cc5bbbBbBB759080dDC30B56D18B` and linked at deploy
time (`forge create --libraries ...:EvmV1Decoder:$EVM_V1_DECODER_LIBRARY_ADDRESS`).

## Verified network configuration

```
CREDITCOIN_RPC_URL  = https://rpc.cc3-testnet.creditcoin.network
PROOF_BUILDER_URL   = https://prover.cc3-testnet.creditcoin.network
SOURCE_CHAIN_KEY    = 1        # Sepolia. NOTE: chainKey != chainId (Sepolia chainId = 11155111)
EVM_V1_DECODER_LIBRARY_ADDRESS = 0x04B9ae8562D8Cc5bbbBbBB759080dDC30B56D18B
```

Proof builder REST API: `GET /api/v1/proof-by-tx/{chainKey}/{txHash}` (batch:
`/api/v1/proof-batch-by-tx`). Returns `{chainKey, headerNumber, txIndex, txHash, txBytes,
continuityProof{lowerEndpointDigest, roots[]}, merkleProof{root, siblings[]}}`.

## Verified off-chain flow (from official examples)

```ts
// 1. wait for the source-chain block to be attested on Creditcoin
await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber, 15_000, 1_200_000);
// 2. fetch the proof
const proofResult = await proofBuilder.getProof(txHash);
// 3. submit to our ASC on Creditcoin
contract.getFunction('execute(uint8,uint64,uint64,bytes,bytes32,tuple(bytes32,bool)[],bytes32,bytes32[])')(
  action, chainKey, proofData.headerNumber, proofData.txBytes,
  proofData.merkleProof.root, proofData.merkleProof.siblings,
  proofData.continuityProof.lowerEndpointDigest, proofData.continuityProof.roots
);
```

SDK default `waitTimeoutMs` is documented as 15 minutes; the official examples pass 20 minutes.
This is the dominant latency in any live demo.

## Security pattern mandated by the reference implementation

`ASCLoanManager` (official example) establishes the required checks inside `_processAndEmitEvent`:

1. `EvmV1Decoder.isValidTransactionType(txType)`
2. `receipt.receiptStatus == 1` — reject reverted source transactions
3. `log.address_ == registeredSourceContract` — **critical**: without this, anyone can deploy a
   contract that emits the same event signature with arbitrary data and prove it
4. `log.topics[0] == EXPECTED_EVENT_SIGNATURE` and exact topic/data length checks

Replay protection is inherited from `ASCBase.processedQueries`.

## Tooling

The official examples use **Foundry** (`forge`, pinned `foundryup --version v1.2.3`) + `yarn`,
not Hardhat. `@gluwa/asc-contracts` itself is a Hardhat project, but consumers use Foundry.
Solidity `^0.8.28`, OpenZeppelin Contracts 5.1.0.
