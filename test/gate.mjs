// gate test — 纯 node:assert，无外部依赖
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createGate, fingerprint, isDocFile, isDeliveryTool } from '../lib/gate.js'

let pass = 0
const failures = []
const cases = []

async function test(name, fn) {
  try {
    await fn()
    pass++
  } catch (e) {
    failures.push({ name, error: e })
  }
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wd-gate-'))
const doc = path.join(dir, 'report.md')

await test('指纹稳定，内容变了指纹就变', async () => {
  await fs.writeFile(doc, '第一版正文', 'utf8')
  const a = await fingerprint(doc)
  const b = await fingerprint(doc)
  assert.equal(a, b)
  await fs.writeFile(doc, '第二版正文', 'utf8')
  const c = await fingerprint(doc)
  assert.notEqual(a, c)
})

await test('没记账时拒绝，并给出可照做的 wd_scan 命令', async () => {
  const gate = createGate({ mode: 'block' })
  const reason = await gate.inspect(doc)
  assert.ok(reason, '应当拒绝')
  assert.ok(reason.includes('wd_scan'), '理由里要有下一步命令')
  assert.ok(reason.includes('report'), '理由里要带 profile 建议')
})

await test('扫过且 ERROR 0 → 放行', async () => {
  const gate = createGate({ mode: 'block' })
  await gate.record(doc, { error: 0, warn: 3, info: 0 }, 'report')
  assert.equal(await gate.inspect(doc), null)
})

await test('扫过但 ERROR > 0 → 拒绝', async () => {
  const gate = createGate({ mode: 'block' })
  await gate.record(doc, { error: 2, warn: 0, info: 0 }, 'report')
  const reason = await gate.inspect(doc)
  assert.ok(reason && reason.includes('ERROR 2'), `应当拒绝并报出 ERROR 数，实际: ${reason}`)
})

await test('扫描后又改文件 → 旧通行证失效', async () => {
  const gate = createGate({ mode: 'block' })
  await fs.writeFile(doc, '第三版：改了一个字', 'utf8')
  await gate.record(doc, { error: 0, warn: 0, info: 0 }, 'report')
  await fs.writeFile(doc, '第四版：又改了一个字', 'utf8')
  const reason = await gate.inspect(doc)
  assert.ok(reason && reason.includes('改动'), `应当提示重扫，实际: ${reason}`)
})

await test('非文档不拦', async () => {
  const gate = createGate({ mode: 'block' })
  assert.equal(await gate.inspect(path.join(dir, 'chart.png')), null)
  assert.equal(isDocFile(path.join(dir, 'chart.png')), false)
  assert.equal(isDocFile(doc), true)
})

await test('pdf 认源文件：同名 .md 通过即放行', async () => {
  const gate = createGate({ mode: 'block' })
  const md = path.join(dir, 'thesis.md')
  const pdf = path.join(dir, 'thesis.pdf')
  await fs.writeFile(md, '论文正文', 'utf8')
  await fs.writeFile(pdf, '%PDF-1.4 fake', 'utf8')
  assert.ok(await gate.inspect(pdf), '源文件没扫时应拒绝')
  await gate.record(md, { error: 0, warn: 0, info: 0 }, 'academic')
  assert.equal(await gate.inspect(pdf), null, '源文件通过后 pdf 应放行')
})

await test('一次列全 present 的所有问题', async () => {
  const gate = createGate({ mode: 'block' })
  const a = path.join(dir, 'a.docx')
  const b = path.join(dir, 'b.md')
  await fs.writeFile(a, 'A', 'utf8')
  await fs.writeFile(b, 'B', 'utf8')
  await gate.record(b, { error: 1, warn: 0, info: 0 }, 'report')
  const problems = await gate.inspectPresentArgs({ files: [{ path: a }, { path: b }, { path: path.join(dir, 'x.png') }] })
  assert.equal(problems.length, 2, `应报 2 条（a 未扫、b 有 ERROR），实际 ${problems.length}`)
})

await test('mode=warn 只记日志不拦（由调用方决定），mode=off 直接放行', async () => {
  const off = createGate({ mode: 'off' })
  assert.equal(await off.inspect(doc), null)
  assert.equal(off.mode, 'off')
})

await test('delivery 工具名判定', async () => {
  assert.equal(isDeliveryTool('present'), true)
  assert.equal(isDeliveryTool('present', []), true)
  assert.equal(isDeliveryTool('write'), false)
})

await fs.rm(dir, { recursive: true, force: true })

if (failures.length) {
  for (const f of failures) {
    console.error(`✗ ${f.name}\n  ${f.error.message}`)
  }
  console.error(`\ngate: ${pass} passed, ${failures.length} failed`)
  process.exit(1)
}
console.log(`gate: ${pass} passed`)
