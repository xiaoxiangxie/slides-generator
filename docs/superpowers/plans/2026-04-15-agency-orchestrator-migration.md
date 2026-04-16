# Slides Generator — 迁移至 Agency Orchestrator 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `lib/pipeline/` 的硬编码顺序调用，替换为 agency-orchestrator 的 YAML 驱动工作流，实现 DAG 执行、重试机制、变量传递。

**Architecture:** 在 Next.js 项目中安装 agency-orchestrator 作为库，将现有的 4 个 Skill 目录转换为 agency 兼容的 Role Markdown 格式，编写 YAML 工作流定义，替换 `pipeline/index.ts` 的编排逻辑，复用现有的 API 层和 SQLite 状态管理。

**Tech Stack:** TypeScript/Node.js, agency-orchestrator, Next.js App Router, better-sqlite3

---

## 文件映射

| 原文件/目录 | 新路径/方式 | 职责 |
|---|---|---|
| `lib/pipeline/index.ts` | 删除（被 `lib/pipeline/orchestrator.ts` 替代） | Pipeline 编排器 |
| `lib/pipeline/claude-runner.ts` | 复用 `agency-orchestrator` 内置 ClaudeCodeConnector | Claude CLI 调用 |
| `lib/pipeline/prompts.ts` | 拆分到 Role Markdown 文件的 frontmatter | Prompt 模板 |
| `.claude/skills/frontend-slides/` | `.agents/frontend-slides/` | Role 文件 |
| `.claude/skills/ljg-writes/` | `.agents/ljg-writes/` | Role 文件 |
| `.claude/skills/agent-browser/` | `.agents/agent-browser/` | Role 文件 |
| `.claude/skills/remotion/` | `.agents/remotion/` | Role 文件 |
| `lib/generation-store.ts` | 不变 | 客户端 localStorage 缓存 |
| `lib/db.ts` | 不变 | SQLite 持久化 |
| `app/api/generate/route.ts` | 修改：调用新的 orchestrator | 启动工作流 |
| `app/api/generate/sse/route.ts` | 不变 | SSE 进度推送 |

---

## Phase 1: 安装 agency-orchestrator 并验证基础调用

### Task 1: 安装 agency-orchestrator 作为项目依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 agency-orchestrator**

Run: `cd /Users/xiaoxiang/Documents/slides-generator && npm install agency-orchestrator`

Expected: 安装成功，无报错

- [ ] **Step 2: 验证包可用**

Run: `node -e "const {createConnector} = require('agency-orchestrator'); console.log('OK')"`

Expected: 输出 "OK"

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "feat: 安装 agency-orchestrator 依赖"
```

---

### Task 2: 创建 `.agents/` 目录并迁移 Role 文件

**Files:**
- Create: `.agents/agent-browser/agent.md`
- Create: `.agents/baoyu-url-to-markdown/agent.md`
- Create: `.agents/ljg-writes/agent.md`
- Create: `.agents/frontend-slides/agent.md`
- Create: `.agents/remotion/agent.md`
- Delete: `.claude/skills/` (迁移后删除)

Agency 的 Role 文件格式是 Markdown + frontmatter：

```markdown
---
name: 角色显示名
description: 角色描述
emoji: "🎨"
---
系统提示词内容（frontmatter 之后的所有内容）
```

- [ ] **Step 1: 创建 `.agents/` 目录**

Run: `mkdir -p .agents/agent-browser .agents/baoyu-url-to-markdown .agents/ljg-writes .agents/frontend-slides .agents/remotion`

- [ ] **Step 2: 创建 `agent-browser` Role 文件**

Create: `.agents/agent-browser/agent.md`

```markdown
---
name: 内容抓取助手
description: 使用无头浏览器从 URL 提取页面主要内容，转换为 Markdown 格式
emoji: "🌐"
---
你是一个内容抓取助手。你的唯一任务是从给定的 URL 中提取页面的主要内容，并保存为 Markdown 文件。

## 目标 URL

{{url}}

## 输出要求

1. 提取页面的主要内容（标题、正文、代码块、列表等）
2. 去掉导航栏、页脚、广告、侧边栏等无关内容
3. 保留 Markdown 格式（标题层级、代码块、链接、列表）
4. 如果页面有多语言版本，优先中文
5. 请绝对不要使用 write_to_file 或者其他保存文件工具！直接将你提取到的最终 Markdown 放在 ```markdown ``` 代码块中打印出来即可！

## 注意

- 不要生成摘要或评论，只提取原始内容
- 如果页面无法访问，将错误信息输出
- 完成后不需要做任何其他事情
```

- [ ] **Step 3: 创建 `baoyu-url-to-markdown` Role 文件**

Create: `.agents/baoyu-url-to-markdown/agent.md`

```markdown
---
name: URL转Markdown助手
description: 使用 Chrome CDP 渲染并转换 URL 为干净 Markdown
emoji: "📄"
---
你是一个 URL 转 Markdown 助手。你的任务是使用 baoyu-url-to-markdown 工具将 URL 转换为干净的 Markdown 内容。

## 目标 URL

{{url}}

## 使用方法

请调用 url-to-markdown 工具，传入目标 URL：
```
bun run ~/.agents/skills/baoyu-url-to-markdown/scripts/main.ts {{url}}
```

## 输出要求

1. 将转换后的 Markdown 内容直接放在 ```markdown ``` 代码块中输出
2. 不要添加任何摘要或评论
3. 如果转换失败，输出错误信息
```

- [ ] **Step 4: 创建 `ljg-writes` Role 文件**

Create: `.agents/ljg-writes/agent.md`

```markdown
---
name: 内容规划师
description: 将文章内容规划成结构化幻灯片大纲，口语化旁白
emoji: "✍️"
---

你是一个幻灯片内容规划师。你的任务是将一篇文章/内容规划成幻灯片大纲。

## 写作理念

- 口语化：像跟一个聪明的朋友说话
- 去 AI 味：不要「值得注意的是」「此外」这类机械连词
- 密度高：能用两个字说的不用四个字
- 具体：用场景替代解释

## 篇幅设定

经过系统智能判定，当前传入的内容属于【{{range_type}}】规模，目标幻灯片分布大约为 {{slide_count}} 页。

## 输入内容

{{content}}

## 输出要求

请直接将你规划的 markdown 文本放在代码块中（例如：```markdown ... ```），不要使用任何外部工具去保存文件。大纲每页用 ## 分隔，格式如下：

```
## 第 1 页 | title | 标题页

### 标题
这里是大标题

### 副标题
一句话描述

### 旁白
用口语化的方式介绍主题，像跟朋友聊天一样。

---

## 第 2 页 | concept | 核心概念

### 标题
这个特性解决了什么问题

### 要点
- 要点一：简短有力
- 要点二：一个要点一个概念
- 要点三：不超过 6 个

### 旁白
来，我们看看这个。（口语化旁白，约 50-100 字）
```

## 页面类型说明

| 类型 | 用途 |
|------|------|
| title | 标题页 |
| concept | 概念解释 |
| code | 代码展示 |
| diagram | 图表/流程 |
| summary | 总结 |

## 规划原则

1. 第一页必须是 title 类型
2. 最后一页建议是 summary 类型
3. 如有代码示例，用 code 类型单独成页
4. 内容密度：每页只讲一个概念
5. 旁白决不能是要点的重复，而是「你会怎么跟朋友解释这件事」
```

- [ ] **Step 5: 创建 `frontend-slides` Role 文件**

Create: `.agents/frontend-slides/agent.md`

```markdown
---
name: 幻灯片生成专家
description: 根据大纲和风格参数生成自包含 HTML 幻灯片
emoji: "🎨"
---

你是一个幻灯片生成专家。你的任务是根据大纲和风格参数，生成一份完整的 HTML 幻灯片。

## 大纲内容

{{outline}}

## 风格参数

- 风格名: {{style_name}} ({{style_name_cn}})
- 背景色: {{style_bg}}
- 主文字色: {{style_text}}
- 强调色: {{style_accent}}
- 次要色: {{style_secondary}}
- 展示字体: {{style_display_font}}
- 正文字体: {{style_body_font}}
- 调性: {{style_vibe}}
- 比例: {{aspect_ratio}}
- 布局指令: {{layout_instruction}}

## 必须遵守的规则

1. 绝对不要使用 write_to_file 或者任何人外部工具！请直接完整输出 HTML 代码至 ```html ``` 代码块中！
2. 必须单文件自包含 HTML，彻底原生无外部框架（除了字体），CSS 和 Javascript 完全内联！
3. 每个 .slide 必须 height: 100vh; height: 100dvh; overflow: hidden;
4. 所有字体大小必须使用 clamp(min, preferred, max) 函数进行响应式缩放！
5. 零外部 JS 依赖，只允许原生的 JS 实现逻辑（必须包含 SlidePresentation 控制器）！
6. 每个 section 需要加上类似于 /* === SECTION NAME === */ 这样的漂亮注释

请直接输出完整的 HTML 代码在 ```html ``` 代码块中。
```

- [ ] **Step 6: 创建 `remotion` Role 文件**

Create: `.agents/remotion/agent.md`

```markdown
---
name: 视频渲染工程师
description: 将 HTML 幻灯片通过 Remotion 渲染为 MP4 视频
emoji: "🎬"
---

你是一个视频渲染工程师。你的任务是将 HTML 幻灯片通过 Remotion 渲染为 MP4 视频。

## 输入信息

- HTML 文件路径: {{html_path}}
- 大纲文件路径: {{outline_path}}
- 输出目录: {{output_dir}}
- 视频尺寸: {{width}}x{{height}}
- 视频风格: {{video_style}}

## 渲染流程

1. 读取 HTML 文件内容
2. 从大纲文件中提取每页旁白文本
3. 根据 video_style 计算字幕时间轴（normal: 5字/秒, fast: 7字/秒, slow: 3字/秒）
4. 生成 SRT 字幕文件
5. 调用 Remotion CLI 渲染视频

## 输出要求

完成后报告:
1. MP4 文件路径
2. SRT 文件路径
3. 总时长（秒）
```

- [ ] **Step 7: 提交 Role 文件**

```bash
git add .agents/
git commit -m "feat: 创建 .agents/ 目录并迁移 Role 文件"
```

---

## Phase 2: 编写 YAML 工作流定义

### Task 3: 创建幻灯片生成工作流 YAML

**Files:**
- Create: `workflows/slides-generator.yaml`

- [ ] **Step 1: 创建工作流目录和 YAML 文件**

Create: `workflows/slides-generator.yaml`

```yaml
name: slides-generator
description: URL或文本 → HTML幻灯片 → MP4视频
agents_dir: .agents
llm:
  provider: claude-code
  model: sonnet
  timeout: 300000
  retry: 3
concurrency: 1

inputs:
  - name: source
    description: URL 或文本内容
  - name: input_type
    description: "url" 或 "text"
  - name: style_id
    description: 风格预设 ID
  - name: aspect_ratio
    description: "16:9" 或 "9:16"
  - name: video_style
    description: "normal" | "fast" | "slow"

steps:

  - id: extract_content
    role: agent-browser
    name: 抓取页面内容
    emoji: "🌐"
    task: |
      请从以下 URL 提取页面主要内容并转换为 Markdown：

      URL: {{source}}

      如果需要，可以使用备选的 baoyu-url-to-markdown 工具。
    output: raw_content
    condition: "{{input_type}} == 'url'"

  - id: use_text_directly
    role: agent-browser
    name: 使用文本内容
    emoji: "📝"
    task: |
      用户直接输入了文本内容，将其作为原始内容：

      {{source}}
    output: raw_content
    condition: "{{input_type}} == 'text'"

  - id: analyze_length
    role: ljg-writes
    name: 分析篇幅
    emoji: "📏"
    task: |
      请分析以下内容的长度，并输出一个简短的 JSON 对象：

      内容长度: {{raw_content}}

      分析规则:
      - 如果内容 < 800 字，输出 {"range_type": "简洁", "slide_count": 3}
      - 如果内容 < 3000 字，输出 {"range_type": "适中", "slide_count": 8}
      - 如果内容 >= 3000 字，输出 {"range_type": "详细", "slide_count": 15}

      直接输出 JSON 代码块，不要有多余内容。
    output: analysis_result

  - id: plan_slides
    role: ljg-writes
    name: 规划幻灯片
    emoji: "✍️"
    task: |
      请将以下内容规划成幻灯片大纲：

      内容:
      {{raw_content}}

      篇幅类型: {{analysis_result}}

      请根据规划结果，直接输出 markdown 大纲代码块。
    output: slide_outline
    depends_on: [analyze_length]

  - id: generate_slides
    role: frontend-slides
    name: 生成HTML
    emoji: "🎨"
    task: |
      请根据以下大纲生成 HTML 幻灯片：

      {{slide_outline}}

      风格: {{style_id}}
      比例: {{aspect_ratio}}
    output: html_path
    depends_on: [plan_slides]

  - id: render_video
    role: remotion
    name: 渲染视频
    emoji: "🎬"
    task: |
      请根据以下信息渲染视频：

      {{html_path}}
      {{slide_outline}}
      {{output_dir}}
      {{width}}
      {{height}}
      {{video_style}}
    output: video_result
    depends_on: [generate_slides]
```

- [ ] **Step 2: 提交 YAML 工作流**

```bash
git add workflows/slides-generator.yaml
git commit -m "feat: 创建 slides-generator 工作流 YAML"
```

---

## Phase 3: 实现 Orchestrator 封装层

### Task 4: 创建 `lib/pipeline/orchestrator.ts` 封装

**Files:**
- Create: `lib/pipeline/orchestrator.ts`
- Create: `lib/pipeline/run-workflow.ts` (workflow YAML runner)

- [ ] **Step 1: 创建 workflow runner 工具函数**

Create: `lib/pipeline/run-workflow.ts`

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { run } from 'agency-orchestrator';
import type { WorkflowResult } from 'agency-orchestrator';

export interface WorkflowInputs {
  source: string;
  input_type: 'url' | 'text';
  style_id: string;
  aspect_ratio: '16:9' | '9:16';
  video_style: 'normal' | 'fast' | 'slow';
  output_dir: string;
  width: number;
  height: number;
}

export async function runSlidesWorkflow(
  yamlPath: string,
  inputs: WorkflowInputs,
  callbacks?: {
    onStepStart?: (stepId: string) => void;
    onStepComplete?: (stepId: string, output: string) => void;
    onBatchStart?: (stepIds: string[]) => void;
    onBatchComplete?: (stepIds: string[]) => void;
  }
): Promise<WorkflowResult> {
  const yamlContent = readFileSync(yamlPath, 'utf-8');

  const result = await run(yamlContent, {
    ...inputs,
    output_dir: inputs.output_dir,
    width: String(inputs.width),
    height: String(inputs.height),
  }, {
    onStepStart: (node) => callbacks?.onStepStart?.(node.step.id),
    onStepComplete: (node) => callbacks?.onStepComplete?.(node.step.id, node.result || ''),
    onBatchStart: (nodes) => callbacks?.onBatchStart?.(nodes.map(n => n.step.id)),
    onBatchComplete: (nodes) => callbacks?.onBatchComplete?.(nodes.map(n => n.step.id)),
  });

  return result;
}
```

- [ ] **Step 2: 创建 orchestrator.ts 主文件**

Create: `lib/pipeline/orchestrator.ts`

```typescript
/**
 * Agency Orchestrator 封装层
 * 替代原来的 pipeline/index.ts
 */
import path from 'path';
import { runSlidesWorkflow, type WorkflowInputs } from './run-workflow';
import { updateJob, getJob } from '@/lib/db';
import type { StylePreset } from '@/lib/style-presets';

const WORKFLOW_YAML = path.join(process.cwd(), 'workflows', 'slides-generator.yaml');

export interface OrchestratorInput {
  id: string;
  input: string;
  inputType: 'url' | 'text';
  style: StylePreset;
  aspectRatio: string;
  taskName?: string;
  videoStyle?: 'normal' | 'fast' | 'slow';
}

function isCancelled(id: string): boolean {
  const job = getJob(id);
  return job?.status === 'cancelled';
}

function abortIfCancelled(id: string): void {
  if (isCancelled(id)) {
    throw new Error('TASK_CANCELLED');
  }
}

export async function runPipeline(opts: OrchestratorInput): Promise<void> {
  const { id, input, inputType, style, aspectRatio, taskName, videoStyle = 'normal' } = opts;
  const cwd = process.cwd();

  const dateStr = new Date().toISOString().slice(0, 10);
  const htmlPath = `/output/${dateStr}/${id}/${id}.html`;
  const outputDir = path.join(cwd, 'public', 'output', dateStr, id);
  const dimensions = {
    width: aspectRatio === '16:9' ? 1920 : 1080,
    height: aspectRatio === '16:9' ? 1080 : 1920,
  };

  const workflowInputs: WorkflowInputs = {
    source: input,
    input_type: inputType,
    style_id: style.id,
    aspect_ratio: aspectRatio as '16:9' | '9:16',
    video_style: videoStyle,
    output_dir: outputDir,
    width: dimensions.width,
    height: dimensions.height,
  };

  try {
    updateJob(id, {
      status: 'generating',
      skill: 'agent-browser',
      step: '正在启动工作流...',
      progress: 5,
    });

    abortIfCancelled(id);

    await runSlidesWorkflow(WORKFLOW_YAML, workflowInputs, {
      onStepStart: (stepId) => {
        updateJob(id, {
          status: 'generating',
          skill: stepId,
          step: `正在执行: ${stepId}...`,
          progress: 30,
        });
      },
      onStepComplete: (stepId, output) => {
        const progressMap: Record<string, number> = {
          'extract_content': 25,
          'use_text_directly': 25,
          'analyze_length': 40,
          'plan_slides': 55,
          'generate_slides': 75,
          'render_video': 90,
        };
        updateJob(id, {
          skill: stepId,
          step: `完成: ${stepId}`,
          progress: progressMap[stepId] ?? 50,
        });
      },
      onBatchComplete: (stepIds) => {
        abortIfCancelled(id);
      },
    });

    updateJob(id, {
      status: 'done',
      skill: '',
      step: 'Done!',
      progress: 100,
      htmlPath,
      endedAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: any) {
    if (e.message === 'TASK_CANCELLED') return;

    updateJob(id, {
      status: 'error',
      skill: '',
      step: 'Failed: ' + e.message,
      error: e.message,
      endedAt: Math.floor(Date.now() / 1000),
    });
    throw e;
  }
}
```

- [ ] **Step 3: 提交封装层**

```bash
git add lib/pipeline/orchestrator.ts lib/pipeline/run-workflow.ts
git commit -m "feat: 创建 agency orchestrator 封装层"
```

---

## Phase 4: 替换 API 层调用

### Task 5: 修改 `app/api/generate/route.ts` 指向新 orchestrator

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: 查看当前 generate/route.ts 内容**

Run: `cat app/api/generate/route.ts`

确认当前调用的是 `runPipeline` 还是其他函数

- [ ] **Step 2: 修改 import 语句**

如果当前文件导入的是 `lib/pipeline/index` 的 `runPipeline`，改为：

```typescript
import { runPipeline } from '@/lib/pipeline/orchestrator';
```

（函数签名相同，无需修改其他逻辑）

- [ ] **Step 3: 提交 API 修改**

```bash
git add app/api/generate/route.ts
git commit -m "refactor(api): 切换到新的 orchestrator 封装"
```

---

## Phase 5: 删除旧文件

### Task 6: 清理旧 pipeline 文件

**Files:**
- Delete: `lib/pipeline/index.ts` (被 orchestrator.ts 替代)
- Delete: `lib/pipeline/prompts.ts` (迁移到 Role 文件)
- Delete: `lib/pipeline/claude-runner.ts` (复用 agency 内置 connector)

**注意：仅在 Phase 1-4 全部验证通过后执行此步骤**

- [ ] **Step 1: 确认新 orchestrator 工作正常后再删除**

先手动测试 `npm run dev` 并尝试生成一张幻灯片，确认成功后再删除旧文件

- [ ] **Step 2: 删除旧文件**

```bash
git rm lib/pipeline/index.ts lib/pipeline/prompts.ts lib/pipeline/claude-runner.ts
```

- [ ] **Step 3: 提交清理**

```bash
git commit -m "refactor: 删除旧的 pipeline 实现，迁移到 agency-orchestrator"
```

---

## 验证清单

迁移完成后，确保以下功能正常：

- [ ] `npm run dev` 能正常启动
- [ ] 输入 URL 生成幻灯片
- [ ] 输入文本生成幻灯片
- [ ] SSE 进度推送正常
- [ ] 任务取消功能正常
- [ ] 错误重试生效（可在 prompt 中加入随机错误测试）
- [ ] `public/output/` 下能生成 HTML 文件

---

## 后续扩展点

迁移完成后自然解锁的能力：

1. **DAG 并行执行** — 同层节点可并行（未来内容抓取 + 风格分析可并行）
2. **错误重试** — agency 内置分级退避重试
3. **Resume 模式** — 任务中断后可从断点恢复
4. **循环支持** — 可在特定节点配置 loop 重新执行
5. **YAML 驱动的 Workflow** — 未来无需改代码，直接修改 YAML 即可调整工作流
