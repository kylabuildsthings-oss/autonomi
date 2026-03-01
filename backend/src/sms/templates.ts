/**
 * Autonomi SMS Templates
 * Realistic, varied messages for different scenarios.
 * Placeholders use {key}; render with renderTemplate().
 * Note: "Sent from Twilio trial account" is added by Twilio for trial accounts.
 * To remove it: Twilio Console → add funds (min $20) and upgrade number to production.
 */

const REBALANCE_TEMPLATES = [
  `🛡️ Autonomi: Position rebalanced
• {amount} USDC repaid
• LTV {oldLTV}% → {newLTV}%
• USYC: {collateral} @ $` + `{price}
• Gas: {gas} USDC
• tx: {txHash}`,
  `⚡ Auto-rebalance executed
• Market volatility detected ({vix})
• New LTV: {newLTV}% (target 60%)
• Settlement: {time}ms on Arc
• Block: #{block}`,
  `🔄 Position adjusted
• Collateral: {collateral} USYC
• Borrowed: {borrowed} USDC
• New ratio: {ratio}
• Agent confidence: {confidence}%
• Reason: Price impact {impact}%`,
  `📊 Rebalance complete
• Before: {oldLTV}% LTV
• After: {newLTV}% LTV
• Adjusted: {amount} USDC
• Oracle: Stork ({oracleTime}s)
• Gas price: {gasPrice} gwei`,
];

const PRICE_TEMPLATES = [
  `📈 Stork Oracle Update
• USYC: {oldPrice} → {newPrice} ({change}%)
• Your LTV: {oldLTV}% → {newLTV}%
• Circle yield: {yield}% APY
• Next update: {nextCheck}s`,
  `📉 Market Alert: USYC {change}%
• Current: {price}
• 1h change: {hourChange}%
• 24h range: {low} – {high}
• LTV impact: {ltvImpact}%
• Agent status: Monitoring`,
  `💹 Price movement detected
• Asset: USYC (T-bills)
• Change: {change}% ({direction})
• Volume: {volume}M USDC
• Bid-ask spread: {spread}%
• Circle reserves: {reserves}B`,
];

const WARNING_TEMPLATES = [
  `⚠️ Autonomi: LTV above 65%
• Current LTV: {ltv}%
• Rebalance in progress…
• Target: 60%
• tx: {txHash}`,
  `🛡️ High LTV detected
• Your position: {ltv}%
• Threshold: 65%
• Agent acting now to rebalance to 60%
• Arc settlement: <1s`,
  `📊 LTV alert
• Position LTV: {ltv}%
• Initiating auto-rebalance
• Stork oracle: {price} USYC
• No action needed from you`,
];

const CIRCLE_TEMPLATES = [
  `💎 Circle Treasury Update
• USYC reserves: {reserves}B
• 7-day yield: {yield}%
• Your position yield: +{earned} USDC
• Compounded: {compounded}
• Next distribution: {nextDist}h`,
  `🏦 Circle Wallet Activity
• Agent wallet: {agentWallet}
• Gas reserved: {gas} USDC
• Next rebalance budget: {budget} USDC
• 7-day avg gas: {avgGas} USDC/tx
• Wallet health: {health}%`,
  `💰 Treasury Report
• Total USYC supply: {supply}M
• Avg duration: {duration} days
• Your share: {share} USYC
• Daily yield accrued: {dailyYield}
• Circle compliance: {compliance}`,
];

const ARC_TEMPLATES = [
  `🌉 Arc Network Update
• Block time: {blockTime}s
• Finality: {finality}ms
• Active validators: {validators}
• USDC gas price: {gasPrice} gwei
• Network load: {load}%`,
  `⚡ Arc Performance
• Last block: #{lastBlock}
• TPS: {tps}
• Pending tx: {pending}
• Your last tx: {lastTx}
• Explorer: https://explorer.arc-test.net/tx/{txHash}`,
  `🔗 Chain Status
• Network: Arc Testnet (ID: 1686)
• Current epoch: {epoch}
• Slots per second: {slots}
• Malachite consensus: {consensus}
• Peer count: {peers}`,
];

const AGENT_TEMPLATES = [
  `🤖 Autonomi Agent Report
• Uptime: {uptime}d {hours}h {mins}m
• Rebalances this week: {rebalances}
• Total protected: {protected}
• Last action: {lastAction}
• Next check: {nextCheck}
• Gas efficiency: {efficiency}%`,
  `📡 Agent Network Status
• Connected to: Arc (finality: {finality}ms)
• Oracle: Stork ({oracleUptime}% uptime)
• Circle API: {circleStatus}
• Gas price: {gasPrice} gwei
• Agent wallet: {walletBalance} USDC`,
  `🕒 Agent Schedule
• Monitoring interval: 5 min
• Last check: {lastCheck}
• Next check: {nextCheck}
• Positions watched: {positions}
• Active alerts: {alerts}`,
];

const SUMMARY_TEMPLATES = [
  `📋 Daily Autonomi Summary
• Date: {date}
• Avg LTV: {avgLTV}% (target 60%)
• Rebalances: {rebalances} (avg {avgAmount} USDC)
• Price volatility: {volatility}
• Agent efficiency: {efficiency}%
• Protected: {protected} in fees`,
  `📊 24h Performance
• Start LTV: {startLTV}%
• End LTV: {endLTV}%
• High: {highLTV}% | Low: {lowLTV}%
• Rebalances: {rebalances}
• Gas spent: {gasSpent} USDC
• Yield earned: {yieldEarned} USDC`,
  `📈 Daily Overview
• Position: {position} USYC
• Borrowed: {borrowed} USDC
• LTV: {ltv}%
• USYC price: {price}
• No rebalances today`,
];

const TEST_TEMPLATES = [
  `🧪 Autonomi Test Alert
Your SMS notifications are working!
• Agent active: ✅
• Network: Arc Testnet
• Reply HELP for commands
• Reply STOP to unsubscribe`,
  `✅ System Test Successful
• SMS delivery: ✓
• Agent status: Active
• Oracle connection: ✓
• Circle API: ✓
• Timestamp: {timestamp}`,
  `🔧 Diagnostic Message
• Your address: {address}
• Agent balance: {balance} USDC
• Last rebalance: {lastRebalance}
• Current LTV: {ltv}%
• Stork price: {price}`,
];

/** Replace {key} with data[key]; missing keys become "—". */
export function renderTemplate(
  templates: readonly string[],
  data: Record<string, string | number | undefined>
): string {
  const template = templates[Math.floor(Math.random() * templates.length)]!;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = data[key];
    return v !== undefined && v !== "" ? String(v) : "—";
  });
}

export function getRebalanceMessage(data: Record<string, string | number | undefined>): string {
  return renderTemplate(REBALANCE_TEMPLATES, data);
}

export function getPriceAlertMessage(data: Record<string, string | number | undefined>): string {
  return renderTemplate(PRICE_TEMPLATES, data);
}

export function getWarningMessage(data: Record<string, string | number | undefined>): string {
  return renderTemplate(WARNING_TEMPLATES, data);
}

export function getDailySummaryMessage(data: Record<string, string | number | undefined>): string {
  return renderTemplate(SUMMARY_TEMPLATES, data);
}

export function getTestMessage(data: Record<string, string | number | undefined> = {}): string {
  return renderTemplate(TEST_TEMPLATES, { ...data, timestamp: new Date().toISOString() });
}

export {
  REBALANCE_TEMPLATES,
  PRICE_TEMPLATES,
  WARNING_TEMPLATES,
  CIRCLE_TEMPLATES,
  ARC_TEMPLATES,
  AGENT_TEMPLATES,
  SUMMARY_TEMPLATES,
  TEST_TEMPLATES,
};
