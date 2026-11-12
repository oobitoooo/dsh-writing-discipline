// 文风指纹测试 — 临时目录造样本，不碰真实基线
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fp-'))
process.env.WD_PROFILE_FILE = path.join(DIR, 'baseline.json')

const { buildFingerprint, saveFingerprint, loadFingerprint, compareToFingerprint, petWords, walkFiles } = await import('../lib/fingerprint.js')

// 三份「我平时写的」样本：短句、口语、参差
const SAMPLES = [
  '这事儿卡在张三那边，等他回。别的都好了，就差这一块。真到下周一还没动静，我就直接找他们组长。说白了就是流程拖着，人不坏，事不快。我这边能做的都做了，剩下的只能等。等不及就先上别的模块，这块单独发。',
  '先说结论：能上，但别急。灰度先开五个点，盯两小时。有问题立刻回滚，回滚脚本我昨晚跑过两遍。上回就是因为没盯，挂了四十分钟，这次别重演。监控面板加了三项，都在首页。谁值班谁盯，别指望别人。',
  '接口调通了。慢是因为索引没建。建完从 900ms 掉到 120ms。就这样。别的指标没动，不用看。压测跑了三轮，数据一致。要复现的话脚本在 tools 下面，别直接跑生产。有问题喊我，我今晚在。',
]
SAMPLES.forEach((s, i) => fs.writeFileSync(path.join(DIR, `mine-${i}.md`), s, 'utf8'))

// 一篇「模型写的」：长句、整齐、书面、被动多
const MACHINE = [
  '目前该事项的推进受限于相关方的反馈时效，建议在完成进一步确认后再行决策。',
  '该改动的影响范围已经被充分评估，相关风险已经被纳入整体监控体系之中。',
  '从整体来看，本次调整在提升系统稳定性方面具备一定的积极作用与参考价值。',
  '后续将持续跟踪相关指标的运行情况，并根据实际表现进行相应的优化与调整。',
].join('')

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

test('样本不足时报错而不是静默给空基线', () => {
  assert.throws(() => buildFingerprint([path.join(DIR, 'mine-0.md')]), /样本不足/)
})

test('建立基线：结构完整，只存统计量', () => {
  const files = walkFiles(DIR).filter((f) => f.includes('mine-'))
  const fp = buildFingerprint(files)
  assert.equal(fp.samples, 3)
  assert.ok(fp.metrics.avgSentenceZh.median > 0)
  assert.ok(fp.metrics.sentenceLenCV.median > 0)
  assert.ok(Array.isArray(fp.petWords))
  assert.ok(fp.exemplar.length > 0)
  assert.equal(JSON.stringify(fp).includes('张三'), false, '基线不该存原文')
})

test('存盘 / 读盘往返', () => {
  const files = walkFiles(DIR).filter((f) => f.includes('mine-'))
  const fp = buildFingerprint(files)
  saveFingerprint(fp)
  const back = loadFingerprint()
  assert.ok(back)
  assert.equal(back.samples, fp.samples)
  assert.deepEqual(back.metrics, fp.metrics)
})

test('同一批样本自比：判为「像你」', () => {
  const files = walkFiles(DIR).filter((f) => f.includes('mine-'))
  const fp = buildFingerprint(files)
  const r = compareToFingerprint(fs.readFileSync(files[0], 'utf8'), fp)
  assert.equal(r.level, 'same', `${r.headline} / items=${r.items.map((i) => i.key)}`)
  assert.ok(r.headline.includes('就是'))
})

test('机器腔文本：判为偏离，并指出长句与整齐', () => {
  const files = walkFiles(DIR).filter((f) => f.includes('mine-'))
  const fp = buildFingerprint(files)
  const r = compareToFingerprint(MACHINE, fp)
  assert.notEqual(r.level, 'same', '应当判为偏离')
  const keys = r.items.map((i) => i.key)
  assert.ok(keys.includes('sentence-length'), '应指出句长偏离：' + keys.join(','))
  assert.ok(keys.includes('uniformity'), '应指出句子过于整齐：' + keys.join(','))
  // 每条都要给「人话」，不是光秃秃的数字
  for (const it of r.items) {
    assert.ok(it.plain && it.plain.length > 8, `${it.key} 缺少人话说明`)
    assert.ok(/[。！]/.test(it.plain), `${it.key} 的说明不像句子`)
  }
})

test('偏离结论里能给出你自己的句式做对照', () => {
  const files = walkFiles(DIR).filter((f) => f.includes('mine-'))
  const fp = buildFingerprint(files)
  const r = compareToFingerprint(MACHINE, fp)
  const lenItem = r.items.find((i) => i.key === 'sentence-length')
  assert.ok(lenItem.mine.startsWith('你写的：'), '应引用你自己的句子')
  assert.ok(lenItem.theirs.startsWith('这篇写：'), '应引用这稿的句子')
})

test('口头禅统计会过滤掉虚词', () => {
  const words = petWords('这个那个我们你们可以就是不是因为所以但是而且或者以及对于关于通过', 10)
  assert.equal(words.length, 0, '全是虚词时不该有口头禅')
  const real = petWords('这事儿卡住了。这事儿得催。这事儿我来。', 5)
  assert.ok(real.some((p) => p.w === '这事' || p.n >= 2))
})

test('没有基线时 load 返回 null', () => {
  const f = process.env.WD_PROFILE_FILE
  process.env.WD_PROFILE_FILE = path.join(DIR, 'nope.json')
  assert.equal(loadFingerprint(), null)
  process.env.WD_PROFILE_FILE = f
})

try {
  fs.rmSync(DIR, { recursive: true, force: true })
} catch {}

const total = pass + failures.length
if (failures.length) {
  console.error(`✗ ${failures.length}/${total} 用例失败`)
  for (const f of failures) console.error(`--- ${f.name} ---\n${f.error?.message ?? f.error}`)
  process.exit(1)
}
console.log(`✓ ${total}/${total} 用例通过（fingerprint）`)
