// input:  taskId, htmlPath, outlinePath, outputDir, dimensions, videoStyle
// output: { mp4Path, srtPath }
// pos:    Remotion 渲染器，按任务隔离创建 Remotion 项目并调用 CLI 渲染
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { exec as execCb, spawn as spawnCb } from "child_process";
import { promisify } from "util";
import http from "http";
import type { VideoStyle } from "@/lib/style-presets";

const exec = promisify(execCb);

// 从 HTML 中提取 CSS 变量
interface CssVariables {
  bg: string;
  text: string;
  accent: string;
  secondary: string;
  dim: string;
  glow: string;
  fontFamily: string;
}

function extractCssVariables(htmlContent: string): CssVariables {
  const defaults = {
    bg: "#0d1117",
    text: "#39d353",
    accent: "#39d353",
    secondary: "#79c0ff",
    dim: "#484f58",
    glow: "rgba(57, 211, 83, 0.15)",
    fontFamily: "JetBrains Mono, monospace",
  };

  try {
    // 提取 :root 中的变量
    const rootMatch = htmlContent.match(/:root\s*\{([^}]+)\}/);
    if (!rootMatch) return defaults;

    const cssBlock = rootMatch[1];
    const getVar = (name: string, fallback: string): string => {
      const match = cssBlock.match(new RegExp(`--${name}\\s*:\\s*([^;]+)`));
      return match ? match[1].trim() : fallback;
    };

    // 提取 font-family
    const fontMatch = htmlContent.match(/font-family:\s*['"]?([^'";\n]+)['"]?/);
    const fontFamily = fontMatch ? fontMatch[1].trim() : defaults.fontFamily;

    return {
      bg: getVar("bg", defaults.bg),
      text: getVar("text", defaults.text),
      accent: getVar("accent", defaults.accent),
      secondary: getVar("secondary", defaults.secondary),
      dim: getVar("dim", defaults.dim),
      glow: getVar("glow", defaults.glow),
      fontFamily,
    };
  } catch {
    return defaults;
  }
}

// 解析旁白文本（处理 markdown 代码块）
function parseNarrations(content: string): string[] {
  try {
    const cleaned = content.replace(/```(?:json|markdown)?\n?/g, "").trim();
    const slides = JSON.parse(cleaned);
    return slides.map((s: any) => s.narration || s.narrations || s.旁白 || "");
  } catch {
    return [];
  }
}

// 解析幻灯片结构
interface SlideData {
  type: string;
  title: string;
  subtitle?: string;
  points?: string[];
  summary_cards?: { label: string; value: string }[];
  narration?: string;
  bgColor?: string;
}

function parseSlides(content: string): SlideData[] {
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

// 启动简单 HTTP 服务器
async function startHttpServer(dir: string, port: number): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve, reject) => {
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };

    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, req.url === "/" ? "index.html" : req.url!);
      // 安全检查：确保文件在 dir 内
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || "application/octet-stream";
      readFile(filePath)
        .then((data) => {
          res.writeHead(200, { "Content-Type": contentType });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end("Not found");
        });
    });

    server.listen(port, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
    server.on("error", reject);
  });
}

// ── Puppeteer HTML 转视频 ──────────────────────────────────
async function renderHtmlToVideoUsingPuppeteer(
  htmlPath: string,
  outlinePath: string,
  outputDir: string,
  dimensions: { width: number; height: number },
  videoStyle: VideoStyle,
  onProgress?: (msg: string) => void
): Promise<{ mp4Path: string }> {
  const puppeteer = await import("puppeteer");
  const { wordsPerSec, gap } = STYLE_PARAMS[videoStyle];

  // 检查 ffmpeg 可用性
  try {
    await exec("ffmpeg -version");
  } catch {
    throw new Error("ffmpeg not found. Please install ffmpeg first.");
  }

  // 读取 outline 获取幻灯片数量和旁白
  const outlineContent = await readFile(outlinePath, "utf-8");
  const narrations = parseNarrations(outlineContent);
  const slides = parseSlides(outlineContent);

  // 边界检查：slides 为空
  if (slides.length === 0) {
    throw new Error("No slides found in outline. Please check the outline JSON format.");
  }

  const totalSec = narrations.reduce((acc, t) => acc + Math.max(t.length / wordsPerSec, 1) + gap, 2);

  // 启动 HTTP 服务器
  const htmlDir = path.dirname(htmlPath);
  onProgress?.("启动本地服务器...");
  const { server, url } = await startHttpServer(htmlDir, 3456);

  const framesDir = path.join(outputDir, "frames");
  await mkdir(framesDir, { recursive: true });

  onProgress?.("启动浏览器...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: dimensions.width, height: dimensions.height, deviceScaleFactor: 1 });

  onProgress?.(`加载 HTML 页面...`);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

  // 等待字体加载完成（额外等待 3-5 秒）
  await page.waitForTimeout(5000);
  await page.waitForNetworkIdle({ timeout: 30000 }).catch(() => {});

  const fps = 30;
  const totalFrames = Math.ceil(totalSec * fps);

  // 截图每一帧（使用扁平化序号供 ffmpeg 使用）
  let frameIndex = 0;
  for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
    onProgress?.(`截取第 ${slideIdx + 1}/${slides.length} 页...`);

    // 滚动到指定幻灯片
    await page.evaluate((idx) => {
      const slides = document.querySelectorAll(".slide");
      if (slides[idx]) {
        slides[idx].scrollIntoView();
      }
    }, slideIdx);

    // 等待滚动完成
    await page.waitForTimeout(300);

    // 计算该幻灯片持续时间（秒）
    const slideSec = Math.max(narrations[slideIdx]?.length / wordsPerSec || 5, 2) + gap;
    const slideFrames = Math.ceil(slideSec * fps);

    // 逐帧截图（扁平序号 frame%04d.png）
    for (let f = 0; f < slideFrames; f++) {
      const framePath = path.join(framesDir, `frame${String(frameIndex).padStart(4, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png" });
      frameIndex++;
    }
  }

  await browser.close();
  server.close();

  // 使用 ffmpeg 合成视频
  const mp4Path = path.join(outputDir, `${path.basename(outputDir)}.mp4`);
  onProgress?.("合成视频...");

  const inputPattern = path.join(framesDir, "frame%04d.png");
  await exec(
    `ffmpeg -y -framerate ${fps} -i "${inputPattern}" -c:v libx264 -pix_fmt yuv420p -s ${dimensions.width}x${dimensions.height} "${mp4Path}"`,
    { timeout: 300000 }
  );

  // 清理帧文件
  await exec(`rm -rf "${framesDir}"`);

  return { mp4Path };
}

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



function buildThemeTs(cssVars: CssVariables): string {
  return `// 从 HTML CSS 变量提取的主题配置
export const COLORS = {
  bg: "${cssVars.bg}",
  text: "${cssVars.text}",
  accent: "${cssVars.accent}",
  secondary: "${cssVars.secondary}",
  dim: "${cssVars.dim}",
  glow: "${cssVars.glow}",
};

export const FONTS = {
  primary: "${cssVars.fontFamily.split(",")[0].trim()}",
  mono: "${cssVars.fontFamily}",
};

export const GLOW_CYAN = \`0 0 20px \${COLORS.accent}40, 0 0 40px \${COLORS.accent}20\`;
export const GLOW_SECONDARY = \`0 0 20px \${COLORS.secondary}40, 0 0 40px \${COLORS.secondary}20\`;
`;
}

// 根据 slide 数据生成场景组件代码
function buildSlideSceneTsx(slideIndex: number, slide: SlideData, cssVars: CssVariables): string {
  const slideNum = String(slideIndex + 1).padStart(2, "0");
  const totalSlides = "08"; // 这个后面会动态计算

  // 根据 slide 类型生成不同的内容
  let contentJsx = "";

  if (slide.type === "title" || slide.type === "concept") {
    contentJsx = `
      {/* Terminal Frame */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 500,
        background: "rgba(13, 17, 23, 0.95)",
        border: \`1px solid \${COLORS.accent}50\`,
        borderRadius: 8,
        boxShadow: \`0 0 30px \${COLORS.glow}, inset 0 1px 0 rgba(255,255,255,0.05)\`,
        padding: "clamp(1.5rem, 4vw, 2.5rem)",
      }}>
        {/* Terminal Header */}
        <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: \`1px solid \${COLORS.accent}33\` }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f56" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#27c93f" }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: "clamp(1.5rem, 5vw, 2.2rem)",
          fontWeight: 700,
          marginBottom: "1rem",
          textShadow: \`0 0 20px \${COLORS.glow}\`,
          lineHeight: 1.3,
          color: COLORS.text,
        }}>
          ${slide.title}
        </h1>

        ${slide.points && slide.points.length > 0 ? `
        {/* Points List */}
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          ${slide.points.map((point, i) => `
            <li style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              fontSize: "clamp(0.85rem, 2.2vw, 1rem)",
              lineHeight: 1.5,
              color: COLORS.text,
            }}>
              <span style={{ color: COLORS.accent, flexShrink: 0, marginTop: "0.1em" }}>▹</span>
              ${point}
            </li>
          `).join("")}
        </ul>
        ` : ""}

        ${slide.narration ? `
        {/* Narration */}
        <div style={{
          marginTop: "1.5rem",
          padding: "1rem",
          background: \`\${COLORS.accent}0d\`,
          borderLeft: \`2px solid \${COLORS.accent}\`,
          fontSize: "clamp(0.75rem, 1.8vw, 0.9rem)",
          color: \`\${COLORS.accent}cc\`,
          fontStyle: "italic",
          lineHeight: 1.7,
        }}>
          &gt; ${slide.narration}
        </div>
        ` : ""}
      </div>
    `;
  } else if (slide.type === "summary" && slide.summary_cards) {
    contentJsx = `
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "1rem",
        width: "100%",
        maxWidth: 500,
      }}>
        ${slide.summary_cards.map(card => `
          <div style={{
            display: "flex",
            flexDirection: "column",
            padding: "1rem",
            background: \`\${COLORS.accent}0d\`,
            border: \`1px solid \${COLORS.accent}33\`,
            borderRadius: 6,
          }}>
            <span style={{
              fontSize: "clamp(0.7rem, 1.5vw, 0.8rem)",
              color: COLORS.secondary,
              marginBottom: "0.25rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}>
              // ${card.label}
            </span>
            <span style={{
              fontSize: "clamp(0.85rem, 2vw, 1rem)",
              color: COLORS.text,
              fontWeight: 500,
            }}>
              ${card.value}
            </span>
          </div>
        `).join("")}
      </div>
    `;
  }

  return `import React from "react";
import { AbsoluteFill } from "remotion";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS, GLOW_CYAN } from "./theme";

// FadeIn 动画组件
function FadeIn({ children, delay, duration, slideDistance }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = Math.max(0, Math.min(1, (frame - delay) / (fps * duration)));
  return (
    <div style={{
      opacity: progress,
      transform: \`translateY(\${(1 - progress) * slideDistance}px)\`,
    }}>
      {children}
    </div>
  );
}

// Slide ${slideNum} 场景组件
export const SlideScene${slideNum}: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily: FONTS.mono }}>
      {/* Grid Background */}
      <div style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100%",
        height: "100%",
        backgroundImage: \`
          linear-gradient(\${COLORS.accent}08 1px, transparent 1px),
          linear-gradient(90deg, \${COLORS.accent}08 1px, transparent 1px)
        \`,
        backgroundSize: "40px 40px",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Section Number */}
      <div style={{
        position: "absolute",
        top: "clamp(1rem, 3vw, 2rem)",
        left: "clamp(1rem, 3vw, 2rem)",
        fontSize: "clamp(0.7rem, 1.5vw, 0.85rem)",
        color: COLORS.dim,
        zIndex: 2,
      }}>
        [ ${slideNum}/${totalSlides} ]
      </div>

      {/* Main Content - 带入场动画 */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "clamp(1.5rem, 5vw, 3rem)",
        zIndex: 1,
      }}>
        <FadeIn delay={0} duration={0.5} slideDistance={20}>
          ${contentJsx}
        </FadeIn>
      </div>

      {/* Corner Decorations */}
      <div style={{
        position: "absolute",
        top: 10, left: 10,
        width: 30, height: 30,
        borderTop: \`2px solid \${COLORS.accent}\`,
        borderLeft: \`2px solid \${COLORS.accent}\`,
        opacity: 0.5,
      }} />
      <div style={{
        position: "absolute",
        top: 10, right: 10,
        width: 30, height: 30,
        borderTop: \`2px solid \${COLORS.accent}\`,
        borderRight: \`2px solid \${COLORS.accent}\`,
        opacity: 0.5,
      }} />
      <div style={{
        position: "absolute",
        bottom: 10, left: 10,
        width: 30, height: 30,
        borderBottom: \`2px solid \${COLORS.accent}\`,
        borderLeft: \`2px solid \${COLORS.accent}\`,
        opacity: 0.5,
      }} />
      <div style={{
        position: "absolute",
        bottom: 10, right: 10,
        width: 30, height: 30,
        borderBottom: \`2px solid \${COLORS.accent}\`,
        borderRight: \`2px solid \${COLORS.accent}\`,
        opacity: 0.5,
      }} />
    </AbsoluteFill>
  );
};
`;
}

// 生成主视频组件
function buildVideoTsx(slideCount: number, narrations: string[]): string {
  const sceneImports = Array.from({ length: slideCount }, (_, i) =>
    `import { SlideScene${String(i + 1).padStart(2, "0")} } from "./SlideScene${String(i + 1).padStart(2, "0")}";`
  ).join("\n");

  const slideDurations = narrations.map((n) => {
    const minFrames = 90;
    const charCount = n.length || 20;
    const charBasedFrames = Math.round(charCount * 9);
    return Math.max(minFrames, charBasedFrames);
  });

  const sceneComponents = Array.from({ length: slideCount }, (_, i) =>
    `        <Series.Sequence key={${i}} durationInFrames={${slideDurations[i]}}>
          <SlideScene${String(i + 1).padStart(2, "0")} />
        </Series.Sequence>`
  ).join("\n");

  return `import React from "react";
import { AbsoluteFill, Series } from "remotion";
${sceneImports}

export const PPTVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Series>
${sceneComponents}
      </Series>
    </AbsoluteFill>
  );
};
`;
}

// 生成 index.tsx
function buildIndexTs(dimensions: { width: number; height: number }, totalFrames: number): string {
  return `import { registerRoot, Composition } from "remotion";
import { PPTVideo } from "./Video";

registerRoot(() => (
  <Composition
    id="PPT-Video"
    component={PPTVideo}
    durationInFrames={${totalFrames}}
    fps={30}
    width={${dimensions.width}}
    height={${dimensions.height}}
  />
));
`;
}

// 删除旧函数（不再需要）

export async function runRemotionRender(opts: RemotionRenderOptions): Promise<RemotionRenderResult> {
  const { taskId, htmlPath, outlinePath, outputDir, dimensions, videoStyle, onProgress } = opts;
  const cwd = process.cwd();
  const remotionDir = path.join(cwd, "remotion", taskId);

  onProgress?.("初始化 Remotion 项目目录...");
  await mkdir(path.join(remotionDir, "src"), { recursive: true });

  // 读取 HTML 和 outline
  const htmlContent = await readFile(htmlPath, "utf-8");
  const outlineContent = await readFile(outlinePath, "utf-8");

  // 提取 CSS 变量
  const cssVars = extractCssVariables(htmlContent);
  onProgress?.(`提取主题: bg=${cssVars.bg}, accent=${cssVars.accent}`);

  // 解析幻灯片
  const slides = parseSlides(outlineContent);
  const slideCount = slides.length;
  onProgress?.(`解析到 ${slideCount} 页幻灯片`);

  // 写 package.json 和 tsconfig
  await writeFile(path.join(remotionDir, "package.json"), buildPackageJson(taskId), "utf-8");
  await writeFile(path.join(remotionDir, "tsconfig.json"), buildTsConfig(), "utf-8");

  onProgress?.("写入 Remotion 源码文件...");

  // 写 theme.ts
  await writeFile(path.join(remotionDir, "src", "theme.ts"), buildThemeTs(cssVars), "utf-8");

  // 写每个幻灯片场景组件
  for (let i = 0; i < slideCount; i++) {
    const slide = slides[i];
    const sceneCode = buildSlideSceneTsx(i, slide, cssVars);
    await writeFile(
      path.join(remotionDir, "src", `SlideScene${String(i + 1).padStart(2, "0")}.tsx`),
      sceneCode,
      "utf-8"
    );
    onProgress?.(`写入 SlideScene${String(i + 1).padStart(2, "0")}.tsx`);
  }

  // 解析旁白并计算每页时长
  const narrations = slides.map(s => s.narration || s.narrations || "");
  const slideDurations = narrations.map((n) => {
    const minFrames = 90;
    const charCount = n.length || 20;
    const charBasedFrames = Math.round(charCount * 9); // 每字约 0.3 秒 * 30fps
    return Math.max(minFrames, charBasedFrames);
  });
  const totalFrames = slideDurations.reduce((a, b) => a + b, 0);

  // 写 Video.tsx 和 index.tsx
  await writeFile(path.join(remotionDir, "src", "Video.tsx"), buildVideoTsx(slideCount, narrations), "utf-8");
  await writeFile(path.join(remotionDir, "src", "index.tsx"), buildIndexTs(dimensions, totalFrames), "utf-8");

  // npm install（如果还没有依赖）
  const needsInstall = !(await readFile(path.join(remotionDir, "node_modules", ".package-lock.json"), "utf-8").catch(() => null));
  if (needsInstall) {
    onProgress?.("安装 Remotion 依赖...");
    await exec("npm install --prefer-offline --ignore-scripts", {
      cwd: remotionDir,
      timeout: 180_000,
    });
  }

  // 渲染视频
  const mp4Path = path.resolve(cwd, outputDir, `${taskId}.mp4`);
  onProgress?.("渲染视频（Remotion）...");
  // 使用完整的 remotion CLI 路径
  const remotionBin = path.join(remotionDir, "node_modules", ".bin", "remotion");
  await exec(
    `"${remotionBin}" render src/index.tsx PPT-Video --output="${mp4Path}" --scale=1`,
    {
      cwd: remotionDir,
      timeout: 600_000,
    }
  );

  // 生成 SRT
  onProgress?.("生成 SRT 字幕文件...");
  const srtPath = await generateSrtFile(outlinePath, outputDir, taskId, videoStyle);

  return { mp4Path, srtPath };
}
