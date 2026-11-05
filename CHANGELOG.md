# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.0] — 2026-11-05

首个版本。

### Added

- **插件入口** `lib/index.js`：注册 `wd_scan` / `wd_rules` / `wd_rewrite` / `wd_conservation` / `wd_stats` 五个工具。
- **规则引擎** `lib/rules.js`（纯函数，可脱离 DSH 单测）：
  - 25 条规则，覆盖防御性（自我指认、拒绝、道歉、自我评价、免责、防御性声明、推责专业人士、合规姿态）、
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
