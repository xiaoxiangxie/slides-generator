export interface StylePreset {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  /** 预览 HTML 文件名（不含路径） */
  file: string;
  /** 背景色 */
  bg: string;
  /** 主文字色 */
  text: string;
  /** 强调色 */
  accent: string;
  /** 次要色 */
  secondary: string;
  /** 展示字体 */
  displayFont: string;
  /** 正文字体 */
  bodyFont: string;
  /** 风格调性 */
  vibe: string;
  /** 适用比例 */
  aspectRatio: "16:9" | "9:16" | "both";
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "bold-signal",
    name: "Bold Signal",
    nameCn: "橙色卡片",
    description: "深黑 + 橙色卡片，高对比有力",
    file: "01-bold-signal.html",
    bg: "#1a1a1a",
    text: "#ffffff",
    accent: "#FF5722",
    secondary: "#2d2d2d",
    displayFont: "Archivo Black",
    bodyFont: "Space Grotesk",
    vibe: "自信、高对比、现代",
    aspectRatio: "both",
  },
  {
    id: "electric-studio",
    name: "Electric Studio",
    nameCn: "白蓝分屏",
    description: "白/蓝分屏，Manrope 字体",
    file: "02-electric-studio.html",
    bg: "#0a0a0a",
    text: "#ffffff",
    accent: "#4361ee",
    secondary: "#ffffff",
    displayFont: "Manrope",
    bodyFont: "Manrope",
    vibe: "技术感、清爽、分屏",
    aspectRatio: "both",
  },
  {
    id: "creative-voltage",
    name: "Creative Voltage",
    nameCn: "霓虹黄蓝",
    description: "深蓝 + 霓虹黄 Syne 字体",
    file: "03-creative-voltage.html",
    bg: "#1a1a2e",
    text: "#ffffff",
    accent: "#d4ff00",
    secondary: "#0066ff",
    displayFont: "Syne",
    bodyFont: "Space Mono",
    vibe: "动感、创意、霓虹",
    aspectRatio: "both",
  },
  {
    id: "dark-botanical",
    name: "Dark Botanical",
    nameCn: "暗色暖调",
    description: "暗色暖调 serif，优雅精致",
    file: "04-dark-botanical.html",
    bg: "#0f0f0f",
    text: "#e8e4df",
    accent: "#d4a574",
    secondary: "#e8b4b8",
    displayFont: "Cormorant",
    bodyFont: "IBM Plex Sans",
    vibe: "优雅、温暖、文学感",
    aspectRatio: "both",
  },
  {
    id: "neon-cyber",
    name: "Neon Cyber",
    nameCn: "青色霓虹",
    description: "青色霓虹 + 洋红，科幻感",
    file: "05-neon-cyber.html",
    bg: "#0a0f1c",
    text: "#e0e8ff",
    accent: "#00ffcc",
    secondary: "#ff00aa",
    displayFont: "Manrope",
    bodyFont: "Manrope",
    vibe: "赛博朋克、科技、前卫",
    aspectRatio: "both",
  },
  {
    id: "terminal-green",
    name: "Terminal Green",
    nameCn: "终端绿",
    description: "全 JetBrains Mono，技术/代码向",
    file: "06-terminal-green.html",
    bg: "#0d1117",
    text: "#39d353",
    accent: "#39d353",
    secondary: "#79c0ff",
    displayFont: "JetBrains Mono",
    bodyFont: "JetBrains Mono",
    vibe: "极客、技术、终端风",
    aspectRatio: "both",
  },
  {
    id: "notebook-tabs",
    name: "Notebook Tabs",
    nameCn: "牛皮纸质感",
    description: "牛皮纸质感，精致复古",
    file: "07-notebook-tabs.html",
    bg: "#2d2d2d",
    text: "#1a1a1a",
    accent: "#c7b8ea",
    secondary: "#f8f6f1",
    displayFont: "Bodoni Moda",
    bodyFont: "DM Sans",
    vibe: "复古、质感、手工",
    aspectRatio: "both",
  },
  {
    id: "pastel-geometry",
    name: "Pastel Geometry",
    nameCn: "马卡龙色",
    description: "马卡龙色卡片，圆润现代",
    file: "08-pastel-geometry.html",
    bg: "#c8d9e6",
    text: "#1a1a1a",
    accent: "#7c6aad",
    secondary: "#5a7c6a",
    displayFont: "Plus Jakarta Sans",
    bodyFont: "Plus Jakarta Sans",
    vibe: "清新、明亮、柔和",
    aspectRatio: "both",
  },
  {
    id: "split-pastel",
    name: "Split Pastel",
    nameCn: "桃粉薰衣草",
    description: "桃粉 + 薰衣草左右分割",
    file: "09-split-pastel.html",
    bg: "#f5e6dc",
    text: "#1a1a1a",
    accent: "#9b6ea0",
    secondary: "#e4dff0",
    displayFont: "Outfit",
    bodyFont: "Outfit",
    vibe: "甜美、柔和、撞色",
    aspectRatio: "both",
  },
  {
    id: "vintage-editorial",
    name: "Vintage Editorial",
    nameCn: "复古编辑风",
    description: "复古编辑风，洋红点缀",
    file: "10-vintage-editorial.html",
    bg: "#f5f3ee",
    text: "#1a1a1a",
    accent: "#c41e3a",
    secondary: "#888888",
    displayFont: "Fraunces",
    bodyFont: "Work Sans",
    vibe: "复古、编辑、文学",
    aspectRatio: "both",
  },
  {
    id: "swiss-modern",
    name: "Swiss Modern",
    nameCn: "瑞士白红",
    description: "瑞士白 + 红色强调线",
    file: "11-swiss-modern.html",
    bg: "#ffffff",
    text: "#1a1a1a",
    accent: "#ff3300",
    secondary: "#1a1a1a",
    displayFont: "Archivo Black",
    bodyFont: "Nunito",
    vibe: "极简、网格、瑞士设计",
    aspectRatio: "both",
  },
  {
    id: "paper-ink",
    name: "Paper & Ink",
    nameCn: "文学羊皮纸",
    description: "文学感羊皮纸，深红点缀",
    file: "12-paper-ink.html",
    bg: "#faf9f7",
    text: "#1a1a1a",
    accent: "#c41e3a",
    secondary: "#6b6560",
    displayFont: "Cormorant Garamond",
    bodyFont: "Source Serif 4",
    vibe: "文学、精致、书卷气",
    aspectRatio: "both",
  },
];

export const ASPECT_RATIOS = [
  { id: "16:9", name: "横屏 16:9", hint: "适合 YouTube / 电脑端" },
  { id: "9:16", name: "竖屏 9:16", hint: "适合抖音 / 小红书" },
];

// ── Video Style ──────────────────────────────────────────

export type VideoStyle = "normal" | "fast" | "slow";

export interface VideoStyleDef {
  id: VideoStyle;
  name: string;
  nameCn: string;
  /** 每秒读多少个字（中文按字符算） */
  wordsPerSec: number;
  /** 句子之间的气口，单位秒 */
  gap: number;
  hint: string;
}

export const VIDEO_STYLES: VideoStyleDef[] = [
  { id: "normal", name: "Normal",    nameCn: "普通",   wordsPerSec: 5, gap: 1.2, hint: "科普、教学" },
  { id: "fast",   name: "Fast",      nameCn: "快节奏", wordsPerSec: 7, gap: 1.0, hint: "搞笑、资讯" },
  { id: "slow",   name: "Slow",      nameCn: "慢速",   wordsPerSec: 3, gap: 1.5, hint: "催眠、读书、冥想" },
];
