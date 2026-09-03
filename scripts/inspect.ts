/** Reads Nodra state from Creditcoin: device operator, pending rewards, and running totals. */
import { Contract, ethers } from 'ethers';

import { requireEnv, requireAddress, loadAbi, toDeviceId } from './env';

async function main(): Promise<void> {
  const label = process.argv[2];
  const creditcoinRpc = new ethers.JsonRpcProvider(requireEnv('CREDITCOIN_RPC_URL'));
  const controller = new Contract(
    requireAddress('NODRA_INCENTIVE_CONTROLLER_ADDRESS'),
    loadAbi('NodraIncentiveController'),
    creditcoinRpc
  );

  console.log(`\nNodraIncentiveController @ ${await controller.getAddress()}`);
  console.log(`  sourceDeviceRegistry     : ${await controller.sourceDeviceRegistry()}`);
  console.log(`  rewardRatePerUnit        : ${await controller.rewardRatePerUnit()}`);
  console.log(`  totalActivityUnitsSettled: ${await controller.totalActivityUnitsSettled()}`);
  console.log(`  totalRewardsAccrued      : ${await controller.totalRewardsAccrued()}`);
  console.log(`  paused                   : ${await controller.paused()}`);

  if (label) {
    const deviceId = toDeviceId(label);
    const operator: string = await controller.deviceOperator(deviceId);
    console.log(`\nDevice ${label} (${deviceId})`);
    console.log(`  operator       : ${operator}`);
    if (operator !== ethers.ZeroAddress) {
      console.log(`  pendingRewards : ${await controller.pendingRewards(operator)}`);
    }
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}\n`);
  process.exit(1);
});
