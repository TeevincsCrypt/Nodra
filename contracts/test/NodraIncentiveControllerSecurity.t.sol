// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NodraIncentiveControllerHarness} from "./harness/NodraIncentiveControllerHarness.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/**
 * @dev Stand-in for the Creditcoin native query verifier precompile (`0xFD2`) in unit tests.
 *
 * IMPORTANT: `verifyAndEmit` returns FALSE, never true. These unit tests deliberately never
 * fabricate a successful Attestcoin proof — that would defeat the purpose of the integration.
 * They assert that an unverified proof is REJECTED, and exercise Nodra's own decoding,
 * authorization and replay logic through the harness. Genuine proof verification is proven
 * on Creditcoin CC3 Testnet via the Phase 2 runbook.
 */
contract RejectingNativeQueryVerifier {
    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external pure returns (uint64) {
        return 0;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external pure returns (bool) {
        return false;
    }
}

contract NodraIncentiveControllerSecurityTest is Test {
    NodraIncentiveControllerHarness internal controller;

    address internal constant VERIFIER_PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    bytes32 internal constant ACTIVITY_EVENT_SIGNATURE =
        keccak256("DeviceActivityReported(bytes32,uint256,uint256)");

    bytes32 internal constant DEVICE_ID = bytes32("NODE-001");
    uint256 internal constant RATE = 1e12;

    address internal registeredSource = address(0xBEEF);
    address internal spoofedSource = address(0xBAD);
    address internal operator = address(0xCAFE);

    function setUp() public {
        RejectingNativeQueryVerifier mock = new RejectingNativeQueryVerifier();
        vm.etch(VERIFIER_PRECOMPILE, address(mock).code);

        controller = new NodraIncentiveControllerHarness(RATE);
        controller.setSourceDeviceRegistry(registeredSource);
        controller.registerDevice(DEVICE_ID, operator);
    }

    // -----------------------------------------------------------------
    // The Attestcoin gate itself
    // -----------------------------------------------------------------

    /// @dev The whole point of the integration: no valid proof, no settlement.
    function testExecute_revertsWhenProofVerificationFails() public {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);

        vm.expectRevert("Proof of inclusion verification failed");
        controller.execute(0, 1, 100, "", bytes32(uint256(43)), siblings, bytes32(0), new bytes32[](0));
    }

    /// @dev ASCBase queryId dedupe (chainKey, blockHeight, txIndex).
    function testExecute_revertsOnProcessedQueryId() public {
        uint64 chainKey = 1;
        uint64 blockHeight = 100;
        bytes32 merkleRoot = bytes32(uint256(42));
        INativeQueryVerifier.MerkleProofEntry[] memory siblings = new INativeQueryVerifier.MerkleProofEntry[](0);

        bytes32 queryId = controller.exposeComputeQueryId(chainKey, blockHeight, merkleRoot, siblings);
        controller.exposeMarkQueryProcessed(queryId);

        vm.expectRevert("Query already processed");
        controller.execute(0, chainKey, blockHeight, "", merkleRoot, siblings, bytes32(0), new bytes32[](0));
    }

    // -----------------------------------------------------------------
    // Source-contract binding
    // -----------------------------------------------------------------

    function testActivityLog_acceptsRegisteredEmitter() public view {
        (bytes32 deviceId, uint256 sessionId, uint256 units) =
            controller.exposeProcessActivityLogs(_activityLog(registeredSource, DEVICE_ID, 7, 250));

        assertEq(deviceId, DEVICE_ID);
        assertEq(sessionId, 7);
        assertEq(units, 250);
    }

    function testActivityLog_rejectsUnboundSourceRegistry() public {
        NodraIncentiveControllerHarness fresh = new NodraIncentiveControllerHarness(RATE);
        vm.expectRevert("Source device registry not registered!");
        fresh.exposeProcessActivityLogs(_activityLog(registeredSource, DEVICE_ID, 0, 10));
    }

    function testActivityLog_rejectsSpoofedEmitter() public {
        vm.expectRevert("Activity event not emitted by registered source registry!");
        controller.exposeProcessActivityLogs(_activityLog(spoofedSource, DEVICE_ID, 0, 10));
    }

    // -----------------------------------------------------------------
    // Event shape validation
    // -----------------------------------------------------------------

    function testActivityLog_rejectsWrongTopicCount() public {
        EvmV1Decoder.LogEntry[] memory logs = _activityLog(registeredSource, DEVICE_ID, 0, 10);
        bytes32[] memory shortTopics = new bytes32[](2);
        shortTopics[0] = ACTIVITY_EVENT_SIGNATURE;
        shortTopics[1] = DEVICE_ID;
        logs[0].topics = shortTopics;

        vm.expectRevert("Invalid DeviceActivityReported topics");
        controller.exposeProcessActivityLogs(logs);
    }

    function testActivityLog_rejectsWrongEventSignature() public {
        EvmV1Decoder.LogEntry[] memory logs = _activityLog(registeredSource, DEVICE_ID, 0, 10);
        logs[0].topics[0] = keccak256("SomethingElse(uint256)");

        vm.expectRevert("Not DeviceActivityReported event");
        controller.exposeProcessActivityLogs(logs);
    }

    function testActivityLog_rejectsMalformedData() public {
        EvmV1Decoder.LogEntry[] memory logs = _activityLog(registeredSource, DEVICE_ID, 0, 10);
        logs[0].data = hex"1234";

        vm.expectRevert("Invalid DeviceActivityReported data");
        controller.exposeProcessActivityLogs(logs);
    }

    // -----------------------------------------------------------------
    // Device + bounds validation
    // -----------------------------------------------------------------

    function testActivityLog_rejectsUnknownDevice() public {
        vm.expectRevert("Device not registered with Nodra");
        controller.exposeProcessActivityLogs(_activityLog(registeredSource, bytes32("NODE-999"), 0, 10));
    }

    function testActivityLog_rejectsZeroUnits() public {
        vm.expectRevert("activityUnits must be > 0");
        controller.exposeProcessActivityLogs(_activityLog(registeredSource, DEVICE_ID, 0, 0));
    }

    function testActivityLog_rejectsUnitsAboveLimit() public {
        uint256 tooMany = controller.MAX_ACTIVITY_UNITS() + 1;
        vm.expectRevert("activityUnits exceeds limit");
        controller.exposeProcessActivityLogs(_activityLog(registeredSource, DEVICE_ID, 0, tooMany));
    }

    // -----------------------------------------------------------------
    // Settlement, rewards, replay
    // -----------------------------------------------------------------

    function testSettle_accruesReward() public {
        controller.exposeSettleActivity(bytes32(uint256(1)), _encodedActivityTx(registeredSource, DEVICE_ID, 0, 250));

        assertEq(controller.pendingRewards(operator), 250 * RATE);
        assertEq(controller.totalActivityUnitsSettled(), 250);
        assertEq(controller.totalRewardsAccrued(), 250 * RATE);
    }

    function testSettle_rejectsReceiptFailure() public {
        bytes memory encoded = _encodedActivityTx(registeredSource, DEVICE_ID, 0, 250, 0 /* failed receipt */ );
        vm.expectRevert("Transaction did not succeed");
        controller.exposeSettleActivity(bytes32(uint256(1)), encoded);
    }

    function testSettle_rejectsTransactionWithoutActivityEvent() public {
        bytes memory encoded = _encodedTxWithSignature(registeredSource, keccak256("Unrelated(uint256)"));
        vm.expectRevert("No DeviceActivityReported events found");
        controller.exposeSettleActivity(bytes32(uint256(1)), encoded);
    }

    /// @dev Activity-level replay protection, independent of ASCBase's queryId dedupe.
    function testSettle_rejectsDuplicateActivity() public {
        bytes memory encoded = _encodedActivityTx(registeredSource, DEVICE_ID, 3, 100);
        controller.exposeSettleActivity(bytes32(uint256(1)), encoded);

        vm.expectRevert("Activity already settled");
        controller.exposeSettleActivity(bytes32(uint256(2)), encoded);
    }

    function testSettle_allowsDistinctSessions() public {
        controller.exposeSettleActivity(bytes32(uint256(1)), _encodedActivityTx(registeredSource, DEVICE_ID, 0, 100));
        controller.exposeSettleActivity(bytes32(uint256(2)), _encodedActivityTx(registeredSource, DEVICE_ID, 1, 100));

        assertEq(controller.pendingRewards(operator), 200 * RATE);
    }

    // -----------------------------------------------------------------
    // Access control, pause, action dispatch
    // -----------------------------------------------------------------

    function testProcess_rejectsInvalidAction() public {
        bytes memory encoded = _encodedActivityTx(registeredSource, DEVICE_ID, 0, 100);
        vm.expectRevert(abi.encodeWithSignature("InvalidAction(uint8)", 9));
        controller.exposeProcessAndEmitEvent(9, bytes32(uint256(1)), encoded);
    }

    function testProcess_rejectsWhenPaused() public {
        controller.pause();
        bytes memory encoded = _encodedActivityTx(registeredSource, DEVICE_ID, 0, 100);

        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        controller.exposeProcessAndEmitEvent(0, bytes32(uint256(1)), encoded);
    }

    function testAdmin_onlyOwnerCanSetSourceRegistry() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", address(0xDEAD)));
        controller.setSourceDeviceRegistry(address(0x1234));
    }

    function testAdmin_onlyOwnerCanRegisterDevice() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", address(0xDEAD)));
        controller.registerDevice(bytes32("NODE-002"), operator);
    }

    function testAdmin_rejectsRewardRateAboveLimit() public {
        uint256 tooHigh = controller.MAX_REWARD_RATE_PER_UNIT() + 1;
        vm.expectRevert("reward rate exceeds limit");
        controller.setRewardRatePerUnit(tooHigh);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _activityLog(address emitter, bytes32 deviceId, uint256 sessionId, uint256 units)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory logs)
    {
        logs = new EvmV1Decoder.LogEntry[](1);
        logs[0].address_ = emitter;
        logs[0].topics = new bytes32[](3);
        logs[0].topics[0] = ACTIVITY_EVENT_SIGNATURE;
        logs[0].topics[1] = deviceId;
        logs[0].topics[2] = bytes32(sessionId);
        logs[0].data = abi.encode(units);
    }

    function _encodedActivityTx(address emitter, bytes32 deviceId, uint256 sessionId, uint256 units)
        internal
        pure
        returns (bytes memory)
    {
        return _encodedActivityTx(emitter, deviceId, sessionId, units, 1);
    }

    /// @dev Builds the `(txType, bytes[] chunks)` EVM-v1 encoding the prover returns as `txBytes`.
    function _encodedActivityTx(
        address emitter,
        bytes32 deviceId,
        uint256 sessionId,
        uint256 units,
        uint8 receiptStatus
    ) internal pure returns (bytes memory encoded) {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = ACTIVITY_EVENT_SIGNATURE;
        topics[1] = deviceId;
        topics[2] = bytes32(sessionId);

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: abi.encode(units)});

        return _encodeChunks(logs, receiptStatus);
    }

    function _encodedTxWithSignature(address emitter, bytes32 signature) internal pure returns (bytes memory) {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = signature;

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: ""});

        return _encodeChunks(logs, 1);
    }

    function _encodeChunks(EvmV1Decoder.LogEntryTuple[] memory logs, uint8 receiptStatus)
        internal
        pure
        returns (bytes memory encoded)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(21_000), address(0x1), false, address(0x2), uint256(0), bytes(""));
        chunks[1] = abi.encode(uint128(1), uint256(27), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, uint64(21_000), logs, bytes(""));

        encoded = abi.encode(uint8(0), chunks);
    }
}
