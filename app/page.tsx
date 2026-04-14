"use client";

import { useState, useEffect } from "react";
import { STYLE_PRESETS, ASPECT_RATIOS } from "@/lib/style-presets";
import { getTasks, addTask, updateTask, type TaskRecord } from "@/lib/generation-store";

/** 从用户输入中提取任务名称 */
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
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0].id);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [showTaskList, setShowTaskList] = useState(false);

  // Mount 时从 SQLite 同步任务列表（SQLite 是唯一数据源）
  useEffect(() => {
    async function syncTasks() {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const serverTasks: TaskRecord[] = await res.json();
          // 用 SQLite 数据作为唯一数据源，写入 localStorage 保持一致
          const trimmed = serverTasks.slice(-30);
          localStorage.setItem("slides-tasks", JSON.stringify(trimmed));
          setTasks(trimmed);
        } else {
          // API 失败时降级到本地缓存
          setTasks(getTasks());
        }
      } catch {
        setTasks(getTasks());
      }
    }
    syncTasks();
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
          updateTask(task.id, { status: "generating", skill: data.skill || "", step: data.step || "", progress: data.progress || 50, name: data.name || task.name });
          setTasks([...getTasks()]);
        } else if (data.type === "done") {
          updateTask(task.id, { status: "done", skill: "", step: "Done", progress: 100, htmlPath: data.htmlPath || "", endedAt: data.endedAt || Math.floor(Date.now() / 1000) });
          setTasks([...getTasks()]);
          es.close();
        } else if (data.type === "error") {
          updateTask(task.id, { status: "error", skill: "", step: "Failed", error: data.message, endedAt: data.endedAt || Math.floor(Date.now() / 1000) });
          setTasks([...getTasks()]);
          es.close();
        } else if (data.type === "cancelled") {
          updateTask(task.id, { status: "cancelled", step: "已取消", endedAt: data.endedAt || Math.floor(Date.now() / 1000) });
          setTasks([...getTasks()]);
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
        body: JSON.stringify({ input: input.trim(), inputType, styleId: selectedStyle, aspectRatio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      const name = extractTaskName(input.trim(), inputType);
      const task: TaskRecord = { id: data.id, status: "generating", skill: "frontend-slides", step: "Starting...", progress: 10, htmlPath: "", error: "", name, endedAt: 0, createdAt: Math.floor(Date.now() / 1000) };
      addTask(task);
      setTasks([...getTasks()]);
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
    } catch {/* silently ignore */}
  }

  async function deleteTask(id: string) {
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {/* silently ignore */}
  }

  const selectedPreset = STYLE_PRESETS.find(s => s.id === selectedStyle)!;
  const runningCount = tasks.filter((t) => t.status === "generating").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="page">
      {/* ── Header ── */}
      <header className="header">
        <div className="header__left">
          <div className="header__logo">S</div>
          <div>
            <div className="header__title">Slides Generator</div>
            <div className="header__sub">URL or text → HTML slides</div>
          </div>
        </div>
        <div className="header__right">
          <div className="header__stats">
            <span className="header__stat-num">{STYLE_PRESETS.length}</span>
            <span className="header__stat-label">styles</span>
          </div>
          <button
            className={`task-btn ${runningCount > 0 ? "task-btn--running" : doneCount > 0 ? "task-btn--done" : ""}`}
            onClick={() => setShowTaskList(v => !v)}
          >
            <span className={`task-btn__dot ${runningCount > 0 ? "task-btn__dot--pulse" : ""}`} />
            {runningCount > 0 ? `${runningCount} running` : doneCount > 0 ? `${doneCount} done` : "Tasks"}
          </button>
        </div>
      </header>

      {/* Task dropdown */}
      {showTaskList && (
        <div className="task-panel">
          <div className="task-panel__head">
            <span>{tasks.length} Task{tasks.length !== 1 ? "s" : ""}</span>
            {tasks.length > 0 && (
              <button className="task-panel__clear" onClick={() => { setTasks([]); setShowTaskList(false); }}>Clear</button>
            )}
          </div>
          {tasks.length === 0 && <div className="task-panel__empty">No tasks yet</div>}
          {[...tasks].reverse().map(task => {
            const duration = task.endedAt && task.createdAt ? formatDuration(task.endedAt - task.createdAt) : "";
            const isFinal = task.status === "done" || task.status === "error" || task.status === "cancelled";
            return (
              <div key={task.id} className={`task-row task-row--${task.status}`}>
                {/* Top: name + status badge + actions */}
                <div className="task-row__top">
                  <div className="task-row__name" title={task.name}>{task.name || `#${task.id}`}</div>
                  <div className="task-row__badges">
                    {task.status === "generating" && (
                      <span className="badge badge--running">
                        <span className="badge__dot" />
                        {task.progress}%
                      </span>
                    )}
                    {task.status === "done" && (
                      <a href={"/preview/" + task.id} target="_blank" rel="noopener" className="badge badge--done">Done ↗</a>
                    )}
                    {task.status === "error" && <span className="badge badge--error">Error</span>}
                    {task.status === "cancelled" && <span className="badge badge--cancelled">Cancelled</span>}
                  </div>
                </div>

                {/* Progress bar for generating */}
                {task.status === "generating" && (
                  <div className="task-row__bar"><div style={{ width: `${task.progress}%` }} /></div>
                )}

                {/* Step label */}
                <div className="task-row__step">{task.step}</div>

                {/* Times row */}
                <div className="task-row__times">
                  <span className="task-row__time task-row__time--created">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v2.75l1.75 1.75" />
                    </svg>
                    {formatRelativeTime(task.createdAt)}
                  </span>
                  {isFinal && task.endedAt > 0 && (
                    <>
                      <span className="task-row__sep">·</span>
                      <span className="task-row__time">
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M1 6.5h10M6.5 2l4 4.5-4 4.5" />
                        </svg>
                        {duration}
                      </span>
                    </>
                  )}
                </div>

                {/* Error message for failed tasks */}
                {task.status === "error" && task.error && (
                  <div className="task-row__error">{task.error}</div>
                )}

                {/* Action buttons */}
                <div className="task-row__actions">
                  {task.status === "generating" && (
                    <button className="task-action task-action--cancel" onClick={() => cancelTask(task.id)}>
                      Cancel
                    </button>
                  )}
                  {isFinal && (
                    <button className="task-action task-action--delete" onClick={() => deleteTask(task.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Body ── */}
      <div className="body">
        {/* LEFT: Style picker */}
        <aside className="style-col">
          <div className="col-label">Choose a style</div>

          <div className="style-grid">
            {STYLE_PRESETS.map((style, i) => (
              <button
                key={style.id}
                className={`scard ${selectedStyle === style.id ? "scard--on" : ""}`}
                onClick={() => setSelectedStyle(style.id)}
              >
                {/* Thumbnail */}
                <div className="scard__thumb">
                  <StyleThumb style={style} n={i + 1} />
                  {selectedStyle === style.id && (
                    <div className="scard__check">
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="scard__foot">
                  <span className="scard__num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="scard__names">
                    <span className="scard__cn">{style.nameCn}</span>
                    <span className="scard__en">{style.name}</span>
                  </div>
                  <div className="scard__dots">
                    <span className="dot" style={{ background: style.accent }} />
                    <span className="dot" style={{ background: style.bg }} />
                    <span className="dot" style={{ background: style.text }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT: Input */}
        <main className="input-col">
          <div className="input-wrap">
            {/* Section label */}
            <div className="col-label">Create slides</div>

            {/* Type toggle */}
            <div className="toggle-row">
              <button className={`tog ${inputType === "url" ? "tog--on" : ""}`} onClick={() => setInputType("url")}>URL</button>
              <button className={`tog ${inputType === "text" ? "tog--on" : ""}`} onClick={() => setInputType("text")}>Text</button>
            </div>

            {/* Textarea */}
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={inputType === "url" ? "https://github.com/... — any URL" : "Paste your content here..."}
              className="tarea"
              rows={5}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
            />

            {error && <div className="err-msg">{error}</div>}

            {/* Style chip */}
            <div className="style-chip">
              <div className="style-chip__swatch" style={{ background: `linear-gradient(135deg, ${selectedPreset.accent}22, ${selectedPreset.text}11)` }} />
              <span className="style-chip__name">{selectedPreset.nameCn}</span>
              <span className="style-chip__sep">·</span>
              <span className="style-chip__en">{selectedPreset.name}</span>
              <div className="style-chip__dots">
                <span className="dot dot--sm" style={{ background: selectedPreset.accent }} />
                <span className="dot dot--sm" style={{ background: selectedPreset.bg, border: "1px solid rgba(0,0,0,0.1)" }} />
                <span className="dot dot--sm" style={{ background: selectedPreset.text, border: "1px solid rgba(0,0,0,0.1)" }} />
              </div>
            </div>

            {/* Ratio + Generate row */}
            <div className="bottom-row">
              <div className="ratio-group">
                {ASPECT_RATIOS.map(r => (
                  <button
                    key={r.id}
                    className={`ratio ${aspectRatio === r.id ? "ratio--on" : ""}`}
                    onClick={() => setAspectRatio(r.id as "16:9" | "9:16")}
                    title={r.hint}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
              <button onClick={handleGenerate} disabled={loading} className="gen-btn">
                {loading ? (
                  <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/></svg> Generating...</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41Z"/></svg> Generate</>
                )}
              </button>
            </div>

            {loading && <p className="hint">Track progress in the Tasks panel ↑</p>}
          </div>
        </main>
      </div>

      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          /* Warm editorial light palette */
          --bg: #f4f1ec;
          --bg2: #ede9e2;
          --surface: #ffffff;
          --surface2: #f9f7f4;
          --border: rgba(0,0,0,0.08);
          --border2: rgba(0,0,0,0.14);
          --text: #1c1a17;
          --text2: #6b6560;
          --text3: #9a9490;
          --accent: #b8844a;
          --accent2: #d4a574;
          --accent-dim: rgba(184,132,74,0.10);
          --accent-glow: rgba(184,132,74,0.18);
          --danger: #c0453a;
          --success: #4a8a5a;
          --font-body: 'DM Sans', 'Noto Sans SC', system-ui, sans-serif;
          --font-display: 'Fraunces', Georgia, serif;
          --font-mono: 'JetBrains Mono', monospace;
          --radius: 12px;
          --radius-sm: 7px;
        }

        html, body {
          height: 100%;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
          overflow: hidden;
        }

        /* ── Page ── */
        .page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        /* ── Header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 2rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          box-shadow: 0 1px 0 rgba(0,0,0,0.03);
        }

        .header__left { display: flex; align-items: center; gap: 0.75rem; }

        .header__logo {
          width: 36px; height: 36px;
          background: var(--accent);
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-size: 17px; font-weight: 800;
          color: #fff;
          letter-spacing: -0.02em;
          flex-shrink: 0;
        }

        .header__title {
          font-size: 0.9rem; font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
          line-height: 1.2;
        }

        .header__sub {
          font-size: 0.65rem; color: var(--text3);
          margin-top: 0.1rem;
        }

        .header__right { display: flex; align-items: center; gap: 1rem; }

        .header__stats {
          display: flex; align-items: baseline; gap: 0.25rem;
        }

        .header__stat-num {
          font-family: var(--font-display);
          font-size: 1.1rem; font-weight: 700;
          color: var(--accent);
        }

        .header__stat-label {
          font-size: 0.7rem; color: var(--text3);
        }

        /* Task button */
        .task-btn {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.4rem 0.85rem;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 100px;
          color: var(--text2);
          font-size: 0.75rem;
          font-family: var(--font-body);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .task-btn:hover { border-color: var(--border2); color: var(--text); }
        .task-btn--running { background: rgba(184,132,74,0.08); border-color: rgba(184,132,74,0.2); color: var(--accent); }
        .task-btn--done { background: rgba(74,138,90,0.08); border-color: rgba(74,138,90,0.2); color: var(--success); }

        .task-btn__dot {
          width: 6px; height: 6px;
          background: var(--text3);
          border-radius: 50%;
        }

        .task-btn__dot--pulse {
          background: var(--accent);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }

        /* Task panel */
        .task-panel {
          position: fixed;
          top: 60px;
          right: 2rem;
          width: 280px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 8px 32px rgba(0,0,0,0.10);
          z-index: 200;
          overflow: hidden;
        }

        .task-panel__head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.6rem 0.85rem;
          font-size: 0.68rem; color: var(--text3);
          border-bottom: 1px solid var(--border);
          text-transform: uppercase; letter-spacing: 0.1em;
        }

        .task-panel__clear {
          background: none; border: none; color: var(--danger);
          font-size: 0.68rem; cursor: pointer;
          font-family: var(--font-body);
          text-transform: uppercase; letter-spacing: 0.05em;
        }

        .task-panel__empty {
          padding: 1.2rem; text-align: center;
          font-size: 0.8rem; color: var(--text3);
        }

        .task-row {
          padding: 0.55rem 0.85rem;
          border-bottom: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 0.25rem;
        }

        .task-row:last-child { border-bottom: none; }
        .task-row--generating { background: rgba(184,132,74,0.04); }
        .task-row--done { background: rgba(74,138,90,0.03); }
        .task-row--error { background: rgba(192,69,58,0.04); }
        .task-row--cancelled { background: rgba(107,101,96,0.04); }

        .task-row__top {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 0.4rem;
        }

        .task-row__name {
          font-size: 0.75rem; font-weight: 600; color: var(--text);
          flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.3;
        }

        .task-row__badges { display: flex; gap: 0.3rem; flex-shrink: 0; align-items: center; }

        .badge {
          display: inline-flex; align-items: center; gap: 0.2rem;
          padding: 0.15rem 0.4rem;
          border-radius: 100px;
          font-size: 0.6rem; font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
        }

        .badge--running { background: rgba(184,132,74,0.12); color: var(--accent); }
        .badge__dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--accent);
          animation: pulse 1.5s ease-in-out infinite;
        }
        .badge--done { background: rgba(74,138,90,0.12); color: var(--success); }
        .badge--error { background: rgba(192,69,58,0.12); color: var(--danger); }
        .badge--cancelled { background: rgba(107,101,96,0.10); color: var(--text3); }

        .task-row__bar {
          height: 2px; background: var(--border);
          border-radius: 1px; overflow: hidden;
        }

        .task-row__bar div {
          height: 100%; background: var(--accent);
          transition: width 0.4s;
        }

        .task-row__step {
          font-size: 0.7rem; color: var(--text2); line-height: 1.3;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .task-row__times {
          display: flex; align-items: center; gap: 0.3rem;
        }

        .task-row__time {
          display: inline-flex; align-items: center; gap: 0.2rem;
          font-size: 0.6rem; color: var(--text3);
        }

        .task-row__sep { font-size: 0.6rem; color: var(--text3); }

        .task-row__error {
          font-size: 0.65rem; color: var(--danger);
          background: rgba(192,69,58,0.06);
          border: 1px solid rgba(192,69,58,0.12);
          border-radius: var(--radius-sm);
          padding: 0.3rem 0.5rem;
          line-height: 1.4;
          margin-top: 0.1rem;
          max-height: 4.5em; overflow-y: auto;
          word-break: break-all;
        }

        .task-row__actions {
          display: flex; gap: 0.3rem; margin-top: 0.1rem;
        }

        .task-action {
          padding: 0.2rem 0.55rem;
          border-radius: 100px;
          font-size: 0.62rem; font-weight: 500;
          font-family: var(--font-body);
          cursor: pointer; border: 1px solid;
          transition: all 0.15s;
        }

        .task-action--cancel {
          background: rgba(184,132,74,0.06); border-color: rgba(184,132,74,0.18);
          color: var(--accent);
        }
        .task-action--cancel:hover { background: rgba(184,132,74,0.12); }

        .task-action--delete {
          background: rgba(192,69,58,0.06); border-color: rgba(192,69,58,0.15);
          color: var(--danger);
        }
        .task-action--delete:hover { background: rgba(192,69,58,0.12); }

        /* ── Body ── */
        .body {
          display: grid;
          grid-template-columns: 1fr 380px;
          flex: 1;
          overflow: hidden;
        }

        /* ── Style column ── */
        .style-col {
          border-right: 1px solid var(--border);
          padding: 1.5rem 1.75rem;
          overflow-y: auto;
          background: var(--bg);
        }

        .col-label {
          font-size: 0.68rem;
          color: var(--text3);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .style-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0.65rem;
        }

        /* Style card */
        .scard {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
          position: relative;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .scard:hover {
          border-color: var(--border2);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
        }

        .scard--on {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-dim), 0 4px 16px rgba(184,132,74,0.12);
        }

        .scard__thumb {
          height: 100px;
          overflow: hidden;
          position: relative;
          flex-shrink: 0;
        }

        .scard__check {
          position: absolute;
          top: 5px; right: 5px;
          width: 18px; height: 18px;
          background: var(--accent);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .scard__foot {
          padding: 0.5rem 0.6rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          border-top: 1px solid var(--border);
          background: var(--surface2);
        }

        .scard__num {
          font-size: 0.6rem;
          color: var(--text3);
          font-family: var(--font-mono);
          font-weight: 600;
          flex-shrink: 0;
        }

        .scard__names {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
        }

        .scard__cn {
          font-size: 0.7rem;
          color: var(--text);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }

        .scard__en {
          font-size: 0.58rem;
          color: var(--text3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scard__dots {
          display: flex;
          gap: 0.22rem;
          flex-shrink: 0;
        }

        /* ── Input column ── */
        .input-col {
          background: var(--surface);
          padding: 1.5rem 1.75rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .input-wrap {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        /* Toggle buttons */
        .toggle-row {
          display: flex;
          gap: 0.4rem;
        }

        .tog {
          flex: 1;
          padding: 0.5rem;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text2);
          font-size: 0.82rem;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }

        .tog:hover { border-color: var(--border2); color: var(--text); }
        .tog--on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

        /* Textarea */
        .tarea {
          width: 100%;
          padding: 0.8rem 1rem;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 0.88rem;
          font-family: var(--font-body);
          resize: none;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          line-height: 1.65;
        }

        .tarea::placeholder { color: var(--text3); }
        .tarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-dim);
        }

        /* Error */
        .err-msg {
          font-size: 0.76rem;
          color: var(--danger);
          padding: 0.5rem 0.75rem;
          background: rgba(192,69,58,0.06);
          border: 1px solid rgba(192,69,58,0.14);
          border-radius: var(--radius-sm);
        }

        /* Style chip */
        .style-chip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0.85rem;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
        }

        .style-chip__swatch {
          width: 22px; height: 22px;
          border-radius: 5px;
          flex-shrink: 0;
        }

        .style-chip__name {
          font-size: 0.78rem;
          color: var(--text);
          font-weight: 600;
        }

        .style-chip__sep { color: var(--text3); font-size: 0.75rem; }

        .style-chip__en {
          font-size: 0.75rem;
          color: var(--text2);
          flex: 1;
        }

        .style-chip__dots {
          display: flex;
          gap: 0.3rem;
          align-items: center;
        }

        /* Bottom row */
        .bottom-row {
          display: flex;
          gap: 0.6rem;
          align-items: center;
        }

        .ratio-group { display: flex; gap: 0.3rem; }

        .ratio {
          padding: 0.45rem 0.8rem;
          background: var(--bg2);
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text2);
          font-size: 0.75rem;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
          white-space: nowrap;
        }

        .ratio:hover { border-color: var(--border2); color: var(--text); }
        .ratio--on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

        .gen-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.8rem 1.2rem;
          background: var(--accent);
          border: none;
          border-radius: var(--radius);
          color: #fff;
          font-size: 0.92rem;
          font-weight: 700;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.01em;
          box-shadow: 0 2px 8px rgba(184,132,74,0.25);
        }

        .gen-btn:hover:not(:disabled) {
          background: var(--accent2);
          transform: translateY(-1px);
          box-shadow: 0 5px 16px rgba(184,132,74,0.3);
        }

        .gen-btn:active:not(:disabled) { transform: translateY(0); }
        .gen-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .hint {
          font-size: 0.7rem;
          color: var(--text3);
          text-align: center;
          margin: 0;
        }

        /* Dots */
        .dot {
          width: 9px; height: 9px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }

        .dot--sm { width: 10px; height: 10px; }

        /* Spinner */
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

        /* Selection */
        ::selection { background: var(--accent-dim); color: var(--text); }

        /* Responsive */
        @media (max-width: 900px) {
          html, body { overflow: auto; }
          .body { grid-template-columns: 1fr; }
          .style-col { border-right: none; border-bottom: 1px solid var(--border); }
          .input-col { padding-bottom: 3rem; }
          .style-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
        }
      `}</style>
    </div>
  );
}

/* ── Mini preview thumbnails (CSS-only) ── */
function StyleThumb({ style, n }: { style: typeof STYLE_PRESETS[0]; n: number }) {
  const id = String(n).padStart(2, "0");
  const c = (hex: string) => hex;

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
