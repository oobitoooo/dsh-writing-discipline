// dsh-writing-discipline — 规则引擎（纯函数，零依赖，可单测）
// 设计原则：
//  1) 只做确定性判定，不生成文风建议的替代文本；
//  2) 每条命中带 kind + action + 依据，方便调用方决定"删 / 改写 / 人工判"；
//  3) 学术场景下 hedge 属于正当表达，降级为 info，不参与失败判定。

import { ZH_PROFILES, ZH_PROFILE_LABELS, zhRulesFor, zhMetrics, isZhText } from './zh.js'

export const VERSION = '0.4.0'

/** 通用 profile + 中文语域 profile（gov/tech/support/marketing/media） */
export const PROFILES = ['chat', 'report', 'readme', 'email', 'academic', 'comment', ...ZH_PROFILES, 'unknown']

/** 严重度排序，越大越严重 */
const SEV_ORDER = { info: 0, warn: 1, error: 2 }
const SEV_LABEL = { info: 'INFO', warn: 'WARN', error: 'ERROR' }

/**
 * 规则表。
 * patterns: 每个模式单独编译，flags 默认 'iu'（u 让中文与 emoji 安全）。
 * severity: error | warn | info
 * demoteIn: 这些 profile 下降一级（学术语境的正当 hedging / 修辞）
 * action: CUT（整句删）| TIGHTEN（压缩）| REFRAME（改写成事实）| REVIEW（人工判）
 */
export const RULES = [
  // ---------- 防御性：自我指认 / 拒绝 / 道歉 ----------
  {
    id: 'defensive.self-reference',
    label: '能力自贬（自我指认）',
    kind: 'defensive',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '作为(?:一个|一名)?\\s*(?:AI|人工智能|大?语言模型|智能助手|助手|机器人)',
      '我(?:只|仅)?是(?:一个|一名)?\\s*(?:AI|语言模型|助手)',
      '\\bas an? (?:ai|language model|assistant|chatbot)\\b',
      "\\bi'?m (?:just )?an? (?:ai|language model|assistant)\\b",
    ],
    advice: '删掉自我指认，直接从结论开始。读者要的是结果，不是你的身份声明。',
  },
  {
    id: 'defensive.refusal',
    label: '拒绝式措辞',
    kind: 'defensive',
    severity: 'error',
    action: 'REFRAME',
    patterns: [
      '我(?:无法|不能|不便|没办法|不会|做不到)',
      '(?:不予|拒绝)(?:回答|提供|协助|受理)',
      "\\bi (?:can'?t|cannot|won'?t|am unable to|am not able to)\\b",
      "\\b(i am|i'?m) (?:not|un)able to\\b",
    ],
    advice: '改写成具体动作、缺失参数或前置条件。拒绝不是交付物。',
  },
  {
    id: 'defensive.apology',
    label: '道歉',
    kind: 'defensive',
    severity: 'error',
    action: 'CUT',
    patterns: ['很?抱歉', '对不起', '^\\s*抱歉', "\\bi'?m sorry\\b", '\\bi apologi[sz]e\\b', '^\\s*sorry[,.!，。]'],
    advice: '删掉道歉，直接给正确内容。',
  },
  {
    id: 'defensive.self-deprecation',
    label: '自我评价 / 预告错误',
    kind: 'defensive',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '能力有限|水平有限|才疏学浅|不揣浅陋',
      '如有(?:疏漏|错误|遗漏|不当)(?:之处)?',
      '个人观点',
      '未必(?:完全)?(?:准确|正确)',
      '\\bbarely\\b',
      "\\bi'?m no expert\\b",
      '\\bto the best of my (?:knowledge|ability)\\b',
      '\\b(?:any )?(?:errors|mistakes) (?:are|remain) my own\\b',
    ],
    advice: '删掉；有错就改，不预告错误。',
  },
  // ---------- 免责 / 说教 ----------
  {
    id: 'defensive.disclaimer',
    label: '免责声明',
    kind: 'defensive',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '仅供参考',
      '不构成.{0,8}(?:建议|意见|承诺)',
      '本(?:回答|内容|信息|文|方案)(?:仅|只)',
      '免责声明',
      '风险(?:自担|自负)',
      '\\bfor (?:educational|informational|reference) purposes only\\b',
      '\\bnot (?:legal|medical|financial|professional) advice\\b',
      '\\bdisclaimer\\b',
      '\\bno warranty\\b',
      '\\buse at your own risk\\b',
    ],
    advice: '整句删除。真实约束改写成「条件 → 后果」的事实句。',
  },
  {
    id: 'moralizing.exhortation',
    label: '说教劝退',
    kind: 'moralizing',
    severity: 'error',
    action: 'TIGHTEN',
    patterns: [
      '请注意',
      '温馨(?:提示|提醒)',
      '务必(?:确保|注意|确认)',
      '请(?:务必)?(?:确保|理解|知悉|牢记)',
      '建议(?:您|你)?(?:谨慎|小心|妥善)',
      '(?:严禁|切勿|切忌)',
      '\\bplease (?:note|be aware|ensure|make sure)\\b',
      '\\balways (?:make sure|ensure|remember)\\b',
      '\\bnever (?:do|use|forget)\\b',
    ],
    advice: '换成参数、阈值、前置条件或回滚步骤——给条件，不给姿态。',
    demoteIn: ['academic'],
  },
  {
    id: 'moralizing.push-to-professional',
    label: '推责给专业人士',
    kind: 'moralizing',
    severity: 'error',
    action: 'REFRAME',
    patterns: [
      '建议(?:您|你)?(?:咨询|寻求|联系).{0,12}(?:专业人士|律师|医生|专家|机构|客服)',
      '\\bconsult (?:a|your) (?:professional|doctor|lawyer|expert|adviser)\\b',
    ],
    advice: '给出具体判据，让读者自己就能判断；判据才可执行。',
  },
  {
    id: 'moralizing.compliance-posture',
    label: '合规姿态',
    kind: 'moralizing',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '出于(?:安全|伦理|合规|法律)(?:考虑|原因)',
      '在(?:合法|合规|授权)的?前提下',
      '本着.{0,8}(?:负责|谨慎|安全)',
      '\\bfor (?:safety|compliance|ethical) reasons\\b',
    ],
    advice: '删掉姿态，留事实与步骤。',
  },
  // ---------- 社交尾巴 / 元评论 / 旁白 ----------
  {
    id: 'meta.social-tail',
    label: '社交尾巴',
    kind: 'meta',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '希望(?:以上|这些|这个|本文).{0,10}(?:帮助|有用)',
      '如(?:还)?有(?:其他|更多)(?:问题|需要|疑问)',
      '随时(?:告诉我|联系|找我)',
      '欢迎(?:批评|指正)|请(?:批评)?指正',
      '\\bhope (?:this|that) helps\\b',
      '\\bfeel free to\\b',
      '\\blet me know if\\b',
      '\\bin conclusion\\b',
      '\\bto conclude\\b',
    ],
    advice: '删掉客套。交付完成即结束，不需要社交缓冲。',
  },
  {
    id: 'meta.opener',
    label: '元评论开场白',
    kind: 'meta',
    severity: 'warn',
    action: 'CUT',
    patterns: [
      '需要?(?:特别)?指出的是',
      '值得(?:一提|注意)的?是',
      '不得不说',
      '客观(?:地)?(?:说|讲)',
      "\\bit'?s (?:important|worth) (?:to note|noting)\\b",
      '\\bit should be noted\\b',
      '\\bneedless to say\\b',
      '\\bg(generally|enerally) speaking\\b',
    ],
    advice: '直接陈述内容本身，删掉开场白。',
    demoteIn: ['academic'],
  },
  {
    id: 'meta.self-narration',
    label: '过程旁白',
    kind: 'meta',
    severity: 'error',
    action: 'CUT',
    patterns: [
      '首先(?:我)?(?:需要|要)(?:了解|确认|弄清)',
      '接下来(?:我)?(?:将|会)',
      '我将(?:为您|为你|为你)',
      '下面我(?:来|将)',
      '让(?:我|我们)(?:先)?(?:想想|看看|梳理)',
      '\\blet me (?:think|first|check)\\b',
      '\\bi will now\\b',
    ],
    advice: '删掉旁白，直接给结果。需要展示推理时用「依据 → 判断 → 动作」。',
  },
  {
    id: 'meta.question-back',
    label: '反问/请示',
    kind: 'meta',
    severity: 'warn',
    action: 'REFRAME',
    patterns: [
      '要不要我(?:帮你|来|继续)',
      '需要我.{0,10}吗[？?]',
      '你是不是(?:想|要)',
      '\\bwould you like me to\\b',
      '\\bshall i\\b',
    ],
    advice: '能自己决定就直接做；确需选择时给一个默认项 + 一个替代项。',
  },
  {
    id: 'meta.process-residue',
    label: '修改过程残留',
    kind: 'meta',
    severity: 'warn',
    action: 'CUT',
    patterns: [
      '(?:本轮|上一版|前一版|初稿中|刚才)[^。\\n]{0,12}(?:修改|调整|删除|加入)',
      '根据(?:你的|您的要求|你的要求)',
      '按(?:你说的|您说的|要求)',
      '本次(?:修改|调整|更新)',
      '\\bas requested\\b',
      '\\bper your request\\b',
      '\\b(?:i|we) (?:changed|updated|removed|added)\\b',
    ],
    advice: '成品里不留施工痕迹。改动说明写在变更记录，不写在正文。',
    demoteIn: ['academic', 'review'],
  },
  // ---------- 对冲 / 空泛 ----------
  {
    id: 'hedge.zh',
    label: '软对冲（中文）',
    kind: 'hedge',
    severity: 'warn',
    action: 'TIGHTEN',
    patterns: ['可能', '或许', '也许', '大概', '似乎', '应该是', '大约', '大致', '倾向于', '未必'],
    advice: '有数据就量化；没数据就写样本量与方向，不要用语气词代替证据。',
    demoteIn: ['academic'],
  },
  {
    id: 'hedge.en',
    label: '软对冲（英文）',
    kind: 'hedge',
    severity: 'warn',
    action: 'TIGHTEN',
    patterns: ['\\bprobably\\b', '\\bperhaps\\b', '\\bmaybe\\b', '\\bsomewhat\\b', '\\barguably\\b', '\\bit seems\\b', '\\bpresumably\\b', '\\bto some extent\\b'],
    advice: 'Quantify it or bound it. Hedges stack up into noise.',
    demoteIn: ['academic'],
  },
  {
    id: 'hedge.vague-degree',
    label: '模糊程度词',
    kind: 'hedge',
    severity: 'warn',
    action: 'TIGHTEN',
    patterns: ['一定程度上', '某种程度上', '在很大程度(?:上)?', '基本上', '总体来说', '相对来说', '总体而言', '\\bfairly\\b', '\\bquite\\b', '\\brather\\b'],
    advice: '程度词要么换成数字，要么整句删。',
    demoteIn: ['academic'],
  },
  {
    id: 'hedge.stacking',
    label: '限定词堆叠',
    kind: 'hedge',
    severity: 'error',
    action: 'TIGHTEN',
    patterns: [
      '可能(?:会)?(?:或许|也许)',
      '或许可能',
      '也许大概',
      '\\bmay (?:potentially|possibly|conceivably)\\b',
      '\\bcould (?:potentially|possibly|conceivably)\\b',
      '\\bmight (?:possibly|potentially)\\b',
      '\\bit is possible that.{0,24}\\bmay\\b',
    ],
    advice: '一条判断只保留一层限定。多层限定是防御饱和，不是严谨。',
  },
  {
    id: 'defensive.claim-disclaimer',
    label: '防御性声明（提前堵嘴）',
    kind: 'defensive',
    severity: 'error',
    action: 'REFRAME',
    patterns: [
      '(?:我们|本文|本研究)(?:并)?不(?:声称|主张|试图证明)',
      '本文(?:无意|不打算)',
      "\\bwe (?:do not|don'?t) claim\\b",
      '\\bwe make no claim\\b',
      '\\bthis (?:paper|study|work) does not attempt\\b',
    ],
    advice: '用「证据支持到什么边界」正面表达，替代「我们不声称 X」。',
  },
  {
    id: 'style.absolute',
    label: '绝对化断言',
    kind: 'style',
    severity: 'warn',
    action: 'REVIEW',
    patterns: ['一定(?:能|会|是)', '必然', '绝对(?:能|会|正确)', '毫无疑问', '百分之百', '\\bundoubtedly\\b', '\\bobviously\\b', '\\bof course\\b', '\\bclearly the best\\b'],
    advice: '绝对化要证据兜底；没有证据就降为可检验的表述。',
    demoteIn: ['academic'],
  },
  {
    id: 'style.filler-opener',
    label: '填充式开头',
    kind: 'style',
    severity: 'warn',
    action: 'CUT',
    patterns: ['^\\s*好的[，,。]', '^\\s*当然[，,]', '^\\s*没问题[，,！!]', '^\\s*(?:Sure|Certainly|Of course)[,!.]'],
    advice: '直接从结论开始。',
  },
  {
    id: 'style.llm-ism-zh',
    label: 'LLM 套话（中文）',
    kind: 'style',
    severity: 'warn',
    action: 'CUT',
    patterns: ['赋能', '抓手', '闭环', '颗粒度', '底层逻辑', '组合拳', '打法', '护城河', '让我们(?:一起)?(?:深入)?探讨', '在当今(?:这个)?(?:快速|飞速)'],
    advice: '套话换成人话：谁、做什么、多久、怎么验收。',
  },
  {
    id: 'style.llm-ism-en',
    label: 'LLM 套话（英文）',
    kind: 'style',
    severity: 'warn',
    action: 'CUT',
    patterns: ['\\bdelve\\b', '\\btapestry\\b', '\\btestament to\\b', '\\bin the realm of\\b', '\\bnavigat(?:e|ing) the (?:complex|landscape)\\b', '\\bunlock the (?:power|potential)\\b'],
    advice: 'Write the claim, not the vibe.',
  },
  {
    id: 'style.not-x-but-y',
    label: '「不是X而是Y」句式',
    kind: 'style',
    severity: 'warn',
    action: 'REVIEW',
    patterns: ['不是[^。\\n]{1,16}(?:而)?是[^。\\n]{1,24}', '\\bnot (?:just|only) [^.]{1,30}\\bbut\\b'],
    advice: '对比句式用一次是强调，连用三次就是套路。数一数全文出现几次。',
    demoteIn: ['academic'],
  },
  {
    id: 'structure.preamble',
    label: '铺垫式开头',
    kind: 'style',
    severity: 'warn',
    action: 'REFRAME',
    patterns: [
      '^\\s*随着[^。\\n]{0,20}(?:发展|进步|普及|来临|到来)',
      '^\\s*在当今[^。\\n]{0,16}(?:时代|背景|环境|社会)',
      '^\\s*近年来[，,]',
      '^\\s*众所周知',
      '^\\s*不言而喻',
      '^\\s*(?:In recent years|Nowadays|In today' + "'" + 's)\\b',
      '^\\s*It is (?:well )?known that\\b',
    ],
    advice: '首段第一句放结论或数字。铺垫段整段删——读者不需要被带进场。',
  },
]

/** 段落级 / 全文级密度规则 */
export const DENSITY_RULES = [
  {
    id: 'density.hedge-per-paragraph',
    label: '段落软对冲密度过高',
    kind: 'hedge',
    severity: 'error',
    action: 'REVIEW',
    /** 同段 hedge 命中数达到该值、且全段无量化数据时升级 */
    threshold: 3,
    advice: '整段重写：结论 + 数据；确实证据不足时写明样本量与方向。',
  },
  {
    id: 'density.em-dash',
    label: '破折号过密',
    kind: 'style',
    severity: 'warn',
    action: 'REVIEW',
    /** 每千字符允许的破折号数量 */
    per1000: 6,
    advice: '破折号密度高是典型的模型味。改成句号或括号。',
  },
  {
    id: 'style.sentence-too-long',
    label: '超长句',
    kind: 'style',
    severity: 'warn',
    action: 'REVIEW',
    advice: '一句话只装一个判断。拆开。',
  },
]

/**
 * 改写示例：给的是「删完之后该长什么样」，不是「更温和的说法」。
 * 规则命中时一并输出——一个具体对照比十句建议有用。
 */
export const EXAMPLES = {
  'defensive.self-reference': {
    before: '作为一个 AI 助手，我认为这个方案可能可用。',
    after: '方案可用：灰度 5%，观察 30 分钟，错误率 >1% 自动回滚。',
  },
  'defensive.refusal': {
    before: '我无法确认这个接口是否稳定。',
    after: '该接口稳定性未验证——缺近 7 天 p99 数据，待补测。',
  },
  'defensive.apology': {
    before: '抱歉，上一条的路径写错了。',
    after: '路径更正：`/v2/orders`（上一条为 `/v1/order`）。',
  },
  'defensive.disclaimer': {
    before: '本内容仅供参考，具体以实际环境为准。',
    after: '适用前提：Linux 5.15+、Postgres 14+；其他版本先跑 `verify.sh`。',
  },
  'defensive.self-deprecation': {
    before: '能力有限，如有疏漏请指正。',
    after: '（删除；有错直接改，不预告错误）',
  },
  'defensive.claim-disclaimer': {
    before: '我们不声称该方法适用于所有场景。',
    after: '本方法的证据边界：单站点、样本 n=1200、观察期 6 个月。',
  },
  'moralizing.exhortation': {
    before: '请注意，生产环境操作存在风险，建议谨慎。',
    after: '变更窗口 02:00–04:00；先在 staging 跑同一份 `deploy.sh`，比对 `diff -r` 输出。',
  },
  'moralizing.push-to-professional': {
    before: '建议您咨询专业人士后再操作。',
    after: '判据：RPO ≤ 5 min 且备份可恢复到 T-1 才允许执行；否则先补备份。',
  },
  'meta.social-tail': {
    before: '希望对您有帮助，如有其他问题随时联系我。',
    after: '（删除；交付完成即结束）',
  },
  'meta.self-narration': {
    before: '首先我需要了解你的环境，接下来我将给出方案。',
    after: '方案见下，按 env=prod / staging 两栏给参数。',
  },
  'hedge.stacking': {
    before: '这样可能会或许有一定程度的提升。',
    after: 'P95 从 840 ms 降到 210 ms（n=12000，2026-10-28 压测）。',
  },
  'hedge.zh': {
    before: '性能可能有比较明显的提升。',
    after: 'P95 840 ms → 210 ms（n=12000）。样本 n=3 时方向一致但不足以定论。',
  },
  'structure.preamble': {
    before: '随着人工智能技术的快速发展，越来越多的团队开始关注效率问题。',
    after: '构建耗时 14 分钟，其中 62% 在依赖解析——这是本次要压的部分。',
  },
  'density.hedge-per-paragraph': {
    before: '可能有效，或许更快，也许更省资源，应该不错。',
    after: '构建耗时从 14 min 降到 6 min（n=20 次，同一台机器）。证据不足处写「样本 n=3，方向一致」。',
  },
}

/** 交付前自检清单（工具无法自动判定的部分，只能人来打勾） */
export const CHECKLIST = [
  '首段第一句是结论或数字，不是铺垫',
  '全文 ERROR 计数 = 0',
  '每个「提示 / 建议」都已改写成参数、阈值或步骤',
  '没有「我 / 本回答 / 以上内容」这类指代自身的句子',
  '删掉任意一句后信息量不变 → 该句删掉',
  '涉及风险时给的是条件与后果（if → then），不是劝告',
]

const AUTOFLAGS = 'giu'
function compile(pattern) {
  try {
    return new RegExp(pattern, AUTOFLAGS)
  } catch {
    return null
  }
}

const COMPILED = RULES.map((rule) => ({
  ...rule,
  example: EXAMPLES[rule.id] ?? null,
  regexes: rule.patterns.map(compile).filter(Boolean),
}))

const DEMOTE = { error: 'warn', warn: 'info', info: 'info' }

function severityFor(rule, profile) {
  if (Array.isArray(rule.demoteIn) && rule.demoteIn.includes(profile)) {
    return DEMOTE[rule.severity] ?? rule.severity
  }
  return rule.severity
}

/** 段内是否含可量化证据（有则不算"用语气词代替证据"） */
const QUANT = /[0-9０-９]|百分之|n\s*=\s*\d|‰|%|毫秒|毫米|分钟|小时|倍|ms\b|kg\b|km\b|GB\b|MB\b|TB\b|\d+\s*(?:条|例|次|人|个|天|年|月|周|秒|QPS)/i

function splitSentences(line) {
  return line
    .split(/(?<=[。！？!?；;])|(?<=\.\s)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function excerpt(line, start, end, pad = 24) {
  const a = Math.max(0, start - pad)
  const b = Math.min(line.length, end + pad)
  return `${a > 0 ? '…' : ''}${line.slice(a, b)}${b < line.length ? '…' : ''}`
}

/**
 * 主扫描函数。
 * @param {string} text
 * @param {{profile?:string, severityMin?:'info'|'warn'|'error', maxHits?:number}} opts
 */
export function scan(text, opts = {}) {
  const profile = PROFILES.includes(opts.profile) ? opts.profile : 'unknown'
  const severityMin = SEV_ORDER[opts.severityMin] !== undefined ? opts.severityMin : 'info'
  const maxHits = Number.isFinite(opts.maxHits) ? Math.max(1, Math.floor(opts.maxHits)) : 500
  const maxWarn = Number.isFinite(opts.maxWarn) ? Math.max(0, Math.floor(opts.maxWarn)) : null

  const src = String(text ?? '')
  // locale: 'auto' 按中文占比自动判断；'zh' 强制启用中文层；'en' 关闭
  const locale = ['auto', 'zh', 'en'].includes(opts.locale) ? opts.locale : 'auto'
  const zhEnabled = locale === 'zh' || (locale === 'auto' && isZhText(src))
  const activeRules = zhEnabled ? COMPILED.concat(zhRulesFor(profile)) : COMPILED
  const lines = src.split('\n')
  // 代码围栏与行内代码里的是「引用/示例」，不是作者自己的行文：遮蔽后不参与匹配
  let fence = false
  const maskedLines = lines.map((line) => {
    const t = line.trim()
    if (/^(```|~~~)/.test(t)) {
      fence = !fence
      return ' '.repeat(line.length)
    }
    if (fence) return ' '.repeat(line.length)
    return line
      .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
      // 「」/“”里的内容是在引用别人的话（或被引作反例），不算作者自己的行文
      .replace(/「[^」]*」|“[^”]*”/g, (m) => ' '.repeat(m.length))
  })
  const hits = []

  // 段落切分（同时保留在该段落内的行号范围，用于行号回报）
  const paragraphs = []
  let cur = { start: 0, text: '', raw: '' }
  for (let i = 0; i < lines.length; i++) {
    if (maskedLines[i].trim() === '') {
      if (cur.text.trim()) paragraphs.push(cur)
      cur = { start: i + 1, text: '', raw: '' }
    } else {
      if (!cur.text) cur.start = i
      cur.text += maskedLines[i] + '\n'
      cur.raw += lines[i] + '\n'
    }
  }
  if (cur.text.trim()) paragraphs.push(cur)

  let paraIndex = 0
  for (let li = 0; li < lines.length; li++) {
    const line = maskedLines[li]
    const rawLine = lines[li]
    if (!line.trim()) continue
    if (rawLine.includes('dsh-wd:ignore')) continue
    if (!paragraphs[paraIndex] || li < paragraphs[paraIndex].start) {
      const p = paragraphs.findIndex((pp) => li >= pp.start && li < pp.start + pp.text.split('\n').length)
      if (p >= 0) paraIndex = p
    }

    for (const rule of activeRules) {
      for (const re of rule.regexes) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(line)) !== null) {
          const severity = severityFor(rule, profile)
          if (SEV_ORDER[severity] >= SEV_ORDER[severityMin]) {
            hits.push({
              ruleId: rule.id,
              label: rule.label,
              kind: rule.kind,
              severity,
              action: rule.action,
              line: li + 1,
              column: m.index + 1,
              paragraph: paraIndex,
              match: m[0],
              excerpt: excerpt(rawLine, m.index, m.index + m[0].length),
              advice: rule.advice,
              example: rule.example ?? null,
            })
          }
          if (m.index === re.lastIndex) re.lastIndex++
          if (m[0].length === 0) re.lastIndex++
          if (hits.length >= maxHits) break
        }
        if (hits.length >= maxHits) break
      }
      if (hits.length >= maxHits) break
    }
    if (hits.length >= maxHits) break
  }

  // ---- 段落级：软对冲密度 ----
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const hedgeHits = hits.filter((h) => h.paragraph === i && h.kind === 'hedge')
    if (hedgeHits.length >= 3 && !QUANT.test(p.text)) {
      const rule = DENSITY_RULES[0]
      hits.push({
        ruleId: rule.id,
        label: rule.label,
        kind: rule.kind,
        severity: rule.severity,
        action: rule.action,
        line: p.start + 1,
        column: 1,
        paragraph: i,
        match: `${hedgeHits.length} 处软对冲 / 0 处量化数据`,
        excerpt: (p.raw || p.text).replace(/\s+/g, ' ').trim().slice(0, 120),
        advice: rule.advice,
        example: EXAMPLES[rule.id] ?? null,
        density: true,
      })
    }
  }

  // ---- 全文级：破折号密度 ----
  {
    const chars = maskedLines.join('\n').replace(/\s/g, '').length || 1
    const dashes = (maskedLines.join('\n').match(/—|--/g) || []).length
    const per1000 = (dashes / chars) * 1000
    if (chars > 150 && per1000 > DENSITY_RULES[1].per1000) {
      hits.push({
        ruleId: DENSITY_RULES[1].id,
        label: DENSITY_RULES[1].label,
        kind: DENSITY_RULES[1].kind,
        severity: DENSITY_RULES[1].severity,
        action: DENSITY_RULES[1].action,
        line: 0,
        column: 0,
        paragraph: -1,
        match: `${dashes} 个破折号 / ${per1000.toFixed(1)} 每千字符`,
        excerpt: '（全文统计）',
        advice: DENSITY_RULES[1].advice,
        density: true,
      })
    }
  }

  // ---- 全文级：超长句 ----
  {
    let worst = null
    for (let li = 0; li < maskedLines.length; li++) {
      for (const s of splitSentences(maskedLines[li])) {
        const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length
        const en = (s.match(/[A-Za-z0-9']+/g) || []).length
        const score = zh + en * 1.6
        if (!worst || score > worst.score) worst = { score, line: li + 1, len: s.length, snippet: s.slice(0, 60), zh, en }
      }
    }
    if (worst && (worst.zh > 55 || worst.en > 34)) {
      hits.push({
        ruleId: DENSITY_RULES[2].id,
        label: DENSITY_RULES[2].label,
        kind: DENSITY_RULES[2].kind,
        severity: DENSITY_RULES[2].severity,
        action: DENSITY_RULES[2].action,
        line: worst.line,
        column: 1,
        paragraph: -1,
        match: `最长句 ${worst.len} 字符（中文 ${worst.zh} 字 / 英文 ${worst.en} 词）`,
        excerpt: worst.snippet,
        advice: DENSITY_RULES[2].advice,
        density: true,
      })
    }
  }

  // ---- 中文层：逗号链 / 中文超长句 ----
  const zh = zhEnabled ? zhMetrics(src) : null
  if (zhEnabled && zh) {
    if (zh.commaChainMax >= 5) {
      hits.push({
        ruleId: 'zh-density.comma-chain',
        label: '逗号链过长',
        kind: 'zh-punct',
        severity: 'warn',
        action: 'REFRAME',
        line: 0,
        column: 0,
        paragraph: -1,
        match: `单句最多 ${zh.commaChainMax} 个逗号`,
        excerpt: '（全文统计）',
        advice: '一句话里逗号超过 4 个，说明你在一句里塞了三个判断。按判断拆句。',
        example: {
          before: '该系统上线后，用户反馈良好，客服压力下降，运维成本降低，团队信心提升。',
          after: '上线后工单量从日均 320 降到 190。运维成本下降 18%（n=3 个月）。',
        },
        density: true,
      })
    }
    if (zh.maxSentenceZh >= 60) {
      hits.push({
        ruleId: 'zh-density.long-sentence',
        label: '中文超长句',
        kind: 'zh-redundancy',
        severity: 'warn',
        action: 'REFRAME',
        line: 0,
        column: 0,
        paragraph: -1,
        match: `最长句 ${zh.maxSentenceZh} 字（建议 ≤ 45）`,
        excerpt: '（全文统计）',
        advice: '中文一句话超过 45 字就开始回读。拆成两句，或删掉中间的修饰。',
        density: true,
      })
    }
  }

  const counts = { error: 0, warn: 0, info: 0 }
  for (const h of hits) counts[h.severity]++

  const byKind = {}
  for (const h of hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1

  return {
    version: VERSION,
    profile,
    locale: locale === 'auto' ? (zhEnabled ? 'zh' : 'en') : locale,
    zh,
    stats: stats(src),
    counts,
    byKind,
    warnBudget: maxWarn,
    ok: counts.error === 0 && (maxWarn === null || counts.warn <= maxWarn),
    hits,
  }
}

/** 文本统计（不依赖规则命中，可作为独立指标） */
export function stats(text) {
  const src = String(text ?? '')
  const zhChars = (src.match(/[\u4e00-\u9fa5]/g) || []).length
  const enWords = (src.match(/[A-Za-z][A-Za-z'-]*/g) || []).length
  const sentences = (src.match(/[。！？!?]+|\.\s|[.!?]$/g) || []).length || (src.trim() ? 1 : 0)
  const paragraphs = src.split(/\n\s*\n/).filter((p) => p.trim()).length
  const units = Math.max(1, zhChars + enWords)
  const hedge = (src.match(/可能|或许|也许|大概|似乎|应该是|probably|perhaps|maybe|somewhat|arguably/gi) || []).length
  const dash = (src.match(/—|--|–/g) || []).length
  return {
    chars: src.replace(/\s/g, '').length,
    zhChars,
    enWords,
    sentences,
    paragraphs,
    avgSentence: sentences ? Math.round(units / sentences) : 0,
    hedgePer1000: Number(((hedge / units) * 1000).toFixed(1)),
    dashPer1000: Number(((dash / Math.max(1, src.replace(/\s/g, '').length)) * 1000).toFixed(1)),
    zh: zhMetrics(src),
  }
}

// ---------------- 确定性改写 ----------------
/**
 * 只做三件有把握的事，且永不删除含数字/引用/图表的句子：
 *  1) 剥离开头/句首的防御性引子（请注意、需要注意的是、好的，…）
 *  2) 压缩限定词堆叠（可能或许 → 可能；may potentially → may）
 *  3) 删除纯防御句（整句只承担免责/客套功能，且不含任何量化或引用信息）
 */
const PREFIX_STRIPS = [
  /^\s*(?:好的|当然|没问题)[，,。！!]\s*/u,
  /^\s*请注意[，,：:]?\s*/u,
  /^\s*温馨提示[：:]\s*/u,
  /^\s*需要?(?:特别)?指出的是[，,：:]?\s*/u,
  /^\s*值得(?:一提|注意)的?是[，,：:]?\s*/u,
  /^\s*(?:需要|值得)说明的?是[，,：:]?\s*/u,
]

const HEDGE_COLLAPSE = [
  [/可能(?:会)?(?:或许|也许)/gu, '可能'],
  [/或许可能/gu, '可能'],
  [/也许大概/gu, '也许'],
  [/\bmay potentially\b/gi, 'may'],
  [/\bcould potentially\b/gi, 'could'],
  [/\bmight possibly\b/gi, 'might'],
  [/\bit is possible that\b/gi, 'it is possible that'],
]

const PURE_DEFENSIVE = [
  /^[^。！？!?\n]{0,40}(?:仅供参考|不构成.{0,8}建议|如有疏漏|能力有限|希望.{0,10}帮助|随时(?:告诉我|联系))[^。！？!?\n]{0,20}[。！？!?]?$/u,
  /^\s*(?:很?抱歉|对不起)[^。\n]{0,40}[。，,]?\s*$/u,
  /^\s*(?:hope (?:this|that) helps|feel free to [^.\n]{0,40})[.!]?\s*$/iu,
]

const KEEP_IF = /\d|\[\^|\[@|\\cite|图\s*\d|表\s*\d|Fig\.?\s*\d|Table\s*\d|https?:\/\//i

export function rewrite(text) {
  const src = String(text ?? '')
  const changes = []
  const lines = src.split('\n')
  const out = []

  for (const original of lines) {
    if (!original.trim()) {
      out.push(original)
      continue
    }
    let line = original
    for (const re of PREFIX_STRIPS) {
      if (re.test(line)) {
        const next = line.replace(re, '')
        if (next !== line) {
          changes.push({ type: 'strip-prefix', before: line.trim(), after: next.trim() })
          line = next
        }
      }
    }
    for (const [re, to] of HEDGE_COLLAPSE) {
      const next = line.replace(re, to)
      if (next !== line) {
        changes.push({ type: 'collapse-hedge', before: line.trim(), after: next.trim() })
        line = next
      }
    }
    // 纯防御句删除（保守：含数字/引用/链接一律保留）
    const sentences = line.split(/(?<=[。！？!?])/u)
    const kept = []
    for (const s of sentences) {
      const isPure = PURE_DEFENSIVE.some((re) => re.test(s.trim()))
      if (isPure && !KEEP_IF.test(s)) {
        changes.push({ type: 'drop-sentence', before: s.trim(), after: '' })
        continue
      }
      kept.push(s)
    }
    const joined = kept.join('')
    if (joined !== line) line = joined
    out.push(line)
  }

  const result = out.join('\n')
  return {
    text: result,
    changed: changes.length > 0,
    changes,
    after: scan(result),
  }
}

// ---------------- 守恒锁 ----------------
const TOKEN_PATTERNS = {
  number: /-?\d+(?:\.\d+)?(?:\s*(?:%|‰|ms|s|min|h|d|kg|g|mg|km|m|cm|mm|GB|MB|KB|TB|条|个|例|次|人|年|天|小时|分钟|秒|倍))?/g,
  cite: /\[@[^\]]+\]|\\cite[tp]?\{[^}]+\}|\([A-Z][A-Za-z'-]+(?:\s+et al\.?)?,\s*\d{4}[a-z]?\)/g,
  ref: /(?:图|表|式)\s*\d+(?:[.-]\d+)?|\b(?:Fig(?:ure)?\.?|Table|Eq(?:uation)?\.?)\s*\d+(?:[.-]\d+)?/g,
  doi: /\b10\.\d{4,9}\/[^\s)]+/g,
  url: /https?:\/\/[^\s)]+/g,
}

const CLAIM_LADDER = [
  ['可能', '导致'],
  ['可能', '决定'],
  ['相关', '导致'],
  ['相关', '证明'],
  ['提示', '证明'],
  ['\\bassociated\\b', '\\bcaused\\b'],
  ['\\bcorrelated\\b', '\\bcauses?\\b'],
  ['\\bsuggest(?:s|ed)?\\b', '\\bproves?\\b'],
  ['\\bsuggest(?:s|ed)?\\b', '\\bdemonstrates?\\b'],
  ['\\bmay\\b', '\\bdoes\\b'],
]

const NEGATION = /不|没|未|无|非|never|not\b|no\b|none|without/gi

/** 否定复合词：原版有、改后没有 = 零结果被改写，属事实漂移 */
const NEGATION_COMPOUNDS = [
  '未见',
  '未发现',
  '未达到',
  '不显著',
  '无显著',
  '无差异',
  '不支持',
  'no significant',
  'no difference',
  'not significant',
  'did not',
]

function tokensOf(text, kind) {
  const out = new Set()
  const re = new RegExp(TOKEN_PATTERNS[kind].source, 'g')
  let m
  while ((m = re.exec(text)) !== null) out.add(m[0].trim())
  return out
}

function bigrams(s) {
  const t = s.replace(/\s/g, '')
  const set = new Set()
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2))
  return set
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * 守恒锁：改写/润色前后，事实层不允许漂移。
 * @returns {{ok:boolean, items:Array, counts:object}}
 */
export function conservation(original, revised) {
  const a = String(original ?? '')
  const b = String(revised ?? '')
  const items = []

  for (const kind of Object.keys(TOKEN_PATTERNS)) {
    const ta = tokensOf(a, kind)
    const tb = tokensOf(b, kind)
    for (const t of ta) {
      if (!tb.has(t)) {
        items.push({
          severity: 'error',
          kind: 'INVARIANT',
          ruleId: `conservation.${kind}-missing`,
          message: `${kind} 丢失或已被改写：${t}`,
          value: t,
        })
      }
    }
    for (const t of tb) {
      if (!ta.has(t)) {
        items.push({
          severity: 'warn',
          kind: 'CANDIDATE',
          ruleId: `conservation.${kind}-added`,
          message: `${kind} 新增：${t}（确认不是润色时臆造）`,
          value: t,
        })
      }
    }
  }

  // 主张强度漂移
  for (const [weak, strong] of CLAIM_LADDER) {
    const hasWeak = new RegExp(weak, 'i').test(a)
    const lostWeak = hasWeak && !new RegExp(weak, 'i').test(b)
    const gainedStrong = new RegExp(strong, 'i').test(b) && !new RegExp(strong, 'i').test(a)
    if (lostWeak && gainedStrong) {
      items.push({
        severity: 'error',
        kind: 'VIOLATION',
        ruleId: 'conservation.claim-ladder',
        message: `主张强度上调：原文「${weak}」→ 改后「${strong}」`,
        value: `${weak} -> ${strong}`,
      })
    }
  }

  // 否定复合词消失（零结果被"润色"掉是最常见的事实改写）
  for (const phrase of NEGATION_COMPOUNDS) {
    const ca = a.split(phrase).length - 1
    const cb = b.split(phrase).length - 1
    if (ca > 0 && cb === 0) {
      items.push({
        severity: 'error',
        kind: 'VIOLATION',
        ruleId: 'conservation.negation-removed',
        message: `否定表述「${phrase}」在改后文本中消失（原文 ${ca} 处）`,
        value: phrase,
      })
    }
  }

  // 段落级否定漂移
  const pa = a.split(/\n\s*\n/).filter((x) => x.trim())
  const pb = b.split(/\n\s*\n/).filter((x) => x.trim())
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const sim = jaccard(bigrams(pa[i]), bigrams(pb[i]))
    if (sim < 0.4) continue
    const na = (pa[i].match(NEGATION) || []).length
    const nb = (pb[i].match(NEGATION) || []).length
    if (na !== nb) {
      items.push({
        severity: 'error',
        kind: 'INVARIANT',
        ruleId: 'conservation.negation-drift',
        message: `第 ${i + 1} 段否定标记从 ${na} 变为 ${nb}（相似度 ${(sim * 100).toFixed(0)}%）`,
        value: `neg ${na} -> ${nb}`,
      })
    }
  }

  // 边界词消失
  const scopeWords = ['仅', '限于', '只', 'in this study', 'only', 'within', 'for the tested', '受限于']
  for (const w of scopeWords) {
    if (a.includes(w) && !b.includes(w)) {
      items.push({
        severity: 'warn',
        kind: 'CANDIDATE',
        ruleId: 'conservation.scope-boundary',
        message: `适用边界词「${w}」在改后文本中消失`,
        value: w,
      })
    }
  }

  const counts = { error: 0, warn: 0, info: 0 }
  for (const it of items) counts[it.severity] = (counts[it.severity] || 0) + 1

  return { ok: counts.error === 0, counts, items }
}

/** 把扫描结果渲染成紧凑报告（给工具输出用） */
export function formatReport(report, opts = {}) {
  const sevName = { error: '🔴', warn: '🟠', info: '🟡' }
  const lines = []
  const s = report.stats
  const head = report.ok
    ? `写作纪律检查：✅ 通过（ERROR 0 / WARN ${report.counts.warn} / INFO ${report.counts.info}${report.warnBudget !== null && report.warnBudget !== undefined ? `｜预算 ${report.warnBudget}` : ''}）`
    : `写作纪律检查：发现 ${report.hits.length} 处问题（ERROR ${report.counts.error} / WARN ${report.counts.warn} / INFO ${report.counts.info}${report.warnBudget !== null && report.warnBudget !== undefined && report.counts.error === 0 ? `｜WARN 超出预算 ${report.warnBudget}` : ''}）`
  lines.push(`${head}｜profile=${report.profile}`)
  lines.push(
    `统计：${s.chars} 字符（中文 ${s.zhChars} 字 + 英文 ${s.enWords} 词）／${s.paragraphs} 段／${s.sentences} 句／平均 ${s.avgSentence}／对冲密度 ${s.hedgePer1000}‰／破折号 ${s.dashPer1000}‰`,
  )
  if (report.hits.length === 0) return lines.join('\n')

  const order = { error: 0, warn: 1, info: 2 }
  const sorted = [...report.hits].sort((x, y) => order[x.severity] - order[y.severity] || x.line - y.line)
  const limit = Number.isFinite(opts.maxItems) ? opts.maxItems : 40
  for (const h of sorted.slice(0, limit)) {
    const loc = h.line > 0 ? `L${h.line}` : '全文'
    lines.push(`${sevName[h.severity]} [${SEV_LABEL[h.severity]} · ${h.kind} · ${h.action}] ${h.label} @ ${loc}`)
    lines.push(`    「${h.match}」  ${h.excerpt}`)
    if (opts.verbose !== false) {
      lines.push(`    → ${h.advice}`)
      // 具体对照：删完之后该长什么样，比"建议删掉"可执行得多
      if (h.example) {
        lines.push(`    ✗ ${h.example.before}`)
        lines.push(`    ✓ ${h.example.after}`)
      }
    }
  }
  if (sorted.length > limit) lines.push(`… 另有 ${sorted.length - limit} 条未列出（用 maxItems 调整）`)
  return lines.join('\n')
}

export function rulesBrief(profile = 'unknown') {
  const rows = RULES.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    severity: severityFor(r, profile),
    action: r.action,
    hasExample: Boolean(EXAMPLES[r.id]),
  }))
  return {
    version: VERSION,
    profile,
    count: rows.length,
    densityRules: DENSITY_RULES.map((d) => ({ id: d.id, label: d.label })),
    checklist: CHECKLIST,
    zh: {
      profiles: ZH_PROFILE_LABELS,
      active: zhRulesFor(profile).map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind,
        severity: r.severity,
        action: r.action,
        hasExample: Boolean(r.example),
      })),
    },
    rules: rows,
  }
}
