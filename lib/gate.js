// dsh-writing-discipline — 交付门禁
// 记账规则：每份文档按「内容 sha256」记账；只有 ERROR===0 的扫描才算通过。
// 文件一改 hash 就变，旧通行证自动失效——这是"起效"的关键，而不是靠 agent 记得调用。

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const DOC_EXT = new Set([
  '.docx', '.docm', '.dotx', '.pptx', '.pptm', '.xlsx', '.xlsm',
  '.pdf', '.md', '.markdown', '.txt', '.tex', '.rst',
])

const OFFICE_SOURCE = {
  '.pdf': ['.docx', '.docm', '.pptx', '.html', '.md', '.tex'],
}

export function isDocFile(p) {
  return DOC_EXT.has(path.extname(String(p || '')).toLowerCase())
}

export async function fingerprint(p) {
  try {
    const buf = await fs.readFile(p)
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
  } catch {
    return null
  }
}

export function createGate(config = {}) {
  const records = new Map() // realpath -> { hash, error, warn, profile, at, name, ext }
  const cfg = { mode: 'block', ...config }

  const key = (p) => path.resolve(String(p))

  return {
    get mode() {
      return cfg.mode
    },

    /** wd_scan 跑完就记账。 */
    async record(filePath, counts, profile) {
      if (!filePath) return null
      const p = key(filePath)
      const hash = await fingerprint(p)
      if (!hash) return null
      const entry = {
        hash,
        error: Number(counts?.error ?? 0),
        warn: Number(counts?.warn ?? 0),
        info: Number(counts?.info ?? 0),
        profile: profile ?? 'unknown',
        at: Date.now(),
        name: path.basename(p),
        ext: path.extname(p).toLowerCase(),
      }
      records.set(p, entry)
      return entry
    },

    /** 某人手动清账（改了文件后不想让旧记录干扰）。 */
    forget(filePath) {
      if (filePath) records.delete(key(filePath))
      else records.clear()
    },

    list() {
      return [...records.entries()].map(([p, v]) => ({ path: p, ...v, ageSeconds: Math.round((Date.now() - v.at) / 1000) }))
    },

    /** 单文件判定，返回 null 表示放行，否则返回拒绝理由。 */
    async inspect(filePath) {
      if (cfg.mode === 'off') return null
      const p = key(filePath)
      if (!isDocFile(p)) return null
      const ext = path.extname(p).toLowerCase()
      const rec = records.get(p)
      const hash = await fingerprint(p)

      if (rec && hash && rec.hash === hash) {
        if (rec.error > 0) {
          return `${path.basename(p)} 的最近一次扫描仍有 ERROR ${rec.error} 处（profile=${rec.profile}）。改完再跑 wd_scan，ERROR 归零才会放行。`
        }
        return null
      }

      if (rec && hash && rec.hash !== hash) {
        return `${path.basename(p)} 在扫描之后又被改动过（内容指纹变了）。重新跑 wd_scan({"filePath":${JSON.stringify(p)},"profile":"report"})。`
      }

      // 导出件（pdf 等）没有自己的记录时，认它的源文件：源文件通过即可放行。
      const sources = OFFICE_SOURCE[ext]
      if (sources) {
        const stem = p.slice(0, p.length - ext.length)
        for (const s of sources) {
          const src = stem + s
          const srcRec = records.get(key(src))
          if (srcRec && srcRec.error === 0) {
            const srcHash = await fingerprint(src)
            if (srcHash && srcRec.hash === srcHash) return null
          }
        }
        return `${path.basename(p)} 没有扫描记录，也没有通过扫描的源文件。先扫源文件（.docx 等）或直接扫这份 ${ext}，ERROR 为 0 再交付。`
      }

      return `${path.basename(p)} 尚未通过写作纪律扫描。先跑 wd_scan({"filePath":${JSON.stringify(p)},"profile":"report"})，按命中改完、复扫到 ERROR 0，present 才会放行。`
    },

    /** present 参数 → 拒绝理由（一次列全，别让 agent 一个个试）。 */
    async inspectPresentArgs(args) {
      const files = Array.isArray(args?.files) ? args.files : []
      const problems = []
      for (const f of files) {
        const p = typeof f === 'string' ? f : f?.path
        if (!p) continue
        const reason = await this.inspect(p)
        if (reason) problems.push(reason)
      }
      return problems
    },
  }
}

/** present 类工具名：默认只认 DSH 的 present，可配置追加。 */
export function isDeliveryTool(toolName, extra = []) {
  const name = String(toolName || '').toLowerCase()
  return name === 'present' || extra.map((x) => String(x).toLowerCase()).includes(name)
}
