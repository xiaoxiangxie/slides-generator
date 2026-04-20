"use client";
import { useState, useEffect, useCallback, useRef } from "react";
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

function StatusBadge({ status, progress }: { status: TaskRecord["status"]; progress: number }) {
  if (status === "generating") {
    return (
      <span className="tp-badge tp-badge--running">
        <span className="tp-badge__dot" />
        {progress}%
      </span>
    );
  }
  const map: Record<string, { bg: string; color: string; label: string }> = {
    done: { bg: "rgba(74,138,90,0.15)", color: "#4a8a5a", label: "Done" },
    error: { bg: "rgba(192,69,58,0.12)", color: "#c0453a", label: "Failed" },
    cancelled: { bg: "rgba(107,101,96,0.1)", color: "#6b6560", label: "Cancelled" },
    pending: { bg: "rgba(107,101,96,0.08)", color: "#9a9590", label: "Pending" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="tp-badge" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function TaskCard({ task, selected, onSelect }: { task: TaskRecord; selected: boolean; onSelect: () => void }) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(task.name || "");

  const handleSaveName = useCallback(async () => {
    if (!editingName) return;
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue }),
      });
    } catch {}
    setEditingName(false);
  }, [editingName, nameValue, task.id]);

  const handleCancel = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${task.id}/cancel`, { method: "POST" });
    window.location.reload();
  }, [task.id]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    window.location.reload();
  }, [task.id]);

  return (
    <div
      className={`tp-card ${selected ? "tp-card--selected" : ""}`}
      onClick={onSelect}
    >
      {task.status === "generating" && (
        <div className="tp-card__progress-bar">
          <div className="tp-card__progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
      )}

      <div className="tp-card__header">
        <span className="tp-card__id">{task.id.slice(0, 8)}</span>

        {editingName ? (
          <input
            className="tp-card__name-input"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="tp-card__name"
            onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); setNameValue(task.name || ""); }}
            title="Double-click to rename"
          >
            {task.name || "Untitled Slide"}
          </span>
        )}

        <StatusBadge status={task.status} progress={task.progress} />

        <svg className={`tp-card__chevron ${selected ? "tp-card__chevron--open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>

      <div className="tp-card__tags">
        {task.inputType && (
          <span className="tp-tag">
            {task.inputType === "url" ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            ) : (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            )}
            {task.inputType === "url" ? "URL" : "Text"}
          </span>
        )}
        {task.aspectRatio && (
          <span className="tp-tag">{task.aspectRatio}</span>
        )}
        {task.videoStyle && task.videoStyle !== "normal" && (
          <span className="tp-tag tp-tag--capitalize">{task.videoStyle}</span>
        )}
        {task.styleName && (
          <span className="tp-tag tp-tag--accent">
            {task.styleName.split("·")[0].trim()}
          </span>
        )}
      </div>

      <div className="tp-card__step-row">
        {task.status === "generating" && (
          <span className="tp-card__skill">{task.skill || "system"}</span>
        )}
        <span className="tp-card__step">{task.step}</span>
      </div>

      <div className="tp-card__footer">
        <span className="tp-card__time">{formatRelativeTime(task.createdAt)}</span>
        {task.endedAt > 0 && (
          <>
            <span className="tp-card__sep">·</span>
            <span className="tp-card__time">{formatDuration(task.endedAt - task.createdAt)}</span>
          </>
        )}
        {task.inputContent && (
          <>
            <span className="tp-card__sep">·</span>
            <span className="tp-card__content" title={task.inputContent}>
              {task.inputType === "url" ? task.inputContent : task.inputContent.slice(0, 24) + (task.inputContent.length > 24 ? "…" : "")}
            </span>
          </>
        )}

        <div className="tp-card__actions">
          {task.status === "generating" && (
            <button
              className="tp-action tp-action--cancel"
              onClick={handleCancel}
              title="Cancel"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
          {task.status === "done" && (
            <a
              href={"/preview/" + task.id}
              target="_blank"
              rel="noopener"
              className="tp-action tp-action--preview"
              title="Preview"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </a>
          )}
          {(task.status === "done" || task.status === "error" || task.status === "cancelled") && (
            <button
              className="tp-action tp-action--delete"
              onClick={handleDelete}
              title="Delete"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          )}
        </div>
      </div>

      {task.status === "error" && task.error && (
        <div className="tp-card__error">{task.error}</div>
      )}
    </div>
  );
}

function SrtPreview({ jobId }: { jobId: string }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/tasks/${jobId}/srt`)
      .then((res) => {
        if (!res.ok) throw new Error("SRT unavailable");
        return res.text();
      })
      .then((text) => { setHtml(text); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [jobId]);

  if (loading) return (
    <div className="tp-preview-empty">
      <span className="tp-preview-empty__text">Loading...</span>
    </div>
  );
  if (error) return (
    <div className="tp-preview-empty">
      <span className="tp-preview-empty__text tp-preview-empty__text--error">{error}</span>
    </div>
  );

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <iframe srcDoc={html} className="tp-srt-iframe" title="subtitle preview" sandbox="allow-scripts" />
    </div>
  );
}

type FilterInput = "all" | "url" | "text";
type FilterStatus = "all" | "done" | "error" | "generating";
type FilterAspect = "all" | "16:9" | "9:16";
type SortKey = "createdAt" | "name" | "status";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"html" | "video" | "srt">("html");
  const [previewAspect, setPreviewAspect] = useState<"16:9" | "9:16">("16:9");
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [iframeSize, setIframeSize] = useState({ width: "100%", height: "100%" });

  useEffect(() => {
    if (previewAspect !== "9:16") {
      setIframeSize({ width: "100%", height: "100%" });
      return;
    }
    const update = () => {
      if (!previewContainerRef.current) return;
      const containerH = previewContainerRef.current.clientHeight;
      const w = Math.min(containerH * (9 / 16), previewContainerRef.current.clientWidth);
      setIframeSize({ width: `${w}px`, height: `${containerH}px` });
    };
    update();
    const ro = new ResizeObserver(update);
    if (previewContainerRef.current) ro.observe(previewContainerRef.current);
    return () => ro.disconnect();
  }, [previewAspect]);
  const [toast, setToast] = useState<string | null>(null);

  const [filterInput, setFilterInput] = useState<FilterInput>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAspect, setFilterAspect] = useState<FilterAspect>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) setTasks(await res.json());
    } catch {}
  }

  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    if (!tasks.some((t) => t.status === "generating")) return;
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, [tasks]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const filtered = tasks.filter((t) => {
    if (filterInput !== "all" && t.inputType !== filterInput) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAspect !== "all" && t.aspectRatio !== filterAspect) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.name?.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q) && !t.inputContent?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "createdAt") cmp = a.createdAt - b.createdAt;
    else if (sortKey === "name") cmp = (a.name || "").localeCompare(b.name || "");
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    return sortAsc ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = tasks.find((t) => t.id === selectedId);

  const activeFilters = [filterInput, filterStatus, filterAspect, searchQuery].filter(v => v !== "all" && v !== "").length;

  return (
    <div className="tp-root">
      {/* Left panel */}
      <div className="tp-list-panel">
        <div className="tp-list-header">
          <a href="/" className="tp-back-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </a>
          <h1 className="tp-list-title">任务列表</h1>
          <span className="tp-list-count">
            {activeFilters > 0 ? `${filtered.length} / ${tasks.length}` : tasks.length}
          </span>
        </div>

        <div className="tp-list-toolbar">
          <div className="tp-search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="tp-search__icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              className="tp-search__input"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
            {searchQuery && (
              <button className="tp-search__clear" onClick={() => setSearchQuery("")}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <select
            className="tp-sort-select"
            value={`${sortKey}-${sortAsc ? "asc" : "desc"}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split("-");
              setSortKey(key as SortKey);
              setSortAsc(dir === "asc");
            }}
          >
            <option value="createdAt-desc">Newest</option>
            <option value="createdAt-asc">Oldest</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="status-asc">Status</option>
          </select>
        </div>

        <div className="tp-filters">
          {(["all", "url", "text"] as FilterInput[]).map((t) => (
            <button
              key={t}
              className={`tp-chip ${filterInput === t ? "tp-chip--active" : ""}`}
              onClick={() => { setFilterInput(t); setPage(1); }}
            >
              {t === "all" ? "All" : t === "url" ? "URL" : "Text"}
            </button>
          ))}
          <span className="tp-filters__sep" />
          {(["all", "done", "error", "generating"] as FilterStatus[]).map((s) => (
            <button
              key={s}
              className={`tp-chip ${filterStatus === s ? "tp-chip--active" : ""}`}
              onClick={() => { setFilterStatus(s); setPage(1); }}
            >
              {s === "all" ? "All" : s === "done" ? "Done" : s === "error" ? "Error" : "Running"}
            </button>
          ))}
          <span className="tp-filters__sep" />
          {(["all", "16:9", "9:16"] as FilterAspect[]).map((a) => (
            <button
              key={a}
              className={`tp-chip ${filterAspect === a ? "tp-chip--active" : ""}`}
              onClick={() => { setFilterAspect(a); setPage(1); }}
            >
              {a === "all" ? "Ratio: All" : a}
            </button>
          ))}
          {activeFilters > 0 && (
            <button
              className="tp-chip tp-chip--clear"
              onClick={() => { setFilterInput("all"); setFilterStatus("all"); setFilterAspect("all"); setSearchQuery(""); setPage(1); }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="tp-list">
          {paged.length === 0 && tasks.length > 0 && (
            <div className="tp-list-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="tp-list-empty__icon"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <p className="tp-list-empty__text">No matching tasks</p>
              <button className="tp-list-empty__clear" onClick={() => { setFilterInput("all"); setFilterStatus("all"); setFilterAspect("all"); setSearchQuery(""); }}>
                Clear filters
              </button>
            </div>
          )}
          {tasks.length === 0 && (
            <div className="tp-list-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="tp-list-empty__icon"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <p className="tp-list-empty__text">No tasks yet</p>
              <a href="/" className="tp-list-empty__create">Create one →</a>
            </div>
          )}
          {paged.map((task) => {
            const isSelected = selectedId === task.id;
            return (
              <TaskCard key={task.id} task={task} selected={isSelected} onSelect={() => { setSelectedId(isSelected ? null : task.id); setActiveTab("html"); }} />
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="tp-pagination">
            <button className="tp-pagination__btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
            <span className="tp-pagination__info">{page} / {totalPages}</span>
            <button className="tp-pagination__btn" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="tp-preview-panel">
        {selected ? (
          <div className="tp-preview">
            <div className="tp-preview__header">
              <div className="tp-preview__meta">
                <span className="tp-preview__id">{selected.id.slice(0, 8)}</span>
                <span className="tp-preview__name">{selected.name || "Untitled Slide"}</span>
              </div>

              {selected.status === "done" && (
                <button
                  className={`tp-preview__tab ${activeTab === "srt" ? "tp-preview__tab--active" : ""}`}
                  onClick={() => setActiveTab("srt")}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 12h4M14 12h4M6 8h12M6 16h8"/></svg>
                  字幕
                </button>
              )}

              <div className="tp-preview__tabs">
                <button
                  className={`tp-preview__tab ${activeTab === "html" ? "tp-preview__tab--active" : ""}`}
                  onClick={() => setActiveTab("html")}
                >
                  PPT
                </button>
                {selected.videoPath && (
                  <button
                    className={`tp-preview__tab ${activeTab === "video" ? "tp-preview__tab--active" : ""}`}
                    onClick={() => setActiveTab("video")}
                  >
                    视频
                  </button>
                )}
              </div>

              <div className="tp-preview__aspect-toggle">
                <button
                  className={`tp-preview__aspect-btn ${previewAspect === "16:9" ? "tp-preview__aspect-btn--active" : ""}`}
                  onClick={() => setPreviewAspect("16:9")}
                  title="宽屏 16:9"
                >
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="0" y="0" width="14" height="10" rx="1"/>
                  </svg>
                </button>
                <button
                  className={`tp-preview__aspect-btn ${previewAspect === "9:16" ? "tp-preview__aspect-btn--active" : ""}`}
                  onClick={() => setPreviewAspect("9:16")}
                  title="竖屏 9:16"
                >
                  <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="0" y="0" width="8" height="14" rx="1"/>
                  </svg>
                </button>
              </div>

              <button className="tp-preview__close" onClick={() => setSelectedId(null)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="tp-preview__content" ref={previewContainerRef}>
              {activeTab === "html" && (
                selected.htmlPath
                  ? <div className={`tp-preview__iframe-container${previewAspect === "9:16" ? " tp-preview__iframe-container--9-16" : ""}`}>
                      <iframe src={selected.htmlPath} className={`tp-preview__iframe${previewAspect === "9:16" ? " tp-preview__iframe--9-16" : ""}`} title="ppt preview" sandbox="allow-scripts allow-same-origin" />
                    </div>
                  : <div className="tp-preview-empty">
                      {selected.status === "generating"
                        ? <p className="tp-preview-empty__text">生成中... {selected.progress}%</p>
                        : selected.status === "error"
                        ? <p className="tp-preview-empty__text tp-preview-empty__text--error">{selected.error}</p>
                        : <p className="tp-preview-empty__text">暂无预览</p>}
                    </div>
              )}
              {activeTab === "video" && selected.videoPath && (
                <div className={`tp-preview__iframe-container${previewAspect === "9:16" ? " tp-preview__iframe-container--9-16" : ""}`}>
                    <video controls className={`tp-preview__video${previewAspect === "9:16" ? " tp-preview__video--9-16" : ""}`}>
                      <source src={selected.videoPath} />
                      您的浏览器不支持视频播放
                    </video>
                  </div>
              )}
              {activeTab === "srt" && selected.status === "done" && (
                <div className="tp-preview__iframe-container">
                  <SrtPreview jobId={selected.id} />
                </div>
              )}
              {activeTab === "srt" && selected.status !== "done" && (
                <div className="tp-preview-empty">
                  <p className="tp-preview-empty__text">任务完成后可查看字幕</p>
                </div>
              )}
            </div>

            {selected.status === "done" && (
              <div className="tp-preview__actions">
                <span className="tp-preview__actions-label">输出文件</span>
                {selected.htmlPath && (
                  <a href={selected.htmlPath} target="_blank" rel="noopener" className="tp-file-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    HTML
                  </a>
                )}
                {selected.videoPath && (
                  <a href={selected.videoPath} target="_blank" rel="noopener" className="tp-file-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    MP4
                  </a>
                )}
                <button
                  className="tp-file-btn"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/tasks/${selected.id}/pptx`);
                      const data = await res.json();
                      if (data.url) window.open(data.url, "_blank");
                      else showToast("PPTX 导出失败");
                    } catch { showToast("PPTX 导出失败"); }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                  PPTX
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="tp-preview-panel__empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8" className="tp-preview-panel__empty-icon">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <p className="tp-preview-panel__empty-text">点击左侧任务查看预览</p>
          </div>
        )}
      </div>

      {toast && (
        <div className="tp-toast">{toast}</div>
      )}

      <style>{`
        .tp-root {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
        }

        .tp-list-panel {
          display: flex;
          flex-direction: column;
          width: 440px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow: hidden;
          background: var(--bg);
        }

        .tp-list-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-back-btn {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 500;
          text-decoration: none;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .tp-back-btn:hover {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .tp-list-title {
          flex: 1;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
        }

        .tp-list-count {
          font-size: 0.7rem;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          background: var(--surface-2);
          color: var(--text-muted);
        }

        .tp-list-toolbar {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface);
        }

        .tp-search__icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .tp-search__input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.75rem;
          color: var(--text);
          font-family: var(--font-body);
        }

        .tp-search__input::placeholder {
          color: var(--text-dim);
        }

        .tp-search__clear {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          padding: 0;
        }

        .tp-sort-select {
          font-size: 0.7rem;
          padding: var(--space-2) var(--space-4) var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          outline: none;
          font-family: var(--font-body);
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237a746a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }

        .tp-sort-select:focus {
          border-color: var(--border-hover);
        }

        .tp-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-filters__sep {
          width: 1px;
          height: 12px;
          background: var(--border);
        }

        .tp-chip {
          font-size: 0.7rem;
          padding: 0.25rem 0.625rem;
          border-radius: 9999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .tp-chip:hover {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .tp-chip--active {
          border-color: var(--accent) !important;
          background: rgba(212, 165, 116, 0.12) !important;
          color: var(--accent) !important;
        }

        .tp-chip--clear {
          margin-left: auto;
          border-color: rgba(192, 69, 58, 0.3);
          color: #c0453a;
          background: rgba(192, 69, 58, 0.06);
        }

        .tp-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .tp-list-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-16) var(--space-8);
          gap: var(--space-3);
        }

        .tp-list-empty__icon { color: var(--text-dim); }
        .tp-list-empty__text { font-size: 0.8rem; color: var(--text-muted); }

        .tp-list-empty__clear,
        .tp-list-empty__create {
          font-size: 0.72rem;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: pointer;
          text-decoration: none;
          font-family: var(--font-body);
          transition: all var(--duration-fast) var(--ease-out);
          background: var(--surface);
        }

        .tp-list-empty__create {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--text);
          font-weight: 600;
        }

        .tp-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-4);
          padding: var(--space-3);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }

        .tp-pagination__btn {
          font-size: 0.75rem;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .tp-pagination__btn:hover:not(:disabled) {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .tp-pagination__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .tp-pagination__info { font-size: 0.75rem; color: var(--text-muted); }

        /* Task card */
        .tp-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-4);
          border-radius: var(--radius-xl);
          border: 1px solid var(--border);
          background: var(--surface);
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
        }

        .tp-card:hover { border-color: var(--border-hover); }

        .tp-card--selected {
          /* BorderBeam handles the glow */
          border-color: var(--border-hover);
        }

        .tp-card__progress-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--border);
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          overflow: hidden;
        }

        .tp-card__progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.5s var(--ease-out);
        }

        .tp-card__header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .tp-card__id {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          background: var(--surface-2);
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .tp-card__name {
          flex: 1;
          min-width: 0;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: text;
        }

        .tp-card__name-input {
          flex: 1;
          min-width: 0;
          font-size: 0.8rem;
          font-weight: 600;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--accent);
          color: var(--text);
          outline: none;
          padding: 0;
          font-family: var(--font-body);
        }

        .tp-card__chevron {
          flex-shrink: 0;
          color: var(--text-muted);
          transition: transform var(--duration-normal) var(--ease-out);
        }

        .tp-card__chevron--open { transform: rotate(180deg); }

        .tp-card__tags {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);
        }

        .tp-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.7rem;
          padding: 0.125rem 0.5rem;
          border-radius: var(--radius-sm);
          background: var(--surface-2);
          color: var(--text);
          font-weight: 500;
        }

        .tp-tag--accent {
          background: rgba(212, 165, 116, 0.08);
          color: var(--accent);
          border: 1px solid rgba(212, 165, 116, 0.25);
        }

        .tp-tag--capitalize { text-transform: capitalize; }

        .tp-card__step-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .tp-card__skill {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-dim);
        }

        .tp-card__step {
          font-size: 0.75rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-card__footer {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .tp-card__time { font-size: 0.7rem; color: var(--text-dim); }
        .tp-card__sep { color: var(--border-hover); }

        .tp-card__content {
          font-size: 0.7rem;
          color: var(--text-muted);
          max-width: 120px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-card__actions {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          margin-left: auto;
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }

        .tp-card:hover .tp-card__actions {
          opacity: 1;
        }

        .tp-action {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--surface-2);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          text-decoration: none;
        }

        .tp-action--cancel:hover { border-color: rgba(192,69,58,0.4); color: #c0453a; }
        .tp-action--preview:hover { border-color: rgba(74,138,90,0.4); color: #4a8a5a; }
        .tp-action--delete:hover { border-color: rgba(192,69,58,0.4); color: #c0453a; }

        .tp-card__error {
          font-size: 0.75rem;
          padding: var(--space-2);
          border-radius: var(--radius-md);
          background: rgba(192,69,58,0.06);
          color: #c0453a;
        }

        /* Badge */
        .tp-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.7rem;
          font-weight: 600;
          flex-shrink: 0;
        }

        .tp-badge--running {
          background: rgba(212,165,116,0.15);
          color: var(--accent);
        }

        .tp-badge__dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 1.5s ease-in-out infinite;
        }

        /* Preview panel */
        .tp-preview-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .tp-preview-panel__empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: var(--space-4);
          background: var(--bg);
        }

        .tp-preview-panel__empty-icon { color: var(--text-dim); }
        .tp-preview-panel__empty-text { font-size: 0.8rem; color: var(--text-muted); }

        /* Preview */
        .tp-preview {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .tp-preview__header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-5);
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }

        .tp-preview__meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          min-width: 0;
        }

        .tp-preview__id {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          background: var(--surface-2);
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .tp-preview__name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tp-preview__tabs {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          margin-left: auto;
        }

        .tp-preview__tab {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .tp-preview__tab:hover {
          color: var(--text);
          background: var(--surface-2);
        }

        .tp-preview__tab--active {
          border-color: var(--accent) !important;
          background: rgba(212,165,116,0.12) !important;
          color: var(--accent) !important;
        }

        .tp-preview__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          flex-shrink: 0;
        }

        .tp-preview__close:hover {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .tp-preview__aspect-toggle {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 2px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface-2);
        }

        .tp-preview__aspect-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 22px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .tp-preview__aspect-btn:hover {
          color: var(--text);
          background: var(--surface);
        }

        .tp-preview__aspect-btn--active {
          background: var(--accent) !important;
          color: var(--bg) !important;
        }

        .tp-preview__content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .tp-preview__iframe-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: var(--space-4);
        }

        .tp-preview__iframe-container--9-16 {
          padding: 0;
          height: 100%;
          width: auto;
          justify-content: center;
        }

        .tp-preview__iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .tp-preview__iframe--9-16 {
          aspect-ratio: 9/16;
          width: auto;
          height: 100%;
          object-fit: contain;
        }

        .tp-preview__video {
          width: 100%;
          height: 100%;
          background: #000;
          outline: none;
        }

        .tp-preview__video--9-16 {
          aspect-ratio: 9/16;
          width: auto;
          height: 100%;
          object-fit: contain;
        }

        .tp-srt-iframe {
          width: 100%;
          flex: 1;
          border: none;
        }

        .tp-preview-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
        }

        .tp-preview-empty__text { font-size: 0.8rem; color: var(--text-muted); }
        .tp-preview-empty__text--error { color: #c0453a; }

        .tp-preview__actions {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-5);
          border-top: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }

        .tp-preview__actions-label {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-dim);
        }

        .tp-file-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          text-decoration: none;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .tp-file-btn:hover {
          border-color: var(--border-hover);
          color: var(--text);
        }

        /* Toast */
        .tp-toast {
          position: fixed;
          bottom: var(--space-8);
          left: 50%;
          transform: translateX(-50%);
          padding: var(--space-3) var(--space-5);
          border-radius: 9999px;
          font-size: 0.8rem;
          font-weight: 500;
          z-index: 1000;
          background: var(--text);
          color: var(--bg);
          animation: toast-in 0.25s var(--ease-out);
        }

        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
