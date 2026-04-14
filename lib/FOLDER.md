# lib/ 架构说明

**职责**：业务逻辑模块（风格预设、状态管理、Pipeline 编排）
**包含**：`style-presets.ts` - 12 种风格定义, `db.ts` - SQLite 持久化层, `task-store.ts` - db.ts re-export（服务端）, `generation-store.ts` - localStorage 客户端缓存, `pipeline/` - 多步 Claude Code CLI 流水线

> ⚠️ 一旦本文件夹有变化，请更新本文档
