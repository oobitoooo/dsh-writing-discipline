# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
