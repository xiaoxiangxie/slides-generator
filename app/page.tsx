"use client";

import { useState, useEffect } from "react";
import { BorderBeam } from "border-beam";
import { STYLE_PRESETS, ASPECT_RATIOS, VIDEO_STYLES, type VideoStyle } from "@/lib/style-presets";
import { type TaskRecord } from "@/lib/task-store";

function extractTaskName(input: string, inputType: "url" | "text"): string {
  if (inputType === "url") {
    try {
      const url = new URL(input);
      const domain = url.hostname.replace(/^www\./, "");
      const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean);
      if (segments.length > 0) return `${domain}/${segments.slice(-2).join("/")}`;
      return domain;
    } catch {
      return input.slice(0, 50);
    }
  }
  const first = input.split("\n").find((l) => l.trim().length > 0) || input;
  return first.trim().slice(0, 50);
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState<"url" | "text">("url");
  const [taskName, setTaskName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0].id);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [videoStyle, setVideoStyle] = useState<VideoStyle>("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [showTaskList, setShowTaskList] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function loadTasks() {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const serverTasks: TaskRecord[] = await res.json();
          setTotalCount(serverTasks.length);
          setTasks([...serverTasks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10));
        }
      } catch {}
    }
    loadTasks();
  }, []);

  useEffect(() => {
    const runningTasks = tasks.filter((t) => t.status === "generating");
    if (runningTasks.length === 0) return;
    const sources: EventSource[] = [];
    runningTasks.forEach((task) => {
      const es = new EventSource("/api/generate/sse?id=" + task.id);
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "progress" || data.type === "running") {
          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "generating", skill: data.skill || t.skill, step: data.step || t.step, progress: data.progress ?? t.progress, name: data.name || t.name } : t));
        } else if (data.type === "done") {
          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "done" as const, skill: "", step: "Done", progress: 100, htmlPath: data.htmlPath || t.htmlPath, endedAt: data.endedAt || Math.floor(Date.now() / 1000) } : t));
          es.close();
        } else if (data.type === "error") {
          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "error" as const, skill: "", step: "Failed", error: data.message, endedAt: data.endedAt || Math.floor(Date.now() / 1000) } : t));
          es.close();
        } else if (data.type === "cancelled") {
          setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "cancelled" as const, step: "已取消", endedAt: data.endedAt || Math.floor(Date.now() / 1000) } : t));
          es.close();
        }
      };
      es.onerror = () => es.close();
      sources.push(es);
    });
    return () => sources.forEach((es) => es.close());
  }, [tasks.length]);

  async function handleGenerate() {
    if (!input.trim()) { setError("请输入内容或链接"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim(), inputType, styleId: selectedStyle, aspectRatio, taskName: taskName.trim(), videoStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      const name = taskName.trim() || extractTaskName(input.trim(), inputType);
      const preset = STYLE_PRESETS.find((s) => s.id === selectedStyle);
      const inputContent = inputType === "text" && input.length > 200 ? input.slice(0, 200) + "…" : input;
      const newTask: TaskRecord = {
        id: data.id, status: "generating", skill: "frontend-slides", step: "Starting...", progress: 10,
        htmlPath: "", videoPath: "", error: "", name, endedAt: 0, createdAt: Math.floor(Date.now() / 1000),
        inputType, inputContent, aspectRatio, videoStyle,
        styleName: preset ? `${preset.nameCn} · ${preset.name}` : selectedStyle,
      };
      setTasks((prev) => [newTask, ...prev].slice(0, 10));
      setTotalCount((prev) => prev + 1);
      setShowTaskList(true);
      setLoading(false);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  async function cancelTask(id: string) {
    try {
      await fetch(`/api/tasks/${id}/cancel`, { method: "POST" });
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: "cancelled" as const, step: "已取消", endedAt: Math.floor(Date.now() / 1000) } : t));
    } catch {}
  }

  async function deleteTask(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      }
    } catch {}
  }

  const selectedPreset = STYLE_PRESETS.find((s) => s.id === selectedStyle)!;
  const runningCount = tasks.filter((t) => t.status === "generating").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="home-root">
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-header__brand">
          <div className="home-header__logo">S</div>
          <div>
            <div className="home-header__title">Slides Generator</div>
            <div className="home-header__subtitle">URL or text to HTML slides</div>
          </div>
        </div>

        <div className="home-header__meta">
          <div className="home-header__stat">
            <span className="home-header__stat-num">{STYLE_PRESETS.length}</span>
            <span className="home-header__stat-label">styles</span>
          </div>

          <button
            className="home-task-toggle"
            onClick={() => setShowTaskList((v) => !v)}
          >
            <span
              className="home-task-toggle__dot"
              style={{
                background: runningCount > 0 ? "var(--accent)" : doneCount > 0 ? "var(--success)" : "var(--text-dim)",
                animation: runningCount > 0 ? "pulse-glow 1.5s ease-in-out infinite" : undefined,
              }}
            />
            {runningCount > 0 ? `${runningCount} running` : doneCount > 0 ? `${doneCount} done` : "Tasks"}
          </button>
        </div>
      </header>

      {/* Task overlay */}
      {showTaskList && <div className="home-task-overlay" onClick={() => setShowTaskList(false)} />}

      {/* Task dropdown */}
      {showTaskList && (
        <BorderBeam size="md" colorVariant="ocean" strength={0.4} duration={2.4}>
        <div className="home-task-dropdown">
          <div className="home-task-dropdown__head">
            {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
          </div>
          {tasks.length === 0 ? (
            <div className="home-task-dropdown__empty">No tasks yet</div>
          ) : (
            <div className="home-task-dropdown__list">
              {tasks.map((task) => {
                const duration = task.endedAt && task.createdAt ? formatDuration(task.endedAt - task.createdAt) : "";
                const isFinal = task.status === "done" || task.status === "error" || task.status === "cancelled";
                return (
                  <div key={task.id} className="home-task-item"
                    style={{
                      background: task.status === "generating" ? "rgba(212,165,116,0.04)" : task.status === "done" ? "rgba(74,138,90,0.03)" : undefined,
                    }}>
                    <div className="home-task-item__row">
                      <span className="home-task-item__id">{task.id.slice(0, 8)}</span>
                      <span className="home-task-item__name">{task.name || "Untitled Slide"}</span>
                      {task.status === "generating" && (
                        <span className="home-task-item__badge home-task-item__badge--running">
                          <span className="home-task-item__dot" />
                          {task.progress}%
                        </span>
                      )}
                      {task.status === "done" && (
                        <a href={"/preview/" + task.id} target="_blank" rel="noopener" className="home-task-item__badge home-task-item__badge--done">
                          Done
                        </a>
                      )}
                      {task.status === "error" && (
                        <span className="home-task-item__badge home-task-item__badge--error">Error</span>
                      )}
                    </div>
                    {task.status === "generating" && (
                      <div className="home-task-item__progress">
                        <div className="home-task-item__progress-fill" style={{ width: `${task.progress}%` }} />
                      </div>
                    )}
                    <div className="home-task-item__meta">
                      <span>{formatRelativeTime(task.createdAt)}</span>
                      {isFinal && task.endedAt > 0 && (
                        <>
                          <span className="home-task-item__sep">·</span>
                          <span>{duration}</span>
                        </>
                      )}
                    </div>
                    {task.error && (
                      <div className="home-task-item__error">{task.error}</div>
                    )}
                    <div className="home-task-item__actions">
                      {task.status === "generating" && (
                        <button className="home-task-item__action home-task-item__action--cancel" onClick={() => cancelTask(task.id)}>Cancel</button>
                      )}
                      {isFinal && (
                        <button className="home-task-item__action home-task-item__action--delete" onClick={() => deleteTask(task.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {totalCount > 10 && (
            <div className="home-task-dropdown__foot">
              <a href="/tasks" className="home-task-dropdown__foot-link">
                查看全部 {totalCount} 任务 →
              </a>
            </div>
          )}
        </div>
        </BorderBeam>
      )}

      {/* ── Main layout ── */}
      <div className="home-body">
        {/* LEFT: Style grid */}
        <aside className="home-style-panel">
          <div className="home-section-label">Choose a style</div>
          <div className="home-style-grid">
            {STYLE_PRESETS.map((style, i) => {
              const isSelected = selectedStyle === style.id;
              return (
                <BorderBeam key={style.id} size="md" colorVariant="ocean" strength={isSelected ? 0.45 : 0} duration={2.4} active={isSelected}>
                  <button
                    className={`home-style-card ${isSelected ? "home-style-card--selected" : ""}`}
                    onClick={() => setSelectedStyle(style.id)}
                  >
                    <div className="home-style-card__thumb">
                      <StyleThumb style={style} n={i + 1} />
                      {isSelected && (
                        <div className="home-style-card__check">
                          <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="home-style-card__footer">
                      <span className="home-style-card__num">{String(i + 1).padStart(2, "0")}</span>
                      <div className="home-style-card__info">
                        <div className="home-style-card__name">{style.nameCn}</div>
                        <div className="home-style-card__sub">{style.name}</div>
                      </div>
                      <div className="home-style-card__swatches">
                        <span className="home-style-card__swatch" style={{ background: style.accent }} />
                        <span className="home-style-card__swatch" style={{ background: style.bg, border: "1px solid rgba(255,255,255,0.1)" }} />
                        <span className="home-style-card__swatch" style={{ background: style.text, border: "1px solid rgba(255,255,255,0.1)" }} />
                      </div>
                    </div>
                  </button>
                </BorderBeam>
              );
            })}
          </div>
        </aside>

        {/* RIGHT: Input form */}
        <aside className="home-form-panel">
          <div className="home-section-label">Create slides</div>

          {/* Type toggle */}
          <div className="home-toggle-group">
            {(["url", "text"] as const).map((t) => (
              <button
                key={t}
                className={`home-toggle-btn ${inputType === t ? "home-toggle-btn--active" : ""}`}
                onClick={() => setInputType(t)}
              >
                {t === "url" ? "URL" : "Text"}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputType === "url" ? "https://github.com/... — any URL" : "Paste your content here..."}
            className="home-textarea"
            rows={5}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          />

          {/* Task name */}
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="Task name (optional, auto-derived if empty)"
            className="home-input"
          />

          {error && (
            <div className="home-error">{error}</div>
          )}

          {/* Style chip */}
          <div className="home-style-chip">
            <div className="home-style-chip__preview" style={{ background: `linear-gradient(135deg, ${selectedPreset.accent}33, ${selectedPreset.text}22)` }} />
            <span className="home-style-chip__name">{selectedPreset.nameCn}</span>
            <span className="home-style-chip__sep">·</span>
            <span className="home-style-chip__en">{selectedPreset.name}</span>
            <div className="home-style-chip__swatches">
              <span className="home-style-chip__swatch" style={{ background: selectedPreset.accent }} />
              <span className="home-style-chip__swatch" style={{ background: selectedPreset.bg, border: "1px solid rgba(255,255,255,0.1)" }} />
              <span className="home-style-chip__swatch" style={{ background: selectedPreset.text, border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
          </div>

          {/* Aspect ratio */}
          <div className="home-form-row">
            <span className="home-form-label">尺寸</span>
            <div className="home-form-group">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.id}
                  className={`home-form-pill ${aspectRatio === r.id ? "home-form-pill--active" : ""}`}
                  onClick={() => setAspectRatio(r.id as "16:9" | "9:16")}
                  title={r.hint}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle speed */}
          <div className="home-form-row">
            <span className="home-form-label">字幕速度</span>
            <div className="home-form-group">
              {VIDEO_STYLES.map((s) => (
                <button
                  key={s.id}
                  className={`home-form-pill ${videoStyle === s.id ? "home-form-pill--active" : ""}`}
                  onClick={() => setVideoStyle(s.id)}
                  title={s.hint}
                >
                  {s.nameCn}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <BorderBeam size="line" colorVariant="ocean" strength={0.6} active={!loading}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="home-generate-btn"
            >
              {loading ? (
                <>
                  <svg className="home-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41Z" /></svg>
                  Generate
                </>
              )}
            </button>
          </BorderBeam>

          {loading && (
            <p className="home-hint">Track progress in the Tasks panel</p>
          )}

          {/* Recent tasks */}
          <div className="home-recent">
            <div className="home-section-label" style={{ marginBottom: "var(--space-3)" }}>Recent tasks</div>
            {tasks.length === 0 ? (
              <p className="home-recent__empty">No tasks yet</p>
            ) : (
              <div className="home-recent__list">
                {tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="home-recent__item">
                    <span className="home-recent__id">{task.id.slice(0, 8)}</span>
                    <span className="home-recent__name">{task.name || "Untitled"}</span>
                    <span className="home-recent__status"
                      style={{ color: task.status === "done" ? "#4a8a5a" : task.status === "error" ? "#c0453a" : "var(--text-muted)" }}>
                      {task.status === "generating" ? `${task.progress}%` : task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {totalCount > 5 && (
              <a href="/tasks" className="home-recent__more">
                View all {totalCount} →
              </a>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        /* ── Root ── */
        .home-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
        }

        /* ── Header ── */
        .home-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-6);
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }

        .home-header__brand {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .home-header__logo {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          background: var(--accent);
          color: var(--text);
          font-family: var(--font-display);
          font-size: 1.125rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .home-header__title {
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .home-header__subtitle {
          font-size: 0.7rem;
          color: var(--text-muted);
          margin-top: 0.05rem;
        }

        .home-header__meta {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .home-header__stat {
          display: flex;
          align-items: baseline;
          gap: var(--space-1);
        }

        .home-header__stat-num {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--accent);
        }

        .home-header__stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .home-task-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: 9999px;
          border: 1px solid;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
          font-family: var(--font-body);
        }

        .home-task-toggle__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .home-task-overlay {
          position: fixed;
          inset: 0;
          z-index: 199;
        }

        .home-task-dropdown {
          position: fixed;
          top: 60px;
          right: var(--space-6);
          width: 300px;
          background: var(--surface);
          border: 2px solid transparent;
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 200;
          overflow: hidden;
          animation: fadeUp 0.2s var(--ease-out);
        }

        .home-task-dropdown__head {
          padding: var(--space-3) var(--space-4);
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }

        .home-task-dropdown__empty {
          padding: var(--space-8);
          text-align: center;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .home-task-dropdown__list {
          max-height: 384px;
          overflow-y: auto;
        }

        .home-task-item {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border);
          transition: background var(--duration-fast) var(--ease-out);
        }

        .home-task-item:last-child {
          border-bottom: none;
        }

        .home-task-item__row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .home-task-item__id {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          background: var(--surface-2);
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .home-task-item__name {
          flex: 1;
          min-width: 0;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .home-task-item__badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.6rem;
          font-weight: 600;
          flex-shrink: 0;
          text-decoration: none;
        }

        .home-task-item__badge--running {
          background: rgba(212,165,116,0.12);
          color: var(--accent);
        }

        .home-task-item__dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .home-task-item__badge--done {
          background: rgba(74,138,90,0.12);
          color: #4a8a5a;
        }

        .home-task-item__badge--error {
          background: rgba(192,69,58,0.12);
          color: #c0453a;
        }

        .home-task-item__progress {
          height: 2px;
          background: var(--border);
          border-radius: 1px;
          margin-top: var(--space-2);
          overflow: hidden;
        }

        .home-task-item__progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 1px;
          transition: width 0.5s var(--ease-out);
        }

        .home-task-item__meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-top: var(--space-1);
          font-size: 0.7rem;
          color: var(--text-muted);
        }

        .home-task-item__sep {
          color: var(--border-hover);
        }

        .home-task-item__error {
          margin-top: var(--space-2);
          font-size: 0.65rem;
          padding: var(--space-2);
          border-radius: var(--radius-sm);
          background: rgba(192,69,58,0.06);
          color: #c0453a;
        }

        .home-task-item__actions {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }

        .home-task-item__action {
          font-size: 0.6rem;
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          border: 1px solid;
          cursor: pointer;
          font-family: var(--font-body);
          transition: all var(--duration-fast) var(--ease-out);
        }

        .home-task-item__action--cancel {
          border-color: rgba(212,165,116,0.18);
          color: var(--accent);
          background: rgba(212,165,116,0.06);
        }

        .home-task-item__action--cancel:hover {
          border-color: rgba(212,165,116,0.4);
        }

        .home-task-item__action--delete {
          border-color: rgba(192,69,58,0.15);
          color: #c0453a;
          background: rgba(192,69,58,0.06);
        }

        .home-task-item__action--delete:hover {
          border-color: rgba(192,69,58,0.35);
        }

        .home-task-dropdown__foot {
          padding: var(--space-3) var(--space-4);
          border-top: 1px solid var(--border);
        }

        .home-task-dropdown__foot-link {
          display: block;
          text-align: center;
          font-size: 0.72rem;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          color: var(--accent);
          text-decoration: none;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .home-task-dropdown__foot-link:hover {
          border-color: var(--border-hover);
          background: var(--accent-dim);
        }

        /* ── Body ── */
        .home-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* ── Style panel ── */
        .home-style-panel {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-6);
          border-right: 1px solid var(--border);
        }

        .home-section-label {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text-muted);
          margin-bottom: var(--space-4);
        }

        .home-style-grid {
          display: grid;
          gap: var(--space-4);
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        }

        .home-style-card {
          border-radius: var(--radius-lg);
          border: 2px solid var(--border);
          background: var(--surface);
          overflow: hidden;
          cursor: pointer;
          text-align: left;
          transition: border-color var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out);
          font-family: var(--font-body);
        }

        .home-style-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .home-style-card--selected {
          /* BorderBeam handles the glow — card stays clean */
          border-color: var(--border-hover);
        }

        .home-style-card__thumb {
          height: 96px;
          overflow: hidden;
          position: relative;
        }

        .home-style-card__check {
          position: absolute;
          top: var(--space-2);
          right: var(--space-2);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .home-style-card__footer {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          border-top: 1px solid var(--border);
          background: var(--surface-2);
        }

        .home-style-card__num {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          font-weight: 600;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .home-style-card__info {
          flex: 1;
          min-width: 0;
        }

        .home-style-card__name {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }

        .home-style-card__sub {
          font-size: 0.58rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .home-style-card__swatches {
          display: flex;
          gap: 3px;
          flex-shrink: 0;
        }

        .home-style-card__swatch {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        /* ── Form panel ── */
        .home-form-panel {
          width: 384px;
          flex-shrink: 0;
          overflow-y: auto;
          padding: var(--space-6);
          background: var(--surface);
        }

        .home-toggle-group {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        .home-toggle-btn {
          flex: 1;
          padding: var(--space-3) 0;
          border-radius: var(--radius-md);
          border: 2px solid var(--border);
          background: var(--surface-2);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .home-toggle-btn--active {
          border-color: var(--accent) !important;
          background: rgba(212, 165, 116, 0.10) !important;
          color: var(--accent) !important;
        }

        .home-toggle-btn:hover:not(.home-toggle-btn--active) {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .home-textarea {
          width: 100%;
          border-radius: var(--radius-lg);
          border: 2px solid var(--border);
          background: var(--surface-2);
          color: var(--text);
          padding: var(--space-4);
          font-size: 0.875rem;
          font-family: var(--font-body);
          line-height: 1.6;
          resize: none;
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out);
          margin-bottom: var(--space-3);
        }

        .home-textarea:focus {
          border-color: var(--border-hover);
        }

        .home-textarea::placeholder {
          color: var(--text-dim);
        }

        .home-input {
          width: 100%;
          border-radius: var(--radius-lg);
          border: 2px solid var(--border);
          background: var(--surface-2);
          color: var(--text);
          padding: var(--space-3) var(--space-4);
          font-size: 0.875rem;
          font-family: var(--font-body);
          outline: none;
          transition: border-color var(--duration-fast) var(--ease-out);
          margin-bottom: var(--space-3);
        }

        .home-input:focus {
          border-color: var(--border-hover);
        }

        .home-input::placeholder {
          color: var(--text-dim);
        }

        .home-error {
          font-size: 0.75rem;
          padding: var(--space-3);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-3);
          background: rgba(192,69,58,0.06);
          border: 1px solid rgba(192,69,58,0.14);
          color: #c0453a;
        }

        .home-style-chip {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3);
          border-radius: var(--radius-lg);
          border: 2px solid var(--border);
          background: var(--surface-2);
          margin-bottom: var(--space-3);
        }

        .home-style-chip__preview {
          width: 24px;
          height: 24px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }

        .home-style-chip__name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
        }

        .home-style-chip__sep {
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        .home-style-chip__en {
          font-size: 0.875rem;
          color: var(--text-muted);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .home-style-chip__swatches {
          display: flex;
          gap: 3px;
          flex-shrink: 0;
        }

        .home-style-chip__swatch {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .home-form-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
        }

        .home-form-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-muted);
          min-width: 3rem;
          flex-shrink: 0;
        }

        .home-form-group {
          display: flex;
          gap: var(--space-2);
          flex: 1;
        }

        .home-form-pill {
          flex: 1;
          padding: var(--space-2) 0;
          border-radius: var(--radius-md);
          border: 2px solid var(--border);
          background: var(--surface-2);
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          font-family: var(--font-body);
        }

        .home-form-pill--active {
          border-color: var(--accent) !important;
          background: rgba(212, 165, 116, 0.10) !important;
          color: var(--accent) !important;
        }

        .home-form-pill:hover:not(.home-form-pill--active) {
          border-color: var(--border-hover);
          color: var(--text);
        }

        .home-generate-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-4) 0;
          border-radius: var(--radius-lg);
          background: var(--accent);
          color: var(--text);
          font-size: 0.875rem;
          font-weight: 700;
          font-family: var(--font-body);
          cursor: pointer;
          border: 2px solid transparent;
          transition: all var(--duration-normal) var(--ease-out);
          box-shadow: 0 2px 8px rgba(196, 133, 58, 0.15);
          margin-bottom: var(--space-2);
        }

        .home-generate-btn:hover:not(:disabled) {
          background: var(--accent-light);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(196, 133, 58, 0.25);
        }

        .home-generate-btn:hover:not(:disabled) {
          background: var(--accent-light);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(212, 165, 116, 0.35);
        }

        .home-generate-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .home-generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .home-hint {
          text-align: center;
          font-size: 0.72rem;
          color: var(--text-muted);
          margin-bottom: var(--space-6);
        }

        .home-recent {
          padding-top: var(--space-6);
          border-top: 1px solid var(--border);
        }

        .home-recent__empty {
          font-size: 0.72rem;
          color: var(--text-dim);
        }

        .home-recent__list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .home-recent__item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          border-radius: var(--radius-md);
          background: var(--surface-2);
        }

        .home-recent__id {
          font-family: var(--font-mono);
          font-size: 0.58rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .home-recent__name {
          flex: 1;
          min-width: 0;
          font-size: 0.75rem;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .home-recent__status {
          font-size: 0.72rem;
          flex-shrink: 0;
        }

        .home-recent__more {
          display: block;
          text-align: center;
          font-size: 0.72rem;
          padding: var(--space-2);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          color: var(--accent);
          text-decoration: none;
          margin-top: var(--space-2);
          transition: all var(--duration-fast) var(--ease-out);
        }

        .home-recent__more:hover {
          border-color: var(--border-hover);
          background: var(--accent-dim);
        }

        /* ── Spinner ── */
        .home-spin {
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .home-body {
            flex-direction: column;
          }

          .home-style-panel {
            border-right: none;
            border-bottom: 1px solid var(--border);
            max-height: 50vh;
          }

          .home-form-panel {
            width: 100%;
            flex-shrink: 0;
          }

          .home-style-grid {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          }
        }
      `}</style>
    </div>
  );
}

function StyleThumb({ style, n }: { style: typeof STYLE_PRESETS[0]; n: number }) {
  const id = String(n).padStart(2, "0");
  const previews: Record<string, React.ReactNode> = {
    "bold-signal": (
      <div style={{ background: "linear-gradient(135deg, #1a1a1a, #2d2d2d, #1a1a1a)", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
        <div style={{ position: "absolute", top: 6, left: 8, fontFamily: "Archivo Black, sans-serif", fontSize: "1.2rem", color: "rgba(255,255,255,0.12)", fontWeight: 900 }}>{id}</div>
        <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, background: "#FF5722", padding: "6px 8px", borderRadius: 2 }}>
          <div style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "0.65rem", color: "#1a1a1a", fontWeight: 900, lineHeight: 1.1 }}>Slide Title</div>
          <div style={{ fontSize: "0.35rem", color: "rgba(26,26,26,0.65)", marginTop: 2 }}>Subtitle · 2024</div>
        </div>
      </div>
    ),
    "electric-studio": (
      <div style={{ background: "#0a0a0a", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: "44%", background: "#0a0a0a", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: "#4361ee" }} />
          <div style={{ position: "absolute", top: 6, left: 8, fontSize: "0.32rem", color: "#4361ee", fontWeight: 800 }}>{id} · SLIDE</div>
          <div style={{ position: "absolute", top: 18, left: 8, fontFamily: "Manrope, sans-serif", fontSize: "1.1rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>Slide<br/>Title</div>
        </div>
        <div style={{ height: "56%", background: "#fff", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.32rem", color: "#0a0a0a", lineHeight: 1.5 }}>Content text goes here</div>
          <div style={{ fontSize: "0.28rem", color: "#888", marginTop: 3 }}>Meta · 2024</div>
        </div>
      </div>
    ),
    "creative-voltage": (
      <div style={{ background: "#1a1a2e", width: "100%", height: "100%", display: "flex" }}>
        <div style={{ width: "42%", background: "#0066ff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "4px 4px" }} />
          <div style={{ position: "absolute", top: 5, left: 6, fontFamily: "Space Mono, monospace", fontSize: "0.28rem", fontWeight: 700, background: "#d4ff00", color: "#1a1a2e", padding: "1px 3px" }}>{id}</div>
          <div style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)", padding: "0 5px", fontFamily: "Syne, sans-serif", fontSize: "0.9rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            Slide<br/><span style={{ color: "#d4ff00" }}>Title</span>
          </div>
        </div>
        <div style={{ width: "58%", padding: 6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.26rem", color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>// content</div>
          <div style={{ fontSize: "0.32rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            Key <strong style={{ color: "#d4ff00" }}>point</strong>
          </div>
        </div>
      </div>
    ),
    "dark-botanical": (
      <div style={{ background: "#0f0f0f", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-35%", right: "-20%", width: 130, height: 130, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(212,165,116,0.3) 0%, transparent 70%)", filter: "blur(14px)" }} />
        <div style={{ position: "absolute", bottom: "-25%", left: "-15%", width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(232,180,184,0.22) 0%, transparent 70%)", filter: "blur(16px)" }} />
        <div style={{ position: "absolute", top: "12%", bottom: "12%", left: 10, width: 1, background: "linear-gradient(to bottom, transparent, #d4a574, transparent)" }} />
        <div style={{ position: "absolute", top: "50%", left: 16, transform: "translateY(-50%)" }}>
          <div style={{ fontSize: "0.25rem", color: "#d4a574", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 3 }}>{id} · Slide</div>
          <div style={{ fontFamily: "Cormorant, serif", fontSize: "0.95rem", fontWeight: 400, lineHeight: 1.1, color: "#e8e4df" }}>
            Slide <em style={{ fontStyle: "italic", color: "#e8b4b8" }}>Title</em>
          </div>
          <div style={{ fontSize: "0.3rem", color: "#9a9590", marginTop: 4, lineHeight: 1.4 }}>Subtitle</div>
        </div>
      </div>
    ),
    "neon-cyber": (
      <div style={{ background: "#0a0f1c", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,255,204,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,204,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
        <div style={{ position: "absolute", top: "-40%", left: "20%", width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,255,204,0.14) 0%, rgba(255,0,170,0.06) 50%, transparent 70%)", filter: "blur(12px)" }} />
        <div style={{ position: "absolute", top: 5, left: 6, fontSize: "0.26rem", fontWeight: 700, color: "#00ffcc", textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 2, background: "#00ffcc", boxShadow: "0 0 5px #00ffcc", display: "inline-block" }} />
          {id}
        </div>
        <div style={{ position: "absolute", top: "38%", left: 6, fontFamily: "Manrope, sans-serif", fontSize: "1.1rem", fontWeight: 800, color: "#e0e8ff", lineHeight: 0.95 }}>
          <span style={{ color: "#00ffcc", textShadow: "0 0 12px rgba(0,255,204,0.4)" }}>Slide</span><br/>
          <span style={{ color: "#ff00aa", textShadow: "0 0 12px rgba(255,0,170,0.4)" }}>Title</span>
        </div>
        <div style={{ position: "absolute", bottom: 6, left: 6, display: "flex", gap: 8 }}>
          {[["01","Slide"],["02","Content"]].map(([v, l]) => (
            <div key={l}>
              <div style={{ fontSize: "0.55rem", fontWeight: 800, color: "#00ffcc" }}>{v}</div>
              <div style={{ fontSize: "0.22rem", color: "rgba(224,232,255,0.4)", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    "terminal-green": (
      <div style={{ background: "#0d1117", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 5 }}>
        <div style={{ width: "90%", background: "#161b22", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", boxShadow: "0 3px 10px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 5px", background: "#1c2128", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff5f56" }} />
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#27c93f" }} />
            <div style={{ flex: 1, textAlign: "center", fontSize: "0.24rem", color: "#7d8590" }}>slide_{id}.md</div>
          </div>
          <div style={{ padding: "4px 5px" }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 2, alignItems: "flex-start" }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.3rem" }}>$</span>
              <span style={{ fontSize: "0.28rem", color: "#e6edf3" }}>title: Slide {id}</span>
            </div>
            <div style={{ display: "flex", gap: 3, marginBottom: 2, alignItems: "flex-start" }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.3rem" }}>$</span>
              <span style={{ fontSize: "0.28rem", color: "#7d8590" }}><span style={{ color: "#79c0ff" }}>→</span> content</span>
            </div>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.3rem" }}>$</span>
              <span style={{ display: "inline-block", width: 4, height: 6, background: "#39d353", verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    "notebook-tabs": (
      <div style={{ background: "#2d2d2d", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "88%", height: "82%", background: "#f8f6f1", borderRadius: 2, boxShadow: "0 3px 10px rgba(0,0,0,0.3)", padding: "6px 6px 6px 18px", position: "relative" }}>
          <div style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", width: 5, height: 30, background: "repeating-linear-gradient(to bottom, transparent 0, transparent 4px, #2d2d2d 4px, #2d2d2d 7px, transparent 7px, transparent 11px)" }} />
          <div style={{ position: "absolute", right: -2, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            {[12, 18, 8, 15, 10].map((h, i) => (
              <div key={i} style={{ width: 4, height: h, borderRadius: "2px 0 0 2px", background: ["#98d4bb","#c7b8ea","#f4b8c5","#a8d8ea","#ffe6a7"][i] }} />
            ))}
          </div>
          <div style={{ fontSize: "0.24rem", color: "#c7b8ea", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{id} · Slide</div>
          <div style={{ fontFamily: "Bodoni Moda, serif", fontSize: "0.72rem", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>
            Slide <em style={{ fontStyle: "italic", color: "#f4b8c5" }}>Title</em>
          </div>
          <div style={{ fontSize: "0.26rem", color: "#888", marginTop: 2, lineHeight: 1.4 }}>Subtitle</div>
          <div style={{ marginTop: 4, paddingTop: 3, borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 5 }}>
            {[["Code","130"],["Tools","01"]].map(([l, v]) => (
              <div key={l}>
                <span style={{ fontSize: "0.2rem", color: "#bbb", textTransform: "uppercase" }}>{l}</span>
                <span style={{ fontSize: "0.26rem", fontWeight: 500, color: "#1a1a1a", marginLeft: 2 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    "pastel-geometry": (
      <div style={{ background: "#c8d9e6", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "86%", height: "82%", background: "#faf9f7", borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", padding: 6, display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>
              <span style={{ fontSize: "0.24rem", fontWeight: 700, padding: "1px 4px", borderRadius: 10, background: "#f0b4d4", color: "#7a3a5a" }}>{id}</span>
              <span style={{ fontSize: "0.24rem", fontWeight: 700, padding: "1px 4px", borderRadius: 10, background: "#a8d4c4", color: "#3a6a5a" }}>Slide</span>
            </div>
            <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: "0.72rem", fontWeight: 800, color: "#1a1a1a", lineHeight: 1.1 }}>Title</div>
            <div style={{ fontSize: "0.26rem", color: "#888", marginTop: 2 }}>Subtitle</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, justifyContent: "center", height: "100%" }}>
            {[14, 24, 12, 20, 17].map((h, i) => (
              <div key={i} style={{ width: 12, height: h, borderRadius: 3, background: ["#f0b4d4","#a8d4c4","#5a7c6a","#9b8dc4","#7c6aad"][i] }} />
            ))}
          </div>
        </div>
      </div>
    ),
    "split-pastel": (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <div style={{ width: "50%", background: "#f5e6dc", padding: 6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: "0.25rem", fontWeight: 700, color: "#8a6a50", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{id} · Slide</div>
          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#1a1a1a", lineHeight: 0.95 }}>
            Slide<br/><span style={{ color: "#9b6ea0" }}>Title</span>
          </div>
        </div>
        <div style={{ width: "50%", background: "#e4dff0", position: "relative", padding: 6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(100,80,150,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(100,80,150,0.06) 1px, transparent 1px)", backgroundSize: "8px 8px" }} />
          {[["#c8f0d8","#3a6a4a","130"],["#f0d4e0","#7a4a5a","01"]].map(([bg, c, t], i) => (
            <div key={i} style={{ fontSize: "0.24rem", padding: "1px 5px", borderRadius: 20, marginBottom: 2, background: bg as string, color: c as string, fontWeight: 700, display: "inline-block" }}>{t}</div>
          ))}
          <div style={{ fontSize: "0.28rem", color: "#666", marginTop: 2, lineHeight: 1.4 }}>Content</div>
        </div>
      </div>
    ),
    "vintage-editorial": (
      <div style={{ background: "#f5f3ee", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", width: 40, height: 40, border: "2px solid #e8d4c0", borderRadius: "50%", top: 5, right: 5 }} />
        <div style={{ position: "absolute", width: 28, height: 2, background: "#e8d4c0", bottom: 8, left: 5, transform: "rotate(-30deg)" }} />
        <div style={{ textAlign: "center", maxWidth: "84%" }}>
          <div style={{ fontSize: "0.22rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>{id} · Slide</div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.1rem", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em", color: "#1a1a1a" }}>
            Slide<span style={{ display: "block", fontSize: "0.36em", color: "#888", fontWeight: 700, letterSpacing: "0.06em" }}>Title</span>
          </div>
          <div style={{ fontSize: "0.27rem", color: "#888", marginTop: 4, lineHeight: 1.5 }}>Subtitle</div>
          <div style={{ display: "inline-block", border: "1.5px solid #1a1a1a", padding: "1px 7px", fontSize: "0.24rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a1a1a", marginTop: 5 }}>Read</div>
        </div>
      </div>
    ),
    "swiss-modern": (
      <div style={{ background: "#ffffff", width: "100%", height: "100%", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "#ff3300" }} />
        <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)", fontFamily: "Archivo Black, sans-serif", fontSize: "4rem", fontWeight: 900, color: "rgba(0,0,0,0.05)", lineHeight: 1 }}>{id}</div>
        <div style={{ position: "absolute", top: "50%", left: 10, transform: "translateY(-50%)" }}>
          <div style={{ fontSize: "0.25rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "#ff3300", marginBottom: 2 }}>{id} · Slide</div>
          <div style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "1.25rem", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em" }}>SLIDE<br/>TITLE</div>
          <div style={{ fontSize: "0.28rem", color: "#666", marginTop: 4, lineHeight: 1.5, maxWidth: "28ch" }}>Subtitle</div>
        </div>
        <div style={{ position: "absolute", bottom: 6, left: 10, display: "flex", gap: 8 }}>
          {[["01","Slide"],["02","Content"]].map(([v, l]) => (
            <div key={l}>
              <span style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "0.7rem", color: "#000" }}>{v}</span>
              <span style={{ fontSize: "0.22rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#aaa", marginLeft: 2 }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    "paper-ink": (
      <div style={{ background: "#faf9f7", width: "100%", height: "100%", position: "relative" }}>
        <div style={{ position: "absolute", top: 8, left: 10, right: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: "0.22rem", fontWeight: 500, color: "#6b6560", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{id} · Slide</span>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #c41e3a, transparent)" }} />
        </div>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", width: "88%" }}>
          <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.2rem", fontWeight: 400, lineHeight: 1, marginBottom: 4 }}>
            Slide <em style={{ fontStyle: "italic", color: "#c41e3a" }}>Title</em>
          </div>
          <div style={{ fontSize: "0.28rem", color: "#6b6560", lineHeight: 1.6 }}>Content subtitle</div>
        </div>
        <div style={{ position: "absolute", bottom: 8, left: 10, right: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #c41e3a)" }} />
          <span style={{ fontSize: "0.22rem", fontWeight: 500, color: "#6b6560", letterSpacing: "0.05em" }}>{id} / 2024</span>
        </div>
      </div>
    ),
  };

  return previews[style.id] || (
    <div style={{ background: style.bg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 800, color: style.accent }}>{id}</span>
    </div>
  );
}
