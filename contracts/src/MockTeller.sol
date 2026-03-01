// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ITeller} from "./Autonomi.sol";

/// @notice Demo mock: returns fixed USYC price of $1.05 (18 decimals).
contract MockTeller is ITeller {
    uint256 public constant MOCK_USYC_PRICE = 105e16; // 1.05 * 10^18

    function getUSYCPrice() external pure override returns (uint256) {
        return MOCK_USYC_PRICE;
    }
}
