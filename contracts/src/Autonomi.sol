// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Teller oracle interface for USYC price (18 decimals).
interface ITeller {
    function getUSYCPrice() external view returns (uint256);
}

contract Autonomi is Ownable, ReentrancyGuard {
    struct Position {
        uint256 usycDeposited;       // USYC collateral (6 decimals)
        uint256 usdcBorrowed;        // USDC borrowed (6 decimals)
        uint256 liquidationThreshold; // 7500 = 75%
        uint256 lastRebalance;
        bool active;
    }

    IERC20 public immutable usdc;
    IERC20 public immutable usyc;
    ITeller public teller;

    mapping(address => Position) public positions;
    mapping(address => bool) public authorizedAgents;

    uint256 public constant BPS_BASE = 10000;
    uint256 public constant PRICE_PRECISION = 1e18;

    event PositionCreated(address indexed user, uint256 usycAmount);
    event Borrowed(address indexed user, uint256 usdcAmount);
    event Repaid(address indexed user, uint256 usdcAmount);
    event AutoRebalanced(address indexed user, uint256 newLTV);
    event AgentAuthorized(address indexed agent);
    event AgentRevoked(address indexed agent);

    error UnauthorizedAgent();
    error NoPosition();
    error PositionInactive();
    error LTVExceedsThreshold();
    error InsufficientCollateral();
    error TransferFailed();

    constructor(
        address _usdc,
        address _usyc,
        address _teller
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        usyc = IERC20(_usyc);
        teller = ITeller(_teller);
    }

    modifier onlyAgent() {
        if (!authorizedAgents[msg.sender]) revert UnauthorizedAgent();
        _;
    }

    function depositCollateral(uint256 usycAmount) external nonReentrant {
        if (usycAmount == 0) return;
        Position storage pos = positions[msg.sender];
        if (!pos.active) {
            pos.active = true;
            pos.liquidationThreshold = 7500; // 75% default
            pos.lastRebalance = block.timestamp;
        }
        pos.usycDeposited += usycAmount;
        if (!usyc.transferFrom(msg.sender, address(this), usycAmount)) revert TransferFailed();
        emit PositionCreated(msg.sender, usycAmount);
    }

    function borrow(uint256 usdcAmount) external nonReentrant {
        if (usdcAmount == 0) return;
        Position storage pos = positions[msg.sender];
        if (pos.usycDeposited == 0) revert NoPosition();
        if (!pos.active) revert PositionInactive();
        pos.usdcBorrowed += usdcAmount;
        uint256 ltv = getCurrentLTV(msg.sender);
        if (ltv > pos.liquidationThreshold) revert LTVExceedsThreshold();
        if (!usdc.transfer(msg.sender, usdcAmount)) revert TransferFailed();
        emit Borrowed(msg.sender, usdcAmount);
    }

    function repay(uint256 usdcAmount) external nonReentrant {
        if (usdcAmount == 0) return;
        Position storage pos = positions[msg.sender];
        uint256 toRepay = usdcAmount > pos.usdcBorrowed ? pos.usdcBorrowed : usdcAmount;
        if (toRepay == 0) return;
        pos.usdcBorrowed -= toRepay;
        if (!usdc.transferFrom(msg.sender, address(this), toRepay)) revert TransferFailed();
        emit Repaid(msg.sender, toRepay);
    }

    function autoRebalance(address user, uint256 /* targetLTV */) external onlyAgent nonReentrant {
        Position storage pos = positions[user];
        if (!pos.active || pos.usycDeposited == 0) revert NoPosition();
        pos.lastRebalance = block.timestamp;
        // Rebalance logic: target LTV is in basis points (e.g. 7500 = 75%).
        // For a minimal implementation we just record the rebalance; full logic could
        // add/remove collateral or debt to reach targetLTV.
        uint256 newLTV = getCurrentLTV(user);
        emit AutoRebalanced(user, newLTV);
    }

    function authorizeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent);
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    function getUSYCPrice() public view returns (uint256) {
        return teller.getUSYCPrice();
    }

    /// @return LTV in basis points (e.g. 7500 = 75%), scaled by 1e18 for precision.
    function getCurrentLTV(address user) public view returns (uint256) {
        Position storage pos = positions[user];
        if (pos.usycDeposited == 0) return 0;
        uint256 price = getUSYCPrice();
        if (price == 0) return type(uint256).max; // avoid div by zero
        // LTV = (usdcBorrowed * BPS_BASE * PRICE_PRECISION) / (usycDeposited * price)
        return (pos.usdcBorrowed * BPS_BASE * PRICE_PRECISION) / (pos.usycDeposited * price);
    }
}
