/**
 * 内容规划 - 集成 ljg-writes 原则
 *
 * 核心理念：
 * - 口语化，不是念稿
 * - 先规划结构，用户确认后再生成
 * - SRT 字幕 = 讲解稿，要去 AI 味
 */

export interface SlideSection {
  title: string;
  content: string;
  narration: string;
  type: "title" | "concept" | "code" | "diagram" | "summary";
  durationSeconds: number;
}

export interface PlannedContent {
  title: string;
  subtitle: string;
  sections: SlideSection[];
  totalDuration: number;
  tags: string[];
}

export async function planContent(rawText: string): Promise<PlannedContent> {
  const clean = stripMarkdown(rawText);
  const sections = splitIntoSections(clean);

  const planned: PlannedContent = {
    title: extractTitle(clean),
    subtitle: "",
    sections: sections.map((s) => planSection(s)),
    totalDuration: 0,
    tags: extractTags(clean),
  };

  planned.totalDuration = planned.sections.reduce(
    (sum, s) => sum + s.durationSeconds,
    0
  );

  return planned;
}

/**
 * 彻底剥离 markdown 格式，只留纯文本
 */
function stripMarkdown(text: string): string {
  return text
    // 代码块（保留内容，去掉标记）
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").trim())
    // 行内代码
    .replace(/`([^`]+)`/g, "$1")
    // 标题标记
    .replace(/^#{1,6}\s+/gm, "")
    // 加粗
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    // 斜体
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // 删除线
    .replace(/~~([^~]+)~~/g, "$1")
    // 图片
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    // 链接
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // 表格行（去掉 | 和 ---，保留内容）
    .replace(/\|\s*---+\s*\|[\s|]*\n?/g, "")
    .replace(/^\|(.+)\|\s*$/gm, (_, row) =>
      row.split("|").map((c: string) => c.trim()).filter(Boolean).join("，")
    )
    // HTML 标签
    .replace(/<[^>]+>/g, "")
    // 引用标记
    .replace(/^>\s+/gm, "")
    // 水平线
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // 任务列表
    .replace(/^[\s]*[-*+]\s+\[.\]\s+/gm, "")
    // 清理多余空行
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoSections(text: string): string[] {
  // 先按 ## 标题分段
  const parts = text.split(/\n##\s+/);
  if (parts.length > 1) {
    const sections = parts
      .filter((s) => s.trim().length > 10)
      .map((s) => {
        const firstNewline = s.indexOf("\n");
        if (firstNewline === -1) return s.trim();
        const header = s.slice(0, firstNewline).trim();
        const body = s.slice(firstNewline + 1).trim();
        return body ? `${header}\n${body}` : header;
      });
    if (sections.length >= 2) return sections;
  }

  // 否则按段落分组
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length > 15);

  if (paragraphs.length <= 8) return paragraphs;

  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 4) {
    const chunk = paragraphs.slice(i, i + 4).join("。\n");
    if (chunk.trim().length > 10) chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks : paragraphs.slice(0, 8);
}

function planSection(content: string): SlideSection {
  const type = detectSectionType(content);
  const title = extractSectionTitle(content);
  const narration = generateNarration(content, type);
  const charCount = content.replace(/\n/g, "").length;
  const durationSeconds = Math.max(8, Math.ceil((charCount / 150) * 60));

  return { title, content, narration, type, durationSeconds };
}

function detectSectionType(content: string): SlideSection["type"] {
  const lower = content.toLowerCase();

  if (
    /```[\s\S]+?```/.test(content) ||
    /\b(function|const|let|var|def |import |export |class |=>|async |await)\b/.test(lower)
  ) {
    return "code";
  }
  if (lower.includes("总结") || lower.includes("回顾") || lower.includes("关键") || lower.includes("takeaway")) {
    return "summary";
  }
  if (lower.includes("图") || lower.includes("流程") || lower.includes("架构") || lower.includes("diagram") || lower.includes("例子")) {
    return "diagram";
  }

  return "concept";
}

function extractSectionTitle(content: string): string {
  const firstLine = content.split("\n")[0].replace(/^##\s*/, "").trim();
  if (firstLine.length <= 30) return firstLine;
  return firstLine.slice(0, 27) + "...";
}

function generateNarration(content: string, type: SlideSection["type"]): string {
  let text = content.replace(/\n/g, " ").replace(/^##\s*/, "").trim();
  if (text.length > 100) {
    const lastStop = Math.max(
      text.lastIndexOf("。"),
      text.lastIndexOf("！"),
      text.lastIndexOf("，")
    );
    text = lastStop > 60 ? text.slice(0, lastStop + 1) : text.slice(0, 95) + "...";
  }

  if (type === "code") return `来看看这段实现：${text}`;
  if (type === "summary") return `最后，关键点是：${text}`;
  if (type === "diagram") return `我们来看这张图：${text}`;
  return text.length > 20 ? `来，我们看看这个。${text}` : text;
}

function extractTitle(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  const first = lines[0]?.replace(/^#+\s*/, "").replace(/##\s*/g, "").trim() || "";
  return first.slice(0, 40) || "未命名内容";
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const techTerms = [
    "Agent", "Loop", "LLM", "Tool", "API", "Function",
    "Chain", "RAG", "Memory", "State", "Messages", "GitHub",
  ];
  techTerms.forEach((term) => {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      tags.push(term);
    }
  });
  return tags.slice(0, 5);
}
