# Dashboard 风格对齐、过滤器与 Token 口径适配

日期：2026-09-27 ～ 2026-09-28
仓库：`abyss-dashboard`

## 概览

| 阶段                                    | 分支                       | 状态                            |
| --------------------------------------- | -------------------------- | ------------------------------- |
| 1. 主题与首页风格对齐                   | `feat/ui-style-sync`       | 已快进合并到本地 `main`，未推送 |
| 2. 过滤器改进（时间范围、会话下拉）     | `feat/ui-style-sync`       | 同上                            |
| 3. 测试环境修复（Node 26）              | `feat/ui-style-sync`       | 同上                            |
| 4. Token 新口径适配、配色与深色主题重做 | `feat/token-usage-support` | 未合并，未推送                  |

`main` 上的提交（相对 `852d360`）：

```
a6cb3d5 feat(dashboard): add time range presets and a searchable session picker
8aaabd0 feat(ui): align dashboard theme with the product home page
38f091f test: provide localStorage when Node shadows jsdom storage
```

`feat/token-usage-support` 上的提交（基于 `a6cb3d5`）：

```
21ce58e fix(dashboard): align cache reads under input in the token legend
3912387 feat(dashboard): label token shares clearly and show them on hover
378763a feat(ui): rebuild the dark theme on graphite surfaces
fee8487 feat(ui): use a validated chart palette anchored on #fa0555
849ebd6 feat(dashboard): show cache reads and writes apart from input
837ac0a fix(dashboard): fit billion-scale token totals in cards and chart
a42bd70 feat(dashboard): show cached input apart from input and output
```

## 1. 主题与首页风格对齐

参照 `abyss-frontend` 首页（`src/app/home/*`、`src/index.css` 中的 `.abyss-home-shell`），只借用配色和字体，不引入网格、光晕、粒子等首页装饰，保持 dashboard 的简洁。

- `packages/ui/src/theme.css`：把 shadcn 默认的纯灰 neutral 色板换成首页的带紫调中性色。
  - 浅色：背景 `#f8f6fb`、文字 `#211d26`、卡片 `#ffffff`、主按钮 `#21182c`、焦点和选中色 `#6d4fc2`。
- 字体：界面字体改为 DM Sans，等宽字体改为 Fragment Mono，并新增 `--font-mono` 映射。字体包 `@fontsource/dm-sans`、`@fontsource/fragment-mono` 作为 `apps/dashboard` 的 devDependency 安装，在 `src/index.css` 中引入。原先声明的 Inter 实际从未加载。
- 统计卡片底部渐变从灰色（`from-primary/5`）改为紫色（`from-ring/5`）。

## 2. 过滤器改进

### 时间范围（Dashboard 与 Sessions 页共用）

- 新增 `src/lib/time-range.ts`。
  - 预设：不限 / 最近 24 小时 / 7 天 / 30 天 / 自定义。
  - 自定义范围精确到分钟。
  - 后端的 `to` 是开区间（`observed_at < to`）。
- 新增 `src/components/time-range-field.tsx`：一个预设下拉框；选中"自定义"后，右侧出现"开始时间 / 结束时间"两个独立的列。
- 新增 `src/components/date-time-field.tsx`：自绘的日期时间选择器，取代原生 `datetime-local`（原生控件的时分只能用上下键调）。
  - 输入框可以直接输入 `YYYY-MM-DD HH:mm`。
  - 弹出面板：只显示当月日期的月历，选中日期为主色块，今天用紫色数字标出。
  - 面板底部是 `HH : mm` 分段输入，输满两位小时自动跳到分钟，上下键微调，回车关闭，另有"现在"链接。
- 布局：`packages/ui/src/styles.css` 中，选中自定义时，宽度 ≥ 88rem 的屏幕上给两个时间列保留 11rem，其余列变窄，保证过滤器仍在一行内。
- Sessions 页 URL：使用 `range=` 和 `from=`/`to=` 参数，兼容旧的带时间的 `from`/`to` 链接。

### 会话下拉

后端没有列出会话的接口，所以前端组合两个数据源（`src/components/session-picker.tsx`）：

- 未输入关键词时：从最近 500 条事件中去重，得到当前时间范围和 Agent 下最近活跃的会话（`fetchRecentSessions`）。
- 输入关键词时：先在本地按子串过滤，同时调用 `/v1/agent-usage/search`（防抖 250ms），把搜索结果合并进列表。
- 限制：全文索引按 `-` 切分，只输入 session id 的开头几个字符（如 `8a6a`）搜不到；更早的会话只能靠搜索找到。
- 交互：支持上下键选择、回车确认，右侧有清除按钮，悬停显示完整 ID。

新增共享触发按钮 `src/components/filter-trigger.tsx`，样式与 SelectTrigger 一致。

## 3. 测试环境修复

Node 25 及以上版本自带一个全局 `localStorage`，不加 `--localstorage-file` 启动时它是 undefined，会遮住 jsdom 的 Storage。这导致 dashboard 的 11 个测试失败（在未改动的 `main` 上同样失败）。`src/test/setup.ts` 中改为提供一个内存版 Storage。

## 4. Token 新口径适配

后端和采集端把 token 拆成四类互不重合的计数（见工作区根目录的 `update.md`）：

- 输入 `input_tokens`
- 读缓存 `cache_read_tokens`
- 写缓存 `cache_write_tokens`
- 输出 `output_tokens`

四类之和为 `total_tokens`。前三类共同构成全部输入；输出与缓存无关。

### 接入

- cherry-pick 了 `abyss-dashboard-token-usage` worktree 中的 `58e47fd`（变为 `a42bd70`）。它补齐了 `DailyTokenUsageRow` 的字段，并把图表改成堆叠图。冲突只有图表颜色一处，已按新配色解决。
- `849ebd6`：写缓存不再并入"输入"，单独展示。

### 数字变大后的排版修复（`837ac0a`）

计入缓存后，每日总量达到十亿级：

- 图表 Y 轴刻度改用紧凑写法（`8亿` / `800M`）。
- 图表提示框的标签和数值之间加间距（`packages/ui/src/components/chart.tsx`）。
- 卡片宽度不足 300px 时，数值用 2xl 字号，避免把"实时"标签挤出卡片。

### 总 Token 卡片

最终形态：

```
2,100,173,567
████████████████████████▌▏      比例条，颜色与每日图表一致
● 输入    390万   ● 输出    892万
● 读缓存  20.4亿  ● 写缓存  5330万
```

- 图例两行：输入 / 输出在上，读缓存 / 写缓存在下，读缓存在输入正下方，写缓存在输出正下方。
- 数字使用 3 位有效数字的紧凑写法。
- 悬停比例条的任一段或任一图例项，显示精确值和占总量的比例，例如 `读缓存 2,028,517,696 · 占总量 96.8%`。
- 每日图表提示框的每一行附带当天占比。
- 文案：
  - 中文：输入 / 输出 / 读缓存 / 写缓存
  - 英文：Input / Output / Cache read / Cache write
  - 日文：入力 / 出力 / キャッシュ読 / キャッシュ書

## 5. 配色

所有分类色都用 dataviz 技能的 `validate_palette.js` 验证过，检查项包括：亮度范围、饱和度下限、相邻色的色弱区分度、正常视力区分度、对背景 3:1 的对比度。

### Token 用量色（`--usage-*`，`3912387`）

| 项     | 浅色      | 深色      |
| ------ | --------- | --------- |
| 读缓存 | `#6d4fc2` | `#9346e8` |
| 写缓存 | `#fa0555` | `#fa0555` |
| 输入   | `#2f7fe0` | `#3b8ef0` |
| 输出   | `#0e9f8f` | `#12a594` |

- 比例条顺序为读缓存、写缓存、输入、输出，图表从下往上的堆叠顺序与之相反。只有相邻两段需要互相区分，这两种顺序都通过了验证。蓝色的输入紧挨紫色的读缓存时，浅色下区分度不达标，所以比例条没有把两者放在一起。
- 通用的 `--chart-1..5` 也改成了同一组验证过的颜色（`fee8487`）。

### 深色主题重做（`378763a`）

原深色主题的问题：

- 内容区（`#08050f`）比侧边栏还暗，层级是反的。
- 所有表面都带明显紫色，整体发闷。
- 卡片和背景几乎分不开。
- 图表色都是浅粉彩色，亮度超出深色背景合适的范围，看起来发白发灰。

新方案是中性偏冷的石墨灰（hue 285，色度 ≤ 0.012），按层级逐级变亮：

| 层级              | 颜色                                |
| ----------------- | ----------------------------------- |
| 侧边栏外框        | `#0c0c10`                           |
| 内容区            | `#121217`                           |
| 卡片              | `#19191e`                           |
| 弹出层            | `#1d1d24`                           |
| 边框 / 输入框     | `#2d2d34` / `#37373e`               |
| 主文字 / 辅助文字 | `#f6f6f9` / `#a3a4ac`（对卡片 7:1） |

紫色只用于焦点框（`--ring: #8b6cf0`）、选中状态和图表。浅色主题未改动。

## 验证

每个提交前都在仓库根目录运行：

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`（dashboard 38 个，仓库级 16 个）
- `npm run build`

结果全部通过。界面改动都用浏览器在浅色和深色、中英日三种语言下截图检查，并用 DOM 测量确认没有截断或溢出。

## 待办与注意事项

- **合并冲突风险**：`main` 在合并 `feat/ui-style-sync` 之后多了另一个会话的提交 `d09b7a4 feat(sessions): merged trajectory and virtualized raw-event views`。它和 `feat/token-usage-support` 都修改了 `src/api/usage.ts` 与 `src/i18n/messages.ts`，合并时需要 rebase 或手动解决冲突。
- **推送**：本地 `main` 和 `feat/token-usage-support` 都未推送。以往 `main` 的提交都是通过 PR 合入的。
- **abyss-frontend**：配色改在 `@lexmount.com/abyss-ui` 中，需要发布新版本，并在 `abyss-frontend` 中升级依赖后才会生效。
- **遗留 worktree**：`abyss-dashboard-token-usage` 的 `feat/token-usage-breakdown` 已被 `feat/token-usage-support` 取代。端口 53502 上运行的 dashboard 仍使用那个 worktree 的构建，合并后需要切回主目录的构建产物（见 `update.md`）。
- **会话列表接口**：后端若补上列出会话的接口，会话下拉就不必再依赖事件去重和全文搜索。
- **未提交的改动**：工作区里 `apps/dashboard/bin/abyss-dashboard.mjs` 的权限改动（644 → 755）早于本次工作，未包含在任何提交中。
