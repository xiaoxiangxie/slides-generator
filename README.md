# Slides Generator

输入 URL 或文本 → 生成幻灯片 HTML → Remotion 视频

## 技能依赖

本项目依赖以下 skill，路径：`./claude/skills/`

| Skill | 版本 | 用途 |
|-------|------|------|
| `frontend-slides` | - | HTML 幻灯片生成规范 |
| `ljg-writes` | 4.1.0 | 内容规划与写作规范 |
| `agent-browser` | - | 网页内容抓取 |
| `baoyu-url-to-markdown` | - | URL 转 Markdown（需要 bun + Chrome） |
| `remotion-video` | - | Remotion 视频生成 |

### Skill 更新

如果某个 skill 有更新，在本项目内执行：

```bash
cp -r ~/.agents/skills/<skill-name> ./claude/skills/
```

## 开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 架构

- `app/page.tsx` — 首页，风格选择 + URL 输入
- `app/preview/[id]/page.tsx` — 预览页，显示生成进度和幻灯片
- `app/api/generate/route.ts` — 生成 API，启动后台任务
- `lib/skills/fetcher.ts` — 内容抓取（agent-browser / defuddle.me）
- `lib/skills/planner.ts` — 内容规划（遵守 ljg-writes 规范）
- `lib/skills/slide-generator.ts` — 幻灯片生成（遵守 frontend-slides 规范）
- `lib/style-presets.ts` — 12 种风格预设
- `lib/generation-store.ts` — 任务状态存储
- `public/output/YYYY-MM-DD/` — 生成的幻灯片 HTML

## 流程

1. 输入 URL 或文本
2. agent-browser 抓取页面内容
3. ljg-writes 规划内容结构（待实现用户确认环节）
4. frontend-slides 生成 HTML 幻灯片
5. remotion-video 生成动画视频（待集成）
