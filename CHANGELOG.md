# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.5.0] — 2026-11-12

文风指纹：把「有没有毛病」扩到「还像不像你写的」。三件东西——基线、对比、一张说人话的网页。

### Added

- **`lib/fingerprint.js`**：从旧稿建立文风基线，六个指标——平均句长、句长变异系数、逗号链、「的」链、
  被动句密度、口头禅。**只存统计量与一句原型句，不存原文**；`proseOnly()` 先剔除 Markdown 标题/列表/表格/代码块，
  否则平均句长会被拉到个位数。
- **`wd_profile` 工具**：`build`（建基线）/ `compare`（对比）/ `show`（看基线）。
- **`tools/report.mjs` 前端**：生成单文件 HTML，双击就开，零外部依赖。整页三块——一句结论、几张
  「哪儿不一样」（每条配你自己的句子与这稿的句子对照）、一排句长竖条；数字折叠在底部。
  **刻意不做仪表盘、不打分**：分数让人盯着数字，偏离让人盯着句子。
- **`docs/FINGERPRINT.md`**：指标取舍、判定阈值、已知误报、存了什么。
- `test/fingerprint.mjs`：8 个用例（样本不足报错、基线结构、存读往返、自比判「像你」、机器腔判偏离、
  对照引用、口头禅过滤虚词、无基线返回 null）。

### Changed

- 指纹判定用偏离项权重和分三档（像你 / 有点漂 / 不像你），阈值见 docs/FINGERPRINT.md。
- 工具数 7 → 8。

## [0.4.0] — 2026-11-12

中文语境专门适配。起因是中英混合规则在中文上判定失真：公文里的「请遵照执行」被判 ERROR，
技术文档里的「性能得到明显提升」却被放过——问题不在规则多少，在**判定标准随语域变化**。

### Added

- **中文层 lib/zh.js**：23 条中文规则 + 2 条中文密度规则 + 中文指标。
  - 通用（所有语域）：名词化冗余、被…所、长「的」链、约…左右/超过…以上、空心修饰、抽象名词堆叠、
    半角标点混入中文、连续感叹号、省略号写法、数字混排、文言式对冲、话语填充。
  - 语域专属：gov（公文程式语 INFO、口号串、法规援引含糊）、tech（含糊性能 **ERROR**、模糊量）、
    support（亲/宝子、客服套话）、marketing（绝对化 **ERROR**、虚假紧迫感）、media（钩子开头、情绪收尾）。
  - 规则按 scopes 过滤：通用 profile（chat/report/...）只跑与语域无关的规则，技术报告不会被判成公文。
- **中文密度**：单句逗号 ≥5、单句汉字 ≥60。
- **中文指标**：中文占比、按字句长、最长句、逗号链、『的』链、被字句、半角标点数，随 wd_stats 输出。
- **locale 参数**：uto（中文占比 ≥30% 自动启用）/ zh / en；wd_scan、wd-lint -l 均可指定。
- **profile 扩展**：gov / tech / support / marketing / media 五个中文语域。
- wd_rules 增加中文层段落，按当前 profile 列出生效的中文规则。
- docs/ZH.md：分层理由、规则表、误报取舍、指标读法、同类实现对照与待办。
  - **结构与节奏（对照同期插件补的三条）**：三连排比（zh.structure.trinity）、空转转折（连续段首转折词）、
    列表疲劳（条目占正文 >50%）；以及句长变异系数 <0.25 的「节奏过于均匀」（借鉴 baiguangda-style 的段落均匀判据）。
  - docs/ZH.md 增加「同类实现对照」：baiguangda-style / avoid-ai-writing-cn / humanizer / no-ai-style / cot-lint，
    逐条写明借了什么、为什么没借，以及四件待办。

- **用户词表 `wd_learn`（lib/learn.js）**：把误报记成条目而不是关掉整条规则。两种模式——`suppress`（默认，
  命中片段前后 20 字内匹配到就丢掉该条命中）与 `rule`（主动加规则）。存 `~/.dsh/writing-discipline/learned.json`，
  可用 `WD_LEARNED_FILE` 覆盖；`wd_scan` 与 `wd-lint` 自动加载，`wd-lint --no-learned` 可关闭。
- **会话残留扩展**：`meta.process-residue` 增加死设计引用（「最初考虑用…」「最终选择了方案B」）、
  决策旁白（「我选择了…」）、评审编排（「下面先给出结论」）——对照 cot-lint 的泄漏类型。
- **语料标定 `tools/calibrate.mjs`**：对目录递归统计句长/逗号链/「的」链/变异系数的分位数，输出阈值建议与 JSON，
  用数据替代拍脑袋。

### Changed

- **密度阈值按语料重新标定**：单句 60 → **66 字**，逗号链 5 → **6**（34 份中文语料 p90 = 66 / 6.4，p99 = 71 / 14.0）。
  首版 60 落在 p75–p90 之间，会把正常长句标红。完整分布见 docs/ZH.md 附录 A。
### Changed

- stats() 返回值增加 zh 字段（中文指标）；scan() 返回值增加 locale 与 zh。
- 「如有疑问」从 defensive.self-deprecation 移除——它在客服语境里是套话，不是自我贬低，归 zh.support.service-formula。

### Fixed

- zh.num.mixed 只从「二」起算并要求后接量词，避免「错过再等一年」被判数字混排。
## [0.3.0] — 2026-11-12

把一个「要你记得调用」的扫描器，改成「你忘了也拦得住」的闸门。起因很具体：一份 8 页课程作业，
插件装在本机、工具就在手边，但第一版从头到尾没被扫过一次——初扫才发现 ERROR 1 / WARN 11、
破折号密度 8.9‰、六处「不是X而是Y」。工具没失效，是流程没闭环。

### Added

- **交付闸门（gate）**：`present` 前按文件内容 **sha256** 校验，未扫描 / 扫描后仍有 ERROR / 扫描后又改过文件，一律 `deny`，
  拒绝理由里直接给出该文件的 `wd_scan` 命令。文件一改指纹即变，旧通行证自动失效。
  - 挂在两处：`tools/pre-execute`（主判定，异步、校验指纹）+ `ctx.tools.guard`（同步兜底，防其他监听器改名放行）。
  - `.pdf` 认源文件：同目录同名 `.docx/.pptx/.xlsx/.md/.tex` 通过扫描即放行。
  - 非文档（图片、数据、压缩包）不拦。配置 `gate: 'block' | 'warn' | 'off'`。
- **Office 文本抽取 `lib/extract.js`**：零依赖解析 ZIP 中央目录 + `zlib.inflateRawSync`，
  直接读 `.docx/.docm/.pptx/.pptm/.xlsx/.xlsm` 的正文（含表格单元格），`wd_scan` / `wd_stats` / `wd_conservation` 全部受益。
  不再需要「先写个 python 抽文本、再复制进 text 参数」。
- **常驻规则段（systemPrompt.section）**：把「交付前 ERROR 必须归零、按 sha256 记账、被拦时的标准动作」写进系统提示，
  不依赖 skill 是否被加载。
- **`wd_gate` 工具**：`status` 看记账与模式、`check` 预检某文件会不会被拦、`reset` 清账（外部工具重写文件后强制重扫）。
- **配套 skill `skills/writing-discipline/SKILL.md`**：写前三步流程、闸门行为表、六条高频返工点、
  与 `anti-defensive-writing` 的分工（前者管语气谦卑，后者管句式套路，两套都要过）。

### Changed

- `inject` 从 `['tools']` 扩到 `['tools', 'systemPrompt']`。
- `readInput` 统一走 `extractText`，扩展名白名单增加 Office 格式；不支持的类型给出可执行提示。
- `wd_scan` 在传 `filePath` 时回一行「闸门：已记账 / 已记账但未通过」，让记账状态对 agent 可见。

## [0.2.1] — 2026-11-05

### Added

- docs/CREDITS.md：给两个来源明确署名——dsh-plugin-writing-guard（@xmutfyh，MIT，设计原型，未复制代码）与
  nti-defensive-writing skill（本项目前身，四项机制直接演化而来）。README 中英文版同步增加「致谢 / Credits」段。

## [0.2.0] — 2026-11-05

从配套 skill `anti-defensive-writing` 借来四样东西（详见 `docs/DESIGN.md` §9）：

### Added

- **改写示例（EXAMPLES）**：14 条规则配了 `before / after` 具体对照，命中时以 `✗ / ✓` 两行输出。
  一个具体对照比十句「建议删掉」可执行——模型拿得到改写目标，而不是只拿到禁令。
- **WARN 预算**：`scan(text, { maxWarn: n })` / `wd_scan(maxWarn)` / `wd-lint -m n`。ERROR 仍独立判定，
  WARN 超出预算才失败，便于 CI 逐周收紧（先跑到 0 个 ERROR，再把 WARN 预算从 20 压到 5）。
- **命令行 `wd-lint`**：`bin/wd-lint.mjs`，单文件/多文件/stdin/`-t` 文本，`--json`、`--stats`、`--quiet`、
  `--fix`（就地改写 + `.bak` 备份）、`--diff`（守恒锁两版对比），退出码 0/1/2，可直接当 pre-commit 钩子。
  兼容 `-file` 这类单横线参数写法。
- **交付前自检清单（CHECKLIST）**：6 条工具判不了、只能人打勾的条目，随 `wd_rules` 输出。
- **新规则 `structure.preamble`**（铺垫式开头）：`随着…的发展`、`在当今…`、`近年来，`、`众所周知`、
  `In recent years`、`It is well known that` → WARN / REFRAME。
- 补齐参考实现里的漏网模式：`个人观点`、`如有疑问`、`barely`、`in conclusion`、`to conclude`。
- 量化数据识别放宽到「数字 + 量词」（`\d+\s*(条|例|次|人|个|天|年|月|周|秒|QPS)`），
  但**不**接受裸量词——否则「这个方案」里的「个」会把防御饱和段落误判为有证据。

### Changed

- `formatReport` 在 `verbose` 下增加示例两行；`ok` 的计算纳入 WARN 预算；报告头显示预算状态。
- `rulesBrief` 增加 `checklist` 与每条规则的 `hasExample`。

## [0.1.0] — 2026-11-05

首个版本。

### Added

- **插件入口** `lib/index.js`：注册 `wd_scan` / `wd_rules` / `wd_rewrite` / `wd_conservation` / `wd_stats` 五个工具。
- **规则引擎** `lib/rules.js`（纯函数，可脱离 DSH 单测）：
  - 24 条规则，覆盖防御性（自我指认、拒绝、道歉、自我评价、免责、防御性声明、推责专业人士、合规姿态）、
    元评论（社交尾巴、开场白、过程旁白、反问、修改过程残留）、
    对冲（中/英信使词、模糊程度词、限定词堆叠）、
    文体（绝对化、填充开头、中英套话、「不是X而是Y」）。
  - 3 条密度规则：段落软对冲 ≥3 且无量化数据 → ERROR；破折号 >6‰；超长句（中 >55 字 / 英 >34 词）。
  - profile 降级机制：`academic` 下 hedge 降为 INFO，`review` 下「as requested」不报。
  - `formatReport()` 紧凑报告、`rulesBrief()` 规则速查。
- **确定性改写器** `rewrite()`：剥离引子、压缩限定词堆叠、删除纯防御句；含数字/引用/图表/链接的句子永不删除。
- **守恒锁** `conservation()`：数字/单位/百分比、引用键、图表编号、DOI、URL 丢失 → `INVARIANT`；
  主张强度上调（可能→导致、associated→caused、suggests→proves）→ `VIOLATION`；
  段落否定漂移 → `INVARIANT`；适用边界词消失 → `CANDIDATE`。
- **测试** `test/smoke.mjs`：17 个用例，覆盖中英扫描、profile 降级、密度判定、改写边界、四类守恒检查、正则可编译性、ruleId 唯一性。
- 文档：`README.md`（中文）、`README.en.md`、`docs/DESIGN.md`、MIT LICENSE、GitHub Actions CI。

### Known limitations

- 中文规则偏严，`可能` 常是真不确定 → 用 `profile=academic` 或 `severityMin=warn` 过滤。
- 守恒锁按字面 token 比对，`840 ms` 与 `840ms` 视为不同。
- 仅处理纯文本，不解析 docx/pdf。
