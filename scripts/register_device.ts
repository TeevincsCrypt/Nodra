/**
 * Registers a device on BOTH chains:
 *   - Sepolia  : NodraDeviceRegistry.registerDevice(deviceId)   (operator = caller)
 *   - Creditcoin: NodraIncentiveController.registerDevice(deviceId, operator)  (owner only)
 */
import { Contract, ethers } from 'ethers';

import { requireEnv, requireAddress, requirePrivateKey, loadAbi, toDeviceId } from './env';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`
  Usage:
    yarn nodra:register_device <device_label> [creditcoin_operator_address]

  Example:
    yarn nodra:register_device NODE-001
    `);
    process.exit(1);
  }

  const label = args[0];
  const deviceId = toDeviceId(label);

  const sourceRpc = new ethers.JsonRpcProvider(requireEnv('SOURCE_CHAIN_RPC_URL'));
  const creditcoinRpc = new ethers.JsonRpcProvider(requireEnv('CREDITCOIN_RPC_URL'));

  const sourceWallet = new ethers.Wallet(requirePrivateKey('SOURCE_CHAIN_WALLET_PRIVATE_KEY'), sourceRpc);
  const creditcoinWallet = new ethers.Wallet(requirePrivateKey('CREDITCOIN_WALLET_PRIVATE_KEY'), creditcoinRpc);

  const operator = args[1] ?? creditcoinWallet.address;

  console.log(`Device label : ${label}`);
  console.log(`Device id    : ${deviceId}`);
  console.log(`Operator     : ${operator}\n`);

  const registry = new Contract(
    requireAddress('NODRA_DEVICE_REGISTRY_ADDRESS'),
    loadAbi('NodraDeviceRegistry'),
    sourceWallet
  );
  const controller = new Contract(
    requireAddress('NODRA_INCENTIVE_CONTROLLER_ADDRESS'),
    loadAbi('NodraIncentiveController'),
    creditcoinWallet
  );

  const existingOperator: string = await registry.deviceOperator(deviceId);
  if (existingOperator === ethers.ZeroAddress) {
    console.log('[Sepolia] registerDevice...');
    const tx = await registry.registerDevice(deviceId);
    await tx.wait();
    console.log(`[Sepolia] registered: ${tx.hash}`);
  } else {
    console.log(`[Sepolia] already registered to ${existingOperator}`);
  }

  const existingControllerOperator: string = await controller.deviceOperator(deviceId);
  if (existingControllerOperator === ethers.ZeroAddress) {
    console.log('[Creditcoin] registerDevice...');
    const tx = await controller.registerDevice(deviceId, operator);
    await tx.wait();
    console.log(`[Creditcoin] registered: ${tx.hash}`);
  } else {
    console.log(`[Creditcoin] already registered to ${existingControllerOperator}`);
  }

  console.log('\nDevice registered on both chains.');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
