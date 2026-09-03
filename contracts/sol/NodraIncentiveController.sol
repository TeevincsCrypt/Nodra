// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/**
 * @title NodraIncentiveController
 * @notice Creditcoin-side Nodra ASC. Accrues DePIN rewards ONLY for device activity that the
 *         Attestcoin protocol has cryptographically proven happened on the source chain.
 *
 * @dev Inherits the official `ASCBase`, which:
 *        1. verifies a Merkle inclusion proof + continuity proof through the Attestcoin native
 *           query verifier precompile at `0xFD2`, reverting if verification fails, and
 *        2. dedupes by queryId = keccak(chainKey, blockHeight, txIndex).
 *
 *      There is no oracle, no signer, and no trusted relayer in this path. `execute()` is
 *      permissionless because the proof is self-validating: an unverifiable proof reverts inside
 *      `ASCBase` before any Nodra logic runs. Remove Attestcoin and this contract cannot pay anyone.
 *
 *      Trust chain enforced here, on top of ASCBase's proof check:
 *        - the source transaction must have succeeded (receiptStatus == 1)
 *        - the log must carry our exact event signature
 *        - the log must have been emitted by the registered source registry address
 *        - the device must be registered with Nodra, and activity must be within sane bounds
 *        - the (deviceId, sessionId) pair must not have been settled before
 */
contract NodraIncentiveController is Ownable, Pausable, ASCBase {
    /// @dev Action discriminator passed to `ASCBase.execute`.
    enum NodraActions {
        SettleActivity // 0
    }

    error InvalidAction(uint8 action);

    /// @notice keccak256("DeviceActivityReported(bytes32,uint256,uint256)")
    /// @dev Computed at compile time rather than hardcoded, so it can never drift from the event.
    bytes32 public constant ACTIVITY_EVENT_SIGNATURE = keccak256("DeviceActivityReported(bytes32,uint256,uint256)");

    /// @notice Upper bound on a single activity report. Mirrors the source registry.
    uint256 public constant MAX_ACTIVITY_UNITS = 1_000_000;

    /// @notice Upper bound on the reward rate, so a misconfigured owner cannot mint unbounded credit.
    uint256 public constant MAX_REWARD_RATE_PER_UNIT = 1 ether;

    /// @notice Source-chain contract allowed to emit activity events (Sepolia NodraDeviceRegistry).
    address public sourceDeviceRegistry;

    /// @notice Reward accrued per activity unit.
    uint256 public rewardRatePerUnit;

    /// @notice deviceId => operator credited on Creditcoin.
    mapping(bytes32 => address) public deviceOperator;

    /// @notice keccak(deviceId, sessionId) => settled. Activity-level replay protection.
    mapping(bytes32 => bool) public settledActivities;

    /// @notice operator => accrued reward.
    mapping(address => uint256) public pendingRewards;

    /// @notice Running totals, useful for the Phase 4 dashboard.
    uint256 public totalActivityUnitsSettled;
    uint256 public totalRewardsAccrued;

    event SourceDeviceRegistrySet(address indexed sourceDeviceRegistry);
    event DeviceRegistered(bytes32 indexed deviceId, address indexed operator);
    event RewardRateUpdated(uint256 rewardRatePerUnit);
    event ActivitySettled(
        bytes32 indexed deviceId,
        uint256 indexed sessionId,
        address indexed operator,
        uint256 activityUnits,
        uint256 reward,
        bytes32 queryId
    );

    constructor(uint256 initialRewardRatePerUnit) Ownable(msg.sender) {
        require(initialRewardRatePerUnit > 0, "reward rate must be > 0");
        require(initialRewardRatePerUnit <= MAX_REWARD_RATE_PER_UNIT, "reward rate exceeds limit");
        rewardRatePerUnit = initialRewardRatePerUnit;
        emit RewardRateUpdated(initialRewardRatePerUnit);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /**
     * @notice Bind this controller to the source-chain registry authorized to emit activity events.
     * @dev Without this binding anyone could deploy a contract emitting the same event signature
     *      with an arbitrary deviceId and prove it to fraudulently accrue rewards.
     */
    function setSourceDeviceRegistry(address registry) external onlyOwner {
        require(registry != address(0), "registry cannot be the zero address");
        sourceDeviceRegistry = registry;
        emit SourceDeviceRegistrySet(registry);
    }

    /// @notice Register a device and the operator credited for its activity.
    function registerDevice(bytes32 deviceId, address operator) external onlyOwner {
        require(deviceId != bytes32(0), "deviceId required");
        require(operator != address(0), "operator cannot be the zero address");
        require(deviceOperator[deviceId] == address(0), "device already registered");

        deviceOperator[deviceId] = operator;

        emit DeviceRegistered(deviceId, operator);
    }

    function setRewardRatePerUnit(uint256 newRate) external onlyOwner {
        require(newRate > 0, "reward rate must be > 0");
        require(newRate <= MAX_REWARD_RATE_PER_UNIT, "reward rate exceeds limit");
        rewardRatePerUnit = newRate;
        emit RewardRateUpdated(newRate);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Attestcoin-verified settlement
    // ---------------------------------------------------------------------

    /// @inheritdoc ASCBase
    /// @dev Reached only after `ASCBase.execute` has verified the proof via the `0xFD2` precompile
    ///      and enforced queryId deduplication.
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        override
        whenNotPaused
    {
        if (action == uint8(NodraActions.SettleActivity)) {
            _settleActivity(queryId, encodedTransaction);
        } else {
            revert InvalidAction(action);
        }
    }

    function _settleActivity(bytes32 queryId, bytes memory encodedTransaction) internal {
        EvmV1Decoder.LogEntry[] memory activityLogs =
            _validateTransactionContents(encodedTransaction, ACTIVITY_EVENT_SIGNATURE);

        (bytes32 deviceId, uint256 sessionId, uint256 activityUnits) = _processActivityLogs(activityLogs);

        bytes32 activityKey = keccak256(abi.encodePacked(deviceId, sessionId));
        require(!settledActivities[activityKey], "Activity already settled");
        settledActivities[activityKey] = true;

        address operator = deviceOperator[deviceId];
        uint256 reward = activityUnits * rewardRatePerUnit;

        pendingRewards[operator] += reward;
        totalActivityUnitsSettled += activityUnits;
        totalRewardsAccrued += reward;

        emit ActivitySettled(deviceId, sessionId, operator, activityUnits, reward, queryId);
    }

    /**
     * @dev Shared structural validation of a proved transaction, mirroring the official
     *      Attestcoin reference implementations.
     */
    function _validateTransactionContents(bytes memory encodedTransaction, bytes32 eventSignature)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory selectedEventLogs)
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Transaction did not succeed");

        selectedEventLogs = EvmV1Decoder.getLogsByEventSignature(receipt, eventSignature);
        require(selectedEventLogs.length > 0, "No DeviceActivityReported events found");

        return selectedEventLogs;
    }

    /**
     * @dev Validates and decodes the activity log.
     *      Expected layout:
     *        topics[0] = ACTIVITY_EVENT_SIGNATURE
     *        topics[1] = deviceId
     *        topics[2] = sessionId
     *        data      = abi.encode(activityUnits)
     */
    function _processActivityLogs(EvmV1Decoder.LogEntry[] memory activityLogs)
        internal
        view
        returns (bytes32 deviceId, uint256 sessionId, uint256 activityUnits)
    {
        // For this MVP we settle the first activity log in a transaction; the source registry
        // emits exactly one per `reportActivity` call.
        require(activityLogs.length > 0, "No activity logs");
        EvmV1Decoder.LogEntry memory log = activityLogs[0];

        // Verify the event came from the registered source-chain registry. Without this, anyone
        // could deploy a contract that emits DeviceActivityReported with an arbitrary deviceId
        // and prove it to fraudulently accrue rewards.
        require(sourceDeviceRegistry != address(0), "Source device registry not registered!");
        require(log.address_ == sourceDeviceRegistry, "Activity event not emitted by registered source registry!");

        require(log.topics.length == 3, "Invalid DeviceActivityReported topics");
        require(log.topics[0] == ACTIVITY_EVENT_SIGNATURE, "Not DeviceActivityReported event");
        require(log.data.length == 32, "Invalid DeviceActivityReported data");

        deviceId = log.topics[1];
        sessionId = uint256(log.topics[2]);
        activityUnits = abi.decode(log.data, (uint256));

        require(deviceOperator[deviceId] != address(0), "Device not registered with Nodra");
        require(activityUnits > 0, "activityUnits must be > 0");
        require(activityUnits <= MAX_ACTIVITY_UNITS, "activityUnits exceeds limit");

        return (deviceId, sessionId, activityUnits);
    }
}
