# dsh-writing-discipline

> 给 DeepSeek Harness（DSH）的写作纪律闸门：把「防御性写作」从输出里剃掉，同时锁住事实层不许被动。

零网络、零 LLM、纯本地正则 + 统计。五个工具，全部确定性：同样的输入永远给同样的输出，可进 CI、可写进 pre-commit。

```text
输入：作为一个AI助手，我无法保证该结论的准确性。请注意，生产环境操作存在风险。本内容仅供参考。

输出：写作纪律检查：发现 6 处问题（ERROR 5 / WARN 1 / INFO 0）
🔴 [ERROR · defensive · CUT] 能力自贬（自我指认） @ L1
    「作为一个AI助手」  …作为一个AI助手，我无法保证该结论的准确性。…
    → 删掉自我指认，直接从结论开始。
```

---

## 为什么需要它

模型写东西时会**为不被指责而写**，不是为把事交付而写。表现是五类固定动作：

| 病灶 | 典型形态 | 代价 |
|---|---|---|
| 免责 | 「仅供参考」「不构成任何建议」 | 交付物变成半成品，责任推回读者 |
| 能力自贬 | 「作为一个 AI」「能力有限」「如有疏漏」 | 占篇幅，零信息 |
| 说教劝退 | 「请注意」「务必确保」「建议谨慎」 | 用姿态替代参数 |
| 无意义对冲 | 「可能或许大概」「一定程度上」 | 主张被稀释到无法据此决策 |
| 过程旁白 | 「首先我需要了解…」「接下来我将」 | 纯噪音 |

这些不是风格偏好问题：**它们让读者无法行动**。而清理它们的最大风险不是删不干净，是**顺手把真事实一起删了**——数字、引用、否定、适用边界、主张强度。所以本项目做两件事，缺一不可：

1. `wd_scan` / `wd_rewrite`：找出并清掉防御性噪音；
2. `wd_conservation`：对比改写前后，证明事实层一个字都没动。

只做第 1 件是排版工具，只做第 2 件是审计工具。两个一起才是「能放心自动跑」的闸门。

---

## 安装

### 方式 A：本地 link（开发/自用）

```powershell
dsh plugin --profile desktop add link:C:/path/to/dsh-writing-discipline
```

### 方式 B：从 GitHub 装

```powershell
dsh plugin --profile desktop add github:oobitoooo/dsh-writing-discipline
```

装完重启 DSH（或等插件热加载），`wd_*` 五个工具即出现在工具表里。

**兼容性**：只用到 `ctx.tools.register` + `defineTool`，DSH `0.1.x` 与 `0.2.x` 均可。没有 postinstall 脚本、不写磁盘、不改配置。

---

## 五个工具

### `wd_scan` — 扫描

```jsonc
{ "text": "……", "profile": "chat", "severityMin": "warn", "verbose": true }
// 或 { "filePath": "docs/report.md" }
```

返回 ERROR / WARN / INFO 计数、逐条命中（`ruleId / 行号 / 段落 / 命中原文 / 语义片段 / 建议动作`）、以及文本指标（平均句长、对冲密度、破折号密度）。

`profile` 影响判定严格度：

| profile | 行为 |
|---|---|
| `chat`（默认常见） | hedge 记 WARN，说教/免责记 ERROR |
| `report` / `readme` / `email` | 同上，元评论残留加重 |
| `academic` | **hedge 全部降级为 INFO**——学术 hedging 是 ICMJE 认可的正当表达，不该判失败 |
| `review` | 「as requested」「按要求」类过程残留不报 |

### `wd_rules` — 规则速查

列出 25 条规则 + 3 条密度规则在指定 profile 下的实际严重度。写作前扫一眼，比写完再改便宜。

### `wd_rewrite` — 确定性改写

只做三件有把握的事：

1. **剥离引子**：`好的，` / `请注意，` / `需要注意的是，` / `温馨提示：`
2. **压缩堆叠**：`可能或许` → `可能`；`may potentially` → `may`
3. **删纯防御句**：整句只承担免责/客套功能

**硬约束：含数字、引用、图表编号、链接的句子永不删除。** 返回改写后文本 + 逐条变更记录 + 改后复扫。

它不生成新句子。语义级改写仍要人来做——但这一遍能便宜地砍掉大半噪音。

### `wd_conservation` — 守恒锁

```jsonc
{ "original": 原文, "revised": 改后文本 }   // 或 originalPath / revisedPath
```

检查四类事实漂移：

| 检查 | 级别 | 说明 |
|---|---|---|
| 数字 / 单位 / 百分比 / p 值 / n= | `INVARIANT` | 丢失即 HIGH，必须回滚 |
| 引用键 / 图表编号 / DOI / URL | `INVARIANT` | 同上 |
| 主张强度上调 | `VIOLATION` | `可能→导致`、`associated→caused`、`suggests→proves` |
| 段落否定漂移 | `INVARIANT` | 相似度 ≥40% 的段落里 `不/未/never` 数量变了 |
| 适用边界词消失 | `CANDIDATE` | `仅/限于/only/within` 被删——人工确认 |

`INVARIANT` / `VIOLATION` 出现即 `ok: false`，CI 直接红。

### `wd_stats` — 指标

字符 / 中文词数 / 英文词数 / 段落 / 句数 / 平均句长 / 对冲密度（每千语言单位）/ 破折号密度。改写前后各跑一次，数字会说话。

---

## 判定分级

| 级别 | 含义 | CI 策略 |
|---|---|---|
| `ERROR` | 防御性写作，删掉不损失信息 | 必须为 0 |
| `WARN` | 可疑：软对冲、绝对化、套话 | 设阈值，看趋势 |
| `INFO` | 学术语境下的正当 hedging | 不计入失败 |

每条命中都带 `action`：

- `CUT` — 整句删
- `TIGHTEN` — 压缩（保留信息，去掉保险层）
- `REFRAME` — 改写成事实句（条件 → 后果）
- `REVIEW` — 需要人判，别自动删

**`REVIEW` 存在的理由**：`不是X而是Y` 用一次是强调，用三次是套路；`我们认为` 有时是弱的正当解释。工具只负责把它标出来，删不删由你定。

---

## 规则表（25 条 + 3 条密度）

| 组 | 规则 |
|---|---|
| 防御性 | 能力自贬、拒绝式措辞、道歉、自我评价、免责类、防御性声明、推责专业人士、合规姿态 |
| 元评论 | 社交尾巴、开场白、过程旁白、反问请示、修改过程残留 |
| 对冲 | 中文信使词、英文信使词、模糊程度词、**限定词堆叠（ERROR）** |
| 文体 | 绝对化、填充开头、中文套话、英文套话、不是X而是Y、元评论开场白 |
| 密度 | **段落软对冲 ≥3 处且 0 处量化数据 → ERROR**、破折号 >6‰、超长句（中 >55 字 / 英 >34 词） |

密度规则是这套工具和普通禁词表的关键差别：单个 `可能` 不是问题，**一段里三个 `可能` 且一个数字都没有**才是问题。

---

## 接 CI

```yaml
- name: writing discipline
  run: node -e "import('./lib/rules.js').then(m=>{const r=m.scan(require('fs').readFileSync('dist/README.md','utf8'),{profile:'readme'});if(!r.ok){console.error(m.formatReport(r));process.exit(1)}})"
```

或直接调工具函数（`scan / rewrite / conservation / stats` 都是纯函数，不依赖 DSH 运行时）：

```js
import { scan, conservation } from 'dsh-writing-discipline/rules'

const r = scan(text, { profile: 'report' })
if (!r.ok) throw new Error(`防御性写作 ${r.counts.error} 处`)

const c = conservation(before, after)
if (!c.ok) throw new Error('改写破坏了事实层：' + c.items.filter(i => i.severity === 'error').map(i => i.message).join('; '))
```

---

## 已知边界

- **中文规则偏严格**：`可能` 在技术文本里常是真的不确定，不是防御。用 `profile=academic` 或 `severityMin=warn` 过滤。
- **不改写语义**：`wd_rewrite` 只删不造。它给不出「把这句话改成事实句」的替代文本——那需要判断，判断要人做。
- **守恒锁是启发式**：数字比对按字面 token，`840 ms` 与 `840ms` 会被视为不同；主张强度靠成对词表，覆盖不到所有动词。它是安全带，不是刹车。
- **不处理 .docx/.pdf**：纯文本进，纯文本出。Office 文档请先用对应 skill 抽取。

---

## 开发

```bash
npm test      # 17 个用例，纯 node:assert，无依赖
npm run check # node --check 两个入口文件
```

规则都在 `lib/rules.js` 的 `RULES` 数组里，加一条就是加一个对象：`id / label / kind / severity / action / patterns / advice / demoteIn`。提交前跑测试，`test/smoke.mjs` 会校验「所有正则都能编译」和「ruleId 不重复」。

## 许可

MIT。规则表欢迎 PR——尤其欢迎**误报**：贴一段被误判的文本，比贴十条新规则有用。
