// Checks an expense-claim CSV against a simple policy before it reaches an
// approver. "block" findings must be fixed by the claimant; "review"
// findings are allowed with a reason, but a person has to decide.

// Small RFC 4180 reader: quoted fields, "" escapes, commas and newlines in quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = String(text).replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const REQUIRED = ["id", "employee", "date", "category", "merchant", "amount", "receipt"];

function validDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? d : null;
}

function checkExpenses(rows, policy, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const findings = [];
  const seen = new Map();
  const limits = policy.categoryLimits || {};
  const add = (row, severity, rule, message) =>
    findings.push({ id: row.id || "?", employee: row.employee || "?", severity, rule, message });

  for (const row of rows) {
    const missing = REQUIRED.filter((k) => !row[k]);
    const amount = Number(row.amount);
    const date = validDate(row.date || "");
    if (missing.length || Number.isNaN(amount) || amount <= 0 || !date) {
      const why = missing.length ? `missing ${missing.join(", ")}` : !date ? `bad date "${row.date}"` : `bad amount "${row.amount}"`;
      add(row, "block", "invalid-row", `Row can't be checked: ${why}.`);
      continue;
    }

    const category = row.category.toLowerCase();
    const hasReceipt = /^(yes|y|true|1)$/i.test(row.receipt);
    if (amount > (policy.receiptRequiredOver ?? Infinity) && !hasReceipt) {
      add(row, "block", "missing-receipt", `Receipt required above ${policy.receiptRequiredOver} (claimed ${amount.toFixed(2)}).`);
    }
    if (row.date > today) add(row, "block", "future-date", `Dated ${row.date}, after today (${today}).`);

    const key = [row.employee, row.date, amount.toFixed(2), row.merchant.toLowerCase()].join("|");
    if (seen.has(key)) add(row, "block", "duplicate", `Same employee, date, merchant and amount as ${seen.get(key)}.`);
    else seen.set(key, row.id);

    if (!(category in limits)) add(row, "review", "unknown-category", `Category "${row.category}" is not in the policy.`);
    else if (amount > limits[category]) {
      add(row, "review", "over-limit", `${amount.toFixed(2)} is over the ${category} limit of ${limits[category]}.`);
    }
    const dow = date.getUTCDay();
    if (policy.flagWeekends && (dow === 0 || dow === 6)) add(row, "review", "weekend", "Weekend expense — check it was business.");
  }
  return findings;
}

function toMarkdown(findings, rowCount) {
  const block = findings.filter((f) => f.severity === "block").length;
  const review = findings.length - block;
  const flagged = new Set(findings.map((f) => f.id)).size;
  const lines = [
    "## Expense check",
    "",
    `${rowCount} claim(s) checked: **${rowCount - flagged} clean**, ${block} blocking issue(s), ${review} item(s) for review.`,
  ];
  const byEmployee = new Map();
  for (const f of findings) byEmployee.set(f.employee, [...(byEmployee.get(f.employee) || []), f]);
  for (const [employee, list] of [...byEmployee].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push("", `### ${mdCell(employee)}`, "", "| Claim | Severity | Rule | Detail |", "| --- | --- | --- | --- |");
    for (const f of list) {
      lines.push(`| ${mdCell(f.id)} | ${f.severity === "block" ? "🔴 block" : "🟡 review"} | ${mdCell(f.rule)} | ${mdCell(f.message)} |`);
    }
  }
  return lines.join("\n");
}

// Every value from the CSV can reach the report, so each table cell (and the
// employee heading) goes through this: line breaks would end the row or
// heading early, and an unescaped | would start a new column.
function mdCell(value) {
  return String(value ?? "")
    .replace(/\r\n?|\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

module.exports = { parseCsv, checkExpenses, toMarkdown, mdCell };
