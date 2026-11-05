#!/usr/bin/env node
// wd-lint — 命令行入口（pre-commit / CI 用；也可当普通 lint 工具）
// 退出码：0 干净（或在 WARN 预算内）；1 命中 ERROR 或超出 WARN 预算；2 用法/IO 错误
import fs from 'node:fs'
import path from 'node:path'
import { scan, rewrite, conservation, stats, formatReport } from '../lib/rules.js'

const USAGE = `wd-lint — 防御性写作检查（零依赖，零网络）

用法:
  wd-lint [文件...]               检查文件；- 表示 stdin
  wd-lint -t "文本"               检查字符串
  wd-lint --json 文件.md          输出 JSON
  wd-lint --fix 文件.md           就地改写（原文件备份为 文件.md.bak），再打印剩余问题
  wd-lint --diff before.md after.md   守恒锁：对比两版，事实是否漂移

选项:
  -p, --profile <name>   chat|report|readme|email|academic|review|comment|unknown
  -m, --max-warn <n>     WARN 预算，超过即失败（默认不限）
  -s, --severity-min     info|warn|error（默认 error 才失败，报告仍全量输出）
      --stats            只输出指标
      --json             JSON 输出
  -q, --quiet            只输出最终结论
  -h, --help             本帮助

退出码: 0 通过 / 1 未通过 / 2 用法或 IO 错误
`

function parseArgs(argv) {
  const o = { files: [], text: null, json: false, quiet: false, fix: false, diff: null, stats: false, profile: 'unknown', maxWarn: null, severityMin: 'info' }
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]
    // 与 python 版一致：允许 -file 这种单横线写法
    if (a.startsWith('-') && !a.startsWith('--') && a.length > 2 && !['-t', '-p', '-m', '-s', '-q', '-h'].includes(a)) a = '-' + a
    switch (a) {
      case '-h':
      case '--help':
        o.help = true
        break
      case '-t':
      case '--text':
        o.text = argv[++i]
        break
      case '-p':
      case '--profile':
        o.profile = argv[++i]
        break
      case '-m':
      case '--max-warn':
        o.maxWarn = Number(argv[++i])
        break
      case '-s':
      case '--severity-min':
        o.severityMin = argv[++i]
        break
      case '--json':
        o.json = true
        break
      case '-q':
      case '--quiet':
        o.quiet = true
        break
      case '--fix':
        o.fix = true
        break
      case '--stats':
        o.stats = true
        break
      case '--diff': {
        const before = argv[++i]
        const after = argv[++i]
        o.diff = { before, after }
        break
      }
      default:
        if (a.startsWith('-') && a !== '-') {
          console.error(`未知参数: ${a}`)
          console.error(USAGE)
          process.exit(2)
        }
        o.files.push(a)
    }
  }
  return o
}

function readOne(p) {
  if (p === '-') return { label: '<stdin>', text: fs.readFileSync(0, 'utf8') }
  return { label: p, text: fs.readFileSync(path.resolve(p), 'utf8') }
}

const o = parseArgs(process.argv.slice(2))
if (o.help) {
  console.log(USAGE)
  process.exit(0)
}

// --diff：守恒锁
if (o.diff) {
  try {
    const a = readOne(o.diff.before).text
    const b = readOne(o.diff.after).text
    const res = conservation(a, b)
    if (o.json) {
      console.log(JSON.stringify(res, null, 2))
    } else {
      console.log(res.ok ? '守恒锁：通过（事实层未漂移）' : `守恒锁：发现 ${res.counts.error} 处事实漂移`)
      for (const it of res.items) console.log(`  [${it.severity.toUpperCase()} · ${it.kind}] ${it.message}`)
    }
    process.exit(res.ok ? 0 : 1)
  } catch (e) {
    console.error(`读取失败: ${e.message}`)
    process.exit(2)
  }
}

// 收集输入
let inputs = []
if (o.text !== null) inputs.push({ label: '<text>', text: o.text })
else if (o.files.length === 0) inputs.push({ label: '<stdin>', text: fs.readFileSync(0, 'utf8') })
else
  for (const f of o.files) {
    try {
      inputs.push(readOne(f))
    } catch (e) {
      console.error(`读取失败 ${f}: ${e.message}`)
      process.exit(2)
    }
  }

// --fix：就地改写
if (o.fix) {
  if (o.files.length === 0) {
    console.error('--fix 需要指定文件（不接受 stdin）')
    process.exit(2)
  }
  for (const f of o.files) {
    const src = fs.readFileSync(path.resolve(f), 'utf8')
    const out = rewrite(src)
    if (!out.changed) {
      if (!o.quiet) console.log(`${f}: 无需改写`)
      continue
    }
    fs.writeFileSync(path.resolve(f) + '.bak', src, 'utf8')
    fs.writeFileSync(path.resolve(f), out.text, 'utf8')
    if (!o.quiet) console.log(`${f}: 改写 ${out.changes.length} 处（备份 ${path.basename(f)}.bak）`)
    inputs = inputs.map((x) => (x.label === f ? { label: f, text: out.text } : x))
  }
}

let failed = false
const reports = []
for (const { label, text } of inputs) {
  if (o.stats) {
    const s = stats(text)
    if (o.json) reports.push({ label, ...s })
    else if (!o.quiet) console.log(`${label}: 字符 ${s.chars}｜中文 ${s.zhChars}｜英文 ${s.enWords}｜段 ${s.paragraphs}｜句 ${s.sentences}｜平均句长 ${s.avgSentence}｜对冲密度 ${s.hedgePer1000}‰`)
    continue
  }
  const r = scan(text, { profile: o.profile, severityMin: o.severityMin, maxWarn: o.maxWarn })
  if (!r.ok) failed = true
  if (o.json) {
    reports.push({ label, ...r })
    continue
  }
  if (o.quiet) {
    console.log(`${label}: ERROR ${r.counts.error} / WARN ${r.counts.warn} / INFO ${r.counts.info}${r.ok ? '' : '  ← 未通过'}`)
  } else {
    console.log(`\n=== ${label} ===`)
    console.log(formatReport(r, { verbose: true }))
  }
}

if (o.json) console.log(JSON.stringify({ version: reports[0]?.version, ok: !failed, reports }, null, 2))
process.exit(failed ? 1 : 0)
