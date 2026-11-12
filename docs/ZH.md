# 中文语境专门适配

英文那边的问题很集中：hedging、免责、自我指认。中文不是这个形状——同样一句"高度重视、狠抓落实"，在公文里是合规句式，在技术复盘里是空转，在营销文案里是话术。**判定标准随语域变化**，所以中文层单独成层，而不是往主规则表里再塞二十条正则。

## 1. 为什么要分层

| 问题 | 中英混合规则的做法 | 中文层的做法 |
|---|---|---|
| 语域差异 | 一套阈值打天下，公文必爆红、技术文档全放过 | 按 `profile` 选语域：gov / tech / support / marketing / media |
| 密度单位 | 按词算 | 按**字**算（中文没有词边界，长度只能数字符） |
| 标点规范 | 不涉及 | 半角标点混入中文、连续感叹号、省略号写法 |
| 数字书写 | 不涉及 | 阿拉伯数字与汉字数字混排 |
| 固定句式 | 只有「不是X而是Y」 | 公文程式语、客服套话、营销绝对化、技术含糊量 |

在通用 profile（`chat` / `report` / `readme` / `email` / `academic` / `comment`）下，中文层只跑**与语域无关**的那部分：冗余、病句、标点、对冲、密度。公文/客服/营销的规则不会在技术报告里乱报警。

## 2. 五个语域

| profile | 适用 | 专属规则举例 |
|---|---|---|
| `gov` | 公文 / 通报 / 请示 / 通知 | 特此通知、现将有关事项通知如下、请遵照执行、妥否请批示；口号式动词串；"根据有关规定" |
| `tech` | 技术方案 / 复盘 / README | "性能得到明显提升"（无指标）、"大量请求""比较快"（无数量级） |
| `support` | 客服 / 用户沟通 / 工单回复 | 亲 / 宝子、感谢您的理解与支持、如有疑问请联系客服、请您放心 |
| `marketing` | 营销文案 / 推广页 | 全网最低、100% 正品、史无前例、限时抢购、仅剩 N 件、手慢无 |
| `media` | 媒体稿 / 公众号 | 你有没有发现…、今天我们聊聊、让我们拭目以待 |

## 3. 规则清单（23 条）

### 通用（所有语域）

| id | 判定 | 例子 |
|---|---|---|
| `zh.redundancy.nominalize` | WARN · TIGHTEN | `进行了一次优化 → 优化了` |
| `zh.redundancy.passive-suo` | WARN · TIGHTEN | `被用户所接受 → 用户接受` |
| `zh.redundancy.empty-modifier` | WARN · CUT | `相关的工作 / 一定程度上` |
| `zh.redundancy.de-chain` | WARN · REFRAME | `那个部门的最新版本的报告的…` |
| `zh.redundancy.tautology` | WARN · TIGHTEN | `大约 30 左右 / 超过 50 以上 / 截至…为止` |
| `zh.redundancy.abstract-noun-stack` | WARN · REFRAME | `提升能力建设水平` |
| `zh.punct.halfwidth` | WARN · TIGHTEN | `中文句子里用了 `,` `;` `:` `?`` |
| `zh.punct.repeat` | WARN · TIGHTEN | `！！ / ？？` |
| `zh.punct.ellipsis` | INFO · TIGHTEN | `... → ……` |
| `zh.num.mixed` | INFO · TIGHTEN | `三件 / 3 件（同段混用）` |
| `zh.hedge.classical` | WARN · TIGHTEN | `恐怕 / 兴许 / 未必 / 或多或少` |
| `zh.hedge.discourse` | WARN · CUT | `从某种意义上说 / 就目前而言` |

### 结构与节奏

| id | 判定 | 触发条件 |
|---|---|---|
| `zh.structure.trinity` | WARN · REFRAME | 不仅…而且…更 / 既要…又要…还要 / 一方面…另一方面…同时 |
| `zh.structure.empty-transition` | WARN · CUT | 连续 2 段以「然而/但是/不过/尽管如此」开头 |
| `zh.structure.list-fatigue` | INFO · REVIEW | 条目行占正文 >50%（且正文 ≥8 行） |
| `zh-density.uniform-rhythm` | WARN · REFRAME | 句长变异系数 <0.25（且 ≥5 句） |

`uniform-rhythm` 是本轮新增里最有意思的一条：真人写作的句长参差（长句铺开、短句收口），生成式文本的句长分布异常整齐。用变异系数（标准差 / 均值）判定，比"平均句长"更能抓住这个特征。

### 语域专属

| id | 语域 | 判定 |
|---|---|---|
| `zh.gov.notice-formula` | gov | `**INFO** · TIGHTEN（公文里是合规必须，只提示确认文种）` |
| `zh.gov.empty-slogan` | gov, media | `WARN · REFRAME` |
| `zh.gov.legal-vague` | gov | `WARN · REFRAME` |
| `zh.support.pet-name` | support, marketing | `WARN · CUT` |
| `zh.support.service-formula` | support | `WARN · CUT` |
| `zh.marketing.hyperbole` | marketing | `**ERROR** · REFRAME` |
| `zh.marketing.urgency-fake` | marketing, media | `WARN · REFRAME` |
| `zh.media.hook` | media, marketing | `WARN · REFRAME` |
| `zh.media.emotional-close` | media | `WARN · CUT` |
| `zh.tech.vague-performance` | tech, report | `**ERROR** · REFRAME` |
| `zh.tech.vague-quantity` | tech, report | `WARN · REFRAME` |

只有三条判 ERROR，理由都是"可核验的具体事实被替换成了形容词"：营销绝对化（广告法硬风险）、技术含糊性能（工程判断无法做）、以及上一版的通用层规则。

**公文程式语故意只判 INFO**：真实公文中「请遵照执行」是格式要求，判 ERROR 会把正确文书标红。这条的设计意图是"提示确认文种"，不是"要求删除"。

## 4. 中文密度（两条）

| 规则 | 触发 | 为什么 |
|---|---|---|
| `zh-density.comma-chain` | 单句 ≥5 个逗号 | `一句话塞了三个判断，读者要回读` |
| `zh-density.long-sentence` | 单句 ≥60 字 | `中文超过 45 字就开始丢主语` |

这两条与通用层的「超长句」（中 55 字 / 英 34 词）并存：通用层按加权分算，中文层按纯汉字数算，中文文本通常先命中中文层。

## 5. 中文指标（`wd_stats` 输出）

```
中文层：中文占比 96%｜按字句长 24.5（最长 78）｜逗号链 ≤6｜「的」链 ≤4｜被字句 3｜半角标点 2
```

| 指标 | 读法 |
|---|---|
| 中文占比 | <30% 时中文层不自动启用（`locale: 'auto'` 的判据） |
| 按字句长 | 均值 >25 或最长 >60 就该拆句 |
| 逗号链 | 最大值 ≥5 说明有句子在堆判断 |
| 「的」链 | 单句 ≥3 个「的」，回读成本上升 |
| 句长变异系数 | <0.25 说明每句都差不多长——播报腔，不是人写的节奏 |
| 被字句 | 数量突增通常是抽象写作（"问题被解决了"→"解决了问题"） |
| 半角标点 | 中文句子里出现 `,;:?` 的数量，应为 0 |

## 6. 已知误报与取舍

- **「一年」不算数字混排**：`zh.num.mixed` 只从"二"起算并要求后接量词，避免「错过再等一年」这种固定说法被标。
- **引号与代码块不参与判定**：`「」`/`“”` 里的内容和 ``` 围栏内的一律遮蔽——引用别人的话不算你写的。
- **公文语域的程式语不判 ERROR**：见上。
- **技术文档里的英文不触发中文标点规则**：规则要求标点前是汉字。
- **「的」链只查连续三段**：`A的B的C的` 才算，避免把正常的「我的报告」标出来。

## 7. 用法

```jsonc
// 工具
{ "text": "……", "profile": "gov", "locale": "auto" }

// CLI
wd-lint -p tech src/方案.md
wd-lint -p support -l zh 工单回复.md
wd-lint -p marketing -l en 文案.md   // 关闭中文层做对照
```

`locale`：`auto`（默认，中文占比 ≥30% 自动启用）/ `zh`（强制）/ `en`（关闭）。

## 8. 两套规则怎么配合
- 中文层管**语域失配**：公文腔出现在技术文档、营销话术出现在工单回复、含糊量出现在方案。
- 通用层管**跨语言的写作病**：免责、自贬、对冲、元评论、破折号过密。
- 同一段文本两层都跑，命中会分 kind 标注（`zh-gov` / `zh-support` / `zh-redundancy` / `zh-punct` / `zh-hedge`），便于在报告里按原因分组，而不是糊成一坨"有问题"。

## 9. 同类实现对照（2026-11 生态盘点）

做中文层之前先横向看了一遍同生态的实现。可行的借鉴与放弃都记在这里，避免以后重复讨论。

| 项目 | 机制 | 借了什么 / 为什么没借 |
|---|---|---|
| `dsh-plugin-baiguangda-style` ★1<br><https://github.com/BroWhitebyte/dsh-plugin-baiguangda-style> | 4 条硬错误 + 27 条警告；阈值按 **444 篇 / 80.2 万字**语料标定；含「段落过于均匀」「孤证数字」「金句通胀」 | **借了「段落/句长过于均匀」**，做成 `zh-density.uniform-rhythm`（变异系数 <0.25）。语料标定这件事很有说服力，但本插件面向通用文本、拿不到同分布语料，暂用经验值并在文档写明 |
| `avoid-ai-writing-cn` ★8<br><https://github.com/hellogit2021/avoid-ai-writing-cn> | 说「去掉 AI 味」即重写；说「写的不错」自动把新词记入规避表 | 反馈驱动词表增长是最值得学的一条，但需要用户交互信号才能落地，本轮未做（见下节待办） |
| `dsh-humanizer` ★12<br><https://github.com/lynote-ai/dsh-humanizer> | 8 个确定性工具 + 从样本提取文风指纹 + 改写 brief | 文风指纹与本项目 `styleProfile` 思路一致；本轮只做了「句长分布」这一个维度的指纹（CV + 标准差），完整指纹留待后续 |
| `no-ai-style` ★6<br><https://github.com/01NGVI-QINGYI/no-ai-style> | 三档：检查 / 润色 / 起草；**起草不补充材料外的事实** | 「起草不许补事实」与守恒锁同源，已由 `wd_conservation` 覆盖；三档模式未做，本项目的等价物是 `profile` + `severityMin` |
| `cot-lint` ★2<br><https://github.com/YuanyuanMa03/cot-lint> | 扫 AI 留在文档里的会话残留：死设计引用、PR 视角、变更叙述、评审编排 | 已覆盖「变更叙述」（`meta.process-residue`），「死设计引用 / 评审编排」未覆盖，列入待办 |
| `dsh-plugin-writing-guard` ★46<br><https://github.com/xmutfyh/dsh-plugin-writing-guard> | 控制上下文不是稿件内容；argument economy；defensive-purpose test | 设计原型，见 [CREDITS.md](CREDITS.md)。它的「每条句子必须挣得位置」判据写进了 `CHECKLIST` |

**没借的三类**（记下来省得反复权衡）：

1. **让模型判断"这句像不像 AI"**：不确定输出进不了 CI，本项目的立身之本就是确定性。
2. **不透明的总分/百分比**：`baiguangda` 那类「AI 味指数 7.2/10」看着直观，但无法定位到句子，也没法告诉人改哪里。本项目只报行号、命中片段和改写方向。
3. **把公文/客服/营销判成错误**：语域本身没有对错，错的是用错场合。所以这三类只在与语域匹配时给出提示，而不是全局禁词。

## 10. 待办（按价值排序）

1. **用户词表**：`~/.dsh/writing-discipline/zh-learned.json`，`wd_scan` 自动加载；支持「这句写得不对」→ 记一条。对应 `avoid-ai-writing-cn` 的反馈闭环。
2. **会话残留扩展**：把 `cot-lint` 的「死设计引用（我最初考虑的方案A）」「评审编排（下面给一个结论）」补进 `meta.process-residue`。
3. **语料标定脚本**：`tools/calibrate.mjs` 对指定目录跑分位数，输出阈值建议，替代当前的拍脑袋数字。
4. **完整文风指纹**：句长 + 逗号链 + 「的」链 + 被字句四个维度做基线，扫描时报告偏离度。
