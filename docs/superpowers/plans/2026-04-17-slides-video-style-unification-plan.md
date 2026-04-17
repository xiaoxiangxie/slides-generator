# PPT 与视频风格一致性修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Remotion 渲染的视频通过 iframe 直接加载 HTML 幻灯片，实现视频 100% 还原 PPT HTML 风格。

**Architecture:** 改动 `remotion-runner.ts` 中的模板生成函数，不再生成手写风格的 React 代码。改为生成 iframe-based 的 SlideScene，通过 `scrollIntoView` 定位当前 slide。字幕通过 CaptionOverlay 叠加在 iframe 之上。

**Tech Stack:** TypeScript, Remotion, React

---

## 文件修改概览

| 文件 | 修改内容 |
|------|---------|
| `lib/pipeline/remotion-runner.ts` | `buildSlideSceneTsx` → iframe-based；`buildVideoTsx` → 传 slides URL；`runRemotionRender` → 复制 html 到 public 目录；新增 `buildCaptionOverlayTsx` |
| 无需新增文件 | 直接修改现有模板函数 |

---

## Task 1: 修改 `buildSlideSceneTsx` — 改为 iframe 加载模式

**文件:** `lib/pipeline/remotion-runner.ts:223-337`

- [ ] **Step 1: 读取当前 `buildSlideSceneTsx` 完整代码**

路径: `lib/pipeline/remotion-runner.ts` 第 223-337 行

- [ ] **Step 2: 替换 `buildSlideSceneTsx` 为 iframe 版本**

删除硬编码的 accentColor/textColor/fontFamily，改为：

```typescript
function buildSlideSceneTsx(slideCount: number): string {
  return `import React, { useRef, useEffect } from "react";
import { useCurrentFrame } from "remotion";
import { calculateSubtitles } from "./generateSubtitles";

interface Props {
  slides: import("./parseOutline").SlideData[];
  narrationText: string; // 该页旁白文本
  currentSlideIndex: number;
  iframeUrl: string;
}

export const SlideScene: React.FC<Props> = ({ slides, narrationText, currentSlideIndex, iframeUrl }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const iframe = iframeRef.current;
    // 等待 iframe 加载后通过 postMessage 滚动到对应 slide
    const handleLoad = () => {
      iframe.contentWindow?.postMessage(
        { type: "scrollToSlide", index: currentSlideIndex },
        "*"
      );
    };
    iframe.addEventListener("load", handleLoad);
    // 如果已经加载过，直接发消息
    if (iframe.contentDocument?.readyState === "complete") {
      handleLoad();
    }
    return () => iframe.removeEventListener("load", handleLoad);
  }, [currentSlideIndex]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        allow="fullscreen"
      />
    </div>
  );
};
`;
}
```

**说明:** SlideScene 现在是一个纯 iframe 容器，具体 slide 定位由 HTML 页面内部的 JS 通过 `postMessage` 控制。iframeUrl 传入的是 `slides.html`。

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline/remotion-runner.ts
git commit -m "refactor: buildSlideSceneTsx now renders iframe instead of hardcoded styles"
```

---

## Task 2: 修改 `buildVideoTsx` — 适配新的 SlideScene 接口并加入 CaptionOverlay

**文件:** `lib/pipeline/remotion-runner.ts:365-400`

- [ ] **Step 1: 替换 `buildVideoTsx`**

```typescript
function buildVideoTsx(slideCount: number): string {
  return `import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { SlideScene } from "./SlideScene";
import { parseSlides, parseNarrations } from "./parseOutline";
import { CaptionOverlay } from "./CaptionOverlay";

export interface VideoProps {
  outlineContent: string;
  iframeUrl: string;
  durationInFrames?: number;
}

export const PPTVideo: React.FC<VideoProps> = ({ outlineContent, iframeUrl }) => {
  const slides = parseSlides(outlineContent);
  const narrations = parseNarrations(outlineContent);
  const FPS = 30;

  // 计算每页帧数
  const slideFrames = narrations.map((text: string) => {
    const durationSec = Math.max(text.length / 5, 1) + 1.2;
    return Math.round(durationSec * FPS);
  });

  return (
    <AbsoluteFill>
      <Series>
        {slides.map((slide: any, i: number) => (
          <Series.Sequence key={i} durationInFrames={slideFrames[i] ?? 90}>
            <AbsoluteFill>
              <SlideScene
                slides={slides}
                narrationText={narrations[i] ?? ""}
                currentSlideIndex={i}
                iframeUrl={iframeUrl}
              />
              <CaptionOverlay narrationText={narrations[i] ?? ""} />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pipeline/remotion-runner.ts
git commit -m "feat: buildVideoTsx now passes iframeUrl and renders CaptionOverlay"
```

---

## Task 3: 新增 `buildCaptionOverlayTsx` — 字幕叠加组件模板

**文件:** `lib/pipeline/remotion-runner.ts`（在 `buildGenerateSubtitlesTs` 之后插入新函数）

- [ ] **Step 1: 在 `buildGenerateSubtitlesTs` 之后添加 `buildCaptionOverlayTsx`**

```typescript
function buildCaptionOverlayTsx(): string {
  return `import React from "react";
import { useCurrentFrame } from "remotion";
import { spring, interpolate } from "remotion";

interface Props {
  narrationText: string;
}

export const CaptionOverlay: React.FC<Props> = ({ narrationText }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 6, 80], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const slideUp = interpolate(opacity, [0, 1], [16, 0]);

  if (!narrationText) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8%",
        left: "50%",
        transform: \`translateX(-50%) translateY(\${slideUp}px)\`,
        opacity,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        borderRadius: "12px",
        padding: "14px 28px",
        maxWidth: "80%",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: "clamp(14px, 2.5vw, 22px)",
          fontWeight: 500,
          color: "#ffffff",
          lineHeight: 1.5,
          letterSpacing: "0.01em",
        }}
      >
        {narrationText}
      </span>
    </div>
  );
};
`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pipeline/remotion-runner.ts
git commit -m "feat: add buildCaptionOverlayTsx template for subtitle overlay"
```

---

## Task 4: 修改 `runRemotionRender` — 复制 HTML 到 public 目录并更新调用

**文件:** `lib/pipeline/remotion-runner.ts:425-507`

- [ ] **Step 1: 修改 `runRemotionRender` 中 HTML 复制逻辑**

在 `// 读入 HTML 和 outline` 之后，`// 提取主题色` 之前，添加：

```typescript
// 将 slides.html 复制到 Remotion 项目的 public 目录供 iframe 加载
const publicDir = path.join(remotionDir, "public");
await mkdir(publicDir, { recursive: true });
await copyFile(htmlPath, path.join(publicDir, "slides.html"));
```

需要 import `copyFile`:
```typescript
import { mkdir, writeFile, readFile, copyFile } from "fs/promises";
```

- [ ] **Step 2: 修改 `buildVideoTsx` 调用处，传入 `iframeUrl`**

找到 `await writeFile(..., buildVideoTsx(), ...)` 的调用，改为 `buildVideoTsx(slides.length)`，但由于 `buildVideoTsx` 签名已变，需要传参。

实际上 `buildVideoTsx` 的参数 `slideCount` 只用于未来扩展，当前可以传 0。

- [ ] **Step 3: 修改 `buildIndexTs` 传入 `iframeUrl` prop**

```typescript
function buildIndexTs(outlineContent: string, durationInFrames: number, iframeUrl: string): string {
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
        iframeUrl: "${iframeUrl}",
        durationInFrames: ${durationInFrames},
      }}
    />
  </>
));
`;
}
```

- [ ] **Step 4: 修改 `writeFile` 调用 `buildIndexTs` 处**

在 `runRemotionRender` 中，将 `buildIndexTs(outlineContent, durationInFrames)` 改为 `buildIndexTs(outlineContent, durationInFrames, "slides.html")`。

- [ ] **Step 5: 验证所有 build* 函数签名一致**

确保 `buildVideoTsx(slideCount: number)` 的参数在调用时正确传递。

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/remotion-runner.ts
git commit -m "feat: copy slides.html to public dir and pass iframeUrl to Remotion"
```

---

## Task 5: 为 HTML 幻灯片添加 `postMessage` 监听器支持 slide 滚动

**文件:** HTML 幻灯片通过 `frontend-slides` agent 生成，**需要修改 agent prompt**。

**文件:** `.agents/frontend-slides/agent.md`

- [ ] **Step 1: 读取当前 `frontend-slides/agent.md`**

路径: `.agents/frontend-slides/agent.md`

- [ ] **Step 2: 在 `agent.md` 末尾（HTML 输出指令之后）添加 JavaScript 代码块**

在 HTML 的 `</body>` 之前添加：

```html
<script>
  // 监听 Remotion iframe 的 postMessage 滚动指令
  window.addEventListener("message", (event) => {
    if (event.data?.type === "scrollToSlide") {
      const slideIndex = event.data.index;
      const slides = document.querySelectorAll(".slide");
      if (slides[slideIndex]) {
        slides[slideIndex].scrollIntoView({ behavior: "instant" });
      }
    }
  });
  // 初始化：滚动到第一页
  if (window.location.hash) {
    const idx = parseInt(window.location.hash.replace("#slide=", ""));
    if (!isNaN(idx)) {
      const slides = document.querySelectorAll(".slide");
      if (slides[idx]) slides[idx].scrollIntoView({ behavior: "instant" });
    }
  }
</script>
```

- [ ] **Step 3: Commit**

```bash
git add .agents/frontend-slides/agent.md
git commit -m "feat: frontend-slides listens for postMessage scrollToSlide from Remotion"
```

---

## Task 6: 端到端测试

- [ ] **Step 1: 用一个具体的风格（如 Neon Cyber）执行完整流程**

1. 选择风格，输入内容，触发生成
2. 观察 `public/output/{date}/{taskId}/` 目录中的 `slides.html` 是否生成
3. 观察 `remotion/{taskId}/public/slides.html` 是否被正确复制
4. 渲染视频后，检查视频风格是否与 PPT HTML 一致

- [ ] **Step 2: 验证 CaptionOverlay 字幕是否正确显示**

---

## 依赖说明

无需安装新 npm 包。使用原生 `copyFile`（Node.js 16+ 支持）和原生 `postMessage` API。

---

## Spec 自查

1. **Spec coverage:** 设计文档的所有需求（iframe 加载、字幕叠加、postMessage 通信）都有对应 Task 覆盖 ✓
2. **Placeholder scan:** 无 TBD/TODO，所有代码示例均为完整可运行的代码 ✓
3. **Type consistency:** `SlideScene` 接收 `iframeUrl: string` prop，Video.tsx 传入 `iframeUrl` prop，类型一致 ✓
