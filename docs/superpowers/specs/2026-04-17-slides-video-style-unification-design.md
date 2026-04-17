# PPT 与视频风格一致性修复设计方案

## 问题

`remotion-runner.ts` 的 `buildSlideSceneTsx` 函数硬编码了：
- `accentColor = "#FF5722"`（永远是橙色）
- `textColor = "#ffffff"`（永远是白色）
- `fontFamily = "Manrope"`（永远是 Manrope）
- 所有风格共用简单的渐变背景和要点列表布局

而 `frontend-slides` 生成的 HTML 才是真正的风格实现，使用了完整的 CSS 变量和每个风格独特的布局设计。

**结果：渲染出来的视频跟 PPT 风格完全不一致。**

## 解决方案

让 Remotion 的 `SlideScene.tsx` 直接通过 `<iframe>` 加载 HTML 幻灯片，保持 100% 风格一致。

```
┌─────────────────────────────────────────────┐
│              Remotion 视频                    │
│  ┌─────────────────────────────────────┐    │
│  │  iframe (加载 slides.html)           │    │
│  │  scrollIntoView 滚动到当前 slide     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  CaptionOverlay (字幕叠加层)          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## 架构设计

### 数据流

1. `orchestrator.ts` 执行工作流，生成 `slides.html`
2. `remotion-runner.ts` 将 `slides.html` 复制到 Remotion 项目的 `public/` 目录
3. 生成的 `SlideScene.tsx` 使用 `<iframe src="slides.html" />` + `scrollIntoView` 定位当前 slide
4. `CaptionOverlay` 叠加在 iframe 之上，显示时间轴对齐的字幕
5. Remotion 渲染每一帧时截图 iframe 内容

### 关键文件修改

| 文件 | 修改内容 |
|------|---------|
| `lib/pipeline/remotion-runner.ts` | `buildSlideSceneTsx` 改为生成 iframe-based 组件；不再硬编码主题色和字体 |
| `lib/pipeline/remotion-runner.ts` | 复制 `slides.html` 到 Remotion 项目的 `public/` 目录 |
| `lib/pipeline/remotion-runner.ts` | 移除 `CaptionOverlay`（字幕叠加在 iframe 之上，不再需要单独的渲染组件）|
| `remotion/{taskId}/src/Video.tsx` | 适配新的 slide 切换方式（iframe scroll 而非 React state）|
| `remotion/{taskId}/src/SlideScene.tsx` | 重写为 iframe 加载 HTML 幻灯片 |

### 新 SlideScene.tsx 结构

```tsx
import React, { useRef, useEffect } from "react";
import { useCurrentFrame } from "remotion";
import type { SlideData } from "./parseOutline";

interface Props {
  slides: SlideData[];
  iframeUrl: string;  // "slides.html"
}

export const SlideScene: React.FC<Props> = ({ slides, iframeUrl }) => {
  const frame = useCurrentFrame();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 根据 frame 计算当前 slide index
  // （从 generateSubtitles.ts 的时间轴逻辑获取每页持续时间）

  useEffect(() => {
    if (iframeRef.current) {
      // scrollIntoView 到当前 slide
    }
  }, [currentSlideIndex]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
      {/* CaptionOverlay 叠加在 iframe 之上 */}
    </div>
  );
};
```

### CaptionOverlay 保持不变

字幕叠加层（TikTok 风格）仍然叠加在 iframe 之上，显示当前时间对应的旁白文字。位置、样式不变。

## 实施步骤

1. **修改 `buildSlideSceneTsx`**：生成 iframe-based 的 `SlideScene.tsx` 模板，不再硬编码主题色/字体/布局
2. **修改 `remotion-runner.ts`**：在渲染前将 `slides.html` 复制到 Remotion 项目的 `public/` 目录
3. **修改 `Video.tsx`**：适配新的 slide 切换逻辑（基于 iframe scroll 而非组件切换）
4. **移除不必要的文件**：`CaptionOverlay.tsx` 可以保留但不再被引用（除非后续需要）
5. **测试**：用同一风格生成 PPT 和视频，验证视频风格完全一致

## 备注

- 旁白（narrations）继续只做字幕使用，不在 PPT HTML 上视觉展示
- 旁白数据仍然存储在 outline JSON 的 `narrations` 字段，供 Remotion 生成 SRT 和字幕叠加
