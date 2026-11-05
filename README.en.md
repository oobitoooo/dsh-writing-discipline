# dsh-writing-discipline

> A writing-discipline gate for DeepSeek Harness (DSH). Strips defensive writing from output **and** proves the factual layer survived.

Zero network. Zero LLM. Pure local regex + statistics. Five deterministic tools — same input, same output, safe for CI and pre-commit hooks.

```text
in : As an AI assistant, I can't guarantee this is accurate. Please note that production changes carry risk. This is for informational purposes only.

out: writing check: 4 problems (ERROR 4 / WARN 0)
     [ERROR · defensive · CUT] capability self-reference @ L1
```

---

## The problem

Models write **to avoid blame**, not to deliver. Five recurring moves: disclaimers, capability self-deprecation, moralizing, hedging saturation, and process narration. None of them are style preferences — they make the text *unactionable*.

The real risk in cleaning them is not leaving noise behind. It's deleting facts along with the noise: numbers, citations, negation, scope, claim strength. So this plugin does two things, and neither alone is enough:

1. `wd_scan` / `wd_rewrite` — find and remove the noise;
2. `wd_conservation` — prove the factual layer did not move.

## Install

```powershell
dsh plugin --profile desktop add github:oobitoooo/dsh-writing-discipline
# or, local development:
dsh plugin --profile desktop add link:C:/path/to/dsh-writing-discipline
```

No postinstall script, no disk writes, no config mutation. Works on DSH `0.1.x` and `0.2.x` (only uses `ctx.tools.register` + `defineTool`).

## Tools

| Tool | What it does |
|---|---|
| `wd_scan` | Full lint: 25 rules + 3 density rules, ERROR/WARN/INFO, per-hit line/paragraph/action |
| `wd_rules` | Rule table with the effective severity under a given profile |
| `wd_rewrite` | Deterministic cleanup: strip lead-ins, collapse hedge stacking, drop pure-defensive sentences. **Never deletes a sentence containing a number, citation, figure reference, or URL** |
| `wd_conservation` | Diff lock: numbers / citations / figure refs / DOIs / URLs must survive; claim strength must not be upgraded (`may → causes`); negation must not flip; scope words must not vanish |
| `wd_stats` | Metrics only: sentence length, hedge density, dash density |

### Profiles

`chat` `report` `readme` `email` `academic` `review` `comment` `unknown`

Under `academic`, all hedge rules demote to `INFO` — hedging is legitimate scientific expression (ICMJE). Under `review`, process-residue phrases like "as requested" are not reported.

### Density, not wordlists

A single `may` is not a problem. **Three hedges in one paragraph with zero quantitative data is.** That paragraph-level rule is what separates this from a ban-list.

## Judgement

Every hit carries an action: `CUT` / `TIGHTEN` / `REFRAME` / `REVIEW`. `REVIEW` exists because "not X but Y" is emphasis once and a tic three times — the tool flags it, you decide.

## Use as a library

```js
import { scan, conservation } from 'dsh-writing-discipline/rules'

const r = scan(text, { profile: 'report' })
if (!r.ok) throw new Error(`${r.counts.error} defensive hits`)

const c = conservation(before, after)
if (!c.ok) throw new Error('factual layer changed: ' + c.items.filter(i => i.severity === 'error').map(i => i.message).join('; '))
```

## Limits

- Chinese rules are strict: `可能` is often genuine uncertainty. Filter with `profile=academic` or `severityMin=warn`.
- The rewriter deletes, never generates. Semantic rewriting still needs a human.
- Conservation is heuristic: `840 ms` and `840ms` count as different tokens; the claim ladder covers a fixed verb set. It's a seatbelt, not a brake.
- Text in, text out. For `.docx` / `.pdf`, extract first.

## Development

```bash
npm test      # 17 assertions, node:assert only
npm run check # node --check on both entry points
```

Add a rule by appending an object to `RULES` in `lib/rules.js`.

## License

MIT.
