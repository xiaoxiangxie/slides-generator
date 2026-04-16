"use client";
import { useState, useEffect } from "react";
import { type TaskRecord } from "@/lib/task-store";

const PAGE_SIZE = 10;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SrtPreview({ jobId }: { jobId: string }) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/tasks/${jobId}/srt`)
      .then((res) => {
        if (!res.ok) throw new Error("字幕文件不存在");
        return res.text();
      })
      .then((text) => {
        setHtml(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [jobId]);

  if (loading) {
    return <div className="tp-preview__srt"><div className="tp-preview__empty">加载中...</div></div>;
  }

  if (error) {
    return <div className="tp-preview__srt"><div className="tp-preview__empty"><p className="tp-preview__error">{error}</p></div></div>;
  }

  return (
    <div className="tp-preview__srt">
      <iframe srcDoc={html} className="tp-preview__srt-iframe" title="srt" sandbox="allow-scripts" />
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"html" | "video" | "srt">("html");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterInputType, setFilterInputType] = useState<"all" | "url" | "text">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "done" | "error" | "generating">("all");
  const [filterAspect, setFilterAspect] = useState<"all" | "16:9" | "9:16">("all");

  // 从 SQLite API 加载任务列表
  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const serverTasks: TaskRecord[] = await res.json();
        setTasks([...serverTasks].sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const totalPages = Math.ceil(tasks.length / PAGE_SIZE);
  const paged = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = tasks.find((t) => t.id === selectedId);

  const filtered = tasks.filter((t) => {
    if (filterInputType !== "all" && t.inputType !== filterInputType) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAspect !== "all" && t.aspectRatio !== filterAspect) return false;
    return true;
  });
  const filteredPages = Math.ceil(filtered.length / PAGE_SIZE);
  const filteredPaged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeList = filterInputType !== "all" || filterStatus !== "all" || filterAspect !== "all" ? filteredPaged : paged;
  const activeTotalPages = filterInputType !== "all" || filterStatus !== "all" || filterAspect !== "all" ? filteredPages : totalPages;

  // 轮询刷新生成中的任务
  useEffect(() => {
    const hasGenerating = tasks.some((t) => t.status === "generating");
    if (!hasGenerating) return;
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, [tasks]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        const updated = tasks.filter((t) => t.id !== id);
        setTasks(updated);
        if (selectedId === id) setSelectedId(null);
        showToast("任务已删除");
      }
    } catch { showToast("删除失败"); }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}/cancel`, { method: "POST" });
      if (res.ok) {
        await loadTasks();
        showToast("任务已取消");
      }
    } catch { showToast("取消失败"); }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const startEditName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingName(currentName || "");
  };

  const saveEditName = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName }),
      });
      if (res.ok) {
        await loadTasks();
        setEditingNameId(null);
        showToast("名称已修改");
      }
    } catch { showToast("修改失败"); }
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    const task = tasks.find((t) => t.id === deleteId);
    handleDelete(deleteId);
    setDeleteId(null);
    showToast(task?.status === "error" ? "错误任务已删除" : "任务已删除");
  };

  return (
    <div className="tp-layout">
      {/* Left: Task List */}
      <div className="tp-list-col">
        <header className="tp-header">
          <a href="/" className="tp-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            返回
          </a>
          <h1 className="tp-title">任务列表</h1>
          <span className="tp-count">{filterInputType !== "all" || filterStatus !== "all" || filterAspect !== "all" ? `${filtered.length} / ${tasks.length}` : tasks.length} 个</span>
        </header>

        {/* Filter bar */}
        <div className="tp-filters">
          <div className="tp-filter-group">
            <span className="tp-filter-label">类型</span>
            {(["all", "url", "text"] as const).map((t) => (
              <button key={t} className={`tp-filter-chip ${filterInputType === t ? "tp-filter-chip--on" : ""}`} onClick={() => { setFilterInputType(t); setPage(1); }}>
                {t === "all" ? "全部" : t === "url" ? "📎 URL" : "📝 文本"}
              </button>
            ))}
          </div>
          <div className="tp-filter-group">
            <span className="tp-filter-label">状态</span>
            {(["all", "done", "error", "generating"] as const).map((s) => (
              <button key={s} className={`tp-filter-chip ${filterStatus === s ? "tp-filter-chip--on" : ""}`} onClick={() => { setFilterStatus(s); setPage(1); }}>
                {s === "all" ? "全部" : s === "done" ? "已完成" : s === "error" ? "已失败" : "生成中"}
              </button>
            ))}
          </div>
          <div className="tp-filter-group">
            <span className="tp-filter-label">尺寸</span>
            {(["all", "16:9", "9:16"] as const).map((a) => (
              <button key={a} className={`tp-filter-chip ${filterAspect === a ? "tp-filter-chip--on" : ""}`} onClick={() => { setFilterAspect(a); setPage(1); }}>
                {a === "all" ? "全部" : a}
              </button>
            ))}
          </div>
        </div>

        {activeList.length === 0 && tasks.length > 0 ? (
          <div className="tp-empty">
            <p>筛选结果为空</p>
            <button className="tp-btn" onClick={() => { setFilterInputType("all"); setFilterStatus("all"); setFilterAspect("all"); }}>清除筛选</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="tp-empty">
            <p>暂无任务</p>
            <a href="/">去创建一个 →</a>
          </div>
        ) : (
          <>
            <div className="tp-list">
              {activeList.map((task) => (
                <div
                  key={task.id}
                  className={`tp-row ${selectedId === task.id ? "tp-row--selected" : ""} tp-row--${task.status}`}
                  onClick={() => { setSelectedId(selectedId === task.id ? null : task.id); setActiveTab("html"); }}
                >
                  <div className="tp-row__head">
                    <div className="tp-row__id">{task.id.slice(0, 8)}</div>
                    {editingNameId === task.id ? (
                        <input
                          className="tp-row__name-input"
                          value={editingName}
                          autoFocus
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => saveEditName(task.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEditName(task.id);
                            if (e.key === "Escape") setEditingNameId(null);
                          }}
                        />
                      ) : (
                        <div className="tp-row__name" onDoubleClick={() => startEditName(task.id, task.name)} title="双击修改名称">
                          {task.name || "Untitled Slide"}
                        </div>
                      )}
                    <div className="tp-row__meta">
                      {task.inputType && <span className="tp-meta-tag">{task.inputType === "url" ? "📎" : "📝"}</span>}
                      {task.aspectRatio && <span className="tp-meta-tag">{task.aspectRatio}</span>}
                      {task.videoStyle && <span className="tp-meta-tag">{task.videoStyle}</span>}
                      {task.styleName && <span className="tp-meta-tag tp-meta-tag--style" title={task.styleName}>{task.styleName.split("·")[0].trim()}</span>}
                    </div>
                    <div className="tp-row__badge">
                      {task.status === "generating" && (
                        <span className="badge badge--running"><span className="badge__dot" />{task.progress}%</span>
                      )}
                      {task.status === "done" && <span className="badge badge--done">已完成</span>}
                      {task.status === "error" && <span className="badge badge--error">已失败</span>}
                      {task.status === "cancelled" && <span className="badge badge--cancelled">已取消</span>}
                      {task.status === "pending" && <span className="badge badge--pending">等待中</span>}
                    </div>
                    <div className="tp-row__expand">
                      {selectedId === task.id
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                      }
                    </div>
                  </div>

                  {task.status === "generating" && (
                    <div className="tp-row__bar"><div style={{ width: `${task.progress}%` }} /></div>
                  )}

                  <div className="tp-row__step">
                    {task.status === "generating" && <span className="tp-skill-tag">{task.skill || "system"}</span>}
                    {task.step}
                  </div>

                  <div className="tp-row__foot">
                    <span className="tp-time">{formatRelativeTime(task.createdAt)}</span>
                    {task.endedAt > 0 && <><span className="tp-sep">·</span><span className="tp-time">{formatDuration(task.endedAt - task.createdAt)}</span></>}
                    {task.inputContent && <><span className="tp-sep">·</span><span className="tp-time tp-time--input" title={task.inputContent}>{task.inputType === "url" ? task.inputContent : task.inputContent.slice(0, 30) + (task.inputContent.length > 30 ? "…" : "")}</span></>}
                    <div className="tp-row__actions" onClick={(e) => e.stopPropagation()}>
                      {task.status === "generating" && (
                        <button className="tp-btn tp-btn--icon tp-btn--cancel" onClick={() => handleCancel(task.id)} title="取消">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      )}
                      {task.status === "done" && (
                        <a href={"/preview/" + task.id} target="_blank" rel="noopener" className="tp-btn tp-btn--icon tp-btn--preview" title="预览">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </a>
                      )}
                      {(task.status === "done" || task.status === "error" || task.status === "cancelled") && (
                        <button className="tp-btn tp-btn--icon tp-btn--delete" onClick={() => setDeleteId(task.id)} title="删除">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {task.status === "error" && task.error && (
                    <div className="tp-row__error">{task.error}</div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="tp-pagination">
                <button className="tp-pg-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← 上一页</button>
                <span className="tp-pg-info">{page} / {activeTotalPages}</span>
                <button className="tp-pg-btn" disabled={page === activeTotalPages} onClick={() => setPage((p) => p + 1)}>下一页 →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Preview Panel */}
      <div className="tp-preview-col">
        {selected ? (
          <div className="tp-preview">
            <div className="tp-preview__head">
              <div className="tp-preview__info">
                <span className="tp-preview__id">{selected.id.slice(0, 8)}</span>
                <span className="tp-preview__name">{selected.name || "Untitled Slide"}</span>
              </div>
              <div className="tp-preview__tabs">
                <button className={`tp-tab ${activeTab === "html" ? "tp-tab--on" : ""}`} onClick={() => setActiveTab("html")}>PPT</button>
                {selected.videoPath && <button className={`tp-tab ${activeTab === "video" ? "tp-tab--on" : ""}`} onClick={() => setActiveTab("video")}>视频</button>}
                <button className={`tp-tab ${activeTab === "srt" ? "tp-tab--on" : ""}`} onClick={() => setActiveTab("srt")}>字幕</button>
              </div>
              <div className="tp-preview__actions">
                <button className="tp-btn tp-btn--close" onClick={() => setSelectedId(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {activeTab === "html" && (
              selected.htmlPath ? (
                <iframe src={selected.htmlPath} className="tp-preview__iframe" title="ppt" sandbox="allow-scripts allow-same-origin" />
              ) : (
                <div className="tp-preview__empty">
                  {selected.status === "generating" ? <p>生成中... {selected.progress}%</p>
                   : selected.status === "error" ? <p className="tp-preview__error">{selected.error}</p>
                   : <p>暂无预览</p>}
                </div>
              )
            )}

            {activeTab === "video" && selected.videoPath && (
              <video controls className="tp-preview__video">
                <source src={selected.videoPath} />
                您的浏览器不支持视频播放
              </video>
            )}

            {activeTab === "srt" && selected.status === "done" && (
              <SrtPreview jobId={selected.id} />
            )}
            {activeTab === "srt" && selected.status !== "done" && (
              <div className="tp-preview__empty"><p>任务完成后可查看字幕</p></div>
            )}

            {selected.status === "done" && (
              <div className="tp-preview__files">
                <div className="tp-preview__files-title">输出文件</div>
                {selected.htmlPath && (
                  <div className="tp-preview__file-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <a href={selected.htmlPath} target="_blank" rel="noopener">{selected.htmlPath.split("/").pop()}</a>
                  </div>
                )}
                {selected.videoPath && (
                  <div className="tp-preview__file-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    <a href={selected.videoPath} target="_blank" rel="noopener">{selected.videoPath.split("/").pop()}</a>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="tp-preview tp-preview--empty">
            <p>点击左侧任务查看预览</p>
          </div>
)}
      </div>

      {/* Toast */}
      {toast && (
        <div className="tp-toast">{toast}</div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="tp-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal__title">确认删除</div>
            <div className="tp-modal__body">确定要删除这个任务吗？此操作不可恢复。</div>
            <div className="tp-modal__actions">
              <button className="tp-btn" onClick={() => setDeleteId(null)}>取消</button>
              <button className="tp-btn tp-btn--delete" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        :root {
          --accent: #b8844a;
          --accent2: #9a6c34;
          --accent-dim: rgba(184,132,74,0.12);
          --bg: #f4f1ec;
          --bg2: #ede9e2;
          --text: #1a1714;
          --text2: #6b6560;
          --text3: #9a9590;
          --border: rgba(0,0,0,0.1);
          --border2: rgba(0,0,0,0.18);
          --radius: 10px;
          --radius-sm: 6px;
          --font-body: 'DM Sans', sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); font-family: var(--font-body); color: var(--text); min-height: 100vh; }

        .tp-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
        }

        .tp-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.6rem 0.75rem;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-filter-group {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          flex-wrap: wrap;
        }

        .tp-filter-label {
          font-size: 0.62rem;
          color: var(--text3);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-right: 0.15rem;
        }

        .tp-filter-chip {
          font-size: 0.65rem;
          font-family: var(--font-body);
          padding: 0.15rem 0.5rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--bg2);
          color: var(--text2);
          cursor: pointer;
          transition: all 0.12s;
          white-space: nowrap;
        }
        .tp-filter-chip:hover { border-color: var(--border2); color: var(--text); }
        .tp-filter-chip--on { background: var(--accent); border-color: var(--accent); color: #fff; }

        .tp-list-col {
          width: 460px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg);
        }

        .tp-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.9rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-back {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.72rem;
          color: var(--text2);
          text-decoration: none;
          padding: 0.28rem 0.5rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg2);
          transition: all 0.15s;
        }
        .tp-back:hover { border-color: var(--border2); color: var(--text); }

        .tp-title { font-size: 0.95rem; font-weight: 700; flex: 1; }
        .tp-count { font-size: 0.68rem; color: var(--text3); }

        .tp-empty {
          text-align: center;
          padding: 3rem 0;
          color: var(--text3);
          font-size: 0.82rem;
        }
        .tp-empty p { margin-bottom: 0.6rem; }
        .tp-empty a { color: var(--accent); text-decoration: none; font-weight: 500; }

        .tp-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .tp-row {
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          padding: 0.65rem 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .tp-row:hover { border-color: var(--border2); }
        .tp-row--selected { border-color: var(--accent) !important; box-shadow: 0 0 0 3px rgba(184,132,74,0.1); }
        .tp-row--generating { background: rgba(184,132,74,0.03); }
        .tp-row--error { border-color: rgba(192,69,58,0.3); }
        .tp-row--cancelled { opacity: 0.6; }

        .tp-row__head {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .tp-row__id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.58rem;
          color: var(--text3);
          background: var(--bg2);
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .tp-row__name {
          flex: 1;
          font-size: 0.78rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-row__meta { display: flex; gap: 0.2rem; flex-shrink: 0; flex-wrap: wrap; }
        .tp-meta-tag {
          font-size: 0.58rem;
          font-weight: 600;
          padding: 0.08rem 0.32rem;
          border-radius: 3px;
          background: var(--bg2);
          color: var(--text2);
          border: 1px solid var(--border);
          white-space: nowrap;
        }
        .tp-meta-tag--style { color: var(--accent); border-color: rgba(184,132,74,0.3); background: rgba(184,132,74,0.08); }
        .tp-row__badge { display: flex; gap: 0.2rem; flex-shrink: 0; }
        .tp-row__expand { color: var(--text3); flex-shrink: 0; }

        .badge {
          font-size: 0.6rem;
          font-weight: 600;
          padding: 0.12rem 0.35rem;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 0.18rem;
        }
        .badge--running { background: rgba(184,132,74,0.15); color: var(--accent); }
        .badge__dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .badge--done { background: rgba(74,138,90,0.15); color: #4a8a5a; }
        .badge--error { background: rgba(192,69,58,0.12); color: #c0453a; }
        .badge--cancelled { background: rgba(107,101,96,0.1); color: #6b6560; }
        .badge--pending { background: rgba(107,101,96,0.08); color: #9a9590; }

        .tp-row__bar {
          height: 2px;
          background: var(--bg2);
          border-radius: 2px;
          overflow: hidden;
        }
        .tp-row__bar div {
          height: 100%;
          background: var(--accent);
          transition: width 0.3s ease;
        }

        .tp-row__step {
          font-size: 0.7rem;
          color: var(--text2);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-skill-tag {
          display: inline-block;
          font-size: 0.56rem;
          font-weight: 600;
          background: var(--bg2);
          color: var(--text3);
          padding: 0.06rem 0.28rem;
          border-radius: 3px;
          margin-right: 0.3rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .tp-row__foot {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .tp-time { font-size: 0.65rem; color: var(--text3); }
        .tp-sep { color: var(--border2); font-size: 0.65rem; }
        .tp-time--style { color: var(--accent); font-weight: 500; max-width: 80px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; }
        .tp-time--input { color: var(--text2); max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; }

        .tp-row__actions {
          margin-left: auto;
          display: flex;
          gap: 0.25rem;
        }

        .tp-btn {
          font-size: 0.65rem;
          font-family: var(--font-body);
          padding: 0.15rem 0.4rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg2);
          color: var(--text2);
          transition: all 0.15s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.18rem;
        }
        .tp-btn:hover { border-color: var(--border2); color: var(--text); }
        .tp-btn--cancel:hover { border-color: rgba(192,69,58,0.4); color: #c0453a; }
        .tp-btn--delete:hover { border-color: rgba(192,69,58,0.4); color: #c0453a; background: rgba(192,69,58,0.06); }
        .tp-btn--preview { background: rgba(74,138,90,0.1); border-color: rgba(74,138,90,0.3); color: #4a8a5a; }
        .tp-btn--preview:hover { background: rgba(74,138,90,0.18); }
        .tp-btn--video { background: rgba(74,106,200,0.1); border-color: rgba(74,106,200,0.3); color: #4a6ac8; }
        .tp-btn--close { padding: 0.18rem; }
        .tp-btn--icon { padding: 0.22rem; }

        .tp-row__error {
          font-size: 0.65rem;
          color: #c0453a;
          background: rgba(192,69,58,0.06);
          padding: 0.25rem 0.45rem;
          border-radius: var(--radius-sm);
          word-break: break-all;
        }

        .tp-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.8rem;
          padding: 0.7rem;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-pg-btn {
          font-size: 0.72rem;
          font-family: var(--font-body);
          padding: 0.28rem 0.65rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg2);
          color: var(--text2);
          cursor: pointer;
          transition: all 0.15s;
        }
        .tp-pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .tp-pg-btn:hover:not(:disabled) { border-color: var(--border2); color: var(--text); }
        .tp-pg-info { font-size: 0.72rem; color: var(--text3); }

        /* ── Right: Preview ── */
        .tp-preview-col {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        .tp-preview {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tp-preview--empty {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text3);
          font-size: 0.85rem;
        }

        .tp-preview__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.65rem 1rem;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-preview__info {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          min-width: 0;
        }

        .tp-preview__id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem;
          color: var(--text3);
          background: var(--bg2);
          padding: 0.12rem 0.32rem;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .tp-preview__name {
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-preview__actions {
          display: flex;
          gap: 0.35rem;
          flex-shrink: 0;
        }

        .tp-preview__tabs {
          display: flex;
          gap: 0.2rem;
          flex-shrink: 0;
        }

        .tp-tab {
          font-size: 0.68rem;
          font-family: var(--font-body);
          padding: 0.22rem 0.6rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--bg2);
          color: var(--text2);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }
        .tp-tab:hover { border-color: var(--border2); color: var(--text); }
        .tp-tab--on { background: var(--accent); border-color: var(--accent); color: #fff; }

        .tp-preview__iframe {
          flex: 1;
          border: none;
          width: 100%;
        }

        .tp-preview__video {
          flex: 1;
          width: 100%;
          background: #000;
          outline: none;
        }

        .tp-preview__srt {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tp-preview__srt-iframe {
          flex: 1;
          border: none;
          width: 100%;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.82rem;
          line-height: 1.6;
          color: var(--text);
          padding: 1rem;
          background: var(--bg);
        }

        .tp-preview__empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text3);
          font-size: 0.82rem;
          flex-direction: column;
          gap: 0.4rem;
        }

        .tp-preview__error {
          color: #c0453a;
          font-size: 0.78rem;
          max-width: 300px;
          word-break: break-all;
        }

        .tp-preview__files {
          padding: 0.55rem 1rem;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-preview__files-title {
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--text3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.35rem;
        }

        .tp-preview__file-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          color: var(--text2);
          padding: 0.18rem 0;
        }
        .tp-preview__file-item a { color: var(--accent); text-decoration: none; }
        .tp-preview__file-item a:hover { text-decoration: underline; }

        /* Toast */
        .tp-toast {
          position: fixed;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%);
          background: var(--text);
          color: #fff;
          font-size: 0.8rem;
          padding: 0.55rem 1.2rem;
          border-radius: 20px;
          z-index: 9999;
          animation: toast-in 0.25s ease-out;
          pointer-events: none;
          white-space: nowrap;
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* Modal */
        .tp-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(4px);
          z-index: 9000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fade-in 0.15s ease-out;
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

        .tp-modal {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.4rem 1.5rem;
          width: 300px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          animation: modal-in 0.2s var(--ease-spring, ease-out);
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        .tp-modal__title {
          font-size: 0.92rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .tp-modal__body {
          font-size: 0.78rem;
          color: var(--text2);
          line-height: 1.5;
          margin-bottom: 1rem;
        }

        .tp-modal__actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .tp-modal .tp-btn--delete {
          background: #c0453a;
          border-color: #c0453a;
          color: #fff;
        }
        .tp-modal .tp-btn--delete:hover { background: #a33a30; }

        /* Name input */
        .tp-row__name-input {
          flex: 1;
          font-size: 0.78rem;
          font-weight: 600;
          font-family: var(--font-body);
          color: var(--text);
          border: 1.5px solid var(--accent);
          border-radius: var(--radius-sm);
          padding: 0.1rem 0.3rem;
          outline: none;
          background: #fff;
          min-width: 0;
        }
      `}</style>
    </div>
  );
}
