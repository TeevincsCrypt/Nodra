/**
 * Pre-flight check. Verifies RPC reachability, wallet balances, the Attestcoin chain-info
 * precompile, and the proof builder service BEFORE you spend 8 minutes waiting on an attestation.
 */
import { ethers } from 'ethers';
import { chainInfo } from '@gluwa/usc-sdk';

import { requireEnv, requirePrivateKey, requireNumber } from './env';

async function main(): Promise<void> {
  let failures = 0;
  const fail = (message: string) => {
    console.log(`  FAIL  ${message}`);
    failures += 1;
  };
  const ok = (message: string) => console.log(`  ok    ${message}`);

  console.log('\nNodra Phase 2 setup check\n');

  const creditcoinRpcUrl = requireEnv('CREDITCOIN_RPC_URL');
  const sourceChainRpcUrl = requireEnv('SOURCE_CHAIN_RPC_URL');
  const proofBuilderUrl = requireEnv('PROOF_BUILDER_URL');
  const chainKey = requireNumber('SOURCE_CHAIN_KEY');

  const creditcoinRpc = new ethers.JsonRpcProvider(creditcoinRpcUrl);
  const sourceRpc = new ethers.JsonRpcProvider(sourceChainRpcUrl);

  try {
    const network = await creditcoinRpc.getNetwork();
    ok(`Creditcoin RPC reachable (chainId ${network.chainId})`);
  } catch (error) {
    fail(`Creditcoin RPC unreachable: ${(error as Error).message}`);
  }

  try {
    const network = await sourceRpc.getNetwork();
    ok(`Source chain RPC reachable (chainId ${network.chainId})`);
  } catch (error) {
    fail(`Source chain RPC unreachable: ${(error as Error).message}`);
  }

  try {
    const creditcoinWallet = new ethers.Wallet(requirePrivateKey('CREDITCOIN_WALLET_PRIVATE_KEY'), creditcoinRpc);
    const balance = await creditcoinRpc.getBalance(creditcoinWallet.address);
    if (balance === 0n) {
      fail(`Creditcoin wallet ${creditcoinWallet.address} has zero balance — fund it with testnet CTC`);
    } else {
      ok(`Creditcoin wallet ${creditcoinWallet.address}: ${ethers.formatEther(balance)} CTC`);
    }
  } catch (error) {
    fail(`Creditcoin wallet: ${(error as Error).message}`);
  }

  try {
    const sourceWallet = new ethers.Wallet(requirePrivateKey('SOURCE_CHAIN_WALLET_PRIVATE_KEY'), sourceRpc);
    const balance = await sourceRpc.getBalance(sourceWallet.address);
    if (balance === 0n) {
      fail(`Source wallet ${sourceWallet.address} has zero balance — fund it with Sepolia ETH`);
    } else {
      ok(`Source wallet ${sourceWallet.address}: ${ethers.formatEther(balance)} ETH`);
    }
  } catch (error) {
    fail(`Source wallet: ${(error as Error).message}`);
  }

  try {
    const info = new chainInfo.PrecompileChainInfoProvider(creditcoinRpc);
    const chains = await info.getSupportedChains();
    ok(`ChainInfo precompile responded; ${chains.length} supported chain(s)`);
    for (const chain of chains) {
      const marker = chain.chainKey === chainKey ? '  <-- SOURCE_CHAIN_KEY' : '';
      console.log(`          chainKey ${chain.chainKey} | chainId ${chain.chainId} | ${chain.chainName}${marker}`);
    }
    if (!chains.some((chain) => chain.chainKey === chainKey)) {
      fail(`SOURCE_CHAIN_KEY=${chainKey} is not in the supported chain list above`);
    }

    const latest = await info.getLatestAttestedHeightAndHash(chainKey);
    ok(`Latest attested height for chainKey ${chainKey}: ${latest.height}`);
  } catch (error) {
    fail(`Attestcoin ChainInfo precompile: ${(error as Error).message}`);
  }

  try {
    const response = await fetch(`${proofBuilderUrl.replace(/\/$/, '')}/api/v1/proof-by-tx/${chainKey}/0x${'0'.repeat(64)}`);
    // Any HTTP response proves the service is reachable; a 4xx for a bogus hash is expected.
    ok(`Proof builder reachable (HTTP ${response.status} for a dummy hash, which is expected)`);
  } catch (error) {
    fail(`Proof builder unreachable: ${(error as Error).message}`);
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
