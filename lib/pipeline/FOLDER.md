# pipeline/ 架构说明

**职责**：多步 Claude Code CLI 流水线，串联 agent-browser → ljg-writes → frontend-slides
**包含**：`index.ts` - Pipeline 编排器（含任务名称提取/取消检查/endedAt 设置）, `claude-runner.ts` - Claude Code CLI 调用封装（含 stdin 管道修复）, `prompts.ts` - 三步 prompt 模板

> ⚠️ 一旦本文件夹有变化，请更新本文档
