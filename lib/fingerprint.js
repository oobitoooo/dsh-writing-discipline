// dsh-writing-discipline — 文风指纹（baseline）
//
// 解决的问题不是「这段有没有 AI 味」，而是「这段还像不像**你**写的」。
// 通用规则判的是通病，指纹判的是偏离：你平时一句话十来个字，这篇突然四十字一句，
// 逻辑没错、语法没错，但读起来不是你。
//
// 设计约束：
//  1) 只存统计量，不存原文；样本读进来算完就丢。
//  2) 不用分数（「AI 味 7.2」），只给「哪里不一样 + 你原来的样子」的对照。
//  3) 指标少而稳：句长、句长整齐度、逗号链、「的」链、被动句、口头禅。

import fs from 'node:fs'
import path from 'node:path'
import { zhMetrics } from './zh.js'

export const FINGERPRINT_VERSION = 1
const EXTS = new Set(['.md', '.markdown', '.txt', '.tex', '.rst'])

export function fingerprintFile() {
  if (process.env.WD_PROFILE_FILE) return process.env.WD_PROFILE_FILE
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return path.join(home, '.dsh', 'writing-discipline', 'baseline.json')
}

function walk(p, out = []) {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e === '.git' || e.startsWith('.')) continue
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
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 中位数最容易代表"平时"，极端值不拉偏 */
function median(arr) {
  return quantile([...arr].sort((a, b) => a - b), 0.5)
}

/** 口头禅：高频二元组，去掉标点与常见虚词 */
const STOP = new Set([
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '一个', '可以', '就是', '不是',
  '因为', '所以', '但是', '如果', '然后', '现在', '已经', '还是', '这样', '那样', '什么',
  '没有', '需要', '应该', '可能', '其实', '而且', '或者', '以及', '对于', '关于', '通过',
])

/** 只留自然段：Markdown 的标题/列表/表格/代码块不是「你说话的样子」，混进去会把句长拉到 4 个字 */
export function proseOnly(text) {
  const out = []
  let fence = false
  for (const line of String(text).split('\n')) {
    if (/^\s*(``|~~~)/.test(line)) { fence = !fence; continue }
    if (fence) continue
    const t = line.trim()
    if (!t) { out.push(''); continue }
    if (/^[#>|*+-]\s|^\d+[.、)]\s|^\||^!\[|^\[/.test(t)) continue
    if (/^[\x00-\x7F\s]+$/.test(t)) continue
    out.push(t)
  }
  return out.join('\n')
}

export function petWords(text, limit = 8) {
  const clean = String(text).replace(/[^\u4e00-\u9fa5]/g, ' ')
  const counts = new Map()
  for (const run of clean.split(/\s+/)) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const g = run.slice(i, i + 2)
      if (STOP.has(g)) continue
      counts.set(g, (counts.get(g) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w, n]) => ({ w, n }))
}

function exemplarSentence(text) {
  // 取最接近「平均长度」的那一句当样本原型，比取最长句有代表性
  const sentences = String(text)
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length >= 6)
  if (!sentences.length) return ''
  const lens = sentences.map((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length)
  const target = median(lens)
  let best = sentences[0]
  let bestDiff = Infinity
  sentences.forEach((s, i) => {
    const d = Math.abs(lens[i] - target)
    if (d < bestDiff) {
      bestDiff = d
      best = s
    }
  })
  return best.slice(0, 60)
}

/**
 * 从一组样本建立基线。
 * @param {string[]} files 文件路径列表
 */
export function buildFingerprint(files) {
  const rows = []
  const allPet = new Map()
  for (const f of files) {
    let text = ''
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const prose = proseOnly(text)
    const m = zhMetrics(prose)
    if (m.zhChars < 60 || m.sentences < 4) continue
    rows.push({ file: f, text: prose, m })
    for (const p of petWords(prose, 40)) allPet.set(p.w, (allPet.get(p.w) || 0) + p.n)
  }
  if (rows.length < 2) {
    throw new Error(`样本不足：有效文件 ${rows.length} 份（要求中文 ≥60 字、≥4 句，至少 2 份）`)
  }

  const pick = (k) => rows.map((r) => r.m[k])
  const metrics = {
    avgSentenceZh: pick('avgSentenceZh'),
    sentenceLenCV: pick('sentenceLenCV'),
    commaChainMax: pick('commaChainMax'),
    deChainMax: pick('deChainMax'),
    passivePer1000: rows.map((r) => (r.m.passiveBei / Math.max(1, r.m.chars)) * 1000),
  }

  const summary = {}
  for (const [k, arr] of Object.entries(metrics)) {
    summary[k] = {
      median: Number(median(arr).toFixed(2)),
      p10: Number(quantile([...arr].sort((a, b) => a - b), 0.1).toFixed(2)),
      p90: Number(quantile([...arr].sort((a, b) => a - b), 0.9).toFixed(2)),
    }
  }

  const pet = [...allPet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ w, n }))

  return {
    version: FINGERPRINT_VERSION,
    createdAt: new Date().toISOString(),
    samples: rows.length,
    files: rows.map((r) => path.basename(r.file)),
    metrics: summary,
    petWords: pet,
    exemplar: exemplarSentence(rows[Math.floor(rows.length / 2)].text),
  }
}

export function saveFingerprint(fp, file = fingerprintFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(fp, null, 2) + '\n', 'utf8')
  return file
}

export function loadFingerprint(file = fingerprintFile()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || data.version !== FINGERPRINT_VERSION || !data.metrics) return null
    return data
  } catch {
    return null
  }
}

function pct(a, b) {
  if (!b) return 0
  return (a - b) / b
}

/**
 * 对比一篇稿子和基线，产出「人话」结论。
 * 返回值刻意不做分数，只做三档 + 具体差异条目。
 */
export function compareToFingerprint(text, fp) {
  const m = zhMetrics(text)
  const items = []

  const base = fp.metrics
  const lenRatio = pct(m.avgSentenceZh, base.avgSentenceZh.median)
  if (Math.abs(lenRatio) >= 0.35) {
    items.push({
      key: 'sentence-length',
      title: lenRatio > 0 ? '句子比平时长得多' : '句子比平时短得多',
      plain: `你平时一句话大概 ${base.avgSentenceZh.median} 个字，这篇平均 ${m.avgSentenceZh} 个字。`,
      mine: fp.exemplar ? `你写的：${fp.exemplar}` : '',
      theirs: longestSentence(text),
      weight: Math.min(1, Math.abs(lenRatio)),
    })
  }

  const cvBase = base.sentenceLenCV.median
  if (cvBase > 0 && m.sentences >= 4 && m.sentenceLenCV < 0.45 && m.sentenceLenCV < cvBase * 0.6) {
    items.push({
      key: 'uniformity',
      title: '句子太整齐了',
      plain: `你平时长短句混着来，这篇每句差不多一样长——读起来像播报，不像说话。`,
      mine: fp.exemplar ? `你写的：${fp.exemplar}` : '',
      theirs: longestSentence(text),
      weight: 0.8,
    })
  }

  if (m.commaChainMax >= base.commaChainMax.p90 + 2) {
    items.push({
      key: 'comma-chain',
      title: '一句话里塞的东西太多',
      plain: `你最长的句子用了 ${base.commaChainMax.p90} 个逗号，这篇有一句用了 ${m.commaChainMax} 个。`,
      mine: '',
      theirs: longestSentence(text),
      weight: 0.5,
    })
  }

  const passiveRate = (m.passiveBei / Math.max(1, m.chars)) * 1000
  if (passiveRate > base.passivePer1000.p90 * 1.6 && m.passiveBei >= 3) {
    items.push({
      key: 'passive',
      title: '被动句变多了',
      plain: `你平时很少用「被」，这篇出现了 ${m.passiveBei} 次——读着绕，责任也模糊了。`,
      mine: '',
      theirs: '',
      weight: 0.4,
    })
  }

  if (Array.isArray(fp.petWords) && fp.petWords.length) {
    const mine = petWords(text, 20).map((p) => p.w)
    const lost = fp.petWords.filter((p) => !mine.includes(p.w)).slice(0, 3)
    if (lost.length >= 2) {
      items.push({
        key: 'pet-words',
        title: '你常说的那几个词不见了',
        plain: `你平时爱说 ${fp.petWords.slice(0, 4).map((p) => `「${p.w}」`).join('')}，这篇一个都没出现。`,
        mine: '',
        theirs: '',
        weight: 0.3,
      })
    }
  }

  const score = items.reduce((a, b) => a + b.weight, 0)
  let level = 'same'
  let headline = '这篇读起来就是你。句子的长短、口气都对得上。'
  if (score >= 1.6) {
    level = 'off'
    headline = '这篇不太像你。句子的节奏、用词习惯都和平时差得比较远。'
  } else if (score >= 0.6) {
    level = 'drifting'
    headline = '大体还是你的路子，但有那么几处不像。'
  }

  return {
    level,
    headline,
    score: Number(score.toFixed(2)),
    items: items.sort((a, b) => b.weight - a.weight),
    metrics: { ...m, passivePer1000: Number(passiveRate.toFixed(2)) },
    baseline: fp,
  }
}

function longestSentence(text) {
  const sentences = String(text)
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!sentences.length) return ''
  return '这篇写：' + sentences.sort((a, b) => b.length - a.length)[0].slice(0, 70)
}

export function fingerprintBrief(fp) {
  if (!fp) return '还没有文风基线。用 wd_profile({action:"build", paths:["你的文档目录"]}) 建一份。'
  return [
    `文风基线：${fp.samples} 份样本｜建于 ${fp.createdAt.slice(0, 10)}`,
    `平时一句约 ${fp.metrics.avgSentenceZh.median} 字｜长短参差度 ${fp.metrics.sentenceLenCV.median}`,
    `口头禅：${(fp.petWords || []).slice(0, 6).map((p) => p.w).join('、') || '（无明显高频词）'}`,
    `原型句：${fp.exemplar || '—'}`,
  ].join('\n')
}

export { walk as walkFiles }
