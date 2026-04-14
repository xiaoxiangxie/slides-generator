# 变更日志

## 2026-04-14 (下)

### 功能增强：Remotion 视频自动生成集成
- Pipeline 在生成 HTML (+ 02-outline.md) 后，追加视频生成步骤 (Step 4)
- 通过 `lib/pipeline/remotion-runner.ts` 动态创建独立的 Remotion 项目隔离环境 (`/remotion/{taskId}`)
- 支持三种视频速率风格（Normal / Fast / Slow），动态计算字幕时间点并渲染 `.mp4`
- 同步生成 `.srt` 字幕供剪映等二次剪辑导入
- 首页 UI 增加 `videoStyle` 按钮，任务状态新增 `Video ↗` 直达链接
- SQLite 数据库 (`lib/db.ts`) 和 Client Store 同步扩充了 `videoStyle` 与 `videoPath` 字段的持久化支持
- HTML 输出目录变更为单独目录 `/public/output/{date}/{id}/{id}.html` 以整合资源存放

## 2026-04-14 (上)

### 架构升级：状态层迁移至 SQLite

**问题背景**：
- 原方案：服务端用内存 Map（进程重启丢数据），客户端用 localStorage（两个存储层不同步）
- 首页创建的任务，预览页读取不到（"任务不存在"）

**解决方案**：
- 引入 `lib/db.ts` 作为统一持久化层，基于 better-sqlite3
- `task-store.ts` 变成 db.ts 的 re-export，服务端 API 全用 task-store
- `generation-store.ts` 保留为 localStorage，仅客户端作为缓存
- 首页通过 `GET /api/tasks` 从 SQLite 同步任务列表

### 功能增强：任务列表 5 项改进

1. **失败任务可删除** — `DELETE /api/tasks/[id]`，同时从 SQLite 和前端状态移除
2. **进行中任务可取消** — `POST /api/tasks/[id]/cancel`，Pipeline 在每步之间检查 `isCancelled()` 状态
3. **任务名称显示** — 从输入中提取：URL 显示 domain/path，文本显示第一行
4. **时间信息** — 创建时间（相对）、完成时间 + 总耗时（done/error/cancelled 显示）
5. **错误原因展示** — 失败任务展开显示完整 error 信息

### Bug Fix

- **stdin 管道 bug**：原 `import("fs")` 动态导入是异步的，导致 `spawn` 开始读 stdin 时 prompt 文件还未写入，180s 超时挂死。修复：改用顶层同步 `readFileSync`。

### 关键文件变更

| 文件 | 变更 |
|------|------|
| `lib/db.ts` | 新增，SQLite 持久化层（createJob/getJob/updateJob/listJobs/deleteJob/cancelJob） |
| `lib/task-store.ts` | 改为 re-export db.ts |
| `lib/generation-store.ts` | 保留 localStorage，但接口字段对齐 db.ts（含 name/endedAt/cancelled） |
| `lib/pipeline/index.ts` | 新增 extractName/abortIfCancelled，每步之间检查取消，设置 endedAt |
| `lib/pipeline/claude-runner.ts` | stdin bug fix，改用同步 readFileSync |
| `app/api/tasks/route.ts` | 新增 GET 端点，首页同步用 |
| `app/api/tasks/[id]/route.ts` | 新增 DELETE 删除任务 |
| `app/api/tasks/[id]/cancel/route.ts` | 新增 POST 取消任务 |
| `app/api/generate/sse/route.ts` | 支持 cancelled 类型，返回 name/endedAt |
| `app/page.tsx` | UI 大改：任务名称/时间/错误/取消/删除按钮 |

---

## 2026-04-13

- 初始化项目文档结构（docs/README.md, ARCHITECTURE.md, PROJECT_STRUCTURE.md）
- 规划多步 Pipeline 架构：agent-browser → ljg-writes → frontend-slides
