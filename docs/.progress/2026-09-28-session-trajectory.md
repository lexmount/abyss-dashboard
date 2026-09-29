# 会话详情：按请求加载与合并时间线

日期：2026-09-27 ～ 2026-09-28
仓库：`abyss-backend`、`abyss-dashboard`

## 背景

会话详情页原来一次请求 `/v1/agent-usage/sessions/{session_pk}`，拿到整个 session 所有请求和响应的完整正文，大 session 会把页面卡死。原因在数据本身：采集端原样记录每一次请求，而每次请求都带着截至当时的完整上下文，所以数据量随请求数近似平方增长。

以本地库中最大的 session（1,590 个事件）为例，旧接口返回 66.6 MB。按"相对上一次请求新增的部分"计算，真实的新增内容只有全量的 1/4 到 1/100。

存储保持原样记录不变，只改读取和展示：后端提供按事件、按大纲、按合并结果三种读取方式，前端只加载当前需要的内容。

## 状态

| 部分                                     | 分支                      | 状态                                              |
| ---------------------------------------- | ------------------------- | ------------------------------------------------- |
| 后端三个读取接口                         | `feat/timeline`           | 已合入本地 `main`（`c8fba99`），未推送            |
| 前端合并视图、轮次时间线、Dashboard 入口 | `feat/timeline`           | 已合入本地 `main`（`d09b7a4`、`46dae90`），未推送 |
| 前端：选中条目展开原始事件               | `feat/timeline-inspector` | 已合入本地 `main`，未推送                         |

## 后端（`abyss-backend`）

### 新增接口

| 接口                                           | 返回                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/agent-usage/events/{event_pk}`        | 单个事件原样返回，结构与 timeline 中的 `UsageEventResponse` 相同。只能查到当前 owner 的事件；不存在返回 404，缺少 token 返回 401。                                                                          |
| `GET /v1/agent-usage/sessions/{pk}/outline`    | 与 timeline 相同的 session / turn 结构，但事件不带 text 和 metadata 正文，只有元数据加上 `text_chars`、`preview`（请求取末尾 200 字符，响应取开头 200 字符）、`attachment_count`、`token_usage_estimated`。 |
| `GET /v1/agent-usage/sessions/{pk}/trajectory` | 合并时间线，见下文。                                                                                                                                                                                        |

实现要点：

- `storage/mod.rs` 的 `StorageBackend` trait 新增 `usage_event` 和 `session_outline`，SQLite 和 Postgres 各自实现。
- `SessionTimelineResponse` 和 `TurnTimeline` 对事件类型泛型化，默认仍是 `UsageEventResponse`；outline 使用 `SessionOutlineResponse = SessionTimelineResponse<UsageEventOutline>`。
- outline 查询只 select 定长列和 SQL 计算出的摘要字段；排序需要的 `response_id`、`previous_response_id` 也在 SQL 里取出，不加载整个 metadata。
- SQLite 的 `length()` 和 `substr()` 遇到 NUL 字符会停止。text 中含 NUL 的事件在查询时被标记出来，单独读取 text 后在 Rust 里计算字符数和预览（`text_outline`）。
- trajectory 直接复用 `session_timeline` 取出按权威顺序排好的完整事件，再交给与存储无关的纯函数 `usage::trajectory::build` 合并，两种存储后端都不需要改。

### 合并规则（`usage/trajectory.rs`）

- **用户输入**：请求文本按空行拆成段落，只保留这个 session 里第一次出现的段落。第一段以 `system:` 开头时，比较时忽略它的第一行（Claude Code 的 billing header 每次都变）。
- **流**：以去掉 header 后的 system 段落区分主流程和旁路请求（分类器、标题生成、子 agent 等），每条流单独判断新增内容。结果里保留 `stream` 字段。
- **增长的段落**：同一条流里，与上一次请求的某个段落共享前缀 ≥ 200 字节的段落，只保留新增的尾部，并标记 `continued`。例如自动模式分类器每次都带着不断变长的 `<transcript>`。
- **上下文**：每条流第一次出现、以 `system:` 开头的内容，类型为 `context`。
- **工具**：响应中的 `tool_call` 成为条目；之后请求中第一次出现的同一 `call_id` 的 `tool_result` 填入该条目的 `output`，并记录 `output_event_pk`。找不到对应调用的结果单独成为 `tool_result` 条目。
- **助手回复**：响应的文本。

条目字段：`kind`（`context` / `user` / `assistant` / `tool_call` / `tool_result`）、`stream`、`turn_index`、`event_pk`、`observed_at`、`llm_model`，以及按类型出现的 `text`、`continued`、`name`、`call_id`、`input`、`output`、`output_event_pk`。

### 实测（本地库副本，SQLite）

| session    | 事件数 | 旧 timeline | outline | trajectory       | 工具调用与结果配对 |
| ---------- | ------ | ----------- | ------- | ---------------- | ------------------ |
| `01a0cd0b` | 1,590  | 66.6 MB     | 996 KB  | 3.2 MB / 553 ms  | 723 / 724          |
| `01a0c9bf` | 362    | 69.6 MB     | 254 KB  | 0.65 MB / 338 ms | 176 / 176          |
| `01a0c959` | 894    | 59.6 MB     | 586 KB  | 1.3 MB / 331 ms  | 203 / 205          |

单个事件接口读取最大的一条请求（12.9 万字符）约 0.8 ms。最大的 6 个 session 逐条核对过：outline 的事件顺序、字符数、预览、估算标记都与 timeline 一致。

### 测试

- 单元测试：`usage/trajectory.rs` 3 个（去重与工具配对、增长段落与分流、按字符边界截取前缀）；SQLite 含 NUL 文本的 outline 1 个。
- 黑盒（`scripts/tests/blackbox_api.py`）：单事件接口与 timeline 中对应事件逐字段相同、不暴露附件字节、404、401；outline 的顺序与 timeline 一致、不含正文、`text_chars` 与 `attachment_count` 正确、未知 session 返回 404。`/trajectory` 尚未覆盖。
- `cargo +nightly fmt --check`，两种配置的 `clippy -D warnings`，SQLite 30 个、Postgres 63 个单元测试，两套黑盒测试，全部通过。

## 前端（`abyss-dashboard`）

### 会话详情页（`apps/dashboard/src/app/sessions/detail-page.tsx`）

- 页面标题为 agent 名加版本，副标题为 `session_id`；下方原样列出 session 的全部字段（包括 metadata 中的每一项）。
- 页面只请求 `/trajectory`，显示合并视图：
  - **左侧：轮次时间线**。一条竖线串起所有轮次，第一个节点是"全部轮次"。每个节点显示轮次、开始时间、工具调用次数和两行摘要（优先取这一轮的第一条用户输入，其次是助手回复，只有工具调用时显示工具名）。点击或用 ↑↓ / j/k 选中；选中的轮次写入 URL 参数 `turn`，未指定时显示全部轮次。窄屏下时间线移到内容上方。
  - **右侧：选中轮次的合并内容**。按轮次分组，使用按实际高度测量的虚拟列表。上下文、工具调用和超过 600 字符或 8 行的文本默认折叠；工具调用展开后显示输入和结果；增长段落的尾部前面加"…"。旁路请求与主流程一样直接显示。
- 原始事件在选中条目后展开，页面没有单独的原始事件视图：
  - 点击任意条目即选中其来源事件（写入 URL 参数 `event`），同一事件产生的条目一起高亮，右侧打开原始事件面板；展开按钮只展开不选中。关闭面板会清除 `event` 参数。
  - 工具调用展开后，"结果"一栏提供"查看原始事件"入口，打开结果所在的请求事件（`output_event_pk`），此时该工具调用条目同样高亮。
  - 原始事件面板（`SessionEventInspector`）：可拖动宽度（320–900px），标签页为正文（可复制）、工具（每段默认折叠）、附件、Metadata（原始 JSON）、属性（原样列出事件的每个标量字段）。

### Dashboard 首页

最近事件表中原来的 Text 列只能预览 text 开头 700 个字符，对请求来说永远是 system prompt，已去掉。改为"轮次"列，每行是"第 N 轮 →"按钮，链接到 `/sessions/{session_pk}?turn=N`。

### `@lexmount.com/abyss-ui`（`packages/ui/src/event`）

| 文件                          | 内容                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `session-trajectory.tsx`      | `SessionTrajectory`、`trajectoryTurnSummaries`、`trajectoryRows`                             |
| `session-event-inspector.tsx` | `SessionEventInspector`                                                                      |
| `event-content.ts`            | 从 `session-timeline.tsx` 抽出的共享读取函数：`toolContentSegments`、`isEstimatedTokenUsage` |

- 新增依赖 `@tanstack/react-virtual`。
- 组件只接收数据、文案和回调，不依赖 API、路由或 TanStack Query，符合仓库 `AGENTS.md` 的约定。

### 接口与文案

- `apps/dashboard/src/api/usage.ts`：`fetchSessionTrajectory`、`fetchUsageEvent`。
- 文案（中、英、日）：`sessions.trajectory.*`、`sessions.event.*`、`dashboard.recent.turn` / `openTurn` / `openTurnTitle`。

### 测试

格式、lint、类型检查、构建通过；dashboard 38 个、UI 包 23 个测试通过。选中条目、展开不改变选中、跳到工具结果所在事件、关闭面板这几个交互，在浏览器中用本地库副本实际操作确认过。

## 注意事项

- **Tailwind 层叠顺序**：应用的样式表排在 UI 包之后，并且会再次生成 `.absolute`、`.hidden` 这类基础类。UI 包里"基础类 + 断点覆盖"的写法（如 `hidden md:inline`）会被压住。新组件改用只在小屏生效的 `max-lg:` / `max-md:` 和容器查询（`@container`、`@max-xl:`）。UI 包中其他组件如果用了前一种写法，可能有同样的问题。
- **采集链路丢失的信息**（前端无法展示，只能改采集端）：
  - `abyss-agent-hook/.../anthropic/messages.rs`：请求只提取 `system` 和 role 为 user 的消息文本，历史中的 assistant 消息和 tool_use 块被丢弃；文本去重后用 `\n\n` 拼接，消息边界丢失。
  - `abyss-delivery-plugin/src/uploader.rs`：上报时 metadata 只由工具调用和结果重新拼出，`message_id`、`request_hash`、`provider_call_index`、`stop_reason`、`provider_usage`、`token_usage_estimated` 等全部丢失。库中事件的 metadata 只有 `content_segments` 一个键。
  - 请求和响应事件都在响应结束后生成，`observed_at` 只相差几微秒，没有请求耗时、首 token 时间等计时信息。
  - 后端支持存储原始 HTTP 诊断抓包（`agent_diagnostic_captures`），但本地没有数据。
- **本地环境**：为运行 Postgres 相关测试，用 Homebrew 安装了 `colima`、`docker`、`libpq`。libpq 是 keg-only，运行 Postgres 配置的 `cargo test` 前需要 `export LIBRARY_PATH=/opt/homebrew/opt/libpq/lib`。Colima 虚拟机不用时可以 `colima stop`。

## 待办

- **outline 接口**：前端已不再调用 `/outline`；接口和测试仍在后端，可以保留或删除。
- **trajectory 性能**：每次请求都要读取完整的原始事件再合并，大 session 需要 230–550 ms。可以缓存合并结果，或在入库时计算。
- **黑盒测试**：补上 `/trajectory`。
- **合并规则的局限**：采集端已把 system 和 user 文本拼在一起，每条流的第一条用户输入会被并进 `context`；轮次摘要取这一轮的第一条用户输入，可能取到旁路请求的内容。
- **推送**：两个仓库的本地 `main` 都未推送。
- **预览环境**：预览用的后端（18089，最新 `main` 的构建）连接会话 scratchpad 目录中的数据库副本（1.3 GB）；前端（5174）运行在 worktree `~/abyss/abyss-dashboard-timeline`。不用时需要结束进程并删除副本。
