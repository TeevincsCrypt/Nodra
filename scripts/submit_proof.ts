/**
 * Nodra Phase 2 — the critical path.
 *
 * Takes a Sepolia `reportActivity` transaction hash and drives it all the way through the
 * Attestcoin protocol into Nodra's contract on Creditcoin:
 *
 *   Sepolia tx -> wait for Attestcoin attestation -> fetch inclusion + continuity proof
 *              -> NodraIncentiveController.execute() on Creditcoin
 *              -> ASCBase verifies via the 0xFD2 precompile -> reward accrues
 *
 * This follows the official Attestcoin `loan`/`bridge` examples. There is no fallback path:
 * if Attestcoin cannot attest or prove the transaction, this script fails loudly rather than
 * settling anything.
 */
import { Contract, ethers } from 'ethers';
import { proofProvider, chainInfo } from '@gluwa/usc-sdk';

import { requireEnv, requireAddress, requirePrivateKey, requireNumber, loadAbi } from './env';

/** Action discriminator — see NodraActions in NodraIncentiveController.sol. */
const ACTION_SETTLE_ACTIVITY = 0;

const ATTESTATION_POLL_INTERVAL_MS = 15_000;
const ATTESTATION_TIMEOUT_MS = 1_200_000; // 20 minutes, matching the official examples
const GAS_BUFFER_MULTIPLIER = 135n; // 100% + 35%

function usage(): void {
  console.error(`
  Usage:
    yarn nodra:submit_proof <sepolia_transaction_hash>

  Example:
    yarn nodra:submit_proof 0x87c97c776a678941b5941ec0cb602a4467ff4a35f77264208575f137cb05b2a7
  `);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    usage();
    process.exit(1);
  }

  const txHash = args[0];
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(`Invalid transaction hash: ${txHash}`);
  }

  const creditcoinRpcUrl = requireEnv('CREDITCOIN_RPC_URL');
  const sourceChainRpcUrl = requireEnv('SOURCE_CHAIN_RPC_URL');
  const proofBuilderUrl = requireEnv('PROOF_BUILDER_URL');
  const chainKey = requireNumber('SOURCE_CHAIN_KEY');
  const controllerAddress = requireAddress('NODRA_INCENTIVE_CONTROLLER_ADDRESS');
  const privateKey = requirePrivateKey('CREDITCOIN_WALLET_PRIVATE_KEY');

  const creditcoinRpc = new ethers.JsonRpcProvider(creditcoinRpcUrl);
  const sourceChainRpc = new ethers.JsonRpcProvider(sourceChainRpcUrl);

  // ---------------------------------------------------------------
  // 1. Confirm the source transaction is mined
  // ---------------------------------------------------------------
  console.log(`\n[1/4] Waiting for ${txHash} to be mined on the source chain...`);
  const receipt = await sourceChainRpc.waitForTransaction(txHash, 1, 120_000);
  if (!receipt || receipt.blockNumber == null) {
    throw new Error(`Transaction ${txHash} is not yet mined on the source chain`);
  }
  if (receipt.status !== 1) {
    throw new Error(`Source transaction ${txHash} reverted; there is nothing valid to prove.`);
  }
  const blockNumber = receipt.blockNumber;
  console.log(`      Mined in block ${blockNumber}`);

  // ---------------------------------------------------------------
  // 2. Wait for Attestcoin to attest the block on Creditcoin
  // ---------------------------------------------------------------
  const proofBuilder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);
  const info = new chainInfo.PrecompileChainInfoProvider(creditcoinRpc);

  const latestAttested = await info.getLatestAttestedHeightAndHash(chainKey);
  console.log(`\n[2/4] Latest attested height for chain key ${chainKey}: ${latestAttested.height}`);
  console.log(`      Waiting for block ${blockNumber} to be attested (typically ~8 min, timeout 20 min)...`);

  await proofBuilder.waitUntilHeightAttested(
    chainKey,
    blockNumber,
    ATTESTATION_POLL_INTERVAL_MS,
    ATTESTATION_TIMEOUT_MS
  );
  console.log(`      Block ${blockNumber} attested by the Attestcoin attestor set.`);

  // ---------------------------------------------------------------
  // 3. Fetch the inclusion + continuity proof
  // ---------------------------------------------------------------
  console.log(`\n[3/4] Requesting proof from the Attestcoin proof builder...`);
  const proofResult = await proofBuilder.getProof(txHash);
  if (!proofResult.success || !proofResult.data) {
    throw new Error(`Proof generation failed: ${proofResult.error}`);
  }
  const proofData = proofResult.data;
  console.log(`      Proof generated.`);
  console.log(`        chainKey            : ${proofData.chainKey}`);
  console.log(`        headerNumber        : ${proofData.headerNumber}`);
  console.log(`        txIndex             : ${proofData.txIndex}`);
  console.log(`        merkle siblings     : ${proofData.merkleProof.siblings.length}`);
  console.log(`        continuity roots    : ${proofData.continuityProof.roots.length}`);

  // ---------------------------------------------------------------
  // 4. Submit to Nodra on Creditcoin — ASCBase verifies via the 0xFD2 precompile
  // ---------------------------------------------------------------
  const wallet = new ethers.Wallet(privateKey, creditcoinRpc);
  const controller = new Contract(controllerAddress, loadAbi('NodraIncentiveController'), wallet);

  const executeArgs = [
    ACTION_SETTLE_ACTIVITY,
    proofData.chainKey,
    proofData.headerNumber,
    proofData.txBytes,
    proofData.merkleProof.root,
    proofData.merkleProof.siblings,
    proofData.continuityProof.lowerEndpointDigest,
    proofData.continuityProof.roots,
  ] as const;

  const executeFn = controller.getFunction(
    'execute(uint8,uint64,uint64,bytes,bytes32,tuple(bytes32,bool)[],bytes32,bytes32[])'
  );

  console.log(`\n[4/4] Submitting execute() to NodraIncentiveController at ${controllerAddress}...`);
  const gasLimit = await computeGasLimit(executeFn, executeArgs, proofData);

  const tx = await executeFn(...executeArgs, { gasLimit });
  console.log(`      Creditcoin tx submitted: ${tx.hash}`);

  const creditcoinReceipt = await tx.wait();
  if (!creditcoinReceipt || creditcoinReceipt.status !== 1) {
    throw new Error(`Creditcoin transaction failed: ${tx.hash}`);
  }

  console.log(`      Confirmed in block ${creditcoinReceipt.blockNumber}\n`);
  reportEvents(controller, creditcoinReceipt);
}

/**
 * Gas estimation against the precompile can fail even when the call succeeds — pallet-evm does
 * not always propagate revert reasons in estimation mode. Falls back to a size-based estimate,
 * matching the official examples.
 */
async function computeGasLimit(
  executeFn: ReturnType<Contract['getFunction']>,
  args: readonly unknown[],
  proofData: proofProvider.ContinuityResponse
): Promise<bigint> {
  const continuityLength = proofData.continuityProof.roots.length;
  try {
    const estimated: bigint = await executeFn.estimateGas(...args);
    const withBuffer = (estimated * GAS_BUFFER_MULTIPLIER) / 100n;
    console.log(`      Estimated gas ${estimated}, using ${withBuffer}`);
    return withBuffer;
  } catch (error) {
    const calculated = BigInt(21_000 + continuityLength * 5_000 + 200_000);
    console.warn(`      Gas estimation failed (${(error as Error).message.slice(0, 120)})`);
    console.log(`      Falling back to size-based gas limit: ${calculated} (${continuityLength} continuity roots)`);
    return calculated;
  }
}

/** Prints the proof-of-verification events: Attestcoin's and Nodra's. */
function reportEvents(controller: Contract, receipt: ethers.TransactionReceipt): void {
  console.log('--- Events ---');

  // TransactionVerified is emitted by the Attestcoin verifier precompile at 0xFD2.
  const verifiedTopic = ethers.id('TransactionVerified(uint64,uint64,uint64)');
  const verified = receipt.logs.filter((log) => log.topics[0] === verifiedTopic);
  for (const log of verified) {
    console.log(`  [Attestcoin 0xFD2] TransactionVerified`);
    console.log(`      emitted by : ${log.address}`);
    console.log(`      chainKey   : ${BigInt(log.topics[1])}`);
    console.log(`      height     : ${BigInt(log.topics[2])}`);
  }

  for (const log of receipt.logs) {
    try {
      const parsed = controller.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'ActivitySettled') {
        console.log(`  [Nodra] ActivitySettled`);
        console.log(`      deviceId      : ${parsed.args.deviceId}`);
        console.log(`      sessionId     : ${parsed.args.sessionId}`);
        console.log(`      operator      : ${parsed.args.operator}`);
        console.log(`      activityUnits : ${parsed.args.activityUnits}`);
        console.log(`      reward        : ${parsed.args.reward}`);
        console.log(`      queryId       : ${parsed.args.queryId}`);
      }
    } catch {
      // Not a Nodra event; ignore.
    }
  }

  if (verified.length === 0) {
    console.log('  WARNING: no TransactionVerified event found from the Attestcoin precompile.');
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
