# Slides Generator

> 输入 URL 或文本 → AI 自动生成 12 种风格的 HTML 幻灯片

基于 Next.js 15 + TypeScript 构建的 AI 幻灯片生成器。用户输入一个链接或粘贴文本，系统通过 **多步 Claude Code CLI 流水线** 自动生成单文件 HTML 幻灯片。

## 功能特性

- **12 种内置风格**：从霓虹赛博朋克到牛皮纸质感，每种风格有独立的配色、字体和视觉调性
- **双比例**：支持横屏 16:9（YouTube / 电脑端）和竖屏 9:16（抖音 / 小红书）
- **三步 Skill Pipeline**：每步由独立的 Claude Code CLI + Skill 完成
- **实时进度**：SSE 推送三步生成进度，前端任务面板实时更新
- **单文件输出**：自包含 HTML 文件，可直接分享或下载

## 核心架构：多步 Skill Pipeline

```
Step 1: 内容抓取 (agent-browser)
   └─ 输入: URL
   └─ 输出: .claude-pipeline/{id}/01-content.md
   
Step 2: 内容规划 (ljg-writes)
   └─ 输入: 01-content.md
   └─ 输出: .claude-pipeline/{id}/02-outline.md
   
Step 3: 幻灯片生成 (frontend-slides)
   └─ 输入: 02-outline.md + 风格参数
   └─ 输出: public/output/{date}/{id}.html
```

每一步都是一次独立的 `claude --print` 调用，通过 `.claude/skills/` 目录自动获得 Skill 上下文。

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 15.1.0 (App Router, standalone 模式) |
| 语言 | TypeScript 5, React 19 |
| AI 执行 | Claude Code CLI (`claude --print`)，三步流水线 |
| 实时通信 | Server-Sent Events (SSE)，800ms 轮询 |
| 状态管理 | 服务端：全局内存 Map；客户端：localStorage |

## 项目结构

```
slides-generator/
├── .claude/skills/               # Claude Code CLI 技能目录（自动加载）
│   ├── agent-browser/            #   网页自动化抓取
│   ├── baoyu-url-to-markdown/    #   URL 转 Markdown
│   ├── frontend-slides/          #   HTML 幻灯片生成规范
│   └── ljg-writes/               #   内容规划与写作引擎
│
├── app/                          # Next.js 页面与 API
│   ├── page.tsx                  #   首页（风格选择 + 输入 + 任务面板）
│   ├── preview/[id]/page.tsx     #   预览页（三步进度 + iframe 预览）
│   └── api/generate/
│       ├── route.ts              #   POST 生成 API → 启动 Pipeline
│       ├── sse/route.ts          #   SSE 进度推送
│       └── result/[id]/route.ts  #   轮询结果
│
├── lib/
│   ├── pipeline/                 #   ⭐ 核心 Pipeline 模块
│   │   ├── index.ts              #     编排器（串联三步）
│   │   ├── claude-runner.ts      #     Claude Code CLI 调用封装
│   │   └── prompts.ts            #     三步 prompt 模板
│   ├── style-presets.ts          #   12 种风格预设
│   ├── generation-store.ts       #   服务端任务状态
│   └── task-store.ts             #   客户端任务记录
│
├── public/styles/                # 风格预览 HTML 文件
├── docs/                         # 项目文档（vibe-dev 规范）
└── .claude-pipeline/             # Pipeline 中间产物（gitignore）
```

## 技能依赖

| Skill | 用途 | 在 Pipeline 中的角色 |
|-------|------|---------------------|
| `agent-browser` | 无头浏览器抓取 | Step 1: 内容抓取 |
| `baoyu-url-to-markdown` | URL 转 Markdown | Step 1: 备选抓取方式 |
| `ljg-writes` | 口语化内容规划 | Step 2: 幻灯片大纲 |
| `frontend-slides` | HTML 幻灯片生成 | Step 3: 最终输出 |

### Skill 更新

```bash
cp -r ~/.agents/skills/<skill-name> ./.claude/skills/
```

## 环境要求

- **Node.js** ≥ 18
- **Claude Code CLI** 已安装（`/opt/homebrew/bin/claude` 或 PATH 中的 `claude`）

## 开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 使用流程

1. 选择风格（12 选 1），支持实时预览
2. 选择比例：横屏 16:9 或竖屏 9:16
3. 输入 URL 或粘贴文本
4. 点击 **⚡ Generate Slides**
5. 左上角 📋 Tasks 面板显示三步进度：
   - 🌐 agent-browser — 正在抓取页面内容
   - ✍️ ljg-writes — 正在规划幻灯片结构
   - 🎨 frontend-slides — 正在生成 HTML
6. 完成后点击 **Open ↗** 预览或下载

## 待办

- [ ] remotion 视频生成集成（Step 4）
- [ ] 用户确认大纲后再生成
- [ ] 生产环境持久化（DB 替换内存 Map）
