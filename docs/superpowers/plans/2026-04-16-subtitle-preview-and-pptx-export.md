# 字幕预览修复 + PPTX 导出功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 修复字幕预览点击后变成下载的问题，改为在页面内以格式化文本展示；(2) 新增导出 PPTX 功能，旁白作为每页备注嵌入

**Architecture:**
- 字幕预览：新增 `GET /api/tasks/[id]/srt` 端点返回 SRT 解析后的文本，tasks/page.tsx 的字幕 tab 改为 fetch 该 API 并渲染为 HTML，而非用 iframe src 指向 SRT 文件
- PPTX 导出：新增 `GET /api/tasks/[id]/pptx` 端点，读取 outline JSON 生成 PPTX，旁白写入 slide notes；前端在预览面板文件区增加"导出 PPTX"按钮

**Tech Stack:** `pptxgenjs` (PPTX 生成), SRT 解析（现有 `calculateSubtitles` 逻辑）

---

## Task 1: 修复字幕预览 — SRT 改为 HTML 渲染

**Files:**
- Create: `app/api/tasks/[id]/srt/route.ts` — 解析 SRT 文件并返回 HTML 渲染后的文本
- Modify: `app/tasks/page.tsx:323-334` — 字幕 tab 改用 API fetch + HTML 渲染替代 iframe

- [ ] **Step 1: 创建 SRT 渲染 API 路由**

创建 `app/api/tasks/[id]/srt/route.ts`:

```typescript
import { NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function parseSrt(content: string): Array<{index: number; time: string; text: string}> {
  const entries: Array<{index: number; time: string; text: string}> = [];
  const blocks = content.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;
    const index = parseInt(lines[0]);
    const timeLine = lines[1];
    const text = lines.slice(2).join("\n");
    entries.push({ index, time: timeLine, text });
  }
  return entries;
}

function renderSrtHtml(entries: Array<{index: number; time: string; text: string}>): string {
  return entries.map(e => `
    <div class="srt-entry">
      <div class="srt-meta">${e.time}</div>
      <div class="srt-text">${e.text.replace(/\n/g, "<br>")}</div>
    </div>
  `).join("");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // SRT 文件路径: public/output/{date}/{id}/{id}.srt
  // 需要从 DB 查 createdAt 来推断日期，或直接扫描 public/output 目录
  const { getJob } = await import("@/lib/db");
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dateStr = new Date(job.createdAt * 1000).toISOString().slice(0, 10);
  const srtPath = path.join(process.cwd(), "public", "output", dateStr, id, `${id}.srt`);

  let content: string;
  try {
    content = await readFile(srtPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "SRT not found" }, { status: 404 });
  }

  const entries = parseSrt(content);
  const html = renderSrtHtml(entries);
  return NextResponse.html(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { background: #1a1a1a; color: #fff; font-family: 'Space Grotesk', sans-serif; padding: 16px; margin: 0; }
    .srt-entry { margin-bottom: 20px; }
    .srt-meta { font-size: 11px; color: #888; font-family: monospace; margin-bottom: 4px; }
    .srt-text { font-size: 15px; line-height: 1.6; color: #e0e0e0; }
  </style></head><body>${html}</body></html>`);
}
```

- [ ] **Step 2: 运行测试验证 API**

启动服务器后执行:
```bash
curl -s http://localhost:3000/api/tasks/1886ce62/srt | head -50
```
期望：返回格式化 HTML，包含字幕条目

- [ ] **Step 3: 修改 tasks/page.tsx 字幕 tab**

将 `activeTab === "srt"` 的渲染逻辑（第 323-334 行）从：

```tsx
{activeTab === "srt" && selected.status === "done" && (() => {
  const dateStr = new Date(selected.createdAt * 1000).toISOString().slice(0, 10);
  const srtUrl = `/output/${dateStr}/${selected.id}/${selected.id}.srt`;
  return (
    <div className="tp-preview__srt">
      <iframe src={srtUrl} className="tp-preview__srt-iframe" title="srt" />
    </div>
  );
})()}
```

改为 fetch API + 注入 HTML:

```tsx
{activeTab === "srt" && selected.status === "done" && (
  <SrtPreview taskId={selected.id} createdAt={selected.createdAt} />
)}
```

新建 `SrtPreview` 组件:
```tsx
function SrtPreview({ taskId, createdAt }: { taskId: string; createdAt: number }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const dateStr = new Date(createdAt * 1000).toISOString().slice(0, 10);
    fetch(`/api/tasks/${taskId}/srt`)
      .then(r => r.text())
      .then(setHtml)
      .catch(e => setError(e.message));
  }, [taskId, createdAt]);
  if (error) return <div className="tp-preview__empty"><p>加载失败</p></div>;
  if (!html) return <div className="tp-preview__empty"><p>加载中...</p></div>;
  return (
    <div className="tp-preview__srt">
      <iframe
        srcDoc={html}
        className="tp-preview__srt-iframe"
        title="字幕"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
```

同时删除旧的 `srtUrl` 相关逻辑。

- [ ] **Step 4: 提交**

```bash
git add app/api/tasks/[id]/srt/route.ts app/tasks/page.tsx
git commit -m "fix: render SRT as HTML in subtitle preview instead of iframe download"
```

---

## Task 2: 新增 PPTX 导出功能（旁白作为备注）

**Files:**
- Create: `app/api/tasks/[id]/pptx/route.ts` — 生成 PPTX 文件，旁白写入 slide notes
- Modify: `app/tasks/page.tsx` — 在预览面板文件区增加"导出 PPTX"按钮
- Modify: `lib/style-presets.ts` — 如有字体/颜色字段变更

- [ ] **Step 1: 安装 pptxgenjs**

```bash
npm install pptxgenjs && npm install -D @types/pptxgenjs
```

- [ ] **Step 2: 创建 PPTX 导出 API 路由**

创建 `app/api/tasks/[id]/pptx/route.ts`:

```typescript
import { NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import PptxGenJS from "pptxgenjs";

function parseNarrations(outlineContent: string): string[] {
  try {
    const cleaned = outlineContent.replace(/```(?:json|markdown)?\n?/g, "").trim();
    const slides = JSON.parse(cleaned);
    return slides.map((s: any) => s.narration || s.narrations || s.旁白 || "");
  } catch {
    return [];
  }
}

function parseOutline(outlineContent: string): Array<{title: string; subtitle?: string; points?: string[]; type: string}> {
  try {
    const cleaned = outlineContent.replace(/```(?:json|markdown)?\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { getJob } = await import("@/lib/db");
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dateStr = new Date(job.createdAt * 1000).toISOString().slice(0, 10);
  const baseDir = path.join(process.cwd(), "public", "output", dateStr, id);
  const outlinePath = path.join(baseDir, `${id}-outline.md`);
  const pptxPath = path.join(baseDir, `${id}.pptx`);

  let outlineContent: string;
  try {
    outlineContent = await readFile(outlinePath, "utf-8");
  } catch {
    return NextResponse.json({ error: "Outline not found" }, { status: 404 });
  }

  const slides = parseOutline(outlineContent);
  const narrations = parseNarrations(outlineContent);

  const pptx = new PptxGenJS();
  pptx.title = job.name || "Slides";
  pptx.author = "Slides Generator";

  // 判断尺寸
  const isVertical = job.aspectRatio === "9:16";
  pptx.defineLayout({ name: isVertical ? "VERTICAL" : "WIDE", width: isVertical ? 9 : 13.33, height: isVertical ? 16 : 7.5 });
  pptx.layout = isVertical ? "VERTICAL" : "WIDE";

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideObj = pptx.addSlide();
    // 背景色
    slideObj.addShape(pptx.ShapeType.rect, { fill: { type: "solid", color: "1a1a1a" } });
    // 标题
    slideObj.addText(slide.title || "", {
      x: 0.5, y: 0.5, w: "90%", h: 1.2,
      fontSize: 36, bold: true, color: "FFFFFF",
      fontFace: "Arial",
    });
    // 副标题
    if (slide.subtitle) {
      slideObj.addText(slide.subtitle, {
        x: 0.5, y: 1.8, w: "90%", h: 0.8,
        fontSize: 20, color: "CCCCCC", fontFace: "Arial",
      });
    }
    // 要点
    if (slide.points?.length) {
      const bulletItems = slide.points.map(p => ({ text: p, options: { bullet: true, color: "E0E0E0" } }));
      slideObj.addText(bulletItems, {
        x: 0.5, y: 2.8, w: "90%", h: 4,
        fontSize: 16, color: "E0E0E0", fontFace: "Arial",
      });
    }
    // 旁白作为备注
    const narration = narrations[i];
    if (narration) {
      slideObj.addNotes(narration);
    }
  }

  await pptx.writeFile({ fileName: pptxPath });
  const urlPath = `/output/${dateStr}/${id}/${id}.pptx`;
  return NextResponse.json({ url: urlPath });
}
```

- [ ] **Step 3: 在 tasks/page.tsx 预览面板增加 PPTX 导出按钮**

在 `{activeTab === "srt" ...}` 之后，找文件区 `tp-preview__files`，在 HTML 和视频下载链接后添加:

```tsx
{selected.status === "done" && (
  <div className="tp-preview__files">
    {/* 现有 HTML/视频 文件 */}
    <div className="tp-preview__file-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <a href={selected.htmlPath} target="_blank" rel="noopener">{selected.htmlPath.split("/").pop()}</a>
    </div>
    {selected.videoPath && (
      <div className="tp-preview__file-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <a href={selected.videoPath} target="_blank" rel="noopener">{selected.videoPath.split("/").pop()}</a>
      </div>
    )}
    {/* 新增: PPTX 导出 */}
    <button
      className="tp-btn tp-btn--pptx"
      onClick={async () => {
        const res = await fetch(`/api/tasks/${selected.id}/pptx`);
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank");
        else alert("PPTX 导出失败: " + (data.error || "未知错误"));
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      导出 PPTX（含旁白备注）
    </button>
  </div>
)}
```

添加 CSS 样式（找 `tp-btn--close` 附近的按钮样式）:
```css
.tp-btn--pptx {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d7d46;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  margin-top: 8px;
}
.tp-btn--pptx:hover { background: #34a050; }
```

- [ ] **Step 4: 测试 PPTX 导出**

```bash
curl -s http://localhost:3000/api/tasks/1886ce62/pptx
```
期望: `{"url": "/output/2026-04-16/1886ce62/1886ce62.pptx"}`

验证 PPTX 文件包含备注:
```bash
unzip -p /Users/xiaoxiang/Documents/slides-generator/public/output/2026-04-16/1886ce62/1886ce62.pptx ppt/notesSlides/notesSlide1.xml 2>/dev/null | grep -o "<a:t>[^<]*</a:t>" | head -5
```
期望: 包含旁白文本

- [ ] **Step 5: 提交**

```bash
git add app/api/tasks/[id]/pptx/route.ts app/tasks/page.tsx
git commit -m "feat: add PPTX export with narration as slide notes"
```

---

## Task 3: 视频指令优化 — 确认无需字幕轨道嵌入

**Files:**
- Modify: `workflows/slides-generator.yaml` — 确保 Remotion 渲染参数不含字幕轨道叠加
- Modify: `lib/pipeline/remotion-runner.ts` — 确认 CaptionOverlay 仅用于 frame timing 同步，不嵌入视频

- [ ] **Step 1: 检查当前 Remotion 配置是否嵌入了字幕**

查看 `remotion-runner.ts` 中的 `buildCaptionOverlayTsx()` — 这个 overlay 组件只在 Remotion 渲染期间实时叠加字幕（烧入视频）。用户要求"视频不需要内嵌字幕"，需要确认当前实现是只烧入字幕还是同时生成了独立的 SRT 文件。

检查 `buildPackageJson` 和渲染命令，确认：
- 视频输出 MP4 包含字幕烧入（当前行为）
- SRT 文件单独生成（用于外部播放器的字幕文件）

如果 CaptionOverlay 正在烧入视频，但用户不需要字幕轨道：关闭 `CaptionOverlay` 叠加，仅保留 SRT 文件。

- [ ] **Step 2: 如需关闭字幕烧入，修改 remotion-runner.ts**

在构建 `index.tsx` 的代码模板中，找到 `CaptionOverlay` 的使用处并注释掉：

在 `SlideComposition` 组件渲染处（约在 remotion-runner.ts 某处，需要搜索确认）注释掉:
```tsx
{/* <CaptionOverlay subtitles={subtitles} /> */}
```

- [ ] **Step 3: 提交**

```bash
git commit -m "fix: disable burnt-in subtitle overlay in video output"
```
