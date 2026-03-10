// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILockingContract {

    event TransferIncepted(
        bytes32 id,
        int amount,
        address from,
        address to,
        string keyEncryptedSeller
    );

    event TransferConfirmed(
        bytes32 id,
        int amount,
        address from,
        address to,
        string keyEncryptedBuyer
    );

    event TokenClaimed(bytes32 id, string key);
    event TokenReclaimed(bytes32 id, string key);

    function inceptTransfer(
        bytes32 id,
        int amount,
        address from,
        string calldata keyEncryptedSeller
    ) external;

    function confirmTransfer(
        bytes32 id,
        int amount,
        address to,
        string calldata keyEncryptedBuyer
    ) external;
}