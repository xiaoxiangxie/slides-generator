# 系统架构总览

> ⚠️ 一旦架构发生变化，请更新本文档

## 核心定位

**Slides Generator** 是一个 AI 驱动的幻灯片生成器。用户输入 URL 或文本，系统通过 **多步 Claude Code CLI 流水线** 自动生成 HTML 幻灯片。

## 核心理念

**Skill 即能力**：每个核心步骤由一个独立的 Claude Code CLI + Skill 调用完成。不在 TypeScript 中硬编码 AI 逻辑，而是让 Claude Code CLI 读取 `.claude/skills/` 下的 Skill 规范来执行任务。

## 模块划分

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Client)                                               │
│                                                                 │
│  page.tsx         ── 首页 UI：风格选择 + 输入表单 + 任务面板     │
│  preview/[id]     ── 预览页：SSE 进度 + iframe 预览              │
│                                                                 │
└────────┬──────────────────────────────────────┬─────────────────┘
         │ POST /api/generate                   │ SSE /api/generate/sse
         v                                      ^
┌─────────────────────────────────────────────────────────────────┐
│  API Layer (Next.js Route Handlers)                             │
│                                                                 │
│  route.ts    ── 接收请求，创建任务，启动流水线                    │
│  sse/        ── SSE 推送任务进度                                 │
│  result/     ── 轮询任务结果                                     │
│                                                                 │
└────────┬────────────────────────────────────────────────────────┘
         v
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline Orchestrator (lib/pipeline/)                           │
│                                                                 │
│  按顺序调用以下 Claude Code CLI 步骤：                            │
│                                                                 │
│  Step 1: 内容抓取                                                │
│    Skill: agent-browser / baoyu-url-to-markdown                 │
│    输入: URL                                                     │
│    输出: markdown 文件                                            │
│                                                                 │
│  Step 2: 内容规划                                                │
│    Skill: ljg-writes                                             │
│    输入: markdown 内容                                            │
│    输出: 结构化大纲（JSON/Markdown）                              │
│                                                                 │
│  Step 3: 幻灯片生成                                              │
│    Skill: frontend-slides                                        │
│    输入: 大纲 + 风格参数                                          │
│    输出: 单文件 HTML                                              │
│                                                                 │
│  Step 4 (未来): 视频生成                                          │
│    Skill: remotion                                               │
│    输入: HTML 幻灯片                                              │
│    输出: MP4 视频                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         |
         v
┌─────────────────────────────────────────────────────────────────┐
│  状态管理                                                        │
│                                                                 │
│  generation-store.ts ── 服务端任务状态（内存 Map）                │
│  task-store.ts       ── 客户端任务记录（localStorage）            │
│  style-presets.ts    ── 12 种风格预设                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流转

```
URL/文本
  │
  ├── (URL) ──► Step 1: agent-browser 抓取 ──► raw markdown
  │              Claude Code CLI + agent-browser skill
  │
  └── (文本) ──► 直接进入 Step 2
                    │
                    v
              Step 2: 内容规划 ──► outline.json
                Claude Code CLI + ljg-writes skill
                    │
                    v
              Step 3: 幻灯片生成 ──► slides.html
                Claude Code CLI + frontend-slides skill
                    │
                    v
              (Step 4: 视频生成 ──► video.mp4)
                Claude Code CLI + remotion skill（待集成）
```

## 技术选型

| 层 | 技术 | 理由 |
|---|------|------|
| 框架 | Next.js 15 (App Router) | 全栈一体，API Route 方便 |
| AI 执行 | Claude Code CLI | 通过 `.claude/skills/` 自带 Skill 上下文 |
| 实时通信 | SSE (Server-Sent Events) | 轻量，原生浏览器支持 |
| 状态 | 内存 Map + localStorage | 原型阶段够用，后续换 DB |
| 中间产物 | 文件系统 | 每步输出写文件，下步读取 |

## 更新日志

| 日期 | 变更 |
|------|------|
| 2026-04-13 | 初始架构文档，规划多步 Pipeline 架构 |
