# expense-check

Check an expense-claim spreadsheet against your policy before it reaches an approver: missing receipts, duplicates and future dates are blocked; over-limit and weekend claims are flagged for a human decision.

## The problem

Finance teams and managers approve expense claims line by line, by eye. Duplicate taxi claims, missing receipts and over-limit hotels slip through on busy weeks, and get caught — awkwardly — weeks later in an audit. Meanwhile honest claimants wait days because every claim gets the same slow manual scrutiny.

## Who it's for

Finance and operations staff who process expense claims, and the managers who approve them — in small companies that track claims in a spreadsheet rather than an expensive expense platform.

## What it does

- Reads a claims CSV (exported from any spreadsheet) and a small JSON policy.
- **Blocks** claims the claimant must fix: missing receipt above the threshold, the same employee/date/merchant/amount claimed twice, dates in the future, and rows that can't be checked.
- **Flags for review** claims a person should decide on: over a category limit, a category not in the policy, or weekend spend.
- Prints a summary and a per-employee table; exits with code 1 when anything is blocked.

## Try it

Requires Node 18+. No install step, no dependencies. All example data is invented.

```bash
node cli.js examples/expenses.csv examples/policy.json --today 2026-10-15
node --test
```

Of the 9 sample claims, 2 are clean, 3 have blocking issues (a duplicate taxi, a hotel with no receipt, a future-dated claim) and 5 are flagged for review.

## Acceptance criteria

- The CSV reader handles quoted fields, escaped quotes, commas inside quotes and Windows line endings.
- Missing receipts above the threshold, duplicates and future dates are blocking; the duplicate names the earlier claim.
- Over-limit, unknown-category and weekend claims are review items, never automatic rejections.
- Rows with missing fields, bad dates or bad amounts are reported, not silently skipped.
- The exit code is 1 when any claim is blocked, 0 otherwise.
- Pipes and line breaks in CSV values (claim IDs, employee IDs, categories) are escaped or flattened, so they can't break the report's tables or headings.

## How it's built

`src/check.js` has a small RFC 4180 CSV reader (no library), `checkExpenses` (one pass over the rows with a `Map` for duplicate detection) and `toMarkdown`. The policy is plain JSON so finance can change limits without touching code.

## Limits and safety

- Use employee IDs, not names, in the CSV — the report is meant to be shared with approvers.
- It never approves or rejects anything. Review items need a person's judgement (a client dinner can legitimately exceed the meals limit).
- Duplicate detection matches exact amount, date and merchant; split or slightly different claims for the same expense need a human eye.
- Currency is assumed to be single and consistent across the file.
- Report cells escape table-breaking characters only. Other Markdown in CSV values (for example `**bold**` or links) is rendered as written, so review a report built from an untrusted file before sharing it.

## Contribute

- Support per-employee or per-grade limits in the policy.
- Add a `--csv` output so findings can go back into the spreadsheet.
- Detect "near-duplicates" (same merchant and amount within 2 days).

---

Scaffolded by an automated weekly pipeline, then refined by hand — see the factory repo for how it works.
