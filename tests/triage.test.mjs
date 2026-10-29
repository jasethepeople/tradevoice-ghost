import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { classifyEmergency, tradeScripts } from "../src/lib/triage.ts";
import { isDroppedCall, verifyRetellSignature } from "../src/lib/retell.ts";

test("all three trade-specific triage scripts exist", () => {
  assert.match(tradeScripts.HVAC, /thermostat/i);
  assert.match(tradeScripts.Plumbing, /slab|water/i);
  assert.match(tradeScripts.Electrical, /smoke|sparks/i);
});

test("urgent danger is high; a negated hazard is not", () => {
  assert.equal(classifyEmergency("The caller reports smoke and a burning smell."), "high");
  assert.equal(classifyEmergency("No smoke, sparks, or burning smell; one outlet stopped working."), "low");
  assert.equal(classifyEmergency("No smoke, but there is a burning smell."), "high");
});

test("trade problems are medium and routine work is low", () => {
  assert.equal(classifyEmergency("The thermostat is blank and the air conditioner is not cooling."), "medium");
  assert.equal(classifyEmergency("There is a warm floor and the water meter is still moving."), "medium");
  assert.equal(classifyEmergency("The kitchen breaker keeps tripping."), "medium");
  assert.equal(classifyEmergency("The caller wants a seasonal furnace tune-up."), "low");
});

test("explicit urgency may raise risk but cannot suppress a transcript hazard", () => {
  assert.equal(classifyEmergency("Routine maintenance", "high"), "high");
  assert.equal(classifyEmergency("There is smoke", "low"), "high");
  assert.equal(classifyEmergency("A warm patch on the floor", "low"), "medium");
});

test("Retell webhook signatures validate and stale timestamps fail", () => {
  const key = "test-retell-key";
  const oldKey = process.env.RETELL_API_KEY;
  process.env.RETELL_API_KEY = key;
  const body = '{"event":"call_ended"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", key).update(body + timestamp).digest("hex");
  assert.equal(verifyRetellSignature(body, `v=${timestamp},d=${digest}`), true);
  assert.equal(verifyRetellSignature(body, `v=${timestamp - 301},d=${digest}`), false);
  assert.equal(verifyRetellSignature(`${body} `, `v=${timestamp},d=${digest}`), false);
  if (oldKey === undefined) delete process.env.RETELL_API_KEY;
  else process.env.RETELL_API_KEY = oldKey;
});

test("dropped-call reasons are recognized without treating normal hangs as drops", () => {
  assert.equal(isDroppedCall("network_error"), true);
  assert.equal(isDroppedCall("no-answer"), true);
  assert.equal(isDroppedCall("caller_hangup"), false);
});
