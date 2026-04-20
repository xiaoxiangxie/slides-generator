# Remotion 视频渲染修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Remotion 视频渲染三大问题：(1) iframe 嵌入导致样式/字体丢失，(2) Remotion CLI 路径错误，(3) 渲染质量不稳定

**Architecture:** 改用 Remotion 原生 React 组件直接渲染幻灯片内容，替代 iframe 嵌入 HTML 的方案。使用 `@remotion/google-fonts` 确保字体加载，使用 `calculateMetadata` 动态计算时长。

**Tech Stack:** Remotion + React + @remotion/google-fonts + ffmpeg

---

## 问题分析

### 当前实现的缺陷

**问题 1: iframe 嵌入方案无法传递样式/字体**
当前 `SlideScene.tsx` 使用 `<iframe src={iframeUrl}>` 嵌入静态 HTML，但：
- Remotion headless Chrome 中 Google Fonts 加载不可靠
- postMessage 跨域通信在 iframe 场景下不可用
- 纯静态 HTML 无法接收 React props 来控制内容

**问题 2: Remotion CLI 路径错误**
`remotion-runner.ts:602` 执行：
```typescript
await exec(
  `./node_modules/.bin/remotion render src/index.tsx PPT-Video --output="${mp4Path}"`,
  { cwd: remotionDir }  // remotion/${taskId}/
);
```
问题：`./node_modules/.bin/remotion` 在 `remotionDir` 中不存在，实际路径应该是 `remotionDir/node_modules/.bin/remotion` 或使用 `npx remotion render`

**问题 3: fontFace 无法在 iframe 中跨域访问**
```tsx
const fontFamily = new FontFace('MyFont', `url(${staticFile('font.woff2')})`);
document.fonts.add(fontFamily);
```
这在主文档中有效，但 iframe 内的 HTML 无法访问同一个 fontFace。

---

## 正确方案：Remotion 原生渲染

### 核心思路

不再嵌入 HTML，而是：
1. 解析 outline JSON（slides 数组，每页有 title, points, bgColor, narration 等）
2. 用 Remotion React 组件直接渲染每页幻灯片
3. 使用 `@remotion/google-fonts` 加载字体并 `waitUntilDone()`
4. 使用 `calculateMetadata` 根据旁白长度动态计算每页时长
5. 用 `Series` 组织每页的时序

### 为什么这样更好

- 字体通过 `@remotion/google-fonts` 加载，保证在渲染前可用
- 没有 iframe 跨域问题
- 动画使用 `useCurrentFrame()` 驱动，符合 Remotion 规则
- 时序使用 `Series` 控制，符合 Remotion 最佳实践

---

## 文件修改清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `lib/pipeline/remotion-runner.ts` | 重写 | 改用 Remotion 原生组件渲染，保留 SRT 生成 |
| `remotion/${taskId}/src/` | 重建 | 新的 Remotion 源码结构 |
| `remotion/${taskId}/package.json` | 保持 | 不变 |
| `app/tasks/page.tsx` | 无修改 | 前端无需改动 |

---

## 任务列表

### Task 1: 创建幻灯片渲染组件 `SlideCard.tsx`

**Files:**
- Create: `remotion/${taskId}/src/SlideCard.tsx`

**Step 1: 创建 SlideCard 组件**

根据 outline 中的 slide 数据渲染单个幻灯片：

```tsx
import React from "react";
import { AbsoluteFill } from "remotion";
import { useCurrentFrame } from "remotion";
import { interpolate } from "remotion";
import type { SlideData } from "./types";

interface Props {
  slide: SlideData;
  fontFamily: string;
}

export const SlideCard: React.FC<Props> = ({ slide, fontFamily }) => {
  const frame = useCurrentFrame();

  // 入场动画：fade + translate
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const translateY = interpolate(frame, [0, 15], [20, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: slide.bgColor || "#1a1a1a",
        fontFamily,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* 标题 */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: "#ffffff",
          textAlign: "center",
          padding: "0 10%",
        }}
      >
        {slide.title}
      </div>

      {/* 内容区域 - 根据类型不同渲染 */}
      {slide.type === "concept" && slide.points && (
        <div style={{ marginTop: 40 }}>
          {slide.points.map((point, i) => (
            <div
              key={i}
              style={{
                fontSize: 28,
                color: "#cccccc",
                marginBottom: 16,
                padding: "0 15%",
              }}
            >
              • {point}
            </div>
          ))}
        </div>
      )}

      {slide.type === "summary" && slide.summary_cards && (
        <div style={{ display: "flex", gap: 20, marginTop: 60 }}>
          {slide.summary_cards.map((card, i) => (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "20px 30px",
              }}
            >
              <div style={{ fontSize: 14, color: "#888" }}>{card.label}</div>
              <div style={{ fontSize: 24, color: "#fff", marginTop: 8 }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
```

**Step 2: 创建 types.ts 定义**

```typescript
// remotion/${taskId}/src/types.ts
export interface SlideData {
  type: string;
  title: string;
  subtitle?: string;
  points?: string[];
  summary_cards?: { label: string; value: string }[];
  narration?: string;
  bgColor?: string;
}
```

---

### Task 2: 修改 `runRemotionRender` 使用 Remotion CLI

**Files:**
- Modify: `lib/pipeline/remotion-runner.ts:547-614`

**Step 1: 修复 Remotion CLI 路径**

在 `runRemotionRender` 中修改：

```typescript
// 原来（错误）：
await exec(
  `./node_modules/.bin/remotion render src/index.tsx PPT-Video --output="${mp4Path}"`,
  { cwd: remotionDir }
);

// 修复为（使用 npx 或完整路径）：
const remotionBin = path.join(remotionDir, "node_modules", ".bin", "remotion");
await exec(
  `"${remotionBin}" render src/index.tsx PPT-Video --output="${mp4Path}"`,
  { cwd: remotionDir, timeout: 600_000 }
);
```

**Step 2: 确保 node_modules 安装在正确位置**

检查 `remotion/${taskId}/node_modules` 是否存在 remotion 包，如果不存在需要安装。

---

### Task 3: 创建 Remotion 源码生成模板（改进）

**Files:**
- Modify: `lib/pipeline/remotion-runner.ts` 中的 `buildIndexTs`, `buildVideoTsx` 等函数

**Step 1: 更新 `buildVideoTsx` 使用 SlideCard 组件**

```typescript
function buildVideoTsx(): string {
  return `import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { SlideCard } from "./SlideCard";
import { parseSlides } from "./parseOutline";

export interface VideoProps {
  outlineContent: string;
  fontFamily: string;
}

export const PPTVideo: React.FC<VideoProps> = ({ outlineContent, fontFamily }) => {
  const slides = parseSlides(outlineContent);

  return (
    <AbsoluteFill>
      <Series>
        {slides.map((slide, i) => (
          <Series.Sequence key={i} durationInFrames={90}>
            <SlideCard slide={slide} fontFamily={fontFamily} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
`;
}
```

**Step 2: 更新 `buildIndexTs` 传入字体信息**

```typescript
function buildIndexTs(outlineContent: string, fontFamily: string): string {
  return `import { registerRoot, Composition } from "remotion";
import { PPTVideo } from "./Video";

registerRoot(() => (
  <Composition
    id="PPT-Video"
    component={PPTVideo}
    durationInFrames={720}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      outlineContent: ${JSON.stringify(outlineContent)},
      fontFamily: ${JSON.stringify(fontFamily)},
    }}
  />
));
`;
}
```

---

### Task 4: 集成测试

**Files:**
- Test: 使用 2e990254 任务进行端到端测试

**Step 1: 运行渲染**

```bash
cd /Users/xiaoxiang/Documents/slides-generator
node -e "
const { runRemotionRender } = require('./lib/pipeline/remotion-runner');
runRemotionRender({
  taskId: 'test-render',
  htmlPath: 'public/output/2026-04-20/2e990254/2e990254.html',
  outlinePath: 'public/output/2026-04-20/2e990254/2e990254-outline.md',
  outputDir: 'public/output/2026-04-20/test-render/',
  dimensions: { width: 1080, height: 1920 },
  videoStyle: 'normal',
  onProgress: (msg) => console.log(msg),
}).then(r => console.log('Done:', r)).catch(e => console.error(e));
"
```

**Step 2: 验证输出**
- [ ] MP4 文件大小 > 100KB
- [ ] 视频可以播放
- [ ] 视频中可以看到幻灯片内容（不是空白）

---

## 关键 Remotion 规则提醒

1. **字体加载**: 使用 `@remotion/google-fonts` 的 `loadFont()` 并调用 `waitUntilDone()`
2. **动画**: 必须使用 `useCurrentFrame()` 驱动，不能用 CSS transitions
3. **时序**: 使用 `Series` 而非手动控制 `from`/`duration`
4. **计算时长**: 使用 `calculateMetadata` 动态设置

---

## 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| SlideCard 组件样式与 HTML 不一致 | 视频风格与 PPT 不同 | 参考 HTML 的 CSS 变量和样式 |
| Remotion 渲染慢 | 视频合成时间长 | 优化组件复杂度 |
| 字体加载失败 | 视频无正确字体 | 使用 waitUntilDone() 确保加载完成 |

---

**Plan saved to:** `docs/superpowers/plans/2026-04-20-remotion-video-fix.md`