// dsh-writing-discipline — 用户词表（learned rules）
//
// 为什么需要：内置规则再全也有误报。误报的处理方式不是关掉整条规则，而是把
// 「这句在我这里不算问题」记下来，下次自动放行。这条机制来自 avoid-ai-writing-cn
// （说「写的不错」就把新词记进规避表），本项目做成显式工具 + JSON 文件，可审计、可回滚。
//
// 文件：~/.dsh/writing-discipline/learned.json（可用 WD_LEARNED_FILE 覆盖）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export function learnedFile() {
  if (process.env.WD_LEARNED_FILE) return process.env.WD_LEARNED_FILE
  return path.join(os.homedir(), '.dsh', 'writing-discipline', 'learned.json')
}

const EMPTY = { version: 1, entries: [] }

export function loadLearned(file = learnedFile()) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.entries)) return { ...EMPTY }
    return { version: data.version ?? 1, entries: data.entries }
  } catch {
    return { ...EMPTY }
  }
}

export function saveLearned(data, file = learnedFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: data.entries }, null, 2) + '\n', 'utf8')
  return file
}

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8)
}

/** 校验：正则可编译、字段合法 */
export function validateEntry(entry) {
  if (!entry || typeof entry.pattern !== 'string' || !entry.pattern.trim()) return 'pattern 不能为空'
  try {
    new RegExp(entry.pattern, 'giu')
  } catch (e) {
    return `正则无法编译：${e.message}`
  }
  if (entry.severity && !['info', 'warn', 'error'].includes(entry.severity)) return 'severity 需要是 info/warn/error'
  if (entry.action && !['CUT', 'TIGHTEN', 'REFRAME', 'REVIEW'].includes(entry.action)) return 'action 需要是 CUT/TIGHTEN/REFRAME/REVIEW'
  if (entry.mode && !['suppress', 'rule'].includes(entry.mode)) return 'mode 需要是 suppress/rule'
  return null
}

/**
 * 记一条。phrase 既可以是字面文本（会转义成正则），也可以是 /.../ 包裹的正则。
 */
export function addLearned(input, file = learnedFile()) {
  const pattern = typeof input === 'string' ? literalToPattern(input) : input.pattern
  const entry = {
    id: `user.${hash(String(pattern))}`,
    pattern,
    label: input.label || (typeof input === 'string' ? `用户词表：${input.slice(0, 16)}` : '用户规则'),
    kind: 'user',
    mode: input.mode === 'rule' ? 'rule' : 'suppress',
    severity: input.severity || 'warn',
    action: input.action || 'REVIEW',
    advice: input.advice || '用户标记为非问题（wd_learn 记录）；确认无误可忽略。',
    createdAt: new Date().toISOString(),
  }
  const err = validateEntry(entry)
  if (err) return { ok: false, error: err }
  const data = loadLearned(file)
  const dup = data.entries.find((e) => e.pattern === entry.pattern)
  if (dup) return { ok: true, duplicate: true, entry: dup, file }
  data.entries.push(entry)
  saveLearned(data, file)
  return { ok: true, entry, file }
}

/** 字面文本 → 安全正则（去掉正则元字符，保留原文语义） */
export function literalToPattern(text) {
  const t = String(text).trim()
  if (t.startsWith('/') && t.lastIndexOf('/') > 1) {
    const body = t.slice(1, t.lastIndexOf('/'))
    try {
      new RegExp(body, 'giu')
      return body
    } catch {
      /* 落回字面处理 */
    }
  }
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function removeLearned(id, file = learnedFile()) {
  const data = loadLearned(file)
  const before = data.entries.length
  data.entries = data.entries.filter((e) => e.id !== id)
  if (data.entries.length === before) return { ok: false, error: `没有 id 为 ${id} 的条目` }
  saveLearned(data, file)
  return { ok: true, removed: before - data.entries.length, file }
}

export function clearLearned(file = learnedFile()) {
  const data = loadLearned(file)
  const n = data.entries.length
  saveLearned({ entries: [] }, file)
  return { ok: true, cleared: n, file }
}

/** 转成 scan() 可用的规则形状 */
export function learnedRules(file = learnedFile()) {
  return loadLearned(file).entries
    .filter((e) => e.mode === 'rule')
    .map((e) => ({
      id: e.id,
      label: e.label,
      kind: e.kind || 'user',
      severity: e.severity || 'warn',
      action: e.action || 'REVIEW',
      patterns: [e.pattern],
      advice: e.advice,
      example: null,
    }))
}

/**
 * 一次取全：suppress（默认，用来压制误报）+ rules（主动加规则）。
 * mode='suppress' 的条目在命中片段附近匹配到时，把那条命中丢掉。
 */
export function learnedForScan(file = learnedFile()) {
  const entries = loadLearned(file).entries
  return {
    suppressRules: entries.filter((e) => (e.mode ?? 'suppress') === 'suppress').map((e) => e.pattern),
    rules: entries
      .filter((e) => e.mode === 'rule')
      .map((e) => ({
        id: e.id,
        label: e.label,
        kind: e.kind || 'user',
        severity: e.severity || 'warn',
        action: e.action || 'REVIEW',
        patterns: [e.pattern],
        advice: e.advice,
        example: null,
      })),
  }
}

export function statsLearned(file = learnedFile()) {
  const f = file
  const data = loadLearned(f)
  return { file: f, count: data.entries.length, entries: data.entries }
}
