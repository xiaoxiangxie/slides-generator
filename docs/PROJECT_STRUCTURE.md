# 项目结构详解

> ⚠️ 一旦项目结构发生变化，请更新本文档

## 完整目录结构

```
slides-generator/
├── .claude/skills/               # Claude Code CLI 自动加载的 Skill 目录
│   ├── agent-browser/            #   网页自动化抓取
│   ├── baoyu-url-to-markdown/    #   URL 转 Markdown
│   ├── frontend-slides/          #   HTML 幻灯片生成规范
│   └── ljg-writes/               #   内容规划与写作引擎
│
├── .claude-pipeline/             # Pipeline 中间产物（每次运行生成）
│
├── app/                          # Next.js App Router 页面与 API
│   ├── layout.tsx                #   根布局（meta、字体）
│   ├── globals.css               #   全局样式（CSS 变量）
│   ├── page.tsx                  #   首页（风格选择 + 输入表单 + 任务面板）
│   ├── preview/[id]/page.tsx     #   预览页（SSE 进度 + iframe 预览）
│   └── api/
│       ├── generate/
│       │   ├── route.ts          #   POST 生成 API（创建任务 + 启动流水线）
│       │   └── sse/route.ts      #   GET SSE 推送进度
│       └── tasks/
│           ├── route.ts          #   GET 任务列表（首页同步用）
│           └── [id]/
│               ├── route.ts      #   DELETE 删除任务
│               └── cancel/
│                   └── route.ts  #   POST 取消进行中任务
│
├── lib/                          # 业务逻辑
│   ├── style-presets.ts          #   12 种风格预设定义
│   ├── db.ts                     #   SQLite 持久化层（better-sqlite3）
│   ├── task-store.ts             #   db.ts re-export，服务端专用
│   ├── generation-store.ts       #   localStorage 客户端缓存
│   └── pipeline/
│       ├── index.ts              #   Pipeline 编排器（含提取名称/取消检查）
│       ├── claude-runner.ts      #   Claude Code CLI 调用封装
│       └── prompts.ts            #   三步 prompt 模板
│
├── public/
│   └── output/                   #   生成的幻灯片（按日期，.gitignore）
│
├── .data/                        #   SQLite 数据库文件（.gitignore）
│
├── docs/                         # 项目文档
│   ├── README.md                 #   文档索引
│   ├── ARCHITECTURE.md           #   系统架构总览
│   ├── PROJECT_STRUCTURE.md      #   本文件
│   └── superpowers/
│       └── DAILY.md              #   每日变更日志
│
├── package.json                  # 项目依赖（Next.js 15 + React 19 + TypeScript 5）
├── tsconfig.json                 # TypeScript 配置（路径别名 @/*）
├── next.config.ts                # Next.js 配置（standalone 输出，serverExternalPackages）
└── .gitignore
```

## 快速定位指南

| 我想做什么 | 去哪里 |
|-----------|--------|
| 改首页 UI | `app/page.tsx` |
| 改预览页 | `app/preview/[id]/page.tsx` |
| 改生成 API 逻辑 | `app/api/generate/route.ts` |
| 改 SSE 推送 | `app/api/generate/sse/route.ts` |
| 改任务列表同步 | `app/api/tasks/route.ts` |
| 改 Pipeline 逻辑 | `lib/pipeline/index.ts` |
| 改 Claude CLI 调用 | `lib/pipeline/claude-runner.ts` |
| 改 Prompt 模板 | `lib/pipeline/prompts.ts` |
| 改数据库表结构 | `lib/db.ts` |
| 加一种新风格 | `lib/style-presets.ts` + `.claude/skills/frontend-slides/` |
| 改内容抓取逻辑 | `.claude/skills/agent-browser/` 或 `baoyu-url-to-markdown/` |
| 改写作规范 | `.claude/skills/ljg-writes/` |
| 改幻灯片规范 | `.claude/skills/frontend-slides/` |
| 改全局样式 | `app/page.tsx` 内联 `<style>` 或 `app/globals.css` |

## 新增功能检查清单

- [ ] 是否需要新的 API Route？
- [ ] 是否需要新增 Skill？（放 `.claude/skills/`）
- [ ] 是否影响 style-presets？
- [ ] 是否需要更新 db.ts 的 JobRecord 表结构？
- [ ] 是否需要更新 SSE 推送的消息类型？
- [ ] 是否需要更新 generation-store.ts（客户端类型）？
- [ ] 更新本文档和相关 FOLDER.md
- [ ] 同步更新 docs/superpowers/DAILY.md
