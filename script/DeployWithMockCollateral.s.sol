// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {Autonomi} from "../contracts/src/Autonomi.sol";
import {MockTeller} from "../contracts/src/MockTeller.sol";
import {MockUSYC} from "../contracts/src/MockUSYC.sol";

/// @notice Deploy Autonomi with mock collateral (no permissioning) so you can test deposit/borrow/rebalance.
contract DeployWithMockCollateral is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();

        MockUSYC mockUSYC = new MockUSYC();
        mockUSYC.mint(msg.sender, 10_000_000 * 1e6); // 10M mock USYC (6 decimals)

        MockTeller mockTeller = new MockTeller();
        Autonomi autonomi = new Autonomi(ARC_USDC, address(mockUSYC), address(mockTeller));

        vm.stopBroadcast();

        console.log("MockUSYC deployed to:", address(mockUSYC));
        console.log("MockTeller deployed to:", address(mockTeller));
        console.log("Autonomi (with mock collateral) deployed to:", address(autonomi));
        console.log("");
        console.log("Next: approve Autonomi to spend MockUSYC, then depositCollateral(amount).");
        console.log("Approve: cast send <MOCK_USYC> approve(address,uint256) <AUTONOMI> 1000000000 --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY");
        console.log("Deposit:  cast send <AUTONOMI> depositCollateral(uint256) 1000000 --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY");
    }
}
