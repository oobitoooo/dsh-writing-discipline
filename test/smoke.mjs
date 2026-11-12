// smoke test — 纯 node:assert，无外部依赖
import assert from 'node:assert/strict'
import { scan, rewrite, conservation, stats, rulesBrief, formatReport, RULES, EXAMPLES, CHECKLIST, VERSION } from '../lib/rules.js'

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

const DEFENSIVE_ZH = [
  '作为一个AI助手，我无法保证该结论的准确性。请注意，生产环境操作存在风险，建议您咨询专业人士。',
  '本内容仅供参考，不构成任何投资建议。',
  '很抱歉我能力有限，如有疏漏请指正，希望对您有帮助。',
].join('\n\n')

const CLEAN_ZH = 'API 网关 P95 延迟从 840 ms 降到 210 ms（n=12000，2026-10-28 压测）。切换窗口 02:00–04:00，回滚脚本已演练 2 次。'

test('扫出中文防御性写作的主要类别', () => {
  const r = scan(DEFENSIVE_ZH, { profile: 'chat' })
  const ids = new Set(r.hits.map((h) => h.ruleId))
  for (const id of [
    'defensive.self-reference',
    'defensive.refusal',
    'moralizing.exhortation',
    'defensive.disclaimer',
    'defensive.apology',
    'defensive.self-deprecation',
    'meta.social-tail',
  ]) {
    assert.ok(ids.has(id), `缺少规则命中: ${id}；实际: ${[...ids].join(',')}`)
  }
  assert.equal(r.ok, false)
  assert.ok(r.counts.error >= 6, `error 数应 >=6，实际 ${r.counts.error}`)
})

test('干净文本零命中', () => {
  const r = scan(CLEAN_ZH, { profile: 'report' })
  assert.deepEqual(r.hits.map((h) => `${h.ruleId}:${h.match}`), [], '不应有命中')
  assert.equal(r.ok, true)
})

test('学术 profile 把 hedge 降级为 info', () => {
  const text = '该结果可能反映了样本选择偏差，或许与仪器漂移也有关。'
  const chat = scan(text, { profile: 'chat' })
  const acad = scan(text, { profile: 'academic' })
  const chatErr = chat.hits.filter((h) => h.kind === 'hedge' && h.severity === 'error').length
  const acadErr = acad.hits.filter((h) => h.kind === 'hedge' && h.severity === 'error').length
  assert.equal(acadErr, 0, 'academic 下 hedge 不应是 error')
  assert.ok(chat.hits.some((h) => h.kind === 'hedge' && h.severity === 'warn'))
  assert.equal(chatErr, 0, '单个 hedge 只到 warn，不该是 error')
})

test('段落软对冲密度：≥3 且无量化数据时升级为 ERROR', () => {
  const text = '这个方案可能有效，或许更快，也许更省资源，应该不错。'
  const r = scan(text, { profile: 'report' })
  const density = r.hits.filter((h) => h.ruleId === 'density.hedge-per-paragraph')
  assert.equal(density.length, 1, `应命中 1 条密度规则，实际 ${density.length}`)
  assert.equal(density[0].severity, 'error')
})

test('有量化数据时不算防御饱和', () => {
  const text = '这个方案可能更省资源，实测 P95 从 840 ms 降到 210 ms（n=12000），也许还能再压 20 ms。'
  const r = scan(text, { profile: 'report' })
  assert.equal(r.hits.filter((h) => h.ruleId === 'density.hedge-per-paragraph').length, 0)
})

test('限定词堆叠是 ERROR', () => {
  const r = scan('这可能会或许改善性能。', { profile: 'chat' })
  const stack = r.hits.find((h) => h.ruleId === 'hedge.stacking')
  assert.ok(stack, '应命中 hedge.stacking')
  assert.equal(stack.severity, 'error')
})

test('改写器：剥离引子 + 压缩堆叠 + 删纯防御句', () => {
  const src = '好的，请注意，可能或许会有延迟。\n本内容仅供参考，不构成任何建议。'
  const out = rewrite(src)
  assert.ok(!out.text.includes('好的，'), '应剥离「好的，」')
  assert.ok(!out.text.includes('请注意'), '应剥离「请注意」')
  assert.ok(out.text.includes('可能'), '堆叠应压缩为单层')
  assert.ok(!out.text.includes('仅供参考'), '纯防御句应被删除')
  assert.ok(out.changes.length >= 3, `变更数应 >=3，实际 ${out.changes.length}`)
})

test('改写器：含数字的句子永不删除', () => {
  const src = '本内容仅供参考，2026 年数据不构成任何建议。'
  const out = rewrite(src)
  assert.ok(out.text.includes('2026'), '含数字的句子必须保留')
})

test('守恒锁：数字丢失报 INVARIANT', () => {
  const res = conservation('延迟从 840 ms 降到 210 ms（n=12000）。', '延迟明显下降。')
  assert.equal(res.ok, false)
  const miss = res.items.filter((i) => i.ruleId.startsWith('conservation.number-missing'))
  assert.ok(miss.length >= 2, `应报出丢失的数字，实际 ${miss.length}`)
  assert.ok(miss.every((i) => i.kind === 'INVARIANT'))
})

test('守恒锁：数字一致时通过', () => {
  const res = conservation('延迟从 840 ms 降到 210 ms（n=12000）。', 'P95 从 840 ms 降到 210 ms（n=12000）。')
  assert.equal(res.ok, true, JSON.stringify(res.items))
})

test('守恒锁：主张强度上调报 VIOLATION', () => {
  const res = conservation(
    '结果显示 X 可能与 Y 相关。',
    '结果显示 X 导致 Y。',
  )
  assert.ok(res.items.some((i) => i.ruleId === 'conservation.claim-ladder' && i.kind === 'VIOLATION'))
})

test('守恒锁：否定复合词消失报 VIOLATION', () => {
  const res = conservation(
    '结果显示 X 可能与 Y 相关，延迟从 840 ms 降到 210 ms（n=12000）。实验组未见显著差异。',
    '结果显示 X 导致 Y，延迟明显下降。实验组见显著差异。',
  )
  assert.equal(res.ok, false)
  const removed = res.items.find((i) => i.ruleId === 'conservation.negation-removed' && i.value === '未见')
  assert.ok(removed, '应报出「未见」消失：' + JSON.stringify(res.items.map((i) => i.ruleId)))
  assert.equal(removed.kind, 'VIOLATION')
})

test('守恒锁：段落否定漂移报 INVARIANT', () => {
  const a = '实验组未见显著差异，对照组表现一致，两组样本量相同，测量方法一致。'
  const b = '实验组见显著差异，对照组表现一致，两组样本量相同，测量方法一致。'
  const res = conservation(a, b)
  assert.ok(res.items.some((i) => i.ruleId === 'conservation.negation-drift'))
})

test('守恒锁：引用键丢失', () => {
  const res = conservation('如文献所述 [@smith2024]，结果稳健。', '如文献所述，结果稳健。')
  assert.ok(res.items.some((i) => i.ruleId === 'conservation.cite-missing'))
})

test('stats 基本正确', () => {
  const s = stats('第一句。第二句。')
  assert.equal(s.sentences, 2)
  assert.ok(s.zhChars > 0)
  assert.equal(typeof s.hedgePer1000, 'number')
})

test('规则表非空且 id 唯一', () => {
  const ids = RULES.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length, '存在重复 ruleId')
  assert.ok(ids.length >= 20, `规则数应 >=20，实际 ${ids.length}`)
  const brief = rulesBrief('academic')
  assert.equal(brief.count, RULES.length)
})

test('全部正则都能编译', () => {
  for (const r of RULES) {
    for (const p of r.patterns) {
      assert.doesNotThrow(() => new RegExp(p, 'iu'), `${r.id} 的模式无法编译: ${p}`)
    }
  }
})

test('版本号存在', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/)
})

test('WARN 预算：maxWarn 生效且不影响 ERROR 判定', () => {
  const text = '这个方案可能有效。' // 只有 WARN
  const loose = scan(text, { profile: 'report' })
  const strict = scan(text, { profile: 'report', maxWarn: 0 })
  assert.equal(loose.ok, true, '默认不限预算应通过')
  assert.equal(strict.ok, false, 'WARN 1 > 预算 0 应不通过')
  assert.equal(strict.counts.error, 0, 'ERROR 数仍为 0')
  assert.equal(strict.warnBudget, 0)
})

test('铺垫式开头被识别', () => {
  const r = scan('随着人工智能技术的快速发展，越来越多的团队开始使用自动化工具。', { profile: 'report' })
  assert.ok(r.hits.some((h) => h.ruleId === 'structure.preamble'), '应命中 structure.preamble')
  const r2 = scan('构建耗时 14 分钟，其中 62% 在依赖解析。', { profile: 'report' })
  assert.equal(r2.hits.filter((h) => h.ruleId === 'structure.preamble').length, 0)
})

test('报告带改写示例（✗ / ✓ 对照）', () => {
  const r = scan('作为一个AI助手，我无法保证准确。', { profile: 'chat' })
  const out = formatReport(r, { verbose: true })
  assert.ok(out.includes('✗'), '应输出去掉前的反例')
  assert.ok(out.includes('✓'), '应输出改后的正例')
  const silent = formatReport(r, { verbose: false })
  assert.ok(!silent.includes('✗'), 'verbose=false 时不输出对照')
})

test('示例表没有孤儿 key，自检清单 6 条', () => {
  const ids = new Set(RULES.map((r) => r.id))
  for (const key of Object.keys(EXAMPLES)) {
    assert.ok(ids.has(key) || key.startsWith('density.'), `EXAMPLES 里 ${key} 没有对应规则`)
    assert.ok(EXAMPLES[key].before && EXAMPLES[key].after, `${key} 的示例不完整`)
  }
  assert.equal(CHECKLIST.length, 6)
  assert.ok(rulesBrief('chat').checklist.length === 6)
})

// ---------------- 中文语域层 ----------------
import { ZH_RULES, ZH_PROFILES, zhMetrics, isZhText, zhRulesFor } from '../lib/zh.js'

test('中文层：gov 语域命中公文程式语（INFO，公文里属合规）', () => {
  const r = scan('为深入贯彻落实有关要求，现将有关事项通知如下：请遵照执行。', { profile: 'gov' })
  const hit = r.hits.find((h) => h.ruleId === 'zh.gov.notice-formula')
  assert.ok(hit, '应命中 zh.gov.notice-formula；实际: ' + [...new Set(r.hits.map((h) => h.ruleId))].join(','))
  assert.equal(hit.severity, 'info')
  assert.equal(r.locale, 'zh')
})

test('中文层：support 语域命中客服套话，且不误报自我贬低', () => {
  const r = scan('亲爱的用户，您好！感谢您的理解与支持，如有疑问请联系客服。', { profile: 'support' })
  const ids = new Set(r.hits.map((h) => h.ruleId))
  assert.ok(ids.has('zh.support.service-formula'), '应命中客服套话')
  assert.equal(ids.has('defensive.self-deprecation'), false, '「如有疑问请联系客服」不该判成自我贬低')
})

test('中文层：marketing 语域命中绝对化（ERROR）', () => {
  const r = scan('全网最低价，100%正品，限时抢购，错过再等一年！', { profile: 'marketing' })
  const hit = r.hits.find((h) => h.ruleId === 'zh.marketing.hyperbole')
  assert.ok(hit)
  assert.equal(hit.severity, 'error')
})

test('中文层：tech 语域命中含糊性能描述（ERROR），chat 不命中', () => {
  const text = '重构后性能得到明显提升，系统更加稳定。'
  const tech = scan(text, { profile: 'tech' })
  const chat = scan(text, { profile: 'chat' })
  assert.ok(tech.hits.some((h) => h.ruleId === 'zh.tech.vague-performance' && h.severity === 'error'))
  assert.equal(chat.hits.some((h) => h.ruleId === 'zh.tech.vague-performance'), false, '语域规则不该在 chat 生效')
})

test('中文层：locale=en 关闭，locale=zh 强制开启', () => {
  const text = '特此通知。'
  const off = scan(text, { profile: 'gov', locale: 'en' })
  const on = scan(text, { profile: 'gov', locale: 'zh' })
  assert.equal(off.locale, 'en')
  assert.equal(off.zh, null, 'locale=en 时不应产出中文指标')
  assert.equal(on.locale, 'zh')
  assert.ok(on.zh !== null)
})

test('中文层：isZhText 阈值与英文本判定', () => {
  assert.equal(isZhText('这是一段中文文本，用于测试。'), true)
  assert.equal(isZhText('This is an English sentence only.'), false)
  assert.equal(isZhText(''), false)
})

test('中文指标：逗号链 / 句长 / 的链 / 被字句', () => {
  const m = zhMetrics('系统上线后，用户反馈良好，客服压力下降，运维成本降低，团队信心提升。')
  assert.ok(m.commaChainMax >= 4, `逗号链应 >=4，实际 ${m.commaChainMax}`)
  assert.ok(m.avgSentenceZh > 20)
  const m2 = zhMetrics('那个部门的最新版本的报告被采纳了。')
  assert.ok(m2.passiveBei >= 1)
  assert.ok(m2.deChainMax >= 2, '的链应 >=2，实际 ' + m2.deChainMax)
})

test('中文密度：逗号链 ≥5 触发 WARN', () => {
  const r = scan('第一，第二，第三，第四，第五，第六，结束。', { profile: 'report' })
  assert.ok(r.hits.some((h) => h.ruleId === 'zh-density.comma-chain'), [...new Set(r.hits.map((h) => h.ruleId))].join(','))
})

test('中文规则表结构完整', () => {
  const ids = ZH_RULES.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length, '中文规则 id 重复')
  assert.ok(ZH_RULES.length >= 20, `中文规则应 >=20，实际 ${ZH_RULES.length}`)
  for (const r of ZH_RULES) {
    for (const p of r.patterns) assert.doesNotThrow(() => new RegExp(p, 'giu'), `${r.id} 正则无法编译: ${p}`)
    assert.ok(['info', 'warn', 'error'].includes(r.severity), `${r.id} severity 非法`)
    assert.ok(['CUT', 'TIGHTEN', 'REFRAME', 'REVIEW'].includes(r.action), `${r.id} action 非法`)
  }
  for (const p of ZH_PROFILES) assert.ok(zhRulesFor(p).length > 0, `${p} 语域规则为空`)
})

test('中文规则按语域过滤：通用 profile 只跑无 scopes 的规则', () => {
  const chat = zhRulesFor('chat')
  const gov = zhRulesFor('gov')
  assert.ok(chat.every((r) => !r.scopes || r.scopes.length === 0), 'chat 下不该出现语域专属规则')
  assert.ok(gov.length > chat.length, 'gov 应比 chat 多出公文规则')
})

test('stats 带中文指标', () => {
  const s = stats('这是一句话。这是第二句话。')
  assert.ok(s.zh && typeof s.zh.zhRatio === 'number')
})

test('rulesBrief 输出中文语域层', () => {
  const b = rulesBrief('gov')
  assert.ok(b.zh && Array.isArray(b.zh.active))
  assert.ok(b.zh.active.length >= 12, 'gov 下中文层应 >=12 条，实际 ' + b.zh.active.length)
  assert.ok(Object.keys(b.zh.profiles).includes('gov'))
})

// ---- 汇总 ----
const total = pass + failures.length
if (failures.length) {
  console.error(`\n✗ ${failures.length}/${total} 用例失败\n`)
  for (const f of failures) {
    console.error(`--- ${f.name} ---`)
    console.error(f.error?.message ?? f.error)
    if (process.env.VERBOSE) console.error(f.error?.stack)
  }
  process.exit(1)
} else {
  console.log(`✓ ${total}/${total} 用例通过（dsh-writing-discipline v${VERSION}）`)
}
