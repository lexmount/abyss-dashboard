# Token 计量验证、服务商列表与 Codex 请求文本

日期：2026-09-29
涉及仓库：`abyss-dashboard`（服务商列表）、`abyss-rs`（Codex 请求文本，待修改）、`abyss-backend`（合并规则，待修改）

## 概览

| 事项                                     | 结论 / 状态                                                     |
| ---------------------------------------- | --------------------------------------------------------------- |
| Codex token 计量（对 Aether）            | 准确，逐项一致                                                  |
| Claude Code token 计量（对本地会话记录） | 准确，逐次调用一致；abyss 额外记录了本地记录中没有的旁路请求    |
| 服务商下拉框                             | 改为从数据中读取，自定义服务商可选；已合入 `main`，未推送       |
| Codex 合并视图的"两条用户输入"           | 已查明原因（采集端对 Responses 接口不分角色地拼接文本），待修复 |

## 1. Token 计量验证

### Codex：对比 Aether 网关

Aether 部署在 `pi` 上（容器 `aether-app` / `aether-postgres`），按请求记录用量的表是 `usage`，用户表是 `users`。`usage.username` 列为空，需要通过 `user_id` 关联 `users`。数据库时区为 UTC，对比时按北京时间自然日计算。

用户 `auc` 在 9-29（北京时间 0 点起）的 Codex 用量（模型 `gpt-6-astra`，接口 `openai:responses`）：

| 项                 | abyss（本地库与后端汇总接口一致） | Aether                                       |
| ------------------ | --------------------------------- | -------------------------------------------- |
| 成功请求数         | 28                                | 28（另有 1 次取消，见下）                    |
| 输入（未命中缓存） | 105,388                           | —（`input_tokens` 为 498,220，包含缓存命中） |
| 读缓存             | 392,832                           | 392,832                                      |
| 输出               | 10,577                            | 10,577                                       |
| 总计               | 508,797                           | 508,797                                      |

- 最初看到的"本地 547k"是 dashboard 的"最近 24 小时"（547,354），比自然日多出了前一天 20:02–20:03 的 4 次调用（38,557）。
- Aether 的 `input_tokens` 包含缓存命中，`input_context_tokens`（891,052）又把读缓存加了一次，是重复计算；`total_tokens` 为输入加输出，不含读缓存。abyss 的四类口径（输入、读缓存、写缓存、输出）互不重合，换算后与 Aether 一致。
- Aether 多出的一次请求（10:52:22）状态码 499、状态 cancelled、计费作废、token 为 0。abyss 不记录没有完成的请求，因为采集端在响应结束后才生成事件。

### Claude Code：对比本地会话记录

对照数据为 `~/.claude/projects/**/*.jsonl`，按 `message.id + requestId` 去重（与 ccusage 的做法相同），按输出、读缓存、写缓存逐次调用匹配 abyss 的请求与响应。

窗口为北京时间 9-29 14:15–15:15，涉及两个都开着 abyss 的会话：

| 结果                         | 次数 |
| ---------------------------- | ---- |
| 两边都有，token 完全一致     | 31   |
| 只在本地记录中（abyss 漏采） | 0    |
| 只在 abyss 中                | 2    |

只在 abyss 中的两次都是 Claude Code 在用户离开后生成的回顾摘要，属于旁路请求，Claude Code 不写入本地会话记录。它们真实消耗了 token。

按自然日（9-28）用 ccusage 对比时，差距全部来自 3 个没有通过 abyss 启动的会话（合计约 6.7 亿读缓存），两边都有的会话中 abyss 的数字略高，原因同上。

### 注意事项

- abyss 记录的时间是响应结束的时间，本地会话记录写的是开始时间，同一次调用最多相差约 15 秒；按时间窗口统计时，边界附近的调用可能落在不同窗口。
- 与按自然日计费的平台对比时，应使用自然日范围，而不是"最近 24 小时"。
- 被取消或失败的请求在 abyss 中不可见。

## 2. 服务商列表

### 现状（修改前）

Dashboard 首页（`app/dashboard/page.tsx`）和会话搜索页（`app/sessions/session-search-form.tsx`）的服务商下拉框都写死为 `["openai", "anthropic"]`。

采集端对不认识的服务商使用 `LlmProvider::Other(...)`，实际存入的是网关域名。本地数据中的服务商为 `anthropic`、`aether.aucept.in`、`llmgw.byr.ink`，后两者无法在下拉框中选择。

后端已经支持：`normalize_slug` 只做小写化，并把 `_` 和空格换成 `-`，保留点号；按 `aether.aucept.in` 筛选汇总和搜索接口都能返回正确结果。

### 当前实现

后端没有专门的服务商列表接口，两个页面都通过已有的汇总接口获取选项：

- 请求 `GET /v1/agent-usage/summary?group_by=provider,model`，范围跟随时间和 agent 筛选，不包含服务商和模型筛选本身；结果缓存 60 秒。
- `apps/dashboard/src/lib/usage-choices.ts` 的 `providerChoices` / `modelChoices` 按 token 用量从大到小排列，已选中但不在范围内的值保留在列表中。
- 选中服务商后，模型列表只保留该服务商用过的模型。
- 会话搜索页由 `11703ab`（另一会话）完成；Dashboard 首页在其后改用同样的写法，删除写死的列表。首页测试断言选项查询为 `groupBy: ["provider", "model"]` 且不带服务商筛选。
- 验证：格式、lint、类型检查、构建通过，dashboard 40 个、UI 包 23 个测试通过；浏览器中首页服务商下拉框列出 `anthropic`、`aether.aucept.in`，选中后者时模型下拉框只剩 `gpt-5.6-luna`、`gpt-6-astra`。

## 3. Codex 合并视图中的"两条用户输入"

### 现象

9-29 画鹈鹕的 Codex 会话 `01a0ec0c`（3 次请求）在合并视图中显示为两条"用户输入"：

1. 第一条 33,586 字符，以 "You are Codex…" 开头，其实是系统指令、环境上下文（`<environment_context>`）和真正的用户输入（"创建一个HTML，内容是SVG绘制一个鹈鹕骑自行车的2D动画…"）连在一起。三部分之间只有单个换行，被当作同一个段落；开头不是 `system:`，也没有被识别为"上下文"。
2. 第二条是 `"\n我会直接创建一个独立 HTML…"`，实际上是上一次助手的回复。第二次请求等于第一次的全文加上这段文字，合并规则把增长的尾部当成了新的用户输入。

第三次请求与第二次完全相同，这次调用新增的只有工具结果（在 metadata 中）。

同一时间的会话 `01a0ec09` 只有一次调用，是 Codex 生成标题的旁路请求，Codex 为它分配了独立的 session_id。

### 原因

`abyss-rs/crates/abyss-agent-hook/src/protocol/openai/responses.rs` 的 `extract_request_texts`（第 322 行）把 Responses 接口的整个 `input` 数组不分角色地压平成一段文字：开发者指令、用户消息和历史助手回复混在一起，没有角色标记。

- Anthropic 路径（`anthropic/messages.rs`）只取 `role=user` 的消息，system prompt 单独提取并加 `system:` 前缀。
- 同一函数中的 Chat Completions 分支（第 335 行）也只取 `role == "user"`。

后端的合并规则（`usage/trajectory.rs`）按 Anthropic 路径的格式设计，因此 Codex 会话都会受影响。

### 修复方案（待定）

1. 采集端（根本修复，只影响新数据）：Responses 接口按角色提取，与 Anthropic 路径一致。
   - `instructions` 和 developer/system 角色消息合并为一段，加 `system:` 前缀；
   - 每条 user 消息单独成段（以 `\n\n` 连接）；
   - assistant 消息不再放入请求文本（已在上一次响应中）。
2. 后端合并规则（兼容已有数据）：若某次请求新增的内容等于同一流中上一次响应的文本，不作为用户输入。已有数据中连在一起的"系统指令 + 用户输入"无法可靠拆分。

## 待办

- 决定 Codex 请求文本的修复范围（采集端、后端或两者），采集端在 `abyss-rs` 的 `main` 上另开分支，不使用 `abyss-rs-token-usage` worktree。
- 其他待确认：dashboard 的时间预设是否增加"今天"；是否需要记录被取消或失败的请求。
