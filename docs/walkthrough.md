# Remotion 视频生成集成 - 实施总结

关于为 Pipeline 追加 Remotion 并一键生成演示讲稿视频和 SRT 字幕的需求现已实施完毕！

## 🎯 功能实施要点

1. **结构设计（无缝对接）**：
   - 提取了原来的 HTML 网页产物到单独按 ID 分配的独立子目录 `/public/output/{date}/{id}/` 中。
   - `videoStyle` 作为基础选项贯穿前后端、`db.ts` 与 Pipeline，并以选项组形式展现在页面 Generate 按钮上方，支持 `"普通" / "快节奏" / "慢速"` 时长风格。

2. **独立安全的渲染核心**：
   - 新增了独立模块 [`remotion-runner.ts`](file:///Users/xiaoxiang/Documents/slides-generator/lib/pipeline/remotion-runner.ts)，其负责基于生成的 Pipeline 素材（HTML / `02-outline.md`）在系统根环境 `../remotion/{id}/` 下构建完整的 Remotion 视频项目沙盒。
   - 并在底层使用纯 Node.js 计算 `02-outline.md` 每个片段的时长分配，输出同帧率的 TikTok 下沉式字幕界面与单独打包的 `id.srt` 字幕轴，随后执行执行 `npm install` 与 `npx remotion render` 实施硬渲染工作。

3. **异常处理边界**：
   - **Video 视频渲染为 Pipeline 的子模块任务但不阻塞全局失败**。如果在重构的 Step 4：Remotion 硬渲染时发生系统依赖/资源抓取失败，不会引发上报系统奔溃事件，将会直接以无视频生成的情况结束（但已安全写入了生成的 PPT `html`）。保障服务鲁棒性。

## ✅ 变更清单验证与操作

* 服务端与数据库增量升级完好无损：已经通过 `ALTER TABLE` 将 `jobs` SQLite 扩充了 `videoStyle` 和 `videoPath` 两个新表位，确保对现有 DB 生成记录安全回退与升级兼容。
* 如果对任务生成的产物（包括 MP4/SRT）进行人工二次调整/补修的话，可以直接进入当前目录的 `.gitignore` `/remotion/{taskId}/` 文件进行手工构建与代码微调，由于生成的临时项目是一个标准的工程组件依赖形式（有独立的 `package.json` 组件），便于独立预览：
  ```bash
  cd ./remotion/{ID_NAME}
  npm run build # 即可重新通过 React 直接打出 MP4 包
  ```

🎉 功能验证随时可以展开。如果你想修改字幕位置、视频排版或默认停留秒数，随时指出来，我们可以调整 `remotion-runner.ts` 的自动注入组件源码块的内容来变更表现样式！
