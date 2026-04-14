# 多步 Skill Pipeline：URL/文本 → HTML 幻灯片

## 问题背景

当前项目的幻灯片生成是一个「单次大调用」模式：
- `fetcher.ts` 用硬编码 TypeScript 抓内容（自己 spawn agent-browser、自己 fetch GitHub、自己调 defuddle API）
- `planner.ts` 用纯字符串操作做内容规划（不涉及 AI，只是 split + regex）
- `route.ts` 把所有内容拼成一个巨大 prompt，一次 Claude Code CLI 调用完成所有工作

**核心问题**：Skill 的能力没有被真正利用。每个 Skill（agent-browser、ljg-writes、frontend-slides）都有精心设计的规范，但当前架构绕过了它们，把所有逻辑硬编码在 TypeScript 里。

## 目标架构

将单次调用重构为 **三步 Pipeline**，每一步都是一次独立的 Claude Code CLI 调用，并加载对应的 Skill：

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

> [!IMPORTANT]
> 每一步的 Claude Code CLI 调用都通过 `.claude/skills/` 目录自动获得 Skill 上下文——不依赖用户本地是否安装了 agent-browser CLI 或其他工具，Claude Code 会自己决定如何执行 Skill。

## User Review Required

> [!WARNING]
> **ljg-writes Skill 的适配问题**：当前的 ljg-writes 是一个「写作引擎」——它的输出是 Org-mode 格式的散文文章，不是幻灯片大纲。我们需要在 prompt 中明确告诉它：输出格式是「幻灯片大纲」而非文章。它的核心价值（口语化、去 AI 味、计算机类比）仍然适用于幻灯片旁白。

> [!IMPORTANT]
> **中间产物目录**：建议用 `.claude-pipeline/{id}/` 存放每步的中间文件。这个目录应加入 `.gitignore`。请确认是否同意。

> [!IMPORTANT]
> **Claude Code CLI 路径**：检测到 Claude Code 安装在 `/opt/homebrew/bin/claude`，但不在默认 PATH 中。`route.ts` 的 spawn 需要处理路径问题。

---

## Proposed Changes

### Pipeline 核心（新增模块）

#### [NEW] [pipeline/index.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/index.ts)

Pipeline 编排器。核心职责：
- 定义 `PipelineStep` 接口（skill 名、prompt 构建器、输入文件、输出文件）
- 按顺序执行三步，每步：
  1. 构建 prompt → 写入临时文件
  2. 调用 Claude Code CLI（`claude --print --add-dir . < prompt.txt`）
  3. 验证输出文件是否存在
  4. 更新 generation-store 进度
- 处理文本直传（跳过 Step 1）

#### [NEW] [pipeline/claude-runner.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/claude-runner.ts)

Claude Code CLI 调用封装。从现有 `route.ts` 的 `callClaudeCode()` 抽取并增强：
- 统一的 spawn 逻辑
- 实时 stdout/stderr 解析，提取进度信息
- 超时控制（每步独立超时）
- 路径兼容（`/opt/homebrew/bin/claude` fallback）
- 返回结构化结果（成功/失败/输出内容）

#### [NEW] [pipeline/prompts.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/prompts.ts)

三步的 prompt 模板：

**Step 1 Prompt (内容抓取)**：
```
你是一个内容抓取助手。
请阅读 .claude/skills/agent-browser/SKILL.md，使用 agent-browser 打开以下 URL 并提取页面主要内容。
URL: {url}
将提取的内容以 Markdown 格式保存到: {outputPath}
要求：保留标题层级、代码块、列表结构。去掉导航栏、页脚等无关内容。
```

**Step 2 Prompt (内容规划)**：
```
你是一个幻灯片内容规划师。
请阅读 .claude/skills/ljg-writes/SKILL.md，理解其写作理念（口语化、去 AI 味、密度高）。

基于以下内容，规划一份幻灯片大纲：
{content}（读取 01-content.md）

输出要求（保存到 {outputPath}）：
- 总共 {slideCount} 页
- 每页包含：标题、要点（4-6 条）、旁白文本（口语化，像跟朋友聊天）
- 页面类型：title / concept / code / diagram / summary
- Markdown 格式，用 ## 分隔每页
```

**Step 3 Prompt (幻灯片生成)**：
```
你是一个幻灯片生成专家。
请严格按照 .claude/skills/frontend-slides/SKILL.md 的规范生成 HTML 幻灯片。

1. 读取 .claude/skills/frontend-slides/viewport-base.css 并完整嵌入
2. 读取 .claude/skills/frontend-slides/STYLE_PRESETS.md 了解风格规范

大纲内容：{outline}（读取 02-outline.md）
风格：{styleName}（{styleParams}）
比例：{aspectRatio}
输出文件：{outputPath}
```

---

### API 层重构

#### [MODIFY] [route.ts](file:///Users/xiaoxiang/Documents/slides-generator/app/api/generate/route.ts)

- 删除 `runGeneration()`、`buildPrompt()`、`callClaudeCode()` 三个函数
- 替换为调用 `lib/pipeline/index.ts` 的 `runPipeline()`
- POST handler 逻辑保持不变（校验参数 → 创建 job → 异步启动 pipeline）

#### [MODIFY] [sse/route.ts](file:///Users/xiaoxiang/Documents/slides-generator/app/api/generate/sse/route.ts)

- 无代码变更，但 SSE 消息中的 `skill` 字段会包含当前步骤的 Skill 名称（agent-browser / ljg-writes / frontend-slides）

---

### 状态管理增强

#### [MODIFY] [generation-store.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/generation-store.ts)

新增字段：
- `currentStep: number` — 当前第几步（1/2/3）
- `totalSteps: number` — 总步数（URL=3，文本=2）
- `pipelineDir: string` — 中间产物目录路径

---

### 旧代码处理

#### [DELETE] [fetcher.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/skills/fetcher.ts)

整个文件删除。内容抓取改由 Pipeline Step 1（Claude Code CLI + agent-browser skill）完成。

#### [DELETE] [planner.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/skills/planner.ts)

整个文件删除。内容规划改由 Pipeline Step 2（Claude Code CLI + ljg-writes skill）完成。

---

### 配置与基础设施

#### [MODIFY] [.gitignore](file:///Users/xiaoxiang/Documents/slides-generator/.gitignore)

新增：
```
# Pipeline intermediate files
.claude-pipeline/
```

#### [NEW] .claude-pipeline/.gitkeep

Pipeline 中间产物目录。每个任务在此下创建 `{id}/` 子目录，存放：
- `01-content.md` — 抓取的原始内容
- `02-outline.md` — 规划的幻灯片大纲
- `prompt-step{N}.txt` — 每步的 prompt（调试用）

---

## 开发计划（小步迭代）

按 vibe-dev 方法论，拆为以下小任务，顺序执行：

### 任务 1：Pipeline 基础设施

**目标**：搭建 pipeline 骨架和 Claude Code CLI 封装

**包含**：
1. 创建 `lib/pipeline/claude-runner.ts` — 从 route.ts 抽取 Claude Code CLI 调用逻辑，增加路径检测和结构化返回
2. 创建 `lib/pipeline/index.ts` — Pipeline 编排器骨架（定义 Step 接口，暂用 mock）
3. 更新 `generation-store.ts` — 新增 `currentStep`、`totalSteps` 字段
4. 创建 `.claude-pipeline/.gitkeep` + 更新 `.gitignore`

**验证方式**：单独调用 `claude-runner.ts` 执行一个简单 prompt，确认输出正确

**产出文档**：`lib/pipeline/FOLDER.md`

---

### 任务 2：Step 1 — 内容抓取

**目标**：通过 Claude Code CLI + agent-browser skill 抓取 URL 内容

**包含**：
1. 在 `lib/pipeline/prompts.ts` 中实现 Step 1 的 prompt 构建
2. 在 `pipeline/index.ts` 中接入 Step 1
3. 测试：输入一个 GitHub 仓库 URL，确认输出 `01-content.md` 内容完整

**验证方式**：命令行测试脚本，输入 `https://github.com/vercel/next.js`，检查输出 markdown 质量

**产出文档**：更新 `docs/ARCHITECTURE.md` Step 1 部分

---

### 任务 3：Step 2 — 内容规划

**目标**：通过 Claude Code CLI + ljg-writes skill 将内容规划为幻灯片大纲

**包含**：
1. 在 `lib/pipeline/prompts.ts` 中实现 Step 2 的 prompt 构建
2. 在 `pipeline/index.ts` 中接入 Step 2
3. 测试：用 Step 1 的输出作为输入，检查大纲结构

**验证方式**：检查 `02-outline.md` 的结构是否符合预期（每页有标题、要点、旁白）

**产出文档**：更新 `docs/ARCHITECTURE.md` Step 2 部分

---

### 任务 4：Step 3 — 幻灯片生成

**目标**：通过 Claude Code CLI + frontend-slides skill 生成 HTML 幻灯片

**包含**：
1. 在 `lib/pipeline/prompts.ts` 中实现 Step 3 的 prompt 构建
2. 在 `pipeline/index.ts` 中接入 Step 3
3. 测试：用 Step 2 的输出 + 指定风格，检查生成的 HTML

**验证方式**：浏览器打开生成的 HTML，检查风格正确、键盘导航正常、每页不溢出

**产出文档**：更新 `docs/ARCHITECTURE.md` Step 3 部分

---

### 任务 5：API + 前端集成

**目标**：将 Pipeline 接入 API Route，替换旧逻辑

**包含**：
1. 重写 `app/api/generate/route.ts`：删除旧的 `runGeneration` / `buildPrompt` / `callClaudeCode`，调用 `runPipeline()`
2. 删除 `lib/skills/fetcher.ts` 和 `lib/skills/planner.ts`
3. 确保 SSE 消息正确推送每步的 skill 名称和进度
4. 前端 `preview/[id]/page.tsx` 的 SKILL_LABELS 已经包含了所有需要的 label（agent-browser、ljg-writes、frontend-slides）

**验证方式**：`npm run dev` → 首页输入 URL → 观察任务面板三步进度 → 预览生成结果

**产出文档**：更新所有 FOLDER.md，更新 docs/ARCHITECTURE.md

---

### 任务 6：端到端测试 + 文档收尾

**目标**：完整流程验证 + 文档同步

**包含**：
1. 测试 URL 输入流程（GitHub 链接、普通网页）
2. 测试文本输入流程（跳过 Step 1）
3. 测试全部 12 种风格
4. 测试 16:9 和 9:16 两种比例
5. 更新 README.md
6. 更新 docs/superpowers/DAILY.md

**验证方式**：至少 3 种不同输入源 × 3 种风格的成功生成

---

## Open Questions

> [!IMPORTANT]
> **1. ljg-writes 输出格式适配**：ljg-writes 原本输出 Org-mode 格式的散文。在 Step 2 中我们需要它输出幻灯片大纲，这要在 prompt 中明确约束。你是想：
> - A) 在 prompt 中覆盖 ljg-writes 的输出格式（推荐）
> - B) Fork 一份 skill 为 `ljg-slides-planner`，专门用于幻灯片规划

> [!IMPORTANT]
> **2. Step 1 的 Skill 选择**：`.claude/skills/` 下有 `agent-browser` 和 `baoyu-url-to-markdown` 两个抓取 Skill。你希望：
> - A) 只用 agent-browser（更通用）
> - B) 让 Claude Code 自己选择用哪个（在 prompt 中告知两个都可用）
> - C) 优先 baoyu-url-to-markdown，fallback 到 agent-browser

> [!IMPORTANT]  
> **3. Claude Code CLI 每步超时**：当前全流程 10 分钟超时。拆为 3 步后，你希望每步超时多少？建议：
> - Step 1（抓取）：3 分钟
> - Step 2（规划）：3 分钟
> - Step 3（生成）：5 分钟

---

## Verification Plan

### Automated Tests

```bash
# 1. Claude Runner 单元测试
node -e "require('./lib/pipeline/claude-runner').callClaude('echo hello', {timeout: 10000})"

# 2. 单步测试
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"input":"https://github.com/anthropics/claude-code","inputType":"url","styleId":"bold-signal","aspectRatio":"16:9"}'

# 3. 检查中间产物
ls -la .claude-pipeline/<id>/
cat .claude-pipeline/<id>/01-content.md
cat .claude-pipeline/<id>/02-outline.md
```

### Manual Verification

1. 浏览器访问首页，选择风格，输入 URL，点击生成
2. 观察 Tasks 面板显示三步进度（agent-browser → ljg-writes → frontend-slides）
3. 生成完成后预览 HTML：键盘导航、动画、风格一致性
4. 下载 HTML 并在新标签页打开验证独立运行
