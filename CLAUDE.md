# CLAUDE.md — Wah Tat（华达）集团网站项目文档

> 项目路径：`d:\Debugging website`
> 仓库地址：https://github.com/hjc168/wahtat-website
> 在线地址：https://hjc168.github.io/wahtat-website/
> 创建日期：2026-07-16

---

## 一、项目初始化步骤

### 1.1 环境准备

| 步骤 | 命令 / 操作 | 状态 |
|---|---|---|
| 安装 GitHub CLI | `winget install --id GitHub.cli` | ✅ |
| 登录 GitHub | `gh auth login` → 浏览器授权 | ✅ |
| 初始化 Git 仓库 | `git init` | ✅ |
| 配置用户信息 | `git config user.email "..."` / `git config user.name "..."` | ✅ |

### 1.2 首次提交

```bash
cd "d:/Debugging website"
git init
git add website.html
git commit -m "feat: UCP Group 风格网站 — 初版"
```

提交 SHA: `e71444e`

### 1.3 部署上线（GitHub Pages）

```bash
# 创建 GitHub 仓库并推送
gh repo create ucp-website --public --source=. --remote=origin --push

# 启用 GitHub Pages
gh api repos/hjc168/ucp-website/pages -X POST \
  -f "source[branch]=master" \
  -f "source[path]=/"
```

> ⚠️ **注意**：GitHub Pages 默认入口文件是 `index.html`，必须确保仓库根目录存在 `index.html`。

### 1.4 修复 404 问题

```bash
# 复制 website.html → index.html
cp website.html index.html
git add index.html
git commit -m "fix: rename to index.html for GitHub Pages"
git push origin master
```

提交 SHA: `0101c4d`

### 1.5 后续更新流程

```bash
cd "d:/Debugging website"
# 修改代码...
git add website.html index.html
git commit -m "描述你的修改"
git push
```

---

## 二、文件结构

```
d:\Debugging website\
├── index.html          ← GitHub Pages 入口（website.html 的副本）
├── website.html        ← 主开发文件
└── CLAUDE.md           ← 本文档
```

---

## 三、页面结构

```
┌──────────────────────────────────────────────────┐
│ 1. Header (sticky, 80px)                         │
│    ├── Logo (UCP GROUP, 品红+深灰)               │
│    ├── 导航菜单 (带下拉子菜单)                     │
│    └── 操作区 (语言切换 / 搜索 / LinkedIn)        │
├──────────────────────────────────────────────────┤
│ 2. Hero 英雄区 (100vh - 80px)                     │
│    ├── 视频背景 + 遮罩                            │
│    ├── 引用文字 (渐入动画)                         │
│    ├── CTA 按钮                                   │
│    └── 滚动指示器                                 │
├──────────────────────────────────────────────────┤
│ 3. Products 产品卡片区 (.section--cream)           │
│    └── 3 列卡片网格 (花卉/家居/节庆)               │
├──────────────────────────────────────────────────┤
│ 4. Global Reach 全球版图区                        │
│    ├── 世界地图图片                                │
│    └── 3 个统计数据 (60+/5/1,200+)               │
├──────────────────────────────────────────────────┤
│ 5. Testimonials 推荐轮播区 (.section--light)      │
│    ├── 推荐卡片 (自动播放 5s)                      │
│    ├── 前后箭头 + 圆点指示器                       │
│    └── 3 条推荐内容                               │
├──────────────────────────────────────────────────┤
│ 6. Eco-Friendly 环保产品区                        │
│    └── 左图右文分屏布局 (.split)                   │
├──────────────────────────────────────────────────┤
│ 7. Sustainability 可持续发展区 (.section--cream)   │
│    └── 右图左文分屏布局 (.split--reverse)          │
├──────────────────────────────────────────────────┤
│ 8. Impact 影响力数据区 (渐变背景)                   │
│    └── 4 列统计卡片 (2%/137K/10M/2K)              │
├──────────────────────────────────────────────────┤
│ 9. People of UCP 人物视频区 (.section--light)     │
│    └── 3 列视频卡片 (含播放按钮)                    │
├──────────────────────────────────────────────────┤
│ 10. CTA Banner 行动号召区                          │
│     └── 紫色→品红渐变 + 白色按钮                   │
├──────────────────────────────────────────────────┤
│ 11. Footer 页脚 (.color-darker)                   │
│     ├── 4 列网格 (品牌/链接/资源/地址)              │
│     └── 版权信息 + 社交图标                         │
├──────────────────────────────────────────────────┤
│ [Search Overlay 搜索弹窗 (fixed, z-index: 9999)]   │
└──────────────────────────────────────────────────┘
```

---

## 四、设计系统

### 4.1 色彩方案

| 变量名 | 色值 | 用途 |
|---|---|---|
| `--color-dark` | `#32373c` | 正文文字、深色区域 |
| `--color-darker` | `#1a1d20` | Footer 背景 |
| `--color-purple` | `#5636d1` | 主强调色、按钮、链接 hover |
| `--color-magenta` | `#e2498a` | 副强调色、Logo、hover 点缀 |
| `--color-green` | `#2e7d32` | （预留）环保主题色 |
| `--color-teal` | `#3d8b7d` | （预留）环保主题色 |
| `--color-cream` | `#f7f5f0` | 暖色背景区块 |
| `--color-light-gray` | `#f4f4f4` | 浅灰背景区块 |
| `--color-white` | `#ffffff` | 白色背景 |
| `--color-border` | `#e5e7eb` | 边框线 |
| `--color-text-light` | `#6b7280` | 次要文字 |

### 4.2 字体

| 用途 | 字体族 | Fallback |
|---|---|---|
| 正文 | `'Inter'` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| 标题/引用 | `'Playfair Display'` | `Georgia, 'Times New Roman', serif` |
| 图标 | `Font Awesome 6.5.1` | CDN 加载 |

字体来源：Google Fonts CDN

### 4.3 字体大小层级

| 层级 | 尺寸 | 用途 |
|---|---|---|
| Section 标题 | `clamp(28px, 4vw, 42px)` | 各区块主标题 |
| Hero 引用 | `clamp(20px, 3.5vw, 32px)` | 英雄区引用文字 |
| 产品卡片标题 | `18px` | 卡片内标题 |
| 正文段落 | `16px` | `.split__content p` |
| 导航链接 | `14px` | 顶部导航 |
| Label 标签 | `12px` | `.section__label` 小标签 |
| 统计数字 | `42px` | `.impact-card__number` |

### 4.4 间距系统

| 元素 | 值 |
|---|---|
| Section 上下间距 | `100px`（移动端 `60px`）|
| 容器最大宽度 | `1280px` |
| 容器内边距 | `40px`（平板 `24px`，手机 `20px`）|
| 网格间距 | `30px` |
| Header 高度 | `80px`（移动端 `64px`）|

### 4.5 圆角

| 元素 | 值 |
|---|---|
| 产品卡片 | `16px` |
| 分屏图片 | `16px` |
| 视频卡片 | `16px` |
| 影响卡片 | `16px` |
| 搜索弹窗 | `16px` |
| CTA 按钮 | `50px` |
| 语言切换按钮 | `50px` |
| 导航下拉菜单 | `12px` |
| 导航链接 | `6px` |

### 4.6 动效

| 动效 | 实现 | 时长 |
|---|---|---|
| 卡片 hover 上浮 | `transform: translateY(-6px)` + `box-shadow` | 0.3s |
| 导航下拉展开 | `opacity` + `transform: translateY` | 0.3s |
| Hero 文字渐入 | `@keyframes fadeInUp` | 1s（延迟 0.3s） |
| Hero 滚动指示 | `@keyframes bounce` | 2s 循环 |
| 图片 hover 缩放 | `transform: scale(1.05)` | 0.6s |
| 滚动渐入 | Intersection Observer | 0.6s |
| 推荐轮播切换 | `transform: translateX` | 0.5s |
| 推荐自动播放 | `setInterval` | 5s |
| 搜索弹窗 | `opacity` + `visibility` | 0.3s |

---

## 五、响应式断点

### 5.1 断点策略（移动优先 → 桌面）

| 断点 | 最大宽度 | 目标设备 |
|---|---|---|
| Default | 全宽度 | 桌面端 |
| `@media (max-width: 1024px)` | 1024px | 平板横屏 |
| `@media (max-width: 768px)` | 768px | 平板竖屏 / 大手机 |
| `@media (max-width: 480px)` | 480px | 小手机 |

### 5.2 各断点布局变化

#### 1024px 以下
- 容器内边距缩小为 `24px`
- 导航链接间距缩小
- 产品卡片间距缩小为 `20px`
- 影响力卡片从 4 列变为 2 列
- 视频卡片从 3 列变为 2 列
- Footer 从 4 列变为 2 列
- 分屏布局间距缩小

#### 768px 以下
- Header 高度缩小为 `64px`
- Section 间距缩小为 `60px`
- 容器内边距缩小为 `20px`
- **汉堡菜单激活**：导航滑入式侧边栏
- 导航下拉变为手风琴展开
- 搜索和社交图标隐藏
- 产品卡片 → 单列（最大 400px 居中）
- 分屏布局 → 上下堆叠
- 全球数据 → 单列
- 影响力卡片 → 2 列
- 视频卡片 → 单列（最大 400px 居中）
- Footer → 单列
- Hero → `70vh`（最小 450px）

#### 480px 以下
- 影响力卡片 → 单列（最大 280px 居中）
- 统计数字 → `32px`

### 5.3 移动端导航行为

- 点击汉堡图标 → `header__toggle.active` + `mainNav.open`
- 点击带子菜单的导航链接 → 展开/折叠下拉
- 项目通过 `.nav__item.open` 控制下拉显示

---

## 六、交互功能

### 6.1 导航

| 功能 | 实现 |
|---|---|
| 下拉菜单 | CSS `:hover` 触发（桌面）/ JS `click` 切换（移动端） |
| Sticky Header | `position: sticky; top: 0; z-index: 1000` |
| 滚动阴影 | `window.scroll > 50` 时添加 `.scrolled` class |

### 6.2 搜索

| 功能 | 实现 |
|---|---|
| 打开搜索 | 点击搜索按钮 → 弹出全屏 Overlay |
| 关闭搜索 | 点击 X / 点击遮罩 / 按 Escape |
| 自动聚焦 | Overlay 打开时自动 focus 输入框 |

### 6.3 推荐轮播

| 功能 | 实现 |
|---|---|
| 上一张/下一张 | 箭头按钮 + 圆点指示器 |
| 自动播放 | `setInterval` 5 秒切换 |
| 循环 | `(index + total) % total` 取模运算 |
| 圆点动画 | 激活圆点变为长条（`width: 24px; border-radius: 4px`） |

### 6.4 滚动渐入动画

- 使用 `IntersectionObserver`（threshold: 0.1）
- 观察元素：`.product-card`, `.impact-card`, `.video-card`, `.split__image`, `.split__content`
- 初始状态：`opacity: 0; transform: translateY(30px)`
- 进入视口：`opacity: 1; transform: translateY(0); transition: 0.6s`

---

## 七、外部依赖

| 依赖 | 来源 | 用途 |
|---|---|---|
| Font Awesome 6.5.1 | `cdnjs.cloudflare.com` | 图标 |
| Inter 字体 | `fonts.googleapis.com` | 正文字体 |
| Playfair Display 字体 | `fonts.googleapis.com` | 标题/引用字体 |
| Unsplash 图片 | `images.unsplash.com` | 占位图片 |

---

## 八、Git 提交记录

| SHA | 信息 |
|---|---|
| `e71444e` | `feat: UCP Group 风格网站 — 初版` |
| `0101c4d` | `fix: rename to index.html for GitHub Pages` |

---

## 九、已知注意事项

1. **视频背景**：Hero 区的 `<video>` 指向 UCP 官网视频，跨域可能无法加载。有 `<img>` fallback 兜底。
2. **占位图片**：产品卡片和分屏图片使用 Unsplash 占位图，后续可替换为真实产品图片。
3. **视频卡片**：People of UCP 的视频缩略图使用 UCP 官网图片，点击播放功能仅作 UI 演示。
4. **同步维护**：`website.html` 和 `index.html` 需保持同步更新，或考虑删除 `website.html` 直接在 `index.html` 上开发。
5. **语言切换**：当前仅 UI 展示，未实现多语言切换逻辑。
