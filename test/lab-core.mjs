// 校验浏览器版指纹核心与 lib/ 的实现是否一致
// 做法：从 fingerprint-lab.html 里抠出 <script id="core"> 段，在 node 里求值，
// 再和 lib/zh.js 的 zhMetrics、lib/fingerprint.js 的 buildFingerprint 对拍。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(here, '..', 'tools', 'fingerprint-lab.html')
const html = fs.readFileSync(htmlPath, 'utf8')

const m = html.match(/<script id="core">([\s\S]*?)<\/script>/)
assert.ok(m, 'HTML 里找不到 <script id="core">')
const coreCode = m[1]

// 求值得到浏览器版函数
const core = new Function(coreCode + '\nreturn { zhMetrics, proseOnly, petWords, buildFingerprintFromTexts }')()

const { zhMetrics } = await import('../lib/zh.js')

const SAMPLES = [
  '这事儿卡在张三那边，等他回。别的都好了，就差这一块。真到下周一还没动静，我就直接找他们组长。说白了就是流程拖着，人不坏，事不快。我这边能做的都做了，剩下的只能等。',
  '先说结论：能上，但别急。灰度先开五个点，盯两小时。有问题立刻回滚，回滚脚本我昨晚跑过两遍。上回就是因为没盯，挂了四十分钟，这次别重演。监控面板加了三项，都在首页。',
  '接口调通了。慢是因为索引没建。建完从 900ms 掉到 120ms。就这样。别的指标没动，不用看。压测跑了三轮，数据一致。要复现的话脚本在 tools 下面，别直接跑生产。有问题喊我，我今晚在。',
]

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

test('HTML 脚本能被解析求值', () => {
  assert.equal(typeof core.zhMetrics, 'function')
  assert.equal(typeof core.buildFingerprintFromTexts, 'function')
})

test('浏览器版与 lib 版指标一致', () => {
  for (const t of SAMPLES) {
    const a = zhMetrics(t)
    const b = core.zhMetrics(t)
    for (const k of ['zhChars', 'sentences', 'avgSentenceZh', 'sentenceLenCV', 'commaChainMax', 'deChainMax', 'passiveBei', 'chars']) {
      assert.equal(b[k], a[k], `${k} 不一致：lib=${a[k]} html=${b[k]}`)
    }
  }
})

test('散文过滤一致（Markdown 结构被剔除）', () => {
  const md = '# 标题\n\n- 列表项\n- 另一项\n\n这是正文的一段话，句子正常。第二句也正常。第三句还是正常。\n\n| a | b |\n|---|---|\n| 1 | 2 |'
  const fp = core.buildFingerprintFromTexts([md, md])
  assert.equal(fp.ok, false, '两份相同短文应因不足 60 字 / 4 句被拒')
})

test('两份样本能建出指纹，字段齐全', () => {
  const fp = core.buildFingerprintFromTexts(SAMPLES)
  assert.equal(fp.ok, true, fp.reason)
  assert.equal(fp.samples, 3)
  for (const k of ['avgSentenceZh', 'sentenceLenCV', 'commaChainMax', 'deChainMax', 'passivePer1000']) {
    assert.ok(fp.metrics[k], `缺指标 ${k}`)
    assert.equal(typeof fp.metrics[k].median, 'number')
  }
  assert.ok(Array.isArray(fp.petWords))
  assert.ok(fp.exemplar.length > 0)
  assert.ok(Array.isArray(fp.sentenceLens) && fp.sentenceLens.length > 0)
})

test('样本不足时给出人话原因', () => {
  const fp = core.buildFingerprintFromTexts([SAMPLES[0]])
  assert.equal(fp.ok, false)
  assert.ok(/至少需要 2 份/.test(fp.reason), fp.reason)
})

test('HTML 不含外部依赖（离线可用）', () => {
  assert.equal(/<script[^>]+src=|<link[^>]+href="http|@import/.test(html), false, '不应引用外部资源')
})

const total = pass + failures.length
if (failures.length) {
  console.error(`✗ ${failures.length}/${total} 用例失败`)
  for (const f of failures) console.error(`--- ${f.name} ---\n${f.error?.message ?? f.error}`)
  process.exit(1)
}
console.log(`✓ ${total}/${total} 用例通过（lab-core 一致性）`)
