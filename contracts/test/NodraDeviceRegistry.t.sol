// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NodraDeviceRegistry} from "../sol/NodraDeviceRegistry.sol";

/// @notice Tests for the Sepolia-side device registry that produces the attested activity event.
contract NodraDeviceRegistryTest is Test {
    NodraDeviceRegistry internal registry;

    bytes32 internal constant DEVICE_ID = bytes32("NODE-001");
    address internal operator = address(0xA11CE);
    address internal stranger = address(0xBAD);

    event DeviceActivityReported(bytes32 indexed deviceId, uint256 indexed sessionId, uint256 activityUnits);

    function setUp() public {
        registry = new NodraDeviceRegistry();
        vm.prank(operator);
        registry.registerDevice(DEVICE_ID);
    }

    function testRegisterDevice_setsOperator() public view {
        assertEq(registry.deviceOperator(DEVICE_ID), operator);
    }

    function testRegisterDevice_rejectsZeroId() public {
        vm.expectRevert("deviceId required");
        registry.registerDevice(bytes32(0));
    }

    function testRegisterDevice_rejectsDuplicate() public {
        vm.prank(operator);
        vm.expectRevert("device already registered");
        registry.registerDevice(DEVICE_ID);
    }

    function testReportActivity_emitsDeterministicEvent() public {
        vm.expectEmit(true, true, false, true);
        emit DeviceActivityReported(DEVICE_ID, 0, 250);

        vm.prank(operator);
        registry.reportActivity(DEVICE_ID, 250);
    }

    function testReportActivity_incrementsSessionId() public {
        vm.startPrank(operator);
        assertEq(registry.reportActivity(DEVICE_ID, 10), 0);
        assertEq(registry.reportActivity(DEVICE_ID, 10), 1);
        assertEq(registry.reportActivity(DEVICE_ID, 10), 2);
        vm.stopPrank();
        assertEq(registry.nextSessionId(DEVICE_ID), 3);
    }

    function testReportActivity_rejectsNonOperator() public {
        vm.prank(stranger);
        vm.expectRevert("not device operator");
        registry.reportActivity(DEVICE_ID, 10);
    }

    function testReportActivity_rejectsUnregisteredDevice() public {
        vm.prank(operator);
        vm.expectRevert("device not registered");
        registry.reportActivity(bytes32("NODE-999"), 10);
    }

    function testReportActivity_rejectsZeroUnits() public {
        vm.prank(operator);
        vm.expectRevert("activityUnits must be > 0");
        registry.reportActivity(DEVICE_ID, 0);
    }

    function testReportActivity_rejectsAboveLimit() public {
        vm.prank(operator);
        vm.expectRevert("activityUnits exceeds limit");
        registry.reportActivity(DEVICE_ID, registry.MAX_ACTIVITY_UNITS() + 1);
    }
}
