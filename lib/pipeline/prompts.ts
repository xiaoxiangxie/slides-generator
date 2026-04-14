// input:  rawContent (string), slideCount (number), style preset, aspect ratio
// output: prompt strings for each pipeline step
// pos:    Pipeline 的 prompt 模板层，每步的指令都在这里定义
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import type { StylePreset } from "@/lib/style-presets";
import { readFileSync } from "fs";
import path from "path";

function readSkillFile(...paths: string[]): string {
  try {
    return readFileSync(path.join(process.cwd(), ...paths), "utf-8");
  } catch (e) {
    console.warn(`[Warning] Could not read skill file: ${paths.join("/")}`);
    return "";
  }
}

/**
 * Step 1: 内容抓取 prompt
 * Skill: agent-browser + baoyu-url-to-markdown (Claude 自选)
 */
export function buildFetchPrompt(url: string, outputPath: string): string {
  const agentBrowserSkill = readSkillFile(".claude", "skills", "agent-browser", "SKILL.md");
  const urlToMdSkill = readSkillFile(".claude", "skills", "baoyu-url-to-markdown", "SKILL.md");

  return [
    "你是一个内容抓取助手。你的唯一任务是从给定的 URL 中提取页面的主要内容，并保存为 Markdown 文件。",
    "",
    "## 目标 URL",
    "",
    url,
    "",
    "## 输出要求",
    "",
    "1. 提取页面的主要内容（标题、正文、代码块、列表等）",
    "2. 去掉导航栏、页脚、广告、侧边栏等无关内容",
    "3. 保留 Markdown 格式（标题层级、代码块、链接、列表）",
    "4. 如果页面有多语言版本，优先中文",
    "5. 请绝对不要使用 write_to_file 或者其他保存文件工具！直接将你提取到的最终 Markdown 放在 ```markdown ``` 代码块中打印出来即可！",
    "",
    "## 注意",
    "",
    "- 不要生成摘要或评论，只提取原始内容",
    "- 如果页面无法访问，将错误信息写入输出文件",
    "- 完成后不需要做任何其他事情",
    "",
    "## 抓取指南与可用工具",
    "",
    "请根据 URL 特征自行选择最合适的方式：",
    "- 默认优先使用：baoyu-url-to-markdown，它通过 Chrome CDP 渲染并转换 Markdown，速度快且干净。",
    "- 备选/辅助：如果 baoyu-url-to-markdown 效果不佳，再尝试使用 agent-browser 进行深度交互或截图。",
    "- GitHub 仓库：可以直接 fetch raw README。",
    "",
    "以下是 baoyu-url-to-markdown 的使用指南（首选）：",
    "```markdown",
    urlToMdSkill,
    "```",
    "",
    "以下是 agent-browser 的使用指南（备选）：",
    "```markdown",
    agentBrowserSkill,
    "```",
  ].join("\n");
}

/**
 * Step 2: 内容规划 prompt
 * Skill: ljg-writes（规划模式，非写作模式）
 */
export function buildPlanPrompt(
  contentPath: string,
  outputPath: string,
  slideCount: number,
  rangeType: string
): string {
  const ljgWritesSkill = readSkillFile(".claude", "skills", "ljg-writes", "SKILL.md");

  const contentData = readFileSync(contentPath, "utf-8");

  return [
    "你是一个幻灯片内容规划师。你的任务是将一篇文章/内容规划成幻灯片大纲。",
    "",
    "## 写作理念",
    "",
    "以下是所需遵循的核心写作理念：",
    "```markdown",
    ljgWritesSkill,
    "```",
    "",
    "请理解并应用上述理念的核心：",
    "- 口语化：像跟一个聪明的朋友说话",
    "- 去 AI 味：不要「值得注意的是」「此外」这类机械连词",
    "- 密度高：能用两个字说的不用四个字",
    "- 具体：用场景替代解释",
    "",
    "这些原则适用于每页幻灯片的旁白文本。",
    "",
    "## 篇幅设定",
    "",
    `经过系统智能判定，当前传入的内容属于【${rangeType}】规模，目标幻灯片分布大约为 ${slideCount} 页。请尽最大可能贴近这个页数（允许轻微浮动）。`,
    "",
    "## 输入内容",
    "",
    "以下是需要你规划的原文内容：",
    "```markdown",
    contentData,
    "```",
    "",
    "## 输出要求",
    "",
    "请直接将你规划的 markdown 文本放在代码块中（例如：```markdown ... ```），不要使用任何外部工具去保存文件。大纲每页用 ## 分隔，格式如下：",
    "",
    "```",
    "## 第 1 页 | title | 标题页",
    "",
    "### 标题",
    "这里是大标题",
    "",
    "### 副标题",
    "一句话描述",
    "",
    "### 旁白",
    "用口语化的方式介绍主题，像跟朋友聊天一样。",
    "",
    "---",
    "",
    "## 第 2 页 | concept | 核心概念",
    "",
    "### 标题",
    "这个特性解决了什么问题",
    "",
    "### 要点",
    "- 要点一：简短有力",
    "- 要点二：一个要点一个概念",
    "- 要点三：不超过 6 个",
    "",
    "### 旁白",
    "来，我们看看这个。（口语化旁白，约 50-100 字）",
    "```",
    "",
    "## 页面类型说明",
    "",
    "| 类型 | 用途 | 内容限制 |",
    "|------|------|---------|",
    "| title | 标题页 | 1 标题 + 1 副标题 |",
    "| concept | 概念解释 | 1 标题 + 4-6 要点 |",
    "| code | 代码展示 | 1 标题 + 代码块（≤10 行） |",
    "| diagram | 图表/流程 | 1 标题 + 描述 |",
    "| summary | 总结 | 1 标题 + 3-5 关键要点 |",
    "",
    "## 规划原则",
    "",
    "1. 第一页必须是 title 类型",
    "2. 最后一页建议是 summary 类型",
    "3. 如有代码示例，用 code 类型单独成页",
    "4. 内容密度：每页只讲一个概念",
    "5. 旁白决不能是要点的重复，而是「你会怎么跟朋友解释这件事」",
    "6. 不要在旁白中使用「让我们」「接下来」这类过渡词",
  ].join("\n");
}

/**
 * Step 3: 幻灯片生成 prompt
 * Skill: frontend-slides
 */
export function buildSlidePrompt(
  outlinePath: string,
  outputPath: string,
  style: StylePreset,
  aspectRatio: string
): string {
  const ratioDesc =
    aspectRatio === "9:16"
      ? "9:16 vertical (竖屏/短视频比例)"
      : "16:9 landscape (横屏/大屏比例)";

  const layoutInstruction = 
    aspectRatio === "9:16"
      ? "你【必须】采用竖屏布局：1. 禁止使用多列 Grid；2. 所有卡片和内容必须垂直堆叠；3. 在 <style> 中为 .slide 增加 `@media (min-width: 600px) { .slide { width: calc(100vh * 9 / 16); margin: 0 auto; shadow: rich; } }` 以便在 PC 端模拟竖屏感。"
      : "你采用标准横屏布局，可以使用多列卡片展示。";

  const skillMd = readSkillFile(".claude", "skills", "frontend-slides", "SKILL.md");
  const viewportBase = readSkillFile(".claude", "skills", "frontend-slides", "viewport-base.css");
  const stylePresets = readSkillFile(".claude", "skills", "frontend-slides", "STYLE_PRESETS.md");
  const htmlTemplate = readSkillFile(".claude", "skills", "frontend-slides", "html-template.md");
  const animationPatterns = readSkillFile(".claude", "skills", "frontend-slides", "animation-patterns.md");

  const outlineData = readFileSync(outlinePath, "utf-8");

  return [
    "你是一个幻灯片生成专家。你的任务是根据大纲和风格参数，生成一份完整的 HTML 幻灯片。",
    "",
    "## 必须执行的步骤 / 规范",
    "",
    "以下是完整的生成规范 (SKILL.md)：",
    "```markdown",
    skillMd,
    "```",
    "",
    "以下是必须完整嵌入到 HTML 中的 viewport-base.css：",
    "```css",
    viewportBase,
    "```",
    "",
    "以下是风格参考 (STYLE_PRESETS.md)：",
    "```markdown",
    stylePresets,
    "```",
    "",
    "以下是 HTML 结构模板 (html-template.md)：",
    "```markdown",
    htmlTemplate,
    "```",
    "",
    "以下是动画参考 (animation-patterns.md)：",
    "```markdown",
    animationPatterns,
    "```",
    "",
    "## 大纲内容",
    "",
    "以下是已经规划好的幻灯片大纲：",
    "```markdown",
    outlineData,
    "```",
    "",
    "## 风格参数",
    "",
    `- 风格名: ${style.name} (${style.nameCn})`,
    `- 背景色: ${style.bg}`,
    `- 主文字色: ${style.text}`,
    `- 强调色: ${style.accent}`,
    `- 次要色: ${style.secondary}`,
    `- 展示字体: ${style.displayFont}`,
    `- 正文字体: ${style.bodyFont}`,
    `- 调性: ${style.vibe}`,
    `- 比例: ${ratioDesc}`,
    `- 布局指令: ${layoutInstruction}`,
    "",
    "## 输出要求",
    "",
    "关键规则（来自 frontend-slides，你必须视为最高优先级约束）：",
    "- 绝对不要使用 write_to_file 或者任何人外部工具！请直接完整输出 HTML 代码至 ```html ``` 代码块中！",
    "- 必须单文件自包含 HTML，彻底原生无外部框架（除了字体），CSS 和 Javascript 完全内联！",
    "- 【电影感/视频化】必须：1. 所有标题、列表、图片均需带有 .reveal 类；2. 必须为同一页内的不同 reveal 元素设置递增的 style='transition-delay: Ns' (如 0.2s, 0.4s, 0.6s...) 引导观众视线。3. 背景必须配置渐变、颗粒度或网格纹理，增加视觉深度。",
    "- 【视觉等级】必须：1. 顶级标题字号必须比正文大 3 倍以上，极具冲击力；2. 核心观点必须用高对比度的装饰块（Card/Glassmorphism）包裹；3. 严格控制单页字数，留白率需达到 40% 以上。",
    "- 你必须全量嵌入 viewport-base.css 到底层 <style> 块！",
    `- 你必须严格遵守传入的 STYLE_PRESETS.md 里的【${style.name}】风格特有定义，包含定制的 :root 变量、动画参数和字体定义等，绝不能自己发明另外一套主题颜色！`,
    "- 展示字体与正文字体必须通过 Google Fonts/Fontshare CDN正确导入至 <head>！",
    "- 每个 .slide 必须 height: 100vh; height: 100dvh; overflow: hidden;",
    "- 所有字体大小必须使用 clamp(min, preferred, max) 函数进行响应式缩放！",
    "- 零外部 JS 依赖，只允许原生的 JS 实现逻辑（必须包含 SlidePresentation 控制器）！",
    "- 干净的纯内容区代码：正文中不出现 ## 这样的 Markdown 余孽符号！",
    "- 每个 section 需要加上类似于 /* === SECTION NAME === */ 这样的漂亮注释",
  ].join("\n");
}
