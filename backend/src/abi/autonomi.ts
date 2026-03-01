/**
 * Minimal ABI for Autonomi contract (positions, getCurrentLTV, autoRebalance, getUSYCPrice).
 */
export const autonomiAbi = [
  {
    inputs: [{ name: "", internalType: "address", type: "address" }],
    name: "positions",
    outputs: [
      { name: "usycDeposited", internalType: "uint256", type: "uint256" },
      { name: "usdcBorrowed", internalType: "uint256", type: "uint256" },
      { name: "liquidationThreshold", internalType: "uint256", type: "uint256" },
      { name: "lastRebalance", internalType: "uint256", type: "uint256" },
      { name: "active", internalType: "bool", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "user", internalType: "address", type: "address" }],
    name: "getCurrentLTV",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", internalType: "address", type: "address" },
      { name: "targetLTV", internalType: "uint256", type: "uint256" },
    ],
    name: "autoRebalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getUSYCPrice",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
