#!/usr/bin/env node
// Usage: node cli.js <expenses.csv> <policy.json> [--today 2026-10-15]
// Exits 1 when any claim has a blocking issue, so it can gate a submission step.
const fs = require("fs");
const { parseCsv, checkExpenses, toMarkdown } = require("./src/check");

const argv = process.argv.slice(2);
const t = argv.indexOf("--today");
const today = t >= 0 ? argv[t + 1] : undefined;
const [csvFile, policyFile] = argv.filter((a, i) => !a.startsWith("--") && !(t >= 0 && i === t + 1));

if (!csvFile || !policyFile) {
  console.error("Usage: node cli.js <expenses.csv> <policy.json> [--today YYYY-MM-DD]");
  process.exit(2);
}

const rows = parseCsv(fs.readFileSync(csvFile, "utf8"));
const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"));
const findings = checkExpenses(rows, policy, today ? { today } : {});
console.log(toMarkdown(findings, rows.length));
if (findings.some((f) => f.severity === "block")) process.exit(1);
