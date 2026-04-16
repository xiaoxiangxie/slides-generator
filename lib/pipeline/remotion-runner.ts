// input:  taskId, htmlPath, outlinePath, outputDir, dimensions, videoStyle
// output: { mp4Path, srtPath }
// pos:    Remotion 渲染器，按任务隔离创建 Remotion 项目并调用 CLI 渲染
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { VideoStyle } from "@/lib/style-presets";

const exec = promisify(execCb);

// ── 视频风格参数 ──────────────────────────────────────────

export const STYLE_PARAMS: Record<VideoStyle, { wordsPerSec: number; gap: number }> = {
  normal: { wordsPerSec: 5, gap: 1.2 },
  fast:   { wordsPerSec: 7, gap: 1.0 },
  slow:   { wordsPerSec: 3, gap: 1.5 },
};

// ── 类型 ─────────────────────────────────────────────────

export interface RemotionRenderOptions {
  taskId: string;
  /** PPT HTML 文件绝对路径 */
  htmlPath: string;
  /** 02-outline.md 文件绝对路径 */
  outlinePath: string;
  /** 视频 + SRT 输出目录绝对路径 */
  outputDir: string;
  dimensions: { width: number; height: number };
  videoStyle: VideoStyle;
  /** 进度回调 */
  onProgress?: (msg: string) => void;
}

export interface RemotionRenderResult {
  mp4Path: string;
  srtPath: string;
}

// ── 字幕时间轴 ───────────────────────────────────────────

interface SubtitleEntry {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(entries: SubtitleEntry[]): string {
  return entries
    .map(e => `${e.index}\n${formatSrtTime(e.startSec)} --> ${formatSrtTime(e.endSec)}\n${e.text}`)
    .join("\n\n");
}

/** 从 JSON outline 提取每页旁白文本 */
function parseNarrations(outlineContent: string): string[] {
  try {
    // 去掉可能的 markdown 代码块标记
    const cleaned = outlineContent.replace(/```(?:json|markdown)?\n?/g, "").trim();
    const slides = JSON.parse(cleaned);
    return slides.map((s: any) => s.narration || s.narrations || s.旁白 || "");
  } catch {
    return [];
  }
}

/** 根据旁白和 videoStyle 计算字幕时间轴 */
export function calculateSubtitles(narrations: string[], style: VideoStyle): SubtitleEntry[] {
  const { wordsPerSec, gap } = STYLE_PARAMS[style];
  let cursor = 0;
  return narrations.map((text, i) => {
    const duration = Math.max(text.length / wordsPerSec, 1); // 最少 1 秒
    const startSec = cursor;
    const endSec = startSec + duration;
    cursor = endSec + gap;
    return { index: i + 1, text, startSec, endSec };
  });
}

// ── 生成 SRT（纯 Node.js，不依赖 Remotion） ─────────────

async function generateSrtFile(
  outlinePath: string,
  outputDir: string,
  taskId: string,
  videoStyle: VideoStyle
): Promise<string> {
  const outlineContent = await readFile(outlinePath, "utf-8");
  const narrations = parseNarrations(outlineContent);
  const subtitles = calculateSubtitles(narrations, videoStyle);
  const srtContent = buildSrt(subtitles);
  const srtPath = path.join(outputDir, `${taskId}.srt`);
  await writeFile(srtPath, srtContent, "utf-8");
  return srtPath;
}

// ── Remotion 源码模板 ────────────────────────────────────

function buildPackageJson(taskId: string): string {
  return JSON.stringify({
    name: taskId,
    version: "1.0.0",
    private: true,
    scripts: {
      build: "remotion render PPT-Video",
    },
    dependencies: {
      "@remotion/bundler": "^4.0.0",
      "@remotion/cli": "^4.0.0",
      remotion: "^4.0.0",
      react: "^18.0.0",
      "react-dom": "^18.0.0",
    },
    devDependencies: {
      typescript: "^5.0.0",
      "@types/react": "^18.0.0",
    },
  }, null, 2);
}

function buildTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      lib: ["dom", "ES2020"],
      jsx: "react",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["src"],
  }, null, 2);
}

function buildParseOutlineTs(): string {
  return `// 从 JSON outline 中直接读取每页旁白
export function parseNarrations(content: string): string[] {
  try {
    const slides = JSON.parse(content);
    return slides.map((s: any) => s.narration || s.narrations || s.旁白 || "");
  } catch {
    return [];
  }
}

// 从 JSON outline 解析幻灯片结构
export interface SlideData {
  type: string;
  title: string;
  subtitle?: string;
  points?: string[];
  summary_cards?: { label: string; value: string }[];
  narration?: string;
  bgColor?: string;
}

export function parseSlides(content: string): SlideData[] {
  try {
    const slides = JSON.parse(content);
    return slides.map((s: any) => ({
      type: s.type || "concept",
      title: s.title || "",
      subtitle: s.subtitle,
      points: s.points || [],
      summary_cards: s.summary_cards || [],
      narration: s.narration || s.narrations || s.旁白 || "",
      bgColor: s.bgColor || "#1a1a1a",
    }));
  } catch {
    return [];
  }
}
`;
}


function buildThemeTs(accentColor: string, bgColor: string, textColor: string): string {
  return `// 从 HTML 提取的主题变量
export const theme = {
  accent: "${accentColor}",
  bg: "${bgColor}",
  text: "${textColor}",
} as const;
`;
}

function buildGenerateSubtitlesTs(videoStyle: VideoStyle): string {
  const params = STYLE_PARAMS[videoStyle];
  return `// 字幕时间轴计算
export interface SubEntry { index: number; text: string; startFrame: number; endFrame: number; }

const FPS = 30;
const WORDS_PER_SEC = ${params.wordsPerSec};
const GAP_SEC = ${params.gap};

export function calculateSubtitles(narrations: string[]): SubEntry[] {
  let cursor = 0;
  return narrations.map((text, i) => {
    const durationSec = Math.max(text.length / WORDS_PER_SEC, 1);
    const startFrame = Math.round(cursor * FPS);
    const endFrame = Math.round((cursor + durationSec) * FPS);
    cursor = cursor + durationSec + GAP_SEC;
    return { index: i + 1, text, startFrame, endFrame };
  });
}
`;
}

function buildCaptionOverlayTsx(): string {
  return `import React from "react";
import { useCurrentFrame } from "remotion";
import type { SubEntry } from "./generateSubtitles";

interface Props {
  subtitles: SubEntry[];
}

export const CaptionOverlay: React.FC<Props> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const current = subtitles.find(s => frame >= s.startFrame && frame < s.endFrame);
  if (!current) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8%",
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "80%",
        textAlign: "center",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        fontSize: 28,
        fontFamily: "Manrope, sans-serif",
        fontWeight: 600,
        lineHeight: 1.5,
        padding: "0.5em 1.2em",
        borderRadius: 12,
        letterSpacing: "0.01em",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {current.text}
    </div>
  );
};
`;
}

function buildSlideSceneTsx(width: number, height: number): string {
  return `import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { SlideData } from "./parseOutline";

interface Props {
  slide: SlideData;
}

export const SlideScene: React.FC<Props> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } });
  const titleY = interpolate(titleOpacity, [0, 1], [40, 0]);

  const accentColor = "#FF5722";
  const textColor = "#ffffff";

  return (
    <div
      style={{
        width: ${width},
        height: ${height},
        background: slide.bgColor || "#1a1a1a",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "8%",
        fontFamily: "Manrope, sans-serif",
        color: textColor,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 背景装饰 */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.04) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      {/* 标题 */}
      <h1
        style={{
          fontSize: clamp(32, ${Math.round(width * 0.055)}, 96),
          fontWeight: 800,
          lineHeight: 1.15,
          opacity: titleOpacity,
          transform: \`translateY(\${titleY}px)\`,
          marginBottom: "1.2em",
          letterSpacing: "-0.02em",
        }}
      >
        {slide.title}
      </h1>

      {/* 要点或摘要卡片 */}
      {slide.type === "summary" && slide.summary_cards ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", width: "100%", maxWidth: 900 }}>
          {slide.summary_cards.map((card: any, i: number) => {
            const itemOpacity = spring({ frame: frame - (i + 1) * 6, fps, config: { damping: 20 } });
            const itemY = interpolate(Math.max(0, itemOpacity), [0, 1], [24, 0]);
            return (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderLeft: \`4px solid \${accentColor}\`,
                  padding: "1.2rem",
                  opacity: itemOpacity,
                  transform: \`translateY(\${itemY}px)\`,
                }}
              >
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>{card.label}</p>
                <p style={{ fontSize: 20, fontWeight: 600 }}>{card.value}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.7em" }}>
          {(slide.points || []).map((point: string, i: number) => {
            const itemOpacity = spring({ frame: frame - (i + 1) * 6, fps, config: { damping: 20 } });
            const itemY = interpolate(Math.max(0, itemOpacity), [0, 1], [24, 0]);
            return (
              <li
                key={i}
                style={{
                  fontSize: clamp(18, ${Math.round(width * 0.022)}, 42),
                  opacity: itemOpacity,
                  transform: \`translateY(\${itemY}px)\`,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6em",
                  color: "rgba(255,255,255,0.88)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
                {point}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

function clamp(min: number, val: number, max: number) {
  return Math.min(Math.max(val, min), max);
}
`;
}

function buildCalculateMetadataTs(
  width: number,
  height: number,
  videoStyle: VideoStyle,
  narrationCount: number
): string {
  const { wordsPerSec, gap } = STYLE_PARAMS[videoStyle];
  // 估算总时长（秒），实际运行时会从旁白长度动态算
  const estimatedDuration = narrationCount * (50 / wordsPerSec + gap) + 2;
  const fps = 30;
  const durationInFrames = Math.ceil(estimatedDuration * fps);

  return `import { CalculateMetadataFunction } from "remotion";
import type { VideoProps } from "./Video";

export const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  return {
    width: ${width},
    height: ${height},
    fps: ${fps},
    durationInFrames: props.durationInFrames ?? ${durationInFrames},
  };
};
`;
}

function buildVideoTsx(): string {
  return `import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { SlideScene } from "./SlideScene";
import { parseSlides, parseNarrations } from "./parseOutline";
import { calculateSubtitles } from "./generateSubtitles";

export interface VideoProps {
  outlineContent: string;
  durationInFrames?: number;
}

export const PPTVideo: React.FC<VideoProps> = ({ outlineContent }) => {
  const slides = parseSlides(outlineContent);
  const narrations = parseNarrations(outlineContent);
  const subtitles = calculateSubtitles(narrations);

  // 计算每页帧数：按旁白时长分配
  const FPS = 30;
  const slideFrames = subtitles.map(s => s.endFrame - s.startFrame + Math.round(1.2 * FPS));

  return (
    <AbsoluteFill>
      <Series>
        {slides.map((slide, i) => (
          <Series.Sequence key={i} durationInFrames={slideFrames[i] ?? 90}>
            <AbsoluteFill>
              <SlideScene slide={slide} />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
`;
}

function buildIndexTs(outlineContent: string, durationInFrames: number): string {
  return `import { registerRoot, Composition } from "remotion";
import { PPTVideo } from "./Video";
import { calculateMetadata } from "./calculateMetadata";

registerRoot(() => (
  <>
    <Composition
      id="PPT-Video"
      component={PPTVideo}
      calculateMetadata={calculateMetadata}
      defaultProps={{
        outlineContent: ${JSON.stringify(outlineContent)},
        durationInFrames: ${durationInFrames},
      }}
    />
  </>
));
`;
}

// ── 主入口 ────────────────────────────────────────────────

export async function runRemotionRender(opts: RemotionRenderOptions): Promise<RemotionRenderResult> {
  const { taskId, htmlPath, outlinePath, outputDir, dimensions, videoStyle, onProgress } = opts;
  const cwd = process.cwd();
  const remotionDir = path.join(cwd, "remotion", taskId);
  const srcDir = path.join(remotionDir, "src", "styles");

  onProgress?.("初始化 Remotion 项目目录...");
  await mkdir(srcDir, { recursive: true });

  // 读入 HTML 和 outline
  const htmlContent = await readFile(htmlPath, "utf-8");
  const outlineContent = await readFile(outlinePath, "utf-8");

  // 提取旁白数量用于估算时长
  const narrations = parseNarrations(outlineContent);
  const { wordsPerSec, gap } = STYLE_PARAMS[videoStyle];
  const totalSec = narrations.reduce((acc, t) => acc + Math.max(t.length / wordsPerSec, 1) + gap, 2);
  const durationInFrames = Math.ceil(totalSec * 30);

  // 提取主题色（简单 fallback）
  const accentMatch = htmlContent.match(/--accent:\s*(#[0-9a-fA-F]{3,8})/);
  const bgMatch = htmlContent.match(/--bg:\s*(#[0-9a-fA-F]{3,8})/);
  const textMatch = htmlContent.match(/--text:\s*(#[0-9a-fA-F]{3,8})/);

  onProgress?.("写入 Remotion 源码文件...");

  // package.json + tsconfig
  await writeFile(path.join(remotionDir, "package.json"), buildPackageJson(taskId), "utf-8");
  await writeFile(path.join(remotionDir, "tsconfig.json"), buildTsConfig(), "utf-8");

  // src 文件
  await writeFile(path.join(remotionDir, "src", "parseOutline.ts"), buildParseOutlineTs(), "utf-8");
  await writeFile(
    path.join(remotionDir, "src", "styles", "theme.ts"),
    buildThemeTs(accentMatch?.[1] ?? "#b8844a", bgMatch?.[1] ?? "#1a1a1a", textMatch?.[1] ?? "#ffffff"),
    "utf-8"
  );
  await writeFile(
    path.join(remotionDir, "src", "generateSubtitles.ts"),
    buildGenerateSubtitlesTs(videoStyle),
    "utf-8"
  );
  await writeFile(
    path.join(remotionDir, "src", "CaptionOverlay.tsx"),
    buildCaptionOverlayTsx(),
    "utf-8"
  );
  await writeFile(
    path.join(remotionDir, "src", "SlideScene.tsx"),
    buildSlideSceneTsx(dimensions.width, dimensions.height),
    "utf-8"
  );
  await writeFile(
    path.join(remotionDir, "src", "calculateMetadata.ts"),
    buildCalculateMetadataTs(dimensions.width, dimensions.height, videoStyle, narrations.length),
    "utf-8"
  );
  await writeFile(path.join(remotionDir, "src", "Video.tsx"), buildVideoTsx(), "utf-8");
  await writeFile(
    path.join(remotionDir, "src", "index.tsx"),
    buildIndexTs(outlineContent, durationInFrames),
    "utf-8"
  );

  // npm install
  onProgress?.("安装 Remotion 依赖（npm install）...");
  await exec("npm install --prefer-offline --ignore-scripts", {
    cwd: remotionDir,
    timeout: 120_000,
  });

  // remotion render
  const mp4Path = path.join(outputDir, `${taskId}.mp4`);
  onProgress?.("渲染视频（npx remotion render）...");
  await exec(
    `./node_modules/.bin/remotion render src/index.tsx PPT-Video --output=${mp4Path}`,
    {
      cwd: remotionDir,
      timeout: 600_000, // 10 分钟
    }
  );

  // 生成 SRT（纯 Node.js，无需 Remotion）
  onProgress?.("生成 SRT 字幕文件...");
  const srtPath = await generateSrtFile(outlinePath, outputDir, taskId, videoStyle);

  return { mp4Path, srtPath };
}
