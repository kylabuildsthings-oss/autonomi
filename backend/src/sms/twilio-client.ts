/**
 * Twilio SMS — sendAlert() via Twilio REST API (no Twilio SDK).
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env to enable.
 * Uses fetch() so it works on Node 18+ and avoids SDK dependency issues on Node 24.
 */

import "dotenv/config.js";

function getCredentials(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromNumber = process.env["TWILIO_PHONE_NUMBER"];
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

/**
 * Send an SMS to the given E.164 phone number via Twilio REST API.
 * No-op if Twilio is not configured (missing env vars).
 */
export async function sendAlert(to: string, body: string): Promise<boolean> {
  const creds = getCredentials();
  if (!creds) {
    console.warn("[sms] Twilio not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER). Skipping SMS.");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const basic = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: creds.fromNumber, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[sms] Failed to send alert", { to, status: res.status, error: err });
      return false;
    }
    console.log("[sms] Alert sent", { to: to.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d+)/, "$1 ***-$4") });
    return true;
  } catch (e) {
    console.error("[sms] Failed to send alert", { to, error: String(e) });
    return false;
  }
}
