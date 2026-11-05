# 致谢 / Credits

本项目的判定模型不是凭空来的。两个来源必须点名——一个给了设计原型，一个给了最初形态。

## 1. `dsh-plugin-writing-guard` — @xmutfyh

- 仓库：https://github.com/xmutfyh/dsh-plugin-writing-guard
- npm：`dsh-plugin-writing-guard@2.0.1`
- 许可：MIT

**借了什么（设计层面，不是代码）**

| 设计点 | 在 writing-guard 里的形态 | 在本项目里的形态 |
|---|---|---|
| 规则分层而非单一禁词表 | ERROR/WARN/INFO + 规则分类 | `severity` × `kind` 双维度 |
| 密度门控 | 防御性限定词密度、限定词堆叠 | `density.hedge-per-paragraph`（同段 ≥3 且无量化数据才升级） |
| 「可能承担正当功能，勿自动删」 | `CANDIDATE / INVARIANT / ADVISORY` 标签 | `action: CUT / TIGHTEN / REFRAME / REVIEW` |
| 按文档类型调整严格度 | `profile: manuscript / rebuttal / …` | `profile: chat / report / academic / …`，academic 下 hedge 降 INFO |
| 改写不许改科学事实 | Scholarship Lock + Epistemic Lock | `wd_conservation` 守恒锁（数字/引用/否定/主张强度） |

**没有借的**：一行代码都没复制。规则表、正则、`lib/rules.js` 全部独立实现——因为目标场景不同（它面向论文与 docx，本项目面向任意文本 + CI）。

我在本机装过它（`desktop` profile，2.0.1，带版本豁免），跑过 `writing_audit` 验证其行为，也是在那个对照下才想清楚「密度规则」和「candidate 判定」为什么是必要的。

## 2. `anti-defensive-writing` — 本工作区 skill（2026-11-05）

- 位置：`~/.dsh/skills/anti-defensive-writing/`
- 前身形态：一份中文 SKILL.md（五类病灶 + 删改顺序 + 自检清单）+ 一个 140 行零依赖 Python 扫描器
- 产出背景：由本机 agent 在 YG 的 brief 下写成，同日演化为本插件

**直接演化进插件的部分**

| skill 里的东西 | 插件里的落点 |
|---|---|
| 病灶 / 改前 / 改后 三列对照表 | `EXAMPLES`（13 条规则的 `before` / `after`，命中时 `✗ / ✓` 输出） |
| `--max-warn N` 阈值 | `scan({ maxWarn })` / `wd_scan(maxWarn)` / `wd-lint -m` |
| `-file / -text / -stdin / --json` + 退出码 0/1/2 | `bin/wd-lint.mjs` |
| 交付前 6 条自检清单 | `CHECKLIST`，随 `wd_rules` 输出 |
| 双语禁词表 | `RULES` 的 `patterns`（并补了 `个人观点` / `如有疑问` / `barely` / `in conclusion`） |

**同时纠正了它的一处缺陷**：原扫描器的量化检测把 `个 / 条 / 例` 当成独立量词，导致「这**个**方案可能有效，或许更快」被判为「有量化数据」而豁免密度升级。插件里改成 `\d+\s*(?:条|例|次|人|个|…)`——量词必须绑定数字。

## 3. 更远的上游

- 学术 hedging 的正当性依据：ICMJE Recommendations（讨论部分的限定表达属于规范写法），这也是 `profile=academic` 下把 hedge 降级为 INFO 的理由。
- 「密度而非禁词」的思路在 critique-driven lint（Vale、textlint、write-good）里是通用做法，本项目只做了中文适配与守恒层。

## 如果你觉得漏了谁

开 issue 或者直接改这个文件提 PR。规则表里也有很大一部分来自实际误报反馈——贴一段被误判的文本，比贴十条新规则有用。
