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
├── app/                          # Next.js App Router 页面与 API
│   ├── layout.tsx                #   根布局（meta、字体）
│   ├── globals.css               #   全局样式（CSS 变量、暗色主题）
│   ├── page.tsx                  #   首页（风格选择 + 输入表单 + 任务面板）
│   ├── preview/[id]/page.tsx     #   预览页（SSE 进度 + iframe 预览）
│   └── api/generate/
│       ├── route.ts              #   POST 生成 API（创建任务 + 启动流水线）
│       ├── sse/route.ts          #   GET SSE 推送进度
│       └── result/[id]/route.ts  #   GET 轮询结果
│
├── lib/                          # 业务逻辑
│   ├── style-presets.ts          #   12 种风格预设定义
│   ├── generation-store.ts       #   服务端任务状态（全局内存 Map）
│   ├── task-store.ts             #   客户端任务记录（localStorage）
│   └── skills/                   #   Skill 集成层（当前版本，待重构为 Pipeline）
│       ├── fetcher.ts            #     内容抓取
│       └── planner.ts            #     内容规划
│
├── public/
│   ├── styles/                   #   风格预览 HTML 文件
│   ├── generated/                #   （空）
│   └── output/                   #   生成的幻灯片（按日期，在 .gitignore 中）
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
├── next.config.ts                # Next.js 配置（standalone 输出）
├── README.md                     # 项目 README
└── .gitignore
```

## 快速定位指南

| 我想做什么 | 去哪里 |
|-----------|--------|
| 改首页 UI | `app/page.tsx` |
| 改预览页 | `app/preview/[id]/page.tsx` |
| 改生成 API 逻辑 | `app/api/generate/route.ts` |
| 改 SSE 推送 | `app/api/generate/sse/route.ts` |
| 加一种新风格 | `lib/style-presets.ts` + `public/styles/` 新增预览 HTML |
| 改内容抓取逻辑 | `lib/skills/fetcher.ts`（重构后：`lib/pipeline/`） |
| 改全局样式 | `app/globals.css` |
| 加新 Skill | `.claude/skills/` 下新建文件夹 |

## 新增功能检查清单

- [ ] 是否需要新的 API Route？
- [ ] 是否需要新增 Skill？（放 `.claude/skills/`）
- [ ] 是否影响 style-presets？
- [ ] 是否需要更新 generation-store 状态字段？
- [ ] 是否需要更新 SSE 推送的消息类型？
- [ ] 更新本文档和相关 FOLDER.md
