# Dashboard 界面、Token 口径与会话详情页改动总结

日期：2026-09-27 ～ 2026-09-28
范围：`abyss-dashboard`（前端与 `@lexmount.com/abyss-ui`）、`abyss-backend`（合并与本地部署）

本文只描述当前版本的最终状态；过程中被替换掉的方案不再记录。

## 状态

| 内容                           | 位置                                           | 状态           |
| ------------------------------ | ---------------------------------------------- | -------------- |
| 主题、字体、深色主题、图表配色 | `abyss-dashboard` `main`                       | 已合并，未推送 |
| 过滤器（时间范围、会话下拉）   | `abyss-dashboard` `main`                       | 已合并，未推送 |
| Token 四类口径展示             | `abyss-dashboard` `main`                       | 已合并，未推送 |
| 测试环境修复（Node 26）        | `abyss-dashboard` `main`                       | 已合并，未推送 |
| 会话详情页重新设计             | `abyss-dashboard` `feat/session-detail-polish` | 未合并         |
| token 口径后端与时间线后端合并 | `abyss-backend` `main`（`ea2b384`）            | 已合并，未推送 |

## 1. 主题与字体（`packages/ui/src/theme.css`）

### 浅色

沿用 `abyss-frontend` 首页的带紫调中性色，只借用配色和字体，不引入首页的网格、光晕、粒子等装饰。

- 背景 `#f8f6fb`、文字 `#211d26`、卡片 `#ffffff`
- 主按钮 `#21182c`
- 焦点和选中 `--ring: #6d4fc2`

### 深色

中性偏冷的石墨灰（hue 285，色度 ≤ 0.012）。各层按亮度逐级变亮，紫色只用于焦点、选中状态和图表。

| 层级              | 颜色                                |
| ----------------- | ----------------------------------- |
| 侧边栏外框        | `#0c0c10`                           |
| 内容区            | `#121217`                           |
| 卡片              | `#19191e`                           |
| 弹出层            | `#1d1d24`                           |
| 边框 / 输入框     | `#2d2d34` / `#37373e`               |
| 主文字 / 辅助文字 | `#f6f6f9` / `#a3a4ac`（对卡片 7:1） |
| 焦点 `--ring`     | `#8b6cf0`                           |

### 字体

- 界面字体 DM Sans，等宽字体 Fragment Mono（`--font-mono`）。
- 字体包 `@fontsource/dm-sans`、`@fontsource/fragment-mono` 是 `apps/dashboard` 的 devDependency，在 `src/index.css` 中引入。

### 配色验证

所有分类色都用 dataviz 技能的 `validate_palette.js` 验证过，检查项包括亮度范围、饱和度下限、相邻色的色弱和正常视力区分度、对卡片背景 3:1 的对比度，结果全部通过。

通用图表色：

| 变量        | 浅色      | 深色      |
| ----------- | --------- | --------- |
| `--chart-1` | `#6d4fc2` | `#8b6cf0` |
| `--chart-2` | `#2f7fe0` | `#3b8ef0` |
| `--chart-3` | `#0e9f8f` | `#12a594` |
| `--chart-4` | `#fa0555` | `#fa0555` |
| `--chart-5` | `#e0a019` | `#d4900f` |

Token 用量专用色：

| 变量                  | 浅色      | 深色      |
| --------------------- | --------- | --------- |
| `--usage-cache-read`  | `#6d4fc2` | `#9346e8` |
| `--usage-cache-write` | `#fa0555` | `#fa0555` |
| `--usage-input`       | `#2f7fe0` | `#3b8ef0` |
| `--usage-output`      | `#0e9f8f` | `#12a594` |

## 2. 过滤器（Dashboard 与 Sessions 页）

### 时间范围

- `src/lib/time-range.ts`：
  - 预设：不限 / 最近 24 小时 / 7 天 / 30 天 / 自定义。
  - 自定义范围精确到分钟。
  - 后端的 `to` 按开区间处理。
- `src/components/time-range-field.tsx`：一个预设下拉框。选中"自定义"后，右侧出现"开始时间 / 结束时间"两个独立的列。
- `src/components/date-time-field.tsx`：自绘的日期时间输入，取代原生 `datetime-local`。
  - 输入框可以直接输入 `YYYY-MM-DD HH:mm`。
  - 弹出面板：月历只显示当月日期，选中日期为主色块，今天用紫色数字标出。
  - 面板底部是 `HH : mm` 分段输入：输满两位小时自动跳到分钟，上下键微调，回车关闭；另有"现在"链接。
- 布局：宽度 ≥ 88rem 时，自定义模式下给两个时间列各保留 11rem，其余列变窄，过滤器保持在一行（`packages/ui/src/styles.css`）。
- Sessions 页 URL 使用 `range=` 和 `from=` / `to=` 参数，兼容旧的带时间的 `from` / `to` 链接。

### 会话下拉（`src/components/session-picker.tsx`）

- 未输入关键词时：从最近 500 条事件中去重，列出当前时间范围和 Agent 下的会话。
- 输入关键词时：在本地按子串过滤，同时调用 `/v1/agent-usage/search`（防抖 250ms），结果合并显示。
- 交互：上下键选择、回车确认、清除按钮、悬停显示完整 ID。
- 共享触发按钮 `src/components/filter-trigger.tsx`，样式与 SelectTrigger 一致。
- 限制：
  - 后端没有列出会话的接口，更早的会话只能靠搜索找到。
  - 全文索引按 `-` 切分，只输入 session id 的开头几个字符搜不到。

## 3. Token 四类口径（Dashboard）

后端存储四类互不重合的计数，四者之和为总量：

- 输入 `input_tokens`
- 读缓存 `cache_read_tokens`
- 写缓存 `cache_write_tokens`
- 输出 `output_tokens`

### 总 Token 卡片

```
2,100,173,567
████████████████████████▌▏      比例条：读缓存、写缓存、输入、输出
● 输入    390万   ● 输出    892万
● 读缓存  20.4亿  ● 写缓存  5330万
```

- 比例条和图例使用 `--usage-*` 色，与每日图表一致。
- 图例两行对齐：第一行输入、输出，第二行读缓存、写缓存。
- 数字使用 3 位有效数字的紧凑写法。
- 悬停比例条的任一段或任一图例项，显示精确值和占总量的比例，例如 `读缓存 2,028,517,696 · 占总量 96.8%`。
- 文案：
  - 中文：输入 / 输出 / 读缓存 / 写缓存
  - 英文：Input / Output / Cache read / Cache write
  - 日文：入力 / 出力 / キャッシュ読 / キャッシュ書
- 卡片宽度不足 300px 时，数值用 2xl 字号，避免挤出"实时"标签。

### 每日图表

- 四类堆叠，堆叠高度即当日总量。
- Y 轴刻度用紧凑写法（`8亿` / `800M`）。
- 提示框每行显示精确值和当天占比。
- 图表提示框的标签和数值之间留有间距（`packages/ui/src/components/chart.tsx`）。

## 4. 会话详情页 `/sessions/<id>`（`feat/session-detail-polish`）

### 头部（`apps/dashboard/src/app/sessions/detail-page.tsx`）

- 顶部是"← Agent 看板"返回链接。
- 标题区：紫色 Agent 图标块、Agent 名称、版本徽章；下一行是会话 ID 和复制按钮。
- 右侧："详细信息"弹出层，列出全部原始字段和 metadata；以及"合并视图 / 原始事件"切换。
- 摘要条：开始时间、持续时长、轮次、主要模型。多个模型时显示成 `名称 +N`，悬停可查看完整列表。

### 合并视图（`packages/ui/src/event/session-trajectory.tsx`）

- 放在圆角卡片中。
- 左侧轮次栏：淡底色；选中节点为带光圈的紫色圆点；工具次数显示为小胶囊。
- 轮次之间用"第 N 轮 · 时间"加细线分隔。
- 用户消息：淡紫色气泡，标注"用户"。
- 助手回复：纯正文，时间在右侧，不带图标和标签。
- 工具调用、工具结果、上下文：可展开的细卡片，只有展开箭头和文字标签。展开后输入和结果分为独立区块。

### 原始事件（`packages/ui/src/event/session-ledger.tsx`）

- 放在圆角卡片中。
- "请求"用淡紫色标签，"响应"用淡青色标签（`EventTypeBadge`）。
- 选中行用紫色底色和左侧紫色竖线标记。

## 5. 测试环境

`apps/dashboard/src/test/setup.ts`：Node 25 及以上版本不加 `--localstorage-file` 时，自带的全局 `localStorage` 为 undefined，会遮住 jsdom 的 Storage。这里改为提供一个内存版 Storage。

## 6. 后端与本地部署

- `abyss-backend` `main`：合并了 token 口径分支（`ea2b384`），同时具备四类计数、`token_usage` 新字段、历史数据 migration，以及会话大纲和轨迹接口。
- 后端检查结果：fmt、两套 feature 的 clippy、SQLite feature 测试都通过。默认 feature 的测试因本机缺少 `libpq` 无法链接。

当前运行的服务：

| 端口  | 服务                      | 来源                                                                                 |
| ----- | ------------------------- | ------------------------------------------------------------------------------------ |
| 53489 | 后端                      | `abyss-backend` `main` release（SQLite feature），日志 `local/logs/backend-main.log` |
| 53502 | Dashboard 构建产物        | `abyss-dashboard/apps/dashboard/dist`，日志 `local/logs/dashboard-main.log`          |
| 5173  | Dashboard vite 开发服务器 | `abyss-dashboard` 当前检出分支                                                       |

- 后端连接本地真实库 `~/Library/Application Support/Abyss/cli/local/data/abyss.sqlite`。
- 53489 和 53502 都是手动用 nohup 启动的，不要用 `abyss deploy-local stop/start` 管理。
- `dist` 最近一次是在 `feat/session-detail-polish` 上构建的，所以 53502 当前显示的是包含会话详情页改动的版本。
- 已删除的 worktree 和分支：`abyss-dashboard-timeline`、`abyss-dashboard-token-usage`、`abyss-backend-timeline`、`abyss-backend-token-usage`，以及对应的 `feat/*` 分支。

## 验证

`abyss-dashboard` 的每个提交前都在仓库根目录运行：

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`（dashboard 38 个，仓库级 28 个）
- `npm run build`

结果全部通过。界面改动都用浏览器在浅色和深色、中英日三种语言、桌面和手机宽度下截图检查，并用 DOM 测量确认没有截断或溢出。

## 待办

- **会话详情页**：`feat/session-detail-polish` 待确认后合入 `main`。
- **推送**：`abyss-dashboard` 和 `abyss-backend` 的 `main` 都未推送，以往 `main` 的提交都是通过 PR 合入的。
- **abyss-frontend**：需要发布新版 `@lexmount.com/abyss-ui` 并在 `abyss-frontend` 中升级，改动才会生效。
- **abyss-rs**：`abyss-rs-token-usage` worktree 的 token 口径改动尚未合入 `abyss-rs` 的 `main`，当前运行的 broker 使用该 worktree 的构建。
- **会话列表接口**：后端补上后，会话下拉就不必再依赖事件去重和全文搜索。
- **原始事件详情面板**：正文使用强制断行，单词会在中间断开，尚未处理。
- **未提交的改动**：工作区里 `apps/dashboard/bin/abyss-dashboard.mjs` 的权限改动（644 → 755）早于本次工作，未提交。
