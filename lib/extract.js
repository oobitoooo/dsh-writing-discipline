// dsh-writing-discipline — 文档文本抽取
// 目的：让 wd_scan 能直接吃 .docx/.pptx/.xlsx，而不是逼 agent 先写一堆 python 再复制粘贴。
// 零依赖：只用 node 内置 zlib 解析 ZIP 中央目录，再按 OOXML 的文本节点抽字。

import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const OFFICE_KIND = {
  '.docx': 'docx',
  '.docm': 'docx',
  '.dotx': 'docx',
  '.pptx': 'pptx',
  '.pptm': 'pptx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
}

const PLAIN_EXT = new Set([
  '.md', '.markdown', '.txt', '.rst', '.tex', '.log', '.json', '.yaml', '.yml',
  '.js', '.ts', '.mjs', '.cjs', '.py', '.ps1', '.sh', '.css', '.html', '.csv',
])

const MAX_BYTES = 40 * 1024 * 1024

export function officeKind(filePath) {
  return OFFICE_KIND[path.extname(filePath).toLowerCase()] ?? null
}

export function supportedExt(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return OFFICE_KIND[ext] !== undefined || PLAIN_EXT.has(ext)
}

/** 读任何受支持的文件，返回纯文本。 */
export async function extractText(filePath) {
  const p = path.resolve(filePath)
  const stat = await fs.stat(p)
  if (stat.size > MAX_BYTES) throw new Error(`文件过大（${(stat.size / 1048576).toFixed(1)} MB > 40 MB），请先抽正文再扫描`)
  const kind = officeKind(p)
  if (!kind) {
    if (!PLAIN_EXT.has(path.extname(p).toLowerCase())) {
      throw new Error(`不支持的文件类型 ${path.extname(p) || '(无扩展名)'}`)
    }
    return await fs.readFile(p, 'utf8')
  }
  const buf = await fs.readFile(p)
  return extractOffice(buf, kind)
}

export function extractOffice(buf, kind) {
  const entries = readEntries(buf)
  if (kind === 'docx') {
    const main = entries.find((e) => e.name === 'word/document.xml')
    if (!main) throw new Error('docx 缺少 word/document.xml')
    return ooxmlParagraphs(readEntry(buf, main))
  }
  if (kind === 'pptx') {
    const slides = entries
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
      .sort((a, b) => Number(a.name.match(/(\d+)/)[1]) - Number(b.name.match(/(\d+)/)[1]))
    if (!slides.length) throw new Error('pptx 没有幻灯片')
    return slides
      .map((s, i) => `【第 ${i + 1} 页】\n${ooxmlParagraphs(readEntry(buf, s))}`)
      .join('\n\n')
  }
  // xlsx：共享字符串 + 各表 inlineStr 文本
  const shared = entries.find((e) => e.name === 'xl/sharedStrings.xml')
  const parts = []
  if (shared) parts.push(ooxmlParagraphs(readEntry(buf, shared), { perNode: 'si' }))
  const sheets = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
  for (const sheet of sheets) {
    const text = ooxmlParagraphs(readEntry(buf, sheet))
    if (text.trim()) parts.push(text)
  }
  return parts.join('\n\n')
}

/** 取 XML 里的文本节点，按段落节点分段。 */
function ooxmlParagraphs(buf, opts = {}) {
  const xml = buf.toString('utf8')
  const nodeTag = opts.perNode ?? 'w:p'
  const tokenRe = new RegExp(`<${nodeTag}[ >][\\s\\S]*?</${nodeTag}>|<${nodeTag}/>`, 'g')
  const blocks = xml.match(tokenRe)
  const out = []
  if (blocks && blocks.length) {
    for (const block of blocks) {
      const text = collectText(block)
      if (text.trim()) out.push(text)
    }
  }
  if (!out.length) {
    const text = collectText(xml)
    if (text.trim()) out.push(text)
  }
  return out.join('\n\n')
}

function collectText(xml) {
  const re = /<(?:w|a|t):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|a|t):t>/g
  const pieces = []
  let m
  while ((m = re.exec(xml)) !== null) pieces.push(decodeEntities(m[1]))
  return pieces.join('')
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- zip

function findEOCD(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i
  }
  return -1
}

function readEntries(buf) {
  const eocd = findEOCD(buf)
  if (eocd < 0) throw new Error('不是有效的 Office 文件（找不到 zip 目录）')
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let i = 0; i < count; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    entries.push({ name, method, compSize, localOff })
    off += 46 + nameLen + extraLen + commentLen
  }
  if (!entries.length) throw new Error('Office 文件为空或结构异常')
  return entries
}

function readEntry(buf, entry) {
  const lo = entry.localOff
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('zip 局部头损坏')
  const nameLen = buf.readUInt16LE(lo + 26)
  const extraLen = buf.readUInt16LE(lo + 28)
  const start = lo + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + entry.compSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return zlib.inflateRawSync(data)
  throw new Error(`不支持的压缩方式 ${entry.method}`)
}
