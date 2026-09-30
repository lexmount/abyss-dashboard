# Dashboard 界面、Token 口径、会话列表与本地部署

日期：2026-09-27 ～ 2026-09-29
范围：`abyss-dashboard`（前端与 `@lexmount.com/abyss-ui`）、`abyss-backend`、`abyss-rs`（合并与本地部署）

本文只描述当前版本的最终状态，过程中被替换掉的方案不再记录。相关文档：

- `2026-09-28-session-trajectory.md`：会话详情页的合并视图、按需加载与事件检查面板
- `2026-09-29-token-verification-providers-codex-text.md`：Token 计量验证、服务商列表、Codex 请求文本问题

## 状态

所有改动都已合入各仓库本地的 `main`，没有未合并的功能分支，也都还未推送。

| 仓库              | `main`    | 领先 `origin/main` | 其他分支 / worktree                                            |
| ----------------- | --------- | ------------------ | -------------------------------------------------------------- |
| `abyss-dashboard` | `c1f5e62` | 31 个提交          | 无                                                             |
| `abyss-backend`   | `8b90475` | 5 个提交           | 无                                                             |
| `abyss-rs`        | `29be8df` | 3 个提交           | `explore/history-import`（worktree `abyss-rs-history-import`） |

## 1. 主题与字体（`packages/ui/src/theme.css`）

### 浅色

沿用 `abyss-frontend` 首页的带紫调中性色，只借用配色和字体，不引入首页的网格、光晕、粒子等装饰。

- 背景 `#f8f6fb`、文字 `#211d26`、卡片 `#ffffff`
- 主按钮 `#21182c`
- 焦点和选中 `--ring: #6d4fc2`

### 深色

与官网 abyss.lexmount.cn 的夜间模式一致：紫黑色调，色相固定为 298，只调亮度，各层逐级变亮。

| 层级              | 颜色                                  |
| ----------------- | ------------------------------------- |
| 侧边栏外框        | `#08050f`（官网底色）                 |
| 内容区            | `#0e0a16`                             |
| 卡片              | `#15111e`                             |
| 弹出层            | `#1b1724`                             |
| 边框 / 输入框     | `#2b2735` / `#363140`                 |
| 主文字 / 辅助文字 | `#f6f5fb` / `#a9a5b4`（对卡片 7.7:1） |
| 焦点 `--ring`     | `#c4b5fd`（官网强调色）               |
| 主按钮            | 白底 `#f6f5fb`、深紫字 `#0f0a18`      |

内容区顶部有一层很淡的紫色光晕，呼应官网首屏（`packages/ui/src/styles.css`）。

### 字体

- 界面字体 DM Sans，等宽字体 Fragment Mono（`--font-mono`）。
- 字体包 `@fontsource/dm-sans`、`@fontsource/fragment-mono` 是 `apps/dashboard` 的 devDependency，在 `src/index.css` 中引入。

### 配色验证

分类色都用 dataviz 技能的 `validate_palette.js` 验证过，检查项包括：亮度范围、饱和度下限、相邻色的色弱区分度和正常视力区分度、对卡片背景 3:1 的对比度。深色主题更换后，又对新的卡片底色重新验证过一遍。

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

## 2. Dashboard 首页

### 过滤器

依次为：时间范围、智能体、服务商、模型、会话、事件。点"应用"后生效，"重置"按钮使用撤销图标。

- **时间范围**
  - 逻辑在 `src/lib/time-range.ts`。预设：不限 / 最近 24 小时 / 7 天 / 30 天 / 自定义。自定义范围精确到分钟，后端的 `to` 按开区间处理。
  - `src/components/time-range-field.tsx` 渲染预设下拉框，选中"自定义"后右侧出现"开始时间 / 结束时间"两列。
  - `src/components/date-time-field.tsx` 是自绘的日期时间输入，取代原生 `datetime-local`：
    - 可以直接输入 `YYYY-MM-DD HH:mm`；
    - 弹出面板只显示当月月历；
    - 面板底部是 `HH : mm` 分段输入，输满两位小时自动跳到分钟，上下键微调，回车关闭；另有"现在"链接。
  - 宽度 ≥ 88rem 时，自定义模式下给两个时间列各保留 11rem，过滤器保持在一行（`packages/ui/src/styles.css`）。
- **服务商、模型**：下拉选项来自汇总接口（`group_by=provider,model`），范围跟随时间和智能体筛选，按用量从大到小排列。选中服务商后，模型只保留该服务商用过的。选项逻辑在 `src/lib/usage-choices.ts`，首页的服务商部分由另一个会话完成（`c1f5e62`）。
- **会话**：`src/components/session-picker.tsx`。
  - 未输入关键词时，从最近 500 条事件中去重列出会话；
  - 输入关键词时，在本地按子串过滤，同时调用全文搜索（防抖 250ms），两者结果合并；
  - 支持上下键选择、回车确认、清除按钮，悬停显示完整 ID。

### 总 Token 卡片与每日图表

后端存储四类互不重合的计数，四者之和为总量：输入、读缓存、写缓存、输出。

```
2,100,173,567
████████████████████████▌▏      比例条：读缓存、写缓存、输入、输出
● 输入    390万   ● 输出    892万
● 读缓存  20.4亿  ● 写缓存  5330万
```

- **卡片**
  - 比例条和图例使用 `--usage-*` 色；图例第一行是输入、输出，第二行是读缓存、写缓存，上下对齐。
  - 数字用 3 位有效数字的紧凑写法。悬停任一段或任一图例项，显示精确值和占总量的比例。
  - 卡片宽度不足 300px 时，数值改用 2xl 字号。
- **每日图表**
  - 四类堆叠显示，Y 轴刻度用紧凑写法（`8亿` / `800M`）。
  - 提示框每行显示精确值和当天占比。

### 最近事件

- **列顺序**：观测时间、会话、轮次、模型、智能体、Token、事件、平台 / 主机，全部左对齐。
- **会话**：只显示 ID 的第一段，后面带外链图标，悬停显示完整 ID（`src/lib/session-id.ts`）。
- **Token**：请求行在总量下面多一行"输入 / 缓存命中"，例如 `2 / 57.8万`。
- **刷新**：刷新按钮和"更新于"时间在这张卡片的右上角。点击后重新拉取整页的用量数据，相对时间范围的终点移到当前时刻。

## 3. 会话列表页 `/sessions`

### 前端

- **默认列表**（`src/app/sessions/session-list.tsx`）
  - 打开即列出全部观测到的会话，按最后活跃时间倒序，每页 20 条。
  - 列为：最后活跃、会话、智能体、轮次、事件、Token、主机 / 平台。
  - 点击整行进入会话详情。
- **过滤器**：时间范围、智能体、服务商、模型，同时作用于列表和内容搜索。
  - 服务商和模型的语义是"会话中用过这个服务商或模型"，选项来源与首页相同。
  - "事件"对会话没有意义，已经删除。
- **内容搜索**：输入关键词后切换为全文搜索结果，可以搜对话内容、命令和文件路径。
- **URL 参数**：`q`、`range`、`from`、`to`、`agent_name`、`llm_provider`、`llm_model`、`page`。

### 后端（`abyss-backend`）

新增 `GET /v1/agent-usage/sessions`（`usage/session_list.rs`），SQLite 与 PostgreSQL 各有一份实现（`storage/*/session_list.rs`）。

| 参数           | 含义                                                 |
| -------------- | ---------------------------------------------------- |
| `from`         | 最后活跃时间不早于此时刻                             |
| `to`           | 会话开始时间早于此时刻                               |
| `agent_name`   | 智能体，Claude 的几个别名按同一个处理                |
| `llm_provider` | 会话中至少有一个事件来自该服务商（名称规范化后比较） |
| `llm_model`    | 会话中至少有一个事件使用该模型（精确匹配）           |
| `page`         | 从 1 开始                                            |
| `page_size`    | 1–100，默认 20                                       |

- 返回 `total_sessions`、`page`、`page_size`、`has_more` 和 `items`。
- 每一项包含会话 ID、智能体、版本、主机、平台、开始 / 结束时间、最后活跃时间、轮次数、事件数、Token 总量。
- 最后活跃时间取会话里最新事件的时间，没有事件时取开始时间。

## 4. 会话详情页

头部（身份区、摘要条、详细信息弹出层）和合并视图、原始事件的视觉样式由本次工作完成。之后的结构变化（事件检查面板、按需加载等）见 `2026-09-28-session-trajectory.md`。

## 5. 测试环境

`apps/dashboard/src/test/setup.ts`：Node 25 及以上版本在不加 `--localstorage-file` 启动时，自带的全局 `localStorage` 为 undefined，会遮住 jsdom 的 Storage。这里改为提供一个内存版 Storage。

## 6. 合并与本地部署

### 合并

- **`abyss-backend`**：`main` 包含 token 四类口径（含历史数据 migration）、会话大纲和轨迹接口、会话列表接口。
- **`abyss-rs`**：`main` 包含三项修复：token 四类口径、Codex SSE 重复响应、macOS CA 信任检查。原来的 `fix/codex-sse-and-macos-ca` 和 `feat/token-usage-breakdown` 分支都已合并并删除。
- **已删除的 worktree**：`abyss-dashboard-timeline`、`abyss-dashboard-token-usage`、`abyss-dashboard-providers`、`abyss-backend-timeline`、`abyss-backend-token-usage`、`abyss-rs-token-usage`。

### 当前运行的服务

只保留一份：

| 端口  | 服务                     | 来源                                                                                     |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------- |
| 53489 | 后端                     | `abyss-backend` `main` release（SQLite feature），日志 `local/logs/backend-main.log`     |
| 53502 | Dashboard                | `abyss-dashboard/apps/dashboard/dist`（`c1f5e62`），日志 `local/logs/dashboard-main.log` |
| 57455 | broker + delivery-plugin | `abyss-rs` `main` release，通过 `abyss proxy start` 启动                                 |

- 日志目录为 `~/Library/Application Support/Abyss/cli/local/logs`。
- 后端连接本地真实库 `~/Library/Application Support/Abyss/cli/local/data/abyss.sqlite`。
- 53489 和 53502 是手动用 nohup 启动的。53502 直接读取仓库里的 `dist`，重新构建后它会跟着变化。
- 本机的 Claude Code 和 Codex 通过 57455 代理访问网络，重启 broker 会让它们短暂断线。

### deploy-local

`abyss deploy-local start` 默认使用发布版（后端 1.0.0、dashboard npm 包 0.1.0），它们没有本次的改动。要改用本地构建，可以设置环境变量：

```bash
ABYSS_LOCAL_BACKEND_BIN=~/abyss/abyss-backend/target/release/abyss-backend \
ABYSS_LOCAL_DASHBOARD_BIN=~/abyss/abyss-dashboard/apps/dashboard/bin/abyss-dashboard.mjs \
~/abyss/abyss-rs/target/release/abyss deploy-local start
```

- dashboard 启动脚本需要有可执行权限，而仓库里的文件是 644。
- `deploy-local stop` 会连代理一起停掉。

## 验证

- **`abyss-dashboard`**：每个提交前都在仓库根目录运行 `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`（dashboard 40 个、UI 包 23 个）、`npm run build`，全部通过。
- **`abyss-backend`**：`cargo +nightly fmt --check`、两套 feature 的 clippy 通过；SQLite feature 测试 38 个通过。默认 feature 的测试因本机缺少 `libpq` 无法链接，PostgreSQL 实现只经过编译和 clippy 检查。
- **`abyss-rs`**：合并前 fmt、clippy、全部测试（约 480 个）通过。重启 broker 后，新的请求带着四类 token 计数写入了后端。
- **界面**：界面改动都在 Ego 浏览器中实际操作和截图检查过，覆盖浅色与深色、中英日三种语言、桌面与手机宽度，并用 DOM 测量确认没有截断、溢出或错位。

## 待办

- **推送**：三个仓库的 `main` 都未推送；以往 `main` 的提交都是通过 PR 合入的。
- **abyss-frontend**：需要发布新版 `@lexmount.com/abyss-ui`，并在 `abyss-frontend` 中升级依赖，主题等改动才会生效。
- **会话下拉**：首页的会话下拉仍靠事件去重和全文搜索，可以改用新的会话列表接口。
- **原始事件正文**：正文使用强制断行，单词会在中间断开。
- **abyss-rs 未提交改动**：主目录有另一个会话未提交的改动（两个 README、两个 `docs` 目录、`runtime-policy.toml`）。其中 `runtime-policy.toml` 会作为默认配置编进 `abyss` 命令行，只在本地配置不存在时生效。
- **Codex 请求文本**：见 `2026-09-29-token-verification-providers-codex-text.md`。
