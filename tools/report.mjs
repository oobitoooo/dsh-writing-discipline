#!/usr/bin/env node
// report.mjs — 把「像不像你」和「前后一不一致」做成一张能直接打开的网页
//
// 设计原则：先说结论（一句话），再给两三个具体的「哪儿不一样」，数字藏在折叠里。
// 不做仪表盘、不做分数环——那种东西看着专业，读完不知道该改哪儿。
//
// 两种模式：
//   有基线  → 「像不像你」+ 段落一致性
//   没基线  → 自动降级成「段落一致性」：拿这篇自己的多数段落当尺子，找不像的部分
//
// 用法：
//   node tools/report.mjs 稿件.md                        # 没基线也能出报告
//   node tools/report.mjs 稿件.md --build 旧文档目录      # 顺手建基线
//   node tools/report.mjs 稿件.md --out 报告.html

import fs from 'node:fs'
import path from 'node:path'
import {
  buildFingerprint,
  saveFingerprint,
  loadFingerprint,
  compareToFingerprint,
  compareSegments,
  fingerprintFile,
  walkFiles,
} from '../lib/fingerprint.js'
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

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// 1) 基线（可选）
let fp = loadFingerprint()
const buildDir = opt('--build')
if (buildDir) {
  fp = buildFingerprint(walkFiles(path.resolve(buildDir)))
  saveFingerprint(fp)
  console.log(`基线已建立：${fp.samples} 份样本 → ${fingerprintFile()}`)
}

const text = fs.readFileSync(path.resolve(target), 'utf8')
const m = zhMetrics(text)

// 2) 两条判定
const vs = fp ? compareToFingerprint(text, fp) : null
const seg = compareSegments(text)

// 3) 顶部那句结论：有基线就以基线为准，没有就用段落一致性
let level = 'na'
let headline = ''
let sub = ''
if (vs) {
  level = vs.level
  headline = vs.headline
  sub = `拿你 ${fp.samples} 份旧稿当尺子量的。`
  // 整篇看像你、但内部有几段不像：结论要跟着段落走，不能自己打自己脸
  if (seg.ok && seg.outliers.length) {
    const n = seg.outliers.length
    if (level === 'same') {
      level = 'drifting'
      headline = `大体是你的路子，但有 ${n} 段不像你自己的写法。`
    } else {
      headline = `${vs.headline}另外有 ${n} 段前后不一致。`
    }
    sub = `拿你 ${fp.samples} 份旧稿当尺子量的；另外有 ${n} 段和这篇其余部分不像。`
  }
} else if (seg.ok) {
  level = seg.outliers.length ? (seg.outliers.length >= 2 ? 'off' : 'drifting') : 'same'
  headline = seg.outliers.length
    ? `这篇不太统一：有 ${seg.outliers.length} 段和其余部分不像。`
    : '这篇前后是一个人在写。'
  sub = '还没有你的旧稿当尺子，这次只查了前后是否一致。'
} else {
  headline = '这篇太短，看不出节奏。'
  sub = seg.reason || ''
}

// 4) 句长竖条
function bars(list, maxH = 96) {
  return list
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

// 5) 段落条带：一个方块 = 一段，偏离的标红
const outlierMap = new Map((seg.outliers || []).map((o) => [o.index, o.reasons]))
const segStrip = (seg.segments || [])
  .map((s) => {
    const bad = outlierMap.get(s.index)
    const tip = bad ? `第 ${s.index} 段：${bad.join('；')}` : `第 ${s.index} 段：${s.avgSentenceZh} 字/句`
    return `<b class="seg ${bad ? 'bad' : 'ok'}" title="${esc(tip)}"></b>`
  })
  .join('')

// 6) 卡片
const vsCards = vs
  ? vs.items
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
  : ''

const segCards = (seg.outliers || [])
  .map(
    (o) => `
    <article class="card">
      <h3>第 ${o.index} 段不太一样</h3>
      <p>${esc(o.reasons.join('；'))}——其余段落不是这个节奏。</p>
      <div class="cmp theirs"><span>原文</span>${esc(o.text)}</div>
    </article>`,
  )
  .join('')

const emptyCard =
  !vsCards && !segCards
    ? `<article class="card"><h3>没什么可挑的</h3><p>${
        vs ? '句子长短、用词习惯都在你平时的范围里。' : '前后节奏一致，没有哪一段特别突兀。'
      }</p></article>`
    : ''

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
  h1 { font-size: 38px; line-height:1.32; margin: 12px 0 10px; font-weight: 650; }
  h1.same { color: var(--same); } h1.drifting { color: var(--drift); } h1.off { color: var(--off); } h1.na { color:#555; }
  .sub { font-size: 17px; color: var(--dim); margin: 0 0 36px; }

  .strip-box { background:#fff; border:1px solid var(--line); border-radius:12px; padding:20px 22px; margin:0 0 34px; }
  .strip-box h4 { margin:0 0 12px; font-size:13px; color:var(--dim); font-weight:600; letter-spacing:.04em; }
  .segments { display:flex; gap:6px; flex-wrap:wrap; }
  .seg { display:block; width:34px; height:12px; border-radius:3px; background:#d9d5cf; }
  .seg.bad { background:var(--off); }
  .strip-legend { font-size:12px; color:var(--dim); margin-top:10px; }

  .rhythm { display:grid; grid-template-columns: 1fr 1fr; gap: 28px; margin: 0 0 40px; }
  .rhythm h4 { margin:0 0 10px; font-size:13px; color:var(--dim); font-weight:600; }
  .bars { display:flex; align-items:flex-end; gap:3px; height:110px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  .bars i { display:block; width:5px; border-radius:2px; background:#c9c6c1; }
  .rhythm .theirs .bars i { background:#8d8880; }
  .legend { font-size:12px; color:var(--dim); margin-top:6px; }

  .group-label { font-size:12px; letter-spacing:.1em; color:#999; margin:34px 0 10px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:22px 24px; margin:0 0 14px; }
  .card h3 { margin:0 0 6px; font-size:19px; }
  .card p { margin:0 0 14px; color:#333; }
  .cmp { font-size:15px; color:var(--dim); padding:8px 0; border-top:1px dashed var(--line); }
  .cmp span { display:inline-block; min-width:56px; font-size:12px; letter-spacing:.08em; color:#999; }
  .cmp.mine { color:#555; } .cmp.theirs { color:#333; }

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
  <h1 class="${level}">${esc(headline)}</h1>
  <p class="sub">${esc(sub)}</p>

  ${
    seg.ok
      ? `<section class="strip-box">
    <h4>段落一致性</h4>
    <div class="segments">${segStrip}</div>
    <div class="strip-legend">一个方块是一段，红色的是和其余部分不一样的那几段${
      seg.outliers.length ? `（共 ${seg.outliers.length} 段）` : ''
    }</div>
  </section>`
      : ''
  }

  <section class="rhythm">
    <div class="mine">
      <h4>${fp ? '你平时的句子长短' : '这篇的部分句子'}</h4>
      <div class="bars">${fp ? bars([fp.exemplar || '']) : bars(sentences.slice(0, 8))}</div>
      <div class="legend">${fp ? `原型句：${esc(fp.exemplar || '—')}` : '先建基线才会出现对照'}</div>
    </div>
    <div class="theirs">
      <h4>这篇的句子长短</h4>
      <div class="bars">${bars(sentences)}</div>
      <div class="legend">每根竖条是一句话，越高字越多</div>
    </div>
  </section>

  ${vsCards ? `<div class="group-label">和你的旧稿比</div>${vsCards}` : ''}
  ${segCards ? `<div class="group-label">这篇自己里面比</div>${segCards}` : ''}
  ${emptyCard}

  <details>
    <summary>这些结论是怎么算的</summary>
    <table>
      <tr><th>指标</th><th>${fp ? '你平时' : '这篇中位'}</th><th>这篇</th></tr>
      <tr><td>平均句长（字）</td><td>${fp ? fp.metrics.avgSentenceZh.median : seg.ok ? seg.median.avgSentenceZh : '—'}</td><td>${m.avgSentenceZh}</td></tr>
      <tr><td>句长整齐度（越小越整齐）</td><td>${fp ? fp.metrics.sentenceLenCV.median : seg.ok ? seg.median.sentenceLenCV : '—'}</td><td>${m.sentenceLenCV}</td></tr>
      <tr><td>一句话最多几个逗号</td><td>${fp ? fp.metrics.commaChainMax.p90 : '—'}</td><td>${m.commaChainMax}</td></tr>
      <tr><td>一句话最多几个「的」</td><td>${fp ? fp.metrics.deChainMax.p90 : '—'}</td><td>${m.deChainMax}</td></tr>
      <tr><td>被动句次数</td><td>—</td><td>${m.passiveBei}</td></tr>
      <tr><td>有效段落</td><td>—</td><td>${seg.total ?? 0}</td></tr>
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
console.log(headline)
if (vs) for (const it of vs.items) console.log(`  · ${it.title} —— ${it.plain}`)
for (const o of seg.outliers || []) console.log(`  · 第 ${o.index} 段：${o.reasons.join('；')}`)
