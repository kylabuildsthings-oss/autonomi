/**
 * Twilio SMS — sendAlert() via Twilio REST API (no Twilio SDK).
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env to enable.
 * Uses fetch() so it works on Node 18+ and avoids SDK dependency issues on Node 24.
 *
 * Trial message: "Sent from Twilio trial account" is appended by Twilio for trial accounts.
 * To remove it: Twilio Console → add funds (min $20) → upgrade number to production.
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
 * Returns { ok: true } on success, or { ok: false, error: string } on failure.
 */
export async function sendAlert(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds = getCredentials();
  if (!creds) {
    const msg = "Twilio not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).";
    console.warn("[sms]", msg);
    return { ok: false, error: msg };
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

    const bodyText = await res.text();
    if (!res.ok) {
      let errMsg = bodyText;
      try {
        const parsed = JSON.parse(bodyText) as { message?: string; code?: number };
        if (parsed.message) errMsg = parsed.message;
      } catch {
        // use bodyText as-is
      }
      console.error("[sms] Failed to send alert", { to, status: res.status, error: errMsg });
      return { ok: false, error: errMsg };
    }
    console.log("[sms] Alert sent", { to: to.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d+)/, "$1 ***-$4") });
    return { ok: true };
  } catch (e) {
    const errMsg = String(e);
    console.error("[sms] Failed to send alert", { to, error: errMsg });
    return { ok: false, error: errMsg };
  }
}
