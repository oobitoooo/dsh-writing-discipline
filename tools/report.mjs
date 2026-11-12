#!/usr/bin/env node
// report.mjs — 把「像不像你」做成一张能直接打开的网页
//
// 设计原则：先说结论（一句话），再给两三个具体的「哪儿不一样」，数字藏在折叠里。
// 不做仪表盘、不做分数环——那种东西看着专业，读完不知道该改哪儿。
//
// 用法：
//   node tools/report.mjs 稿件.md                       # 需要已有基线
//   node tools/report.mjs 稿件.md --build 旧文档目录     # 顺手建基线
//   node tools/report.mjs 稿件.md --out 报告.html

import fs from 'node:fs'
import path from 'node:path'
import { buildFingerprint, saveFingerprint, loadFingerprint, compareToFingerprint, fingerprintFile, walkFiles } from '../lib/fingerprint.js'
import { zhMetrics } from '../lib/zh.js'

const argv = process.argv.slice(2)
const opt = (name, def = null) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : def
}
const target = argv.find((a) => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--'))
if (!target) {
  console.error('用法: node tools/report.mjs <稿件> [--build <旧文档目录>] [--out 报告.html]')
  process.exit(2)
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// 1) 基线：有就用，没有或指定 --build 就现建
let fp = loadFingerprint()
const buildDir = opt('--build')
if (buildDir) {
  const files = walkFiles(path.resolve(buildDir))
  fp = buildFingerprint(files)
  saveFingerprint(fp)
  console.log(`基线已建立：${fp.samples} 份样本 → ${fingerprintFile()}`)
}
if (!fp) {
  console.error('没有基线。先跑一次：node tools/report.mjs 稿件.md --build 你的旧文档目录')
  process.exit(1)
}

// 2) 分析
const text = fs.readFileSync(path.resolve(target), 'utf8')
const result = compareToFingerprint(text, fp)
const m = zhMetrics(text)

// 3) 句长条：左=你平时的原型句，右=这篇每句
function bars(sentenceList, maxH = 96) {
  return sentenceList
    .map((s) => {
      const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length
      const h = Math.max(6, Math.round((zh / 60) * maxH))
      return `<i style="height:${h}px" title="${zh} 字"></i>`
    })
    .join('')
}
const sentences = text
  .split(/[。！？!?\n]+/)
  .map((s) => s.trim())
  .filter((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length >= 4)
  .slice(0, 40)

const lvlClass = { same: 'same', drifting: 'drifting', off: 'off' }[result.level]
const lvlWord = { same: '像你', drifting: '有点漂', off: '不像你' }[result.level]

const itemsHtml = result.items.length
  ? result.items
      .map(
        (it) => `
    <article class="card">
      <h3>${esc(it.title)}</h3>
      <p>${esc(it.plain)}</p>
      ${it.mine ? `<div class="cmp mine"><span>你自己</span>${esc(it.mine)}</div>` : ''}
      ${it.theirs ? `<div class="cmp theirs"><span>这篇</span>${esc(it.theirs)}</div>` : ''}
    </article>`,
      )
      .join('')
  : `<article class="card"><h3>没什么可挑的</h3><p>句子长短、用词习惯都在你平时的范围里。</p></article>`

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>像不像你 · ${esc(path.basename(target))}</title>
<style>
  :root { --fg:#1a1a1a; --dim:#6b6b6b; --line:#e6e6e6; --bg:#faf9f7; --same:#2f7d4f; --drift:#b07b1e; --off:#b3402f; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font: 16px/1.75 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 64px 24px 96px; }
  .kicker { font-size: 13px; letter-spacing:.12em; color:var(--dim); text-transform: uppercase; }
  h1 { font-size: 40px; line-height:1.3; margin: 12px 0 8px; font-weight: 650; }
  h1.same { color: var(--same); } h1.drifting { color: var(--drift); } h1.off { color: var(--off); }
  .sub { font-size: 18px; color: var(--dim); margin: 0 0 40px; }
  .rhythm { display:grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 0 0 48px; }
  .rhythm h4 { margin:0 0 10px; font-size:13px; color:var(--dim); font-weight:600; }
  .bars { display:flex; align-items:flex-end; gap:3px; height:110px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  .bars i { display:block; width:5px; border-radius:2px; background:#c9c6c1; }
  .rhythm .theirs .bars i { background:#8d8880; }
  .legend { font-size:12px; color:var(--dim); margin-top:6px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:22px 24px; margin:0 0 14px; }
  .card h3 { margin:0 0 6px; font-size:19px; }
  .card p { margin:0 0 14px; color:#333; }
  .cmp { font-size:15px; color:var(--dim); padding:8px 0; border-top:1px dashed var(--line); }
  .cmp span { display:inline-block; min-width:56px; font-size:12px; letter-spacing:.08em; color:#999; }
  .cmp.mine { color:#555; }
  .cmp.theirs { color:#333; }
  details { margin-top:40px; border-top:1px solid var(--line); padding-top:18px; font-size:14px; color:var(--dim); }
  summary { cursor:pointer; color:#555; }
  table { border-collapse:collapse; margin-top:12px; font-size:13px; }
  td, th { padding:5px 14px 5px 0; text-align:left; }
  footer { margin-top:48px; font-size:12px; color:#aaa; }
</style>
</head>
<body>
<main>
  <div class="kicker">文风指纹</div>
  <h1 class="${lvlClass}">${esc(result.headline)}</h1>
  <p class="sub">拿你 ${fp.samples} 份旧稿当尺子量的。${result.items.length ? `发现 ${result.items.length} 处不一样。` : ''}</p>

  <section class="rhythm">
    <div class="mine">
      <h4>你平时的句子长短</h4>
      <div class="bars">${bars([fp.exemplar || ''])}</div>
      <div class="legend">原型句：${esc(fp.exemplar || '—')}</div>
    </div>
    <div class="theirs">
      <h4>这篇的句子长短</h4>
      <div class="bars">${bars(sentences)}</div>
      <div class="legend">每根竖条是一句话，越高字越多</div>
    </div>
  </section>

  ${itemsHtml}

  <details>
    <summary>这些结论是怎么算的</summary>
    <table>
      <tr><th>指标</th><th>你平时</th><th>这篇</th></tr>
      <tr><td>平均句长（字）</td><td>${fp.metrics.avgSentenceZh.median}</td><td>${m.avgSentenceZh}</td></tr>
      <tr><td>句长整齐度（越小越整齐）</td><td>${fp.metrics.sentenceLenCV.median}</td><td>${m.sentenceLenCV}</td></tr>
      <tr><td>一句话最多几个逗号</td><td>${fp.metrics.commaChainMax.p90}</td><td>${m.commaChainMax}</td></tr>
      <tr><td>一句话最多几个「的」</td><td>${fp.metrics.deChainMax.p90}</td><td>${m.deChainMax}</td></tr>
      <tr><td>被动句次数</td><td>—</td><td>${m.passiveBei}</td></tr>
    </table>
    <p>判定只用偏离程度，不打分。分数会让你盯着数字，偏离让你盯着句子。</p>
  </details>

  <footer>dsh-writing-discipline · 全部本地计算，原文不上传 · ${new Date().toISOString().slice(0, 10)}</footer>
</main>
</body>
</html>`

const outPath = opt('--out') || path.join(process.cwd(), `像不像你-${path.basename(target, path.extname(target))}.html`)
fs.writeFileSync(outPath, html, 'utf8')
console.log(`报告已生成：${outPath}`)
console.log(`${lvlWord}｜${result.headline}`)
for (const it of result.items) console.log(`  · ${it.title} —— ${it.plain}`)
