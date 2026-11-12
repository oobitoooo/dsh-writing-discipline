// dsh-writing-discipline — DSH 插件入口
// 6 个工具：wd_scan / wd_rules / wd_rewrite / wd_conservation / wd_stats / wd_gate
// 1 道闸门：present 交付文档前，必须已对该文件跑过 wd_scan 且 ERROR===0（按内容 sha256 记账）。
// 全部确定性：零网络、零 LLM。

import { defineTool } from '@deepseek-ai/dsh-tools'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  VERSION,
  PROFILES,
  scan,
  stats,
  rewrite,
  conservation,
  formatReport,
  rulesBrief,
} from './rules.js'
import { createGate, isDeliveryTool, isDocFile, fingerprint } from './gate.js'
import { learnedForScan, addLearned, removeLearned, clearLearned, statsLearned, learnedFile, literalToPattern } from './learn.js'
import { buildFingerprint, saveFingerprint, loadFingerprint, compareToFingerprint, fingerprintBrief, walkFiles } from './fingerprint.js'
import { extractText, supportedExt } from './extract.js'

export const name = 'dsh-writing-discipline'
export const inject = ['tools', 'systemPrompt']

const DEFAULT_CONFIG = {
  /** 默认文档类型 */
  profile: 'unknown',
  /** 报告里是否默认输出建议 */
  verboseByDefault: true,
  /** 单次报告最多列多少条 */
  maxItems: 40,
  /** 交付闸门：block=拦；warn=只提示；off=不拦。改这里要重启 DSH */
  gate: 'block',
  /** 除 present 外还要拦的交付类工具名 */
  deliveryTools: [],
}

const SECTION_NAME = 'writing-discipline:gate'
const SECTION_ORDER = 5096

const PROMPT_SECTION = `## 写作纪律闸门（dsh-writing-discipline，机械执行）

交付文本类文件（present 的 .docx/.docm/.pptx/.xlsx/.pdf/.md/.txt/.tex/.rst）前，必须先对**同一份文件**跑 \`wd_scan\`：

- 门槛是 **ERROR === 0**。WARN 不拦，但要按报告逐条处理或显式接受。
- 记账靠文件内容的 sha256：**文件一改，旧通行证立刻失效**，必须重扫。
- 导出件（.pdf）认源文件：同目录同名 .docx/.pptx/.xlsx/.md/.tex 通过扫描即放行。
- 未扫描、扫描后有 ERROR、或扫描后又改了文件，\`present\` 会被拒绝并给出下一步命令。这不是建议，是闸门。
- 改写过的稿子再用 \`wd_conservation\` 对比初稿：数字、引用、图表编号、否定标记、主张强度不许漂移。
- 写之前先 \`wd_rules\` 看一遍当前 profile 生效的规则，能省掉大部分返工。

被拦时的标准动作：照 reason 里的路径跑 wd_scan → 改命中项 → 复扫到 ERROR 0 → 重新 present。不要改成扫别的文件、不要用 wd_gate 绕过；闸门按内容指纹判定，换文件等于重新记账。`

async function readInput(args) {
  if (typeof args?.text === 'string' && args.text.trim()) return args.text
  if (typeof args?.filePath === 'string' && args.filePath) {
    const p = path.resolve(args.filePath)
    if (!supportedExt(p)) {
      throw new Error(`不支持的文件类型 ${path.extname(p) || '(无扩展名)'}；支持 .docx/.pptx/.xlsx 与文本类扩展名`)
    }
    return await extractText(p)
  }
  throw new Error('需要提供 text 或 filePath（内容不能为空）')
}

function normProfile(p, fallback) {
  return PROFILES.includes(p) ? p : fallback
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const gate = createGate({ mode: cfg.gate })
  let gateDirty = false

  // 1) 扫描：核心工具
  ctx.tools.register(
    defineTool({
      name: 'wd_scan',
      description:
        '写作纪律扫描。输入 text 或 filePath（**支持 .docx/.pptx/.xlsx**，会先抽正文再扫），返回 ERROR/WARN/INFO 计数与逐条命中。' +
        '检测：防御性写作（免责、自贬、拒绝式措辞、道歉、自我评价、说教、推责专业人士、合规姿态）、元评论（社交尾巴、开场白、过程旁白、反问、修改残留）、' +
        '软对冲（中英 hedges、模糊程度词、限定词堆叠）、文体（绝对化、填充开头、LLM 套话、「不是X而是Y」、破折号过密、超长句）。' +
        '中文语境专门适配：profile 取 gov/tech/support/marketing/media 时启用中文语域层——公文程式语与口号串、客服套话、营销绝对化、' +
        '技术文档含糊性能描述、中文冗余（进行+动词、被…所、长「的」链、约…左右）、半角标点混入中文、连续感叹号、文言式对冲；' +
        '另加中文密度（逗号链 ≥5、单句 ≥60 字）与中文指标（按字计句长、逗号链、的链、被字句、半角标点）。' +
        'locale 控制中文层：auto（按中文占比自动判定）/ zh（强制启用）/ en（关闭）。' +
        '扫描 filePath 时按内容 sha256 记账：ERROR 归零后，同内容文件的 present 才会放行；文件一改即失效。',
      parameters: {
        text: { type: 'string', description: '要检查的文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: '文件路径：.docx/.pptx/.xlsx 或文本类（与 text 二选一）' },
        profile: {
          type: 'string',
          enum: PROFILES,
          description:
            '文档类型。通用：chat/report/readme/email/academic/comment；中文语域：gov（公文/通报）、tech（技术文档/复盘）、' +
            'support（客服/用户沟通）、marketing（营销文案）、media（媒体稿/公众号）。影响 hedge 降级与中文层规则取舍',
        },
        locale: {
          type: 'string',
          enum: ['auto', 'zh', 'en'],
          description: '中文层开关：auto 按中文占比 ≥30% 自动启用（默认）；zh 强制；en 关闭',
        },
        severityMin: { type: 'string', enum: ['info', 'warn', 'error'], description: '只报不低于该级别的问题（默认 info）' },
        maxWarn: {
          type: 'number',
          description: 'WARN 预算：WARN 数超过该值时 ok=false（ERROR 仍单独判定）。用于 CI 逐周收紧阈值，默认不限',
        },
        verbose: { type: 'boolean', description: '是否输出每条的动作建议（默认按配置）' },
        maxItems: { type: 'number', description: '报告最多列出的条数（默认 40）' },
        json: { type: 'boolean', description: 'true 返回完整 JSON（含全部命中），便于 CI 解析' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const text = await readInput(args)
        const profile = normProfile(args?.profile, cfg.profile)
        let learned = { rules: [], suppressRules: [] }
        try {
          learned = learnedForScan()
        } catch {
          learned = { rules: [], suppressRules: [] }
        }
        const report = scan(text, {
          profile,
          extraRules: learned.rules,
          suppressRules: learned.suppressRules,
          locale: args?.locale ?? 'auto',
          severityMin: args?.severityMin ?? 'info',
          maxWarn: args?.maxWarn,
          maxHits: 2000,
        })
        let gateLine = ''
        if (typeof args?.filePath === 'string' && args.filePath) {
          const entry = await gate.record(path.resolve(args.filePath), report.counts, profile)
          gateDirty = true
          if (entry) {
            gateLine =
              report.counts.error === 0
                ? `\n闸门：已记账（${path.basename(args.filePath)}，ERROR 0）——同内容文件现在可以 present。`
                : `\n闸门：已记账但未通过（${path.basename(args.filePath)}，ERROR ${report.counts.error}）——改完必须重扫。`
          }
        }
        if (args?.json) return JSON.stringify(report, null, 2) + gateLine
        return formatReport(report, {
          verbose: args?.verbose ?? cfg.verboseByDefault,
          maxItems: Number.isFinite(args?.maxItems) ? args.maxItems : cfg.maxItems,
        }) + gateLine
      },
    }),
  )

  // 2) 规则速查
  ctx.tools.register(
    defineTool({
      name: 'wd_rules',
      description:
        '列出写作纪律规则表（id / 标签 / 类别 / 当前 profile 下的严重度 / 建议动作）以及密度规则。' +
        '写之前先看一遍，知道哪些表达会被判定为防御性写作。',
      parameters: {
        profile: { type: 'string', enum: PROFILES, description: '按该文档类型显示实际生效的严重度' },
        json: { type: 'boolean', description: 'true 返回 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      execute(args) {
        const brief = rulesBrief(normProfile(args?.profile, cfg.profile))
        if (args?.json) return JSON.stringify(brief, null, 2)
        const lines = [`dsh-writing-discipline v${VERSION}｜profile=${brief.profile}｜规则 ${brief.count} 条`, '']
        lines.push('密度规则：' + brief.densityRules.map((d) => d.label).join(' / '))
        lines.push('')
        for (const r of brief.rules) {
          lines.push(`[${r.severity.toUpperCase().padEnd(5)} · ${r.kind} · ${r.action}] ${r.id} — ${r.label}${r.hasExample ? ' （带改写示例）' : ''}`)
        }
        lines.push('')
        lines.push('交付前自检（这几条工具判不了，只能人打勾）：')
        for (const item of brief.checklist) lines.push(`  [ ] ${item}`)
        lines.push('')
        lines.push(`中文语境层：当前 profile 生效 ${brief.zh.active.length} 条（共 ${Object.keys(brief.zh.profiles).length} 个中文语域）`)
        lines.push('  语域：' + Object.entries(brief.zh.profiles).map(([k, v]) => `${k}=${v}`).join(' / '))
        for (const r of brief.zh.active) {
          lines.push(`  [${r.severity.toUpperCase().padEnd(5)} · ${r.kind} · ${r.action}] ${r.id} — ${r.label}${r.hasExample ? ' （带改写示例）' : ''}`)
        }
        return lines.join('\n')
      },
    }),
  )

  // 3) 确定性改写
  ctx.tools.register(
    defineTool({
      name: 'wd_rewrite',
      description:
        '确定性改写器（不是 LLM）：剥离开头的防御性引子（「请注意，」「需要注意的是，」「好的，」）、' +
        '压缩限定词堆叠（「可能或许」→「可能」，may potentially → may）、删除纯防御句（整句只承担免责/客套功能）。' +
        '保守约束：含数字、引用、图表编号、链接的句子一律不删。返回改写后文本 + 逐条变更记录 + 改后复扫报告。' +
        '适合清稿第一步；语义改写仍需人工或用模型，但这一步能便宜地砍掉大半噪音。',
      parameters: {
        text: { type: 'string', description: '原始文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: '文件路径（支持 .docx/.pptx/.xlsx）' },
        writeBack: { type: 'boolean', description: 'true 且提供 filePath 时把结果写回原文件（默认 false，只返回文本）' },
        profile: { type: 'string', enum: PROFILES, description: '复扫使用的文档类型' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => false,
      async execute(args) {
        const text = await readInput(args)
        const result = rewrite(text)
        const profile = normProfile(args?.profile, cfg.profile)
        if (args?.writeBack && args?.filePath) {
          await fs.writeFile(path.resolve(args.filePath), result.text, 'utf8')
        }
        const lines = []
        lines.push(`改写完成：${result.changes.length} 处变更${args?.writeBack && args?.filePath ? '（已写回原文件）' : ''}`)
        for (const c of result.changes.slice(0, 40)) {
          lines.push(`- [${c.type}] 「${c.before}」${c.after ? ` → 「${c.after}」` : ' （删除）'}`)
        }
        if (result.changes.length > 40) lines.push(`… 另有 ${result.changes.length - 40} 处`)
        lines.push('')
        lines.push('改写后文本：')
        lines.push(result.text)
        lines.push('')
        lines.push('—— 改后复扫 ——')
        lines.push(formatReport(scan(result.text, { profile }), { maxItems: 20 }))
        return lines.join('\n')
      },
    }),
  )

  // 4) 守恒锁
  ctx.tools.register(
    defineTool({
      name: 'wd_conservation',
      description:
        '守恒锁：对比改写前后的两版文本，验证"润色没有改动事实"。检查数字/单位/百分比、引用键、图表编号、DOI、URL 是否丢失或新增；' +
        '主张强度是否被上调（可能→导致、associated→caused、suggests→proves）；段落否定标记是否漂移；适用边界词是否消失。' +
        'INVARIANT/VIOLATION 级必须回滚，CANDIDATE 级人工确认。所有检查纯本地正则 + bigram 相似度。',
      parameters: {
        original: { type: 'string', description: '改写前原文（与 originalPath 二选一）' },
        revised: { type: 'string', description: '改写后文本（与 revisedPath 二选一）' },
        originalPath: { type: 'string', description: '改写前文件路径' },
        revisedPath: { type: 'string', description: '改写后文件路径' },
        json: { type: 'boolean', description: 'true 返回 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const a = args?.original ?? (args?.originalPath ? await extractText(path.resolve(args.originalPath)) : '')
        const b = args?.revised ?? (args?.revisedPath ? await extractText(path.resolve(args.revisedPath)) : '')
        if (!a || !b) throw new Error('需要 original/originalPath 与 revised/revisedPath 两组输入')
        const res = conservation(a, b)
        if (args?.json) return JSON.stringify(res, null, 2)
        const head = res.ok
          ? `守恒锁：✅ 通过（0 处事实漂移；CANDIDATE ${res.counts.warn ?? 0} 处待确认）`
          : `守恒锁：❌ 发现 ${res.counts.error} 处事实漂移`
        const lines = [head]
        for (const it of res.items) {
          lines.push(`${it.severity === 'error' ? '🔴' : '🟠'} [${it.severity.toUpperCase()} · ${it.kind}] ${it.message}`)
        }
        if (!res.items.length) lines.push('两版之间数字、引用、图表编号、否定与主张强度完全一致。')
        return lines.join('\n')
      },
    }),
  )

  // 5) 指标
  ctx.tools.register(
    defineTool({
      name: 'wd_stats',
      description:
        '文本指标统计（不做判定，只出数）：字符/中文词数/英文词数、段落、句数、平均句长、软对冲密度（每千语言单位）、破折号密度。' +
        '用于改写前后对比、或给 CI 设阈值。',
      parameters: {
        text: { type: 'string', description: '文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: '文件路径（支持 .docx/.pptx/.xlsx）' },
        json: { type: 'boolean', description: 'true 返回 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const text = await readInput(args)
        const s = stats(text)
        if (args?.json) return JSON.stringify(s, null, 2)
        return [
          `字符 ${s.chars}｜中文 ${s.zhChars} 字｜英文 ${s.enWords} 词`,
          `段落 ${s.paragraphs}｜句数 ${s.sentences}｜平均句长 ${s.avgSentence}`,
          `软对冲密度 ${s.hedgePer1000}‰｜破折号密度 ${s.dashPer1000}‰`,
          `中文层：中文占比 ${(s.zh.zhRatio * 100).toFixed(0)}%｜按字句长 ${s.zh.avgSentenceZh}（最长 ${s.zh.maxSentenceZh}）｜逗号链 ≤${s.zh.commaChainMax}｜「的」链 ≤${s.zh.deChainMax}｜被字句 ${s.zh.passiveBei}｜半角标点 ${s.zh.halfWidthPunct}`,
        ].join('\n')
      },
    }),
  )

  // 6) 用户词表
  ctx.tools.register(
    defineTool({
      name: 'wd_learn',
      description:
        '用户词表：把「这条在我这里不算问题」记下来，之后 scan 自动带上（存 ~/.dsh/writing-discipline/learned.json，可审计可回滚）。' +
        '用途是处理误报——内置规则误报时不要整条关掉，记一条反例更精确。' +
        'action=add 传 phrase（字面文本，或 /正则/ 形式）/ label / severity / entryAction；action=list 看现有条目；action=remove 传 id；action=clear 清空。',
      parameters: {
        action: { type: 'string', enum: ['add', 'list', 'remove', 'clear'], description: '默认 add' },
        phrase: { type: 'string', description: 'add 时必填：要规避的字面文本，或 /正则/ 形式' },
        label: { type: 'string', description: '条目名称（可选）' },
        severity: { type: 'string', enum: ['info', 'warn', 'error'], description: '命中时的严重度，默认 warn' },
        entryAction: { type: 'string', enum: ['CUT', 'TIGHTEN', 'REFRAME', 'REVIEW'], description: '命中时的建议动作，默认 REVIEW' },
        advice: { type: 'string', description: '自定义建议文本（可选）' },
        id: { type: 'string', description: 'remove 时的条目 id' },
        json: { type: 'boolean', description: 'true 返回 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => false,
      async execute(args) {
        const act = typeof args?.action === 'string' ? args.action : 'add'
        if (act === 'list') {
          const s = statsLearned()
          if (args?.json) return JSON.stringify(s, null, 2)
          if (!s.count) return `用户词表为空（${s.file}）\n误报时用 wd_learn({action:'add', phrase:'那句话'}) 记一条。`
          return [
            `用户词表：${s.count} 条｜${s.file}`,
            ...s.entries.map((e) => `  ${e.id}  [${e.severity}·${e.action}] ${e.label}  ← /${e.pattern}/`),
          ].join('\n')
        }
        if (act === 'remove') {
          const r = removeLearned(args?.id)
          if (args?.json) return JSON.stringify(r, null, 2)
          return r.ok ? `已删除 ${args.id}（剩余见 wd_learn action=list）` : `没找到：${r.error}`
        }
        if (act === 'clear') {
          const r = clearLearned()
          if (args?.json) return JSON.stringify(r, null, 2)
          return `已清空用户词表（删除 ${r.cleared} 条）`
        }
        if (!args?.phrase) throw new Error('add 需要 phrase')
        const r = addLearned({
          pattern: literalToPattern(args.phrase),
          label: args?.label,
          severity: args?.severity,
          action: args?.entryAction,
          advice: args?.advice,
        })
        if (args?.json) return JSON.stringify(r, null, 2)
        if (!r.ok) return `记不住：${r.error}`
        if (r.duplicate) return `已存在同一条（${r.entry.id}），未重复添加。`
        return `已记入用户词表：${r.entry.id}\n  /${r.entry.pattern}/  [${r.entry.severity}·${r.entry.action}]\n  文件：${r.file}\n下次 wd_scan 自动带上；误记了用 wd_learn({action:'remove', id:'${r.entry.id}'}) 撤销。`
      },
    }),
  )

  // 7) 文风指纹
  ctx.tools.register(
    defineTool({
      name: 'wd_profile',
      description:
        '文风指纹：回答「这篇还像不像你写的」，而不是「有没有 AI 味」。' +
        'action=build 传 paths（你以前的文档目录或文件，至少 2 份），统计句长、长短参差度、逗号链、「的」链、被动句、口头禅，' +
        '存到 ~/.dsh/writing-discipline/baseline.json（只存统计量，不存原文）。' +
        'action=compare 传 text/filePath，给出三档结论（像你 / 有点漂 / 不像你）+ 逐条「哪儿不一样」，每条带你自己句式与这篇句式的对照。' +
        'action=show 看当前基线。不做打分，不做 AI 检测。',
      parameters: {
        action: { type: 'string', enum: ['build', 'compare', 'show'], description: '默认 compare' },
        paths: { type: 'array', items: { type: 'string' }, description: 'build 时的样本目录/文件' },
        text: { type: 'string', description: 'compare 时的文本' },
        filePath: { type: 'string', description: 'compare 时的文件路径' },
        json: { type: 'boolean', description: 'true 返回 JSON' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => false,
      async execute(args) {
        const act = typeof args?.action === 'string' ? args.action : 'compare'
        if (act === 'build') {
          const paths = Array.isArray(args?.paths) ? args.paths : []
          if (!paths.length) throw new Error('build 需要 paths（你以前的文档目录或文件）')
          const files = paths.flatMap((p) => walkFiles(path.resolve(p)))
          const fp = buildFingerprint(files)
          const file = saveFingerprint(fp)
          if (args?.json) return JSON.stringify(fp, null, 2)
          return [
            `文风基线已建立：${fp.samples} 份样本（扫了 ${files.length} 个文件）`,
            `平时一句约 ${fp.metrics.avgSentenceZh.median} 字｜长短参差度 ${fp.metrics.sentenceLenCV.median}`,
            `口头禅：${fp.petWords.slice(0, 6).map((p) => p.w).join('、') || '（无明显高频词）'}`,
            `文件：${file}`,
          ].join('\n')
        }
        if (act === 'show') {
          const fp = loadFingerprint()
          if (args?.json) return JSON.stringify(fp, null, 2)
          return fingerprintBrief(fp)
        }
        const fp = loadFingerprint()
        if (!fp) throw new Error('还没有基线。先 wd_profile({action:"build", paths:["旧文档目录"]})')
        const text = await readInput(args)
        const res = compareToFingerprint(text, fp)
        if (args?.json) return JSON.stringify(res, null, 2)
        const lines = [`${res.headline}`]
        if (res.items.length) {
          lines.push('')
          for (const it of res.items) {
            lines.push(`· ${it.title}——${it.plain}`)
            if (it.mine) lines.push(`    ${it.mine}`)
            if (it.theirs) lines.push(`    ${it.theirs}`)
          }
        }
        lines.push('', `（基线：${fp.samples} 份旧稿；这条只判「像不像你」，不判好坏）`)
        return lines.join('\n')
      },
    }),
  )

  // 8) 闸门自检
  ctx.tools.register(
    defineTool({
      name: 'wd_gate',
      description:
        '交付闸门自检：status 看当前记账（哪些文件通过、哪些失效、剩余多少秒）；check 预检一两个文件会不会被 present 拦下；' +
        'reset 清账（文件被外部工具重写、想强制重扫时用）。闸门本身在 present 前自动生效，这个工具只是给人看的。',
      parameters: {
        action: { type: 'string', enum: ['status', 'check', 'reset'] },
        filePath: { type: 'string', description: 'check/reset 时的目标文件' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const action = args?.action ?? 'status'
        if (action === 'reset') {
          gate.forget(args?.filePath ? path.resolve(args.filePath) : null)
          return args?.filePath ? `已清账：${args.filePath}` : '已清空全部扫描记账。'
        }
        if (action === 'check') {
          if (!args?.filePath) throw new Error('check 需要 filePath')
          const p = path.resolve(args.filePath)
          const reason = await gate.inspect(p)
          const hash = await fingerprint(p)
          return reason
            ? `会被拦下｜${path.basename(p)}｜hash=${hash ?? 'n/a'}\n${reason}`
            : `放行｜${path.basename(p)}｜hash=${hash ?? 'n/a'}`
        }
        const rows = gate.list()
        const head = [`闸门模式：${gate.mode}｜已记账 ${rows.length} 份${gateDirty ? '｜本进程有更新' : ''}`]
        for (const r of rows) {
          const flag = r.error === 0 ? '✅' : '❌'
          head.push(`${flag} ${r.name}｜ERROR ${r.error} / WARN ${r.warn}｜profile=${r.profile}｜${r.ageSeconds}s 前｜${r.path}`)
        }
        if (!rows.length) head.push('（还没有任何扫描记账：present 任何文档都会被拦下）')
        return head.join('\n')
      },
    }),
  )

  // ---------------------------------------------------------------- 闸门
  const evaluate = async (exec) => {
    try {
      if (!exec || !isDeliveryTool(exec.name, cfg.deliveryTools)) return null
      if (gate.mode === 'off') return null
      const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {}
      const problems = await gate.inspectPresentArgs(args)
      if (!problems.length) return null
      if (gate.mode === 'warn') {
        ctx.logger?.warn?.(`[writing-discipline] present 放行（warn 模式）：${problems.join(' / ')}`)
        return null
      }
      return [
        '[writing-discipline] 已拦截 present：交付文档必须先过写作纪律扫描。',
        ...problems.map((p, i) => `${i + 1}. ${p}`),
        '处理完重新 present 即可；不要换文件、不要拆成多次 present 绕过——闸门按文件内容指纹记账。',
      ].join('\n')
    } catch (error) {
      ctx.logger?.warn?.(`[writing-discipline] gate check failed: ${error?.message ?? error}`)
      return null
    }
  }

  try {
    if (typeof ctx.on === 'function') {
      ctx.on(
        'tools/pre-execute',
        async (exec, next) => {
          const reason = await evaluate(exec)
          if (reason) return { kind: 'deny', reason }
          return next()
        },
        { prepend: true },
      )
    }
  } catch (error) {
    ctx.logger?.warn?.(`[writing-discipline] pre-execute hook failed: ${error?.message ?? error}`)
  }

  // 单调兜底：任何监听器把 deny 改成 allow，也会在这里被挡一次（同步判定，不做 IO）。
  try {
    if (ctx.tools && typeof ctx.tools.guard === 'function') {
      ctx.tools.guard((exec) => {
        try {
          if (!exec || !isDeliveryTool(exec.name, cfg.deliveryTools)) return undefined
          if (gate.mode !== 'block') return undefined
          const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {}
          const files = Array.isArray(args?.files) ? args.files : []
          for (const f of files) {
            const p = typeof f === 'string' ? f : f?.path
            if (!p || !isDocFile(p)) continue
            const hit = gate.list().find((r) => r.path === path.resolve(p))
            if (!hit) {
              return `[writing-discipline] 已拦截 present：${path.basename(p)} 未扫描。先跑 wd_scan({"filePath":${JSON.stringify(path.resolve(p))},"profile":"report"})。`
            }
            if (hit.error > 0) {
              return `[writing-discipline] 已拦截 present：${path.basename(p)} 最近一次扫描 ERROR ${hit.error}。改完重扫再交付。`
            }
          }
          return undefined
        } catch {
          return undefined
        }
      })
    }
  } catch (error) {
    ctx.logger?.warn?.(`[writing-discipline] guard register failed: ${error?.message ?? error}`)
  }

  // ---------------------------------------------------------------- 常驻规则
  try {
    if (ctx.systemPrompt && typeof ctx.systemPrompt.section === 'function') {
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        interpolate: false,
        text: PROMPT_SECTION,
      })
    }
  } catch (error) {
    ctx.logger?.warn?.(`[writing-discipline] prompt section failed: ${error?.message ?? error}`)
  }

  ctx.logger?.info?.(
    `[dsh-writing-discipline] v${VERSION} loaded: 6 tools, gate=${gate.mode}, office-extract on`,
  )
}

export default { name, inject, apply }
