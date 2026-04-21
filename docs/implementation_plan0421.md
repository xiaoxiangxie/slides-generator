# 计划：实现 HTML 原生视频渲染同步

## 目标
解决 Remotion 渲染出来的视频无法复刻 HTML 样式及动画的问题。通过将渲染架构从“重新实现 UI”改为“直接渲染 HTML + 时间轴同步”，确保视频与 HTML 页面高度一致。

## 用户审核事项
> [!IMPORTANT]
> 此更改将弃用 `remotion-runner.ts` 中目前硬编码的 "Terminal" 等 React 组件，转而完全依赖 LLM 生成的 HTML 样式。
> 这种方案对生成的 HTML 质量有一定要求（需要包含标准的 CSS 动画）。

## 拟定变更

### 1. HTML 解析与注入 (Orchestrator 层)
在 `orchestrator.ts` 中保存 HTML 后，增加一个注入步骤。

#### [MODIFY] [orchestrator.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/orchestrator.ts)
- 在写入 `htmlFilePath` 之后，读取并注入一个 `VideoBridge` 脚本。
- **脚本功能**：
  - 接收来自父窗口（Remotion）的 `postMessage({ type: 'SEEK', frame: number })`。
  - 将所有具有 `animation` 属性的元素设为 `animation-play-state: paused`。
  - 根据当前帧计算时间偏移，并应用到元素的 `animation-delay` 上。

---

### 2. Remotion 模板重构 (Runner 层)
彻底重构 `remotion-runner.ts` 中的源码生成逻辑。

#### [MODIFY] [remotion-runner.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/remotion-runner.ts)
- **简化 `buildSlideSceneTsx`**：
  - 不再生成具体的 UI 节点。
  - 返回一个包含 `<iframe>` 的组件。
  - 使用 `useCurrentFrame()` 钩子，并在 `useEffect` 中通过 `postMessage` 向 iframe 同步当前帧。
- **优化 `runRemotionRender`**：
  - 确保本地 HTTP 服务器在渲染期间持续运行。
  - 将生成的项目配置为直接从服务器加载幻灯片。
  - 移除 `extractCssVariables` 等脆弱的正则提取逻辑，因为样式现在直接由浏览器处理。

---

### 3. 服务器与生命周期管理
确保 Puppeteer 在 Remotion 环境下能正确访问本地托管的 HTML 文件。

#### [MODIFY] [remotion-runner.ts](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/remotion-runner.ts)
- 在调用 `remotion render` 之前，在 `runRemotionRender` 中保留并优化 `startHttpServer`。
- 修改 `buildVideoTsx`，让每个 `Series.Sequence` 都能根据索引定位到 HTML 页面中的特定幻灯片（例如通过 URL 参数 `?slide=0`）。

## 开放问题
> [!QUESTION]
> 生成的 HTML 是否使用了 standard CSS animations？如果是复杂的 JS 动力驱动动画（如 Canvas 或乱数动画），可能需要更深入的针对性处理（如 Mock Math.random）。目前假设主要是 CSS 动画。

## 验证计划

### 自动化验证
- 运行一个测试任务，对比生成的 `index.html` 在浏览器中的效果与渲染出的 `.mp4` 关键帧。

### 手动验证
- 手动查看生成的 Remotion 项目源码（在 `remotion/{taskId}` 目录下），确保 `SlideScene` 正确加载了 iframe 并能响应消息。
