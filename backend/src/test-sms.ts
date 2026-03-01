/**
 * Send one test SMS to verify Twilio is configured.
 * Run: npm run test:sms -- +15551234567
 * Or set TEST_SMS_PHONE in .env.
 */
import "dotenv/config.js";
import { sendAlert } from "./sms/twilio-client.js";
import { getTestMessage } from "./sms/templates.js";

const phone = process.argv[2]?.trim() || process.env["TEST_SMS_PHONE"]?.trim();
if (!phone) {
  console.error("Usage: npm run test:sms -- +15551234567");
  console.error("Or set TEST_SMS_PHONE=+15551234567 in .env");
  process.exit(1);
}

const body = getTestMessage();
const result = await sendAlert(phone, body);
if (!result.ok) console.error(result.error);
process.exit(result.ok ? 0 : 1);
