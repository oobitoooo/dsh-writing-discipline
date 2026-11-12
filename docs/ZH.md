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
