import 'server-only';

/**
 * Minimal ABI fragments for the two deployed contracts. Kept hand-written and small rather
 * than importing full Foundry build artifacts, so the web app has no build-time dependency
 * on `forge build` having run. Every fragment here is copied verbatim from the deployed
 * source in `contracts/sol/` at the repository root — do not add anything that contract
 * does not actually expose.
 */

/** contracts/sol/NodraDeviceRegistry.sol (Sepolia) */
export const DEVICE_REGISTRY_ABI = [
  'function deviceOperator(bytes32 deviceId) external view returns (address)',
  'function nextSessionId(bytes32 deviceId) external view returns (uint256)',
  'event DeviceActivityReported(bytes32 indexed deviceId, uint256 indexed sessionId, uint256 activityUnits)',
  'event DeviceRegistered(bytes32 indexed deviceId, address indexed operator)',
] as const;

/** contracts/sol/NodraIncentiveController.sol (Creditcoin), including inherited Ownable/Pausable */
export const INCENTIVE_CONTROLLER_ABI = [
  'function owner() external view returns (address)',
  'function paused() external view returns (bool)',
  'function rewardRatePerUnit() external view returns (uint256)',
  'function sourceDeviceRegistry() external view returns (address)',
  'function deviceOperator(bytes32 deviceId) external view returns (address)',
  'function pendingRewards(address operator) external view returns (uint256)',
  'function totalActivityUnitsSettled() external view returns (uint256)',
  'function totalRewardsAccrued() external view returns (uint256)',
  'function settledActivities(bytes32 activityKey) external view returns (bool)',
  'event ActivitySettled(bytes32 indexed deviceId, uint256 indexed sessionId, address indexed operator, uint256 activityUnits, uint256 reward, bytes32 queryId)',
] as const;
