import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

let admin: SupabaseClient | null = null;

export function getAdminDb(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

export function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio server credentials are not configured.");
  return twilio(sid, token);
}

export function verifyTwilioRequest(request: Request, parameters: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");
  const publicUrl = process.env.PUBLIC_APP_URL;
  if (!authToken || !signature || !publicUrl) return false;
  const requestUrl = new URL(request.url);
  const canonical = new URL(`${requestUrl.pathname}${requestUrl.search}`, publicUrl).toString();
  return twilio.validateRequest(authToken, signature, canonical, parameters);
}

export function twiml(body: string, status = 200): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function xmlEscape(value: string): string {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

export async function sendCustomerSms(to: string, from: string, body: string) {
  const client = getTwilioClient();
  return client.messages.create({ to, from, body });
}

export async function alertOwner(ownerPhone: string, from: string, caller: string, issue: string) {
  const client = getTwilioClient();
  const summary = `TradeVoice Ghost urgent call. Caller ${caller}. ${issue.slice(0, 250)}. Please review the call dashboard.`;
  const sms = client.messages.create({ to: ownerPhone, from, body: summary });
  const voice = client.calls.create({
    to: ownerPhone,
    from,
    twiml: `<Response><Say>${xmlEscape(summary)}</Say></Response>`,
  });
  return Promise.all([sms, voice]);
}

export function requireSetupSecret(request: Request): boolean {
  const expected = process.env.INTEGRATION_SETUP_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function publicUrl(path: string): string {
  const base = process.env.PUBLIC_APP_URL;
  if (!base) throw new Error("PUBLIC_APP_URL is not configured.");
  return new URL(path, base).toString();
}
