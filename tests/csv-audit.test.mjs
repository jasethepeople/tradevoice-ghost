import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/csv-audit.ts";

test("finds missed outcomes across common call-log labels", () => {
  const audit = parseCsv("Call SID,From,Status\nCA1,+13035550101,completed\nCA2,+13035550102,no-answer\nCA3,+13035550103,voicemail\nCA4,+13035550104,failed");
  assert.deepEqual(audit, { total: 4, missed: 3, examples: ["+13035550102", "+13035550103", "+13035550104"] });
});

test("handles quoted commas, escaped quotes, and CRLF", () => {
  const audit = parseCsv('Caller,Call Status,Notes\r\n"Jordan, Jr.",Busy,"Said ""call me back"""\r\nRosa,Answered,Booked');
  assert.deepEqual(audit, { total: 2, missed: 1, examples: ["Jordan, Jr."] });
});

test("does not guess a status column or count a header-only file", () => {
  assert.deepEqual(parseCsv("Date,Caller\n2026-10-01,Jordan"), { total: 1, missed: 0, examples: [] });
  assert.deepEqual(parseCsv("Caller,Status\n"), { total: 0, missed: 0, examples: [] });
});
