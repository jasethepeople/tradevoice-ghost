import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRetellSignature(rawBody: string, signature: string | null, now = Date.now()): boolean {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey || !signature) return false;
  const match = signature.match(/(?:^|,)v=(\d+),d=([a-f\d]+)/i);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody + match[1]).digest("hex");
  const received = match[2].toLowerCase();
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isDroppedCall(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
  return /(?:error|failed|timeout|network|dropped|no.?answer|busy)/i.test(reason);
}
