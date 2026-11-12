#!/usr/bin/env node
// calibrate.mjs — 语料标定：对一批中文文本统计指标分布，给出阈值建议
//
// 为什么要有它：插件里的阈值（单句 60 字、逗号链 5、句长 CV 0.25）最早是拍脑袋定的。
// 拍出来的阈值在两个方向都会错——太松等于没规则，太紧等于见谁咬谁。
// 这个脚本用你自己的语料算分位数，把"合理阈值"变成可复现的数字。
//
// 用法：
//   node tools/calibrate.mjs <目录或文件...> [--json] [--min-chars 200]
//
// 判读：
//   p50 是常态，p90 是"偏长但还行"，p99 是"确实异常"。
//   建议把 warn 设在 p90 附近、error 设在 p99 附近；若 p99 与 p50 差距很小，
//   说明这份语料整体就是这个节奏，此时规则应降级而不是硬卡。

import fs from 'node:fs'
import path from 'node:path'
import { zhMetrics } from '../lib/zh.js'

const EXTS = new Set(['.md', '.markdown', '.txt', '.tex', '.rst'])

function walk(p, out = []) {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e === '.git') continue
      walk(path.join(p, e), out)
    }
  } else if (EXTS.has(path.extname(p).toLowerCase())) {
    out.push(p)
  }
  return out
}

function quantile(sorted, q) {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const args = process.argv.slice(2)
const json = args.includes('--json')
const minCharsIdx = args.indexOf('--min-chars')
const minChars = minCharsIdx >= 0 ? Number(args[minCharsIdx + 1]) || 200 : 200
const targets = args.filter((a) => !a.startsWith('--') && a !== String(minChars))

if (!targets.length) {
  console.error('用法: node tools/calibrate.mjs <目录或文件...> [--json] [--min-chars 200]')
  process.exit(2)
}

const files = []
for (const t of targets) {
  try {
    files.push(...walk(path.resolve(t)))
  } catch (e) {
    console.error(`跳过 ${t}: ${e.message}`)
  }
}

const samples = []
for (const f of files) {
  let text = ''
  try {
    text = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  const m = zhMetrics(text)
  if (m.zhChars < minChars || m.sentences < 5) continue
  samples.push({ file: f, ...m })
}

if (!samples.length) {
  console.error(`没有可用样本（要求中文 ≥${minChars} 字、≥5 句）`)
  process.exit(1)
}

const col = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)
const metrics = ['avgSentenceZh', 'maxSentenceZh', 'commaChainMax', 'deChainMax', 'sentenceLenCV', 'passiveBei']

const result = {
  samples: samples.length,
  files: files.length,
  thresholds: {},
  distributions: {},
}

for (const k of metrics) {
  const s = col(k)
  result.distributions[k] = {
    min: s[0],
    p50: Number(quantile(s, 0.5).toFixed(2)),
    p90: Number(quantile(s, 0.9).toFixed(2)),
    p99: Number(quantile(s, 0.99).toFixed(2)),
    max: s[s.length - 1],
  }
}

// 阈值建议
const d = result.distributions
result.thresholds = {
  'zh-density.long-sentence (单句字数)': {
    current: 60,
    suggestWarn: Math.round(d.maxSentenceZh.p90),
    suggestError: Math.round(d.maxSentenceZh.p99),
  },
  'zh-density.comma-chain (单句逗号数)': {
    current: 5,
    suggestWarn: Math.max(3, Math.round(d.commaChainMax.p90)),
    suggestError: Math.max(4, Math.round(d.commaChainMax.p99)),
  },
  'zh-density.uniform-rhythm (CV 下限)': {
    current: 0.25,
    suggestWarn: Number(Math.min(0.35, Math.max(0.12, quantile(col('sentenceLenCV'), 0.1)).toFixed(2))),
  },
}

if (json) {
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

console.log(`样本：${samples.length} 份（扫描 ${files.length} 个文件，要求中文 ≥${minChars} 字、≥5 句）\n`)
console.log('指标                  min      p50      p90      p99      max')
for (const k of metrics) {
  const v = d[k]
  console.log(
    k.padEnd(20) +
      [v.min, v.p50, v.p90, v.p99, v.max].map((x) => String(x).padStart(8)).join(' '),
  )
}
console.log('\n阈值建议（current = 插件当前值）：')
for (const [k, v] of Object.entries(result.thresholds)) {
  const parts = Object.entries(v).map(([kk, vv]) => `${kk}=${vv}`)
  console.log('  ' + k.padEnd(38) + parts.join('  '))
}
console.log('\n判读：warn 取 p90 附近（偏长但常见），error 取 p99 附近（确实异常）。')
console.log('若 p90 与 p50 相差很小，说明语料整体就是这个节奏——把规则降级，别硬卡。')
