// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {NodraIncentiveController} from "../../sol/NodraIncentiveController.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/// @dev Test harness exposing internal validators, mirroring the official Attestcoin example harnesses.
contract NodraIncentiveControllerHarness is NodraIncentiveController {
    constructor(uint256 initialRewardRatePerUnit) NodraIncentiveController(initialRewardRatePerUnit) {}

    function exposeProcessActivityLogs(EvmV1Decoder.LogEntry[] memory activityLogs)
        external
        view
        returns (bytes32 deviceId, uint256 sessionId, uint256 activityUnits)
    {
        return _processActivityLogs(activityLogs);
    }

    function exposeSettleActivity(bytes32 queryId, bytes memory encodedTransaction) external {
        _settleActivity(queryId, encodedTransaction);
    }

    /// @dev Exercises the pause guard and action dispatch without going through the proof path.
    function exposeProcessAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction) external {
        _processAndEmitEvent(action, queryId, encodedTransaction);
    }

    function exposeComputeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) external view returns (bytes32) {
        return _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);
    }

    function exposeMarkQueryProcessed(bytes32 queryId) external {
        processedQueries[queryId] = true;
    }
}
