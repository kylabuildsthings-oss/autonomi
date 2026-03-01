// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {Autonomi} from "../contracts/src/Autonomi.sol";
import {MockTeller} from "../contracts/src/MockTeller.sol";

contract DeployScript is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant ARC_USYC = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;

    function run() external {
        vm.startBroadcast();

        MockTeller mockTeller = new MockTeller();
        Autonomi autonomi = new Autonomi(ARC_USDC, ARC_USYC, address(mockTeller));

        vm.stopBroadcast();

        console.log("MockTeller deployed to:", address(mockTeller));
        console.log("Autonomi deployed to:", address(autonomi));
    }
}
