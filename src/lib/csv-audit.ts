export type CallAudit = { total: number; missed: number; examples: string[] };

export function parseCsv(text: string): CallAudit {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return { total: 0, missed: 0, examples: [] };

  const headers = rows[0].map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const statusIndex = headers.findIndex((header) => /status|disposition|result|outcome/.test(header));
  const callerIndex = headers.findIndex((header) => /caller|from|phone|number|contact/.test(header));
  if (statusIndex < 0) return { total: rows.length - 1, missed: 0, examples: [] };

  const missedRows = rows.slice(1).filter((values) => {
    const status = (values[statusIndex] || "").toLowerCase();
    return /missed|no.?answer|busy|failed|abandon|voicemail|unanswered|not.?answered/.test(status);
  });
  const examples = missedRows.slice(0, 3).map((values) => values[callerIndex >= 0 ? callerIndex : 0] || "Unknown caller");
  return { total: rows.length - 1, missed: missedRows.length, examples };
}
