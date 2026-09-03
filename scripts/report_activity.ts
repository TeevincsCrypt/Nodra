/**
 * Emits one DeviceActivityReported event on Sepolia and prints the transaction hash to feed
 * into `yarn nodra:submit_proof`.
 */
import { Contract, ethers } from 'ethers';

import { requireEnv, requireAddress, requirePrivateKey, loadAbi, toDeviceId } from './env';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error(`
  Usage:
    yarn nodra:report_activity <device_label> <activity_units>

  Example:
    yarn nodra:report_activity NODE-001 250
    `);
    process.exit(1);
  }

  const label = args[0];
  const activityUnits = BigInt(args[1]);
  const deviceId = toDeviceId(label);

  const sourceRpc = new ethers.JsonRpcProvider(requireEnv('SOURCE_CHAIN_RPC_URL'));
  const wallet = new ethers.Wallet(requirePrivateKey('SOURCE_CHAIN_WALLET_PRIVATE_KEY'), sourceRpc);
  const registry = new Contract(
    requireAddress('NODRA_DEVICE_REGISTRY_ADDRESS'),
    loadAbi('NodraDeviceRegistry'),
    wallet
  );

  console.log(`Reporting ${activityUnits} activity units for ${label} (${deviceId})...`);
  const tx = await registry.reportActivity(deviceId, activityUnits);
  console.log(`Submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Transaction failed: ${tx.hash}`);
  }

  let sessionId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'DeviceActivityReported') {
        sessionId = parsed.args.sessionId as bigint;
      }
    } catch {
      // ignore non-registry logs
    }
  }

  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Session id: ${sessionId}`);
  console.log(`\nNext step:\n  yarn nodra:submit_proof ${tx.hash}\n`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
