const test = require("node:test");
const assert = require("node:assert");
const { parseCsv, checkExpenses, toMarkdown, mdCell } = require("../src/check");

const policy = { receiptRequiredOver: 25, flagWeekends: true, categoryLimits: { meals: 60, taxi: 80 } };
const row = (o) => ({ id: "C-1", employee: "E-1", date: "2026-10-07", category: "meals", merchant: "Cafe", amount: "20", receipt: "yes", ...o });
const rules = (rows) => checkExpenses(rows, policy, { today: "2026-10-15" }).map((f) => `${f.id}:${f.severity}:${f.rule}`);

test("csv parser handles quotes, escaped quotes, commas and CRLF", () => {
  const rows = parseCsv('id,merchant,amount\r\nC-1,"Hotel, Room 12",180\r\nC-2,"Tool ""Pro""",29\r\n');
  assert.deepStrictEqual(rows, [
    { id: "C-1", merchant: "Hotel, Room 12", amount: "180" },
    { id: "C-2", merchant: 'Tool "Pro"', amount: "29" },
  ]);
});

test("a clean claim has no findings", () => {
  assert.deepStrictEqual(rules([row()]), []);
});

test("missing receipt above the threshold and future dates block", () => {
  assert.deepStrictEqual(rules([row({ amount: "30", receipt: "no" })]), ["C-1:block:missing-receipt"]);
  assert.deepStrictEqual(rules([row({ date: "2026-11-02" })]), ["C-1:block:future-date"]);
});

test("duplicates block and point at the earlier claim", () => {
  const findings = checkExpenses([row({ id: "C-1" }), row({ id: "C-2", merchant: "CAFE" })], policy, { today: "2026-10-15" });
  assert.deepStrictEqual(findings.map((f) => [f.id, f.rule]), [["C-2", "duplicate"]]);
  assert.match(findings[0].message, /as C-1/);
});

test("over-limit, unknown category and weekends go to review, not block", () => {
  assert.deepStrictEqual(rules([row({ category: "taxi", amount: "92" })]), ["C-1:review:over-limit"]);
  assert.deepStrictEqual(rules([row({ category: "software" })]), ["C-1:review:unknown-category"]);
  assert.deepStrictEqual(rules([row({ date: "2026-10-11" })]), ["C-1:review:weekend"]);
});

test("rows that can't be checked are blocked with the reason", () => {
  assert.deepStrictEqual(rules([row({ amount: "abc" }), row({ id: "C-2", date: "2026-02-30" }), row({ id: "C-3", merchant: "" })]), [
    "C-1:block:invalid-row",
    "C-2:block:invalid-row",
    "C-3:block:invalid-row",
  ]);
});

test("mdCell escapes pipes and flattens line breaks", () => {
  assert.strictEqual(mdCell("C|1"), "C\\|1");
  assert.strictEqual(mdCell("line one\r\nline two\nthree"), "line one line two three");
  assert.strictEqual(mdCell("  plain  "), "plain");
  assert.strictEqual(mdCell(undefined), "");
});

test("pipes and line breaks in csv values cannot break the report table", () => {
  const rows = [row({ id: "C|1", employee: "E|1\n### fake heading", category: "travel|misc", amount: "30", receipt: "no" })];
  const md = toMarkdown(checkExpenses(rows, policy, { today: "2026-10-15" }), rows.length);
  const tableRows = md.split("\n").filter((l) => l.startsWith("| C\\|1 "));
  assert.strictEqual(tableRows.length, 2); // missing-receipt + unknown-category
  for (const r of tableRows) {
    assert.strictEqual(r.split(/(?<!\\)\|/).length, 6, `row has extra columns: ${r}`); // 4 cells + 2 edges
  }
  assert.match(md, /^### E\\\|1 ### fake heading$/m); // still one heading line, pipe escaped
  assert.match(md, /Category "travel\\\|misc" is not in the policy/);
});

test("markdown summary counts clean claims and groups by employee", () => {
  const rows = [row({ id: "C-1" }), row({ id: "C-2", employee: "E-2", amount: "30", receipt: "no" })];
  const md = toMarkdown(checkExpenses(rows, policy, { today: "2026-10-15" }), rows.length);
  assert.match(md, /2 claim\(s\) checked: \*\*1 clean\*\*, 1 blocking issue\(s\), 0 item\(s\) for review\./);
  assert.match(md, /### E-2\n\n\| Claim/);
});
