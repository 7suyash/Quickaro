// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
// PaymentToken.sol
// PURPOSE: Represents digital settlement currency (e.g., SET tokens).
// This is an ERC-20 demo token for educational simulation only.
// DO NOT use with real financial systems or real money.
// ============================================================

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PaymentToken is ERC20, Ownable {
    // Token name: "Settlement Token", symbol: "SET"
    constructor(address initialOwner)
        ERC20("Settlement Token", "SET")
        Ownable(initialOwner)
    {}

    /**
     * @dev Mints demo payment tokens to a given address.
     * Can only be called by the contract owner (admin).
     * @param to     Recipient address
     * @param amount Amount of tokens to mint (in wei units, i.e. 10^18 per token)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Returns the balance of payment tokens held by an address.
     * Inherited from ERC20: balanceOf(address account)
     */

    /**
     * @dev Approve and transfer are inherited from OpenZeppelin ERC20.
     * Approve allows the SettlementEngine to move tokens on behalf of users.
     */
}