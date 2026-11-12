// dsh-writing-discipline — 中文语境专门适配层（zh-CN）
//
// 为什么单独一层：
//  1) 中英混合规则对中文语域的判定太粗：公文腔、客服腔、营销腔各自有固定句式，
//     这些和「AI 味」不是一回事，混在一起会互相压信号；
//  2) 中文的问题密度单位是「字」不是「词」：超长句、逗号链、长定语都只能按字算；
//  3) 中文标点与数字书写有硬规范（半角标点混入、阿拉伯数字与汉字数字混排），
//     这些规则在英文文本里没有意义。
//
// 设计约定：
//  - scopes = null 表示「所有语域通用」；给出数组则只在这些中文语域下生效。
//  - 在通用 profile（chat/report/...）下只跑通用规则，公文/客服/营销规则不参与，
//    避免把一个技术报告误判成公文。
//  - 所有规则都是 ERROR/WARN/INFO 三级 + action，与主规则表同构。

export const ZH_PROFILES = ['gov', 'tech', 'support', 'marketing', 'media']

export const ZH_PROFILE_LABELS = {
  gov: '公文 / 通报 / 请示',
  tech: '技术文档 / 方案 / 复盘',
  support: '客服 / 用户沟通',
  marketing: '营销文案 / 推广',
  media: '媒体稿 / 公众号',
}

/**
 * 中文语域规则。
 * severity: error | warn | info
 * action:   CUT（整句删）| TIGHTEN（压缩）| REFRAME（改成事实）| REVIEW（人工判）
 * scopes:   null = 通用；数组 = 仅该语域
 */
export const ZH_RULES = [
  // ================= 通用：中文冗余与病句 =================
  {
    id: 'zh.redundancy.nominalize',
    label: '名词化冗余（进行/加以 + 动词）',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: [
      '进行(?:了)?(?:一次|进一步|全面|深入)?的?(?:优化|调整|升级|改造|梳理|评估|排查|分析|讨论|研究)',
      '(?:加以|予以)(?:解决|处理|完善|改进|优化|规范)',
      '对[^。，\\n]{2,12}进行(?:了)?[^。，\\n]{0,6}(?:操作|处理)',
    ],
    advice: '动词直接落地：「进行了优化」→「优化了」。中文里"进行+名词"多数时候只是把动作泡发了。',
    example: {
      before: '我们对接口进行了优化，对缓存进行了调整。',
      after: '接口 P95 从 840 ms 降到 210 ms；缓存 TTL 从 300 s 调到 900 s。',
    },
  },
  {
    id: 'zh.redundancy.passive-suo',
    label: '「被…所」句式',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['被[^。，\\n]{1,10}所(?:接受|认可|采用|重视|忽视|限制|影响)'],
    advice: '「被…所」是文言残留，删掉「所」或直接改主动句。',
  },
  {
    id: 'zh.redundancy.empty-modifier',
    label: '空心修饰（相关的/一定的/相应的）',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'CUT',
    scopes: null,
    patterns: [
      '(?:相关|相应|一定|有关)的(?:工作|问题|内容|情况|部门|人员|措施)',
      '在(?:一定|很大)程度上',
    ],
    advice: '这类修饰不限定任何东西。要么给出范围（哪些部门、哪个区间），要么删。',
  },
  {
    id: 'zh.redundancy.de-chain',
    label: '长定语「的」链',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'REFRAME',
    scopes: null,
    patterns: ['[\\u4e00-\\u9fa5]{2,10}的[\\u4e00-\\u9fa5]{2,10}的[\\u4e00-\\u9fa5]{2,10}的'],
    advice: '一句话里三个「的」，读者要回读。拆成两句，或把修饰改成并列短句。',
  },
  {
    id: 'zh.redundancy.tautology',
    label: '语义重复（约…左右 / 超过…以上）',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: [
      '大约[^。，\\n]{0,6}左右',
      '大概[^。，\\n]{0,6}左右',
      '超过[^。，\\n]{0,6}以上',
      '截至[^。，\\n]{0,6}为止',
      '首先第一',
      '再次重申',
      '目的是为了',
    ],
    advice: '两个词表达同一个意思，留一个。',
  },
  {
    id: 'zh.redundancy.abstract-noun-stack',
    label: '抽象名词堆叠',
    kind: 'zh-redundancy',
    severity: 'warn',
    action: 'REFRAME',
    scopes: null,
    patterns: [
      '(?:能力|水平|质量|效率|价值|体系|机制|生态|格局|维度|层面)(?:的)?(?:提升|建设|打造|构建|优化)',
      '进一步(?:提升|加强|深化|完善|推动|促进)',
    ],
    advice: '「提升能力建设水平」= 什么都没说。换成谁、做了什么、指标动了多少。',
  },

  // ================= 中文结构：节奏与排比 =================
  {
    id: 'zh.structure.trinity',
    label: '三连排比（不仅…而且…更…）',
    kind: 'zh-structure',
    severity: 'warn',
    action: 'REFRAME',
    scopes: null,
    patterns: [
      '不仅[^。\\n]{2,24}(?:而且|还|并且)[^。\\n]{2,24}(?:更|甚至|尤其)',
      '既要[^。\\n]{2,20}又要[^。\\n]{2,20}还要',
      '一方面[^。\\n]{2,20}另一方面[^。\\n]{2,20}同时',
    ],
    advice: '排比是修辞，不是论证。三段并列里通常只有一段有证据，留下那段，其余删。',
    example: {
      before: '这套方案不仅提升了效率，而且降低了成本，更重塑了团队协作方式。',
      after: '构建耗时从 14 min 降到 6 min（n=20，同机）。协作方式未变。',
    },
  },
  // ================= 中文标点与书写 =================
  {
    id: 'zh.punct.halfwidth',
    label: '中文里的半角标点',
    kind: 'zh-punct',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['[\\u4e00-\\u9fa5][,;:?!](?![0-9A-Za-z])'],
    advice: '中文句子用全角「，；：？！」。半角混排在中英混排里看着专业，在中文句子里就是错。',
  },
  {
    id: 'zh.punct.repeat',
    label: '连续感叹号 / 问号',
    kind: 'zh-punct',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['[！!]{2,}', '[？?]{2,}'],
    advice: '一个就够。叠标点是情绪替代论据。',
  },
  {
    id: 'zh.punct.ellipsis',
    label: '省略号写法',
    kind: 'zh-punct',
    severity: 'info',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['\\.\\.\\.(?!\\.)', '。{3,}'],
    advice: '中文省略号是「……」六个点。',
  },
  {
    id: 'zh.num.mixed',
    label: '阿拉伯数字与汉字数字混排',
    kind: 'zh-punct',
    severity: 'info',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['(?:^|[^一二三四五六七八九十百千万亿0-9第])([二三四五六七八九十])(?=[个条项次人天])'],
    advice: '同一段里统一一种写法。统计数据用阿拉伯数字，成语与固定说法用汉字。',
  },

  // ================= 通用：中文对冲 =================
  {
    id: 'zh.hedge.classical',
    label: '文言式软对冲',
    kind: 'zh-hedge',
    severity: 'warn',
    action: 'TIGHTEN',
    scopes: null,
    patterns: ['恐怕', '兴许', '未必', '难免', '或多或少', '多多少少', '大体上', '大致上'],
    advice: '这类词把判断稀释成感觉。有数据给数据，没数据写样本量。',
  },
  {
    id: 'zh.hedge.discourse',
    label: '话语填充（从某种意义上说 / 就目前而言）',
    kind: 'zh-hedge',
    severity: 'warn',
    action: 'CUT',
    scopes: null,
    patterns: ['从某种意义上(?:来)?说', '就目前(?:而言|来看)', '在一定意义上', '客观来讲', '平心而论'],
    advice: '这些短语不改变任何主张，只推迟结论。删。',
  },

  // ================= 公文腔（gov） =================
  {
    id: 'zh.gov.notice-formula',
    label: '公文程式语',
    kind: 'zh-gov',
    severity: 'info',
    action: 'TIGHTEN',
    scopes: ['gov'],
    patterns: [
      '特此(?:通知|说明|函告|公告)',
      '现将(?:有关事项|有关情况|相关事宜)[^。\\n]{0,10}(?:通知|说明|印发|公布)如下',
      '请(?:遵照|认真|贯彻)执行',
      '妥否[，,]\\s*请批示',
      '以上(?:意见|报告)[^。\\n]{0,16}请(?:批转|审阅|批示)',
    ],
    advice: '公文/通报里这些是合规必须，保留；出现在方案、邮件、说明书里就是空转，删。判据是文种，不是个人偏好。',
  },
  {
    id: 'zh.gov.empty-slogan',
    label: '口号式动词串',
    kind: 'zh-gov',
    severity: 'warn',
    action: 'REFRAME',
    scopes: ['gov', 'media'],
    patterns: [
      '(?:高度|切实|认真|严格|全面|持续|深入|着力)(?:重视|抓好|落实|推进|加强|提升|深化)',
      '狠抓落实',
      '形成(?:长效)?机制',
      '打造[^。，\\n]{0,10}(?:高地|标杆|样板|品牌)',
      '取得(?:阶段性|显著)成效',
    ],
    advice: '口号串读完不知道发生了什么。补三件事：谁、做了什么、指标怎么变。',
    example: {
      before: '高度重视、狠抓落实，全面提升服务能力，取得阶段性成效。',
      after: '工单平均响应从 6.2 小时降到 1.4 小时；一次解决率 68% → 81%（n=3,400 单，2026 年 10 月）。',
    },
  },
  {
    id: 'zh.gov.legal-vague',
    label: '法规援引含糊',
    kind: 'zh-gov',
    severity: 'warn',
    action: 'REFRAME',
    scopes: ['gov'],
    patterns: ['(?:依照|根据|按照)(?:有关|相关)(?:法律|法规|规定|文件|精神)', '依据(?:上级|有关)(?:要求|部署|指示)'],
    advice: '援引要给到条款号或文号；「有关规定」等于没引。',
  },

  // ================= 客服腔（support） =================
  {
    id: 'zh.support.pet-name',
    label: '客服称呼（亲 / 宝子）',
    kind: 'zh-support',
    severity: 'warn',
    action: 'CUT',
    scopes: ['support', 'marketing'],
    patterns: ['亲[，,～~]', '^\\s*亲\\s*$', '宝子', '亲爱的(?:用户|小伙伴)'],
    advice: '称呼要么用账号/姓名，要么省略。拟亲昵在故障场景里会加重不满。',
    example: {
      before: '亲爱的用户，您好！感谢您的理解与支持，如有疑问请联系客服。',
      after: '你的订单 20261105-0412 已进入退款，预计 2 个工作日到账。查询入口：/orders/20261105-0412。',
    },
  },
  {
    id: 'zh.support.service-formula',
    label: '客服套话',
    kind: 'zh-support',
    severity: 'warn',
    action: 'CUT',
    scopes: ['support'],
    patterns: [
      '感谢您的(?:理解|支持|耐心)(?:与支持)?',
      '如有(?:任何)?疑问[^。\\n]{0,10}(?:联系|咨询)',
      '我们(?:非常|十分)重视您的(?:反馈|意见)',
      '请(?:您)?放心',
      '给您(?:带来|造成)的(?:不便)?[^。\\n]{0,6}(?:抱歉|歉意)',
    ],
    advice: '套话挡在事实前面，用户读到的是推诿。先给结论、单号、时间点，再谈其他。',
  },

  // ================= 营销腔（marketing） =================
  {
    id: 'zh.marketing.hyperbole',
    label: '营销绝对化',
    kind: 'zh-marketing',
    severity: 'error',
    action: 'REFRAME',
    scopes: ['marketing'],
    patterns: [
      '全网(?:最低|最便宜|首发)',
      '绝(?:对|无仅有)',
      '100%\\s*(?:有效|安全|正品)',
      '史无前例',
      '错过(?:再等|就要等)',
      '限时(?:抢购|秒杀|特惠)',
      '王炸',
      '重磅来袭',
    ],
    advice: '绝对化用语在广告法下是硬风险，在阅读体验上是噪音。换成可核验的具体条件。',
    example: {
      before: '全网最低价，100% 正品，限时抢购，错过再等一年！',
      after: '到手价 ¥129（同款主流平台最低 ¥158，链接见比价页）；官方渠道发货，支持 7 天无理由退。',
    },
  },
  {
    id: 'zh.marketing.urgency-fake',
    label: '虚假紧迫感',
    kind: 'zh-marketing',
    severity: 'warn',
    action: 'REFRAME',
    scopes: ['marketing', 'media'],
    patterns: ['仅剩\\s*\\d+\\s*(?:件|席|名额)', '最后\\s*\\d+\\s*(?:小时|分钟|天)', '手慢无'],
    advice: '数字要真。库存与倒计时如果每次刷新都重算，读者会记住这件事。',
  },

  // ================= 媒体 / 公众号腔（media） =================
  {
    id: 'zh.media.hook',
    label: '钩子式开头',
    kind: 'zh-media',
    severity: 'warn',
    action: 'REFRAME',
    scopes: ['media', 'marketing'],
    patterns: [
      '你有没有(?:发现|想过|遇到过)',
      '今天(?:我们)?(?:来)?聊聊',
      '这(?:件事|个问题)(?:值得|必须)(?:说说|聊聊)',
      '不知道(?:你)?有没有',
    ],
    advice: '钩子后面往往没有信息。第一句直接给事实或数字，读者自己会决定要不要看下去。',
  },
  {
    id: 'zh.media.emotional-close',
    label: '情绪收尾',
    kind: 'zh-media',
    severity: 'warn',
    action: 'CUT',
    scopes: ['media'],
    patterns: ['(?:让|愿)我们(?:一起)?(?:拭目以待|共同期待)', '时间(?:会)?(?:给出|证明)(?:答案|一切)'],
    advice: '收尾给结论或下一步动作，不给情绪。',
  },

  // ================= 技术中文（tech） =================
  {
    id: 'zh.tech.vague-performance',
    label: '性能描述含糊',
    kind: 'zh-tech',
    severity: 'error',
    action: 'REFRAME',
    scopes: ['tech', 'report'],
    patterns: [
      '(?:性能|速度|效率)(?:得到|有)?(?:了)?(?:明显|大幅|显著|极大)?(?:提升|改善|优化)(?![^。\\n]{0,20}\\d)',
      '(?:更快|更稳|更省)(?![^。\\n]{0,20}\\d)',
    ],
    advice: '技术文档里的"提升明显"没有信息量。给指标、基线、样本量、时间。',
    example: {
      before: '重构后性能得到明显提升，系统更加稳定。',
      after: 'P95 840 ms → 210 ms（n=12,000，2026-10-28）；30 天可用性 99.95%，前值 99.72%。',
    },
  },
  {
    id: 'zh.tech.vague-quantity',
    label: '技术描述里的模糊量',
    kind: 'zh-tech',
    severity: 'warn',
    action: 'REFRAME',
    scopes: ['tech', 'report'],
    patterns: ['(?:大量|少量|若干|部分|一些)(?:数据|请求|用户|日志|任务)', '(?:很快|较慢|比较大|比较小)(?![^。\\n]{0,12}\\d)'],
    advice: '技术语境给量级：QPS、行数、GB、耗时。',
  },
]

/** 中文指标（不做判定，只出数） */
export function zhMetrics(text) {
  const src = String(text ?? '')
  const clean = src.replace(/\s+/g, '')
  const zhChars = (src.match(/[\u4e00-\u9fa5]/g) || []).length
  const latin = (src.match(/[A-Za-z]/g) || []).length
  const zhRatio = zhChars + latin === 0 ? 0 : zhChars / (zhChars + latin)

  const sentences = src
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const lens = sentences.map((s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length)

  const commaChains = sentences.map((s) => (s.match(/[，,]/g) || []).length)
  const deCounts = sentences.map((s) => (s.match(/的/g) || []).length)
  const beiCount = (src.match(/被/g) || []).length
  const halfPunct = (src.match(/[\u4e00-\u9fa5][,;:?]/g) || []).length
  const fullPunct = (src.match(/[，；：？]/g) || []).length

  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  const variance = lens.length ? lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length : 0
  const std = Math.sqrt(variance)
  const cv = avg ? std / avg : 0
  return {
    zhRatio: Number(zhRatio.toFixed(3)),
    zhChars,
    sentences: sentences.length,
    avgSentenceZh: Number(avg.toFixed(1)),
    sentenceLenStd: Number(std.toFixed(2)),
    sentenceLenCV: Number(cv.toFixed(3)),
    longSentences: lens.filter((n) => n > 60).length,
    maxSentenceZh: lens.length ? Math.max(...lens) : 0,
    commaChainMax: commaChains.length ? Math.max(...commaChains) : 0,
    deChainMax: deCounts.length ? Math.max(...deCounts) : 0,
    passiveBei: beiCount,
    halfWidthPunct: halfPunct,
    fullWidthPunct: fullPunct,
    chars: clean.length,
  }
}

/** 中文占比够不够高，够高才启用中文层（阈值 0.3） */
export function isZhText(text) {
  const src = String(text ?? '')
  const zh = (src.match(/[\u4e00-\u9fa5]/g) || []).length
  const latin = (src.match(/[A-Za-z]/g) || []).length
  if (zh + latin === 0) return false
  return zh / (zh + latin) >= 0.3
}

const AUTOFLAGS = 'giu'

function compileOne(pattern) {
  try {
    return new RegExp(pattern, AUTOFLAGS)
  } catch {
    return null
  }
}

/**
 * 按当前 profile 取生效的中文规则。
 * @param {string} profile 中文语域（gov/tech/...）或通用 profile（chat/report/...）
 */
export function zhRulesFor(profile) {
  const isZhProfile = ZH_PROFILES.includes(profile)
  return ZH_RULES.filter((rule) => {
    if (!rule.scopes || rule.scopes.length === 0) return true
    return isZhProfile && rule.scopes.includes(profile)
  }).map((rule) => ({
    ...rule,
    regexes: rule.patterns.map(compileOne).filter(Boolean),
    example: rule.example ?? null,
  }))
}

export const ZH_EXAMPLE_COUNT = ZH_RULES.filter((r) => r.example).length
