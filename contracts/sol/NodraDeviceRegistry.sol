// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title NodraDeviceRegistry
 * @notice Source-chain (Sepolia) registry for Nodra DePIN devices.
 * @dev This contract is deliberately minimal. Its only job is to produce a deterministic,
 *      cheaply-decodable activity event that the Attestcoin protocol can attest and that
 *      `NodraIncentiveController` can consume on Creditcoin.
 *
 *      Event layout is chosen so that `EvmV1Decoder.getLogsByEventSignature()` can select it
 *      and so every field lands in a fixed position:
 *
 *        topics[0] = keccak256("DeviceActivityReported(bytes32,uint256,uint256)")
 *        topics[1] = deviceId
 *        topics[2] = sessionId
 *        data      = abi.encode(activityUnits)   // exactly 32 bytes
 */
contract NodraDeviceRegistry {
    /// @notice Upper bound on a single activity report. Mirrored on the Creditcoin side.
    uint256 public constant MAX_ACTIVITY_UNITS = 1_000_000;

    struct Device {
        address operator;
        bool registered;
    }

    /// @notice deviceId => device record.
    mapping(bytes32 => Device) public devices;

    /// @notice deviceId => next session id. Monotonic, so activity reports are deterministic.
    mapping(bytes32 => uint256) public nextSessionId;

    event DeviceRegistered(bytes32 indexed deviceId, address indexed operator);

    /// @dev The event Attestcoin attests and Nodra settles against.
    event DeviceActivityReported(bytes32 indexed deviceId, uint256 indexed sessionId, uint256 activityUnits);

    /**
     * @notice Register a device under the caller's address.
     * @param deviceId Stable identifier for the device (e.g. bytes32("NODE-001")).
     */
    function registerDevice(bytes32 deviceId) external {
        require(deviceId != bytes32(0), "deviceId required");
        require(!devices[deviceId].registered, "device already registered");

        devices[deviceId] = Device({operator: msg.sender, registered: true});

        emit DeviceRegistered(deviceId, msg.sender);
    }

    /**
     * @notice Emit a single activity report for a registered device.
     * @dev Only the registered operator may report. The session id is assigned by the contract
     *      rather than the caller, so a given (deviceId, sessionId) pair can only ever be emitted
     *      once on this chain.
     * @param deviceId The device reporting activity.
     * @param activityUnits Amount of work performed. Unit is intentionally abstract for the MVP.
     * @return sessionId The session id assigned to this report.
     */
    function reportActivity(bytes32 deviceId, uint256 activityUnits) external returns (uint256 sessionId) {
        Device memory device = devices[deviceId];
        require(device.registered, "device not registered");
        require(msg.sender == device.operator, "not device operator");
        require(activityUnits > 0, "activityUnits must be > 0");
        require(activityUnits <= MAX_ACTIVITY_UNITS, "activityUnits exceeds limit");

        sessionId = nextSessionId[deviceId];
        nextSessionId[deviceId] = sessionId + 1;

        emit DeviceActivityReported(deviceId, sessionId, activityUnits);
    }

    /// @notice Convenience view for the off-chain simulator/worker.
    function deviceOperator(bytes32 deviceId) external view returns (address) {
        return devices[deviceId].operator;
    }
}
