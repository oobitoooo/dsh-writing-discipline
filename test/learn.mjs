// 用户词表（learned）测试 — 用临时文件，不碰真实 ~/.dsh
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = path.join(os.tmpdir(), `wd-learned-${Date.now()}.json`)
process.env.WD_LEARNED_FILE = TMP

const { addLearned, removeLearned, clearLearned, learnedForScan, statsLearned, literalToPattern, validateEntry } = await import('../lib/learn.js')
const { scan } = await import('../lib/rules.js')

let pass = 0
const failures = []
function test(name, fn) {
  try {
    fn()
    pass++
  } catch (e) {
    failures.push({ name, error: e })
  }
}

test('空词表不报错', () => {
  const s = statsLearned()
  assert.equal(s.count, 0)
  assert.deepEqual(learnedForScan(), { suppressRules: [], rules: [] })
})

test('字面量转正则会转义元字符', () => {
  assert.equal(literalToPattern('a.b*c'), 'a\\.b\\*c')
  assert.equal(literalToPattern('/\\d+ms/u'), '\\d+ms')
  // 不是合法正则时整体按字面转义（宁可多转义，也不让半截正则进词表）
  assert.equal(literalToPattern('/(?/'), '/\\(\\?/')
})

test('add 默认是 suppress 模式，去重生效', () => {
  const a = addLearned({ pattern: '这个方案可能有效', label: '测试' })
  assert.equal(a.ok, true)
  assert.equal(a.entry.mode, 'suppress')
  const b = addLearned({ pattern: '这个方案可能有效' })
  assert.equal(b.duplicate, true)
  const l = learnedForScan()
  assert.equal(l.suppressRules.length, 1)
  assert.equal(l.rules.length, 0)
})

test('suppress 能压掉误报，且不影响别处的真命中', () => {
  const text = '这个方案可能有效。\n另一个方案可能也有用。'
  const base = scan(text, { profile: 'report' })
  assert.ok(base.counts.warn >= 2)
  const l = learnedForScan()
  const after = scan(text, { profile: 'report', extraRules: l.rules, suppressRules: l.suppressRules })
  assert.ok(after.counts.warn < base.counts.warn, `应减少命中：${base.counts.warn} -> ${after.counts.warn}`)
  assert.ok(after.hits.some((h) => h.excerpt.includes('另一个方案')), '第二句仍应被报')
})

test('rule 模式变成主动规则', () => {
  addLearned({ pattern: '赋能矩阵', label: '自选词', mode: 'rule', severity: 'error' })
  const l = learnedForScan()
  assert.equal(l.rules.length, 1)
  const r = scan('这是一套赋能矩阵。', { profile: 'report', extraRules: l.rules, suppressRules: l.suppressRules })
  assert.ok(r.hits.some((h) => h.ruleId.startsWith('user.')), '用户规则应命中')
})

test('非法正则被拒绝且不落盘', () => {
  const before = statsLearned().count
  const r = addLearned({ pattern: '/(?/' })
  assert.equal(r.ok, false)
  assert.ok(String(r.error).includes('正则'))
  assert.equal(statsLearned().count, before)
})

test('validateEntry 拦非法 severity/action/mode', () => {
  assert.ok(validateEntry({ pattern: 'x', severity: 'fatal' }))
  assert.ok(validateEntry({ pattern: 'x', action: 'DELETE' }))
  assert.ok(validateEntry({ pattern: 'x', mode: 'weird' }))
  assert.equal(validateEntry({ pattern: 'x', severity: 'info', action: 'CUT', mode: 'rule' }), null)
})

test('remove 与 clear', () => {
  const list = statsLearned().entries
  assert.ok(list.length >= 2)
  const del = removeLearned(list[0].id)
  assert.equal(del.ok, true)
  assert.equal(statsLearned().count, list.length - 1)
  const c = clearLearned()
  assert.equal(c.ok, true)
  assert.equal(statsLearned().count, 0)
})

test('落盘文件是合法 JSON 且版本正确', () => {
  addLearned({ pattern: 'x-check', mode: 'rule' })
  const raw = JSON.parse(fs.readFileSync(TMP, 'utf8'))
  assert.equal(raw.version, 1)
  assert.ok(Array.isArray(raw.entries))
  assert.ok(raw.entries[0].createdAt)
})

// 清理
try {
  fs.unlinkSync(TMP)
} catch {}

const total = pass + failures.length
if (failures.length) {
  console.error(`✗ ${failures.length}/${total} 用例失败`)
  for (const f of failures) {
    console.error(`--- ${f.name} ---`)
    console.error(f.error?.message ?? f.error)
  }
  process.exit(1)
} else {
  console.log(`✓ ${total}/${total} 用例通过（learned）`)
}
