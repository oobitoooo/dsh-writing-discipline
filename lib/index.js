// dsh-writing-discipline — DSH 插件入口
// 五个工具：wd_scan / wd_rules / wd_rewrite / wd_conservation / wd_stats
// 全部确定性：零网络、零 LLM。工具只报事实与"该动哪句"，改写器只做有把握的机械操作。

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

export const name = 'dsh-writing-discipline'
export const inject = ['tools']

const DEFAULT_CONFIG = {
  /** 默认文档类型 */
  profile: 'unknown',
  /** 报告里是否默认输出建议 */
  verboseByDefault: true,
  /** 单次报告最多列多少条 */
  maxItems: 40,
}

const SUPPORTED_EXT = new Set(['.md', '.txt', '.markdown', '.rst', '.tex', '.log', '.json', '.yaml', '.yml', '.js', '.ts', '.mjs', '.cjs', '.py', '.ps1', '.sh', '.css', '.html'])

async function readInput(args) {
  if (typeof args?.text === 'string' && args.text.trim()) return args.text
  if (typeof args?.filePath === 'string' && args.filePath) {
    const p = path.resolve(args.filePath)
    const ext = path.extname(p).toLowerCase()
    if (!SUPPORTED_EXT.has(ext)) {
      throw new Error(`不支持的文件类型 ${ext || '(无扩展名)'}；文本类扩展名：${[...SUPPORTED_EXT].join(' ')}`)
    }
    return await fs.readFile(p, 'utf8')
  }
  throw new Error('需要提供 text 或 filePath（内容不能为空）')
}

function normProfile(p, fallback) {
  return PROFILES.includes(p) ? p : fallback
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // 1) 扫描：核心工具
  ctx.tools.register(
    defineTool({
      name: 'wd_scan',
      description:
        '写作纪律扫描：检测防御性写作（免责声明、能力自贬、拒绝式措辞、道歉、自我评价、说教劝退、推责给专业人士、合规姿态）、' +
        '元评论（社交尾巴、开场白、过程旁白、反问、修改过程残留）、软对冲（中英 hedges、模糊程度词、限定词堆叠）、' +
        '文体问题（绝对化、填充开头、LLM 套话、「不是X而是Y」、破折号过密、超长句）。' +
        '段落级判定：同段软对冲 ≥3 且无任何量化数据时升级为 ERROR。' +
        '学术 profile（academic）下 hedge 类自动降级为 INFO——学术 hedging 是正当表达，不做失败判定。' +
        '输入 text 或 filePath；返回 ERROR/WARN/INFO 计数、逐条命中（行号/段落/原文片段/动作建议）。',
      parameters: {
        text: { type: 'string', description: '要检查的文本（与 filePath 二选一）' },
        filePath: { type: 'string', description: '文本文件路径（.md/.txt/.tex/代码等；与 text 二选一）' },
        profile: {
          type: 'string',
          enum: PROFILES,
          description: '文档类型；影响 hedge/元评论类规则的降级策略。缺省用插件配置（默认 unknown）',
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
        const report = scan(text, {
          profile,
          severityMin: args?.severityMin ?? 'info',
          maxWarn: args?.maxWarn,
          maxHits: 2000,
        })
        if (args?.json) return JSON.stringify(report, null, 2)
        return formatReport(report, {
          verbose: args?.verbose ?? cfg.verboseByDefault,
          maxItems: Number.isFinite(args?.maxItems) ? args.maxItems : cfg.maxItems,
        })
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
        const lines = [`dsh-writing-discipline v${brief.version}｜profile=${brief.profile}｜规则 ${brief.count} 条`, '']
        lines.push('密度规则：' + brief.densityRules.map((d) => d.label).join(' / '))
        lines.push('')
        for (const r of brief.rules) {
          lines.push(`[${r.severity.toUpperCase().padEnd(5)} · ${r.kind} · ${r.action}] ${r.id} — ${r.label}${r.hasExample ? ' （带改写示例）' : ''}`)
        }
        lines.push('')
        lines.push('交付前自检（这几条工具判不了，只能人打勾）：')
        for (const item of brief.checklist) lines.push(`  [ ] ${item}`)
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
        filePath: { type: 'string', description: '文本文件路径' },
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
        const a = args?.original ?? (args?.originalPath ? await fs.readFile(path.resolve(args.originalPath), 'utf8') : '')
        const b = args?.revised ?? (args?.revisedPath ? await fs.readFile(path.resolve(args.revisedPath), 'utf8') : '')
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
        filePath: { type: 'string', description: '文件路径' },
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
        ].join('\n')
      },
    }),
  )

  ctx.logger?.info?.(`[dsh-writing-discipline] v${VERSION} loaded: 5 tools`)
}

export default { name, inject, apply }
