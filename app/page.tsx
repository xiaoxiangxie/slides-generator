"use client";

import { useState, useEffect } from "react";
import { STYLE_PRESETS, ASPECT_RATIOS } from "@/lib/style-presets";
import { getTasks, addTask, updateTask, type TaskRecord } from "@/lib/task-store";

export default function Home() {
  const [input, setInput] = useState("");
  const [inputType, setInputType] = useState<"url" | "text">("url");
  const [selectedStyle, setSelectedStyle] = useState(STYLE_PRESETS[0].id);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [showTaskList, setShowTaskList] = useState(false);

  useEffect(() => {
    setTasks(getTasks());
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
          updateTask(task.id, {
            status: "generating",
            skill: data.skill || "",
            step: data.step || "",
            progress: data.progress || 50,
          });
          setTasks([...getTasks()]);
        } else if (data.type === "done") {
          updateTask(task.id, { status: "done", skill: "", step: "Done", progress: 100, htmlPath: data.htmlPath || "" });
          setTasks([...getTasks()]);
          es.close();
        } else if (data.type === "error") {
          updateTask(task.id, { status: "error", skill: "", step: "Failed", error: data.message });
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
    if (!input.trim()) {
      setError("请输入内容或链接");
      return;
    }
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
      const task: TaskRecord = {
        id: data.id,
        status: "generating",
        skill: "frontend-slides",
        step: "Starting...",
        progress: 10,
        htmlPath: "",
        createdAt: Date.now(),
      };
      addTask(task);
      setTasks([...getTasks()]);
      setShowTaskList(true);
      setLoading(false);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  const runningCount = tasks.filter((t) => t.status === "generating").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="page">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__logo">S</div>
          <span className="topbar__title">Slides Generator</span>
        </div>
        <div className="topbar__right">
          <span className="topbar__count">{STYLE_PRESETS.length} styles</span>
          <button
            className={`task-pill ${runningCount > 0 ? "task-pill--running" : doneCount > 0 ? "task-pill--done" : ""}`}
            onClick={() => setShowTaskList((v) => !v)}
          >
            <span className={`task-pill__dot ${runningCount > 0 ? "task-pill__dot--animate" : ""}`} />
            {runningCount > 0 ? `${runningCount} running` : doneCount > 0 ? `${doneCount} done` : "Tasks"}
          </button>
        </div>
      </header>

      {/* Task dropdown */}
      {showTaskList && (
        <div className="task-dropdown">
          <div className="task-dropdown__header">
            <span>{tasks.length} Task{tasks.length !== 1 ? "s" : ""}</span>
            {tasks.length > 0 && (
              <button className="task-dropdown__clear" onClick={() => { setTasks([]); setShowTaskList(false); }}>
                Clear
              </button>
            )}
          </div>
          {tasks.length === 0 && <div className="task-dropdown__empty">No tasks yet</div>}
          {[...tasks].reverse().map((task) => (
            <div key={task.id} className={`task-item task-item--${task.status}`}>
              <div className="task-item__row">
                <span className="task-item__id">#{task.id}</span>
                {task.status === "generating" && <span className="task-item__pct">{task.progress}%</span>}
                {task.status === "done" && (
                  <a href={"/preview/" + task.id} target="_blank" rel="noopener" className="task-item__link">Open ↗</a>
                )}
                {task.status === "error" && <span className="task-item__error">Error</span>}
              </div>
              {task.status === "generating" && (
                <div className="task-item__bar"><div style={{ width: `${task.progress}%` }} /></div>
              )}
              <div className="task-item__step">{task.step}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main: Style grid + input ── */}
      <main className="main">
        {/* Style grid — all 12 at once */}
        <section className="style-grid-section">
          <div className="style-grid-header">
            <span className="style-grid-header__label">Choose a style</span>
            <span className="style-grid-header__selected">
              {STYLE_PRESETS.find(s => s.id === selectedStyle)?.nameCn}
              {" · "}
              {STYLE_PRESETS.find(s => s.id === selectedStyle)?.name}
            </span>
          </div>

          <div className="style-grid">
            {STYLE_PRESETS.map((style, i) => (
              <button
                key={style.id}
                className={`style-card ${selectedStyle === style.id ? "style-card--selected" : ""}`}
                onClick={() => setSelectedStyle(style.id)}
              >
                {/* Mini preview */}
                <div className="style-card__preview">
                  <StylePreview style={style} index={i + 1} />
                </div>
                {/* Info row */}
                <div className="style-card__info">
                  <span className="style-card__num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="style-card__names">
                    <span className="style-card__name-cn">{style.nameCn}</span>
                    <span className="style-card__name-en">{style.name}</span>
                  </div>
                  {/* Color dots */}
                  <div className="style-card__colors">
                    <span className="color-dot" style={{ background: style.accent }} title={`Accent: ${style.accent}`} />
                    <span className="color-dot" style={{ background: style.bg }} title={`Background: ${style.bg}`} />
                    <span className="color-dot" style={{ background: style.text }} title={`Text: ${style.text}`} />
                  </div>
                </div>
                {/* Selected check */}
                {selectedStyle === style.id && (
                  <div className="style-card__check">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Input section */}
        <section className="input-section">
          <div className="input-card">
            <h2 className="input-title">Generate slides</h2>

            {/* URL / Text toggle */}
            <div className="tab-group">
              <button
                className={`tab ${inputType === "url" ? "tab--active" : ""}`}
                onClick={() => setInputType("url")}
              >
                URL
              </button>
              <button
                className={`tab ${inputType === "text" ? "tab--active" : ""}`}
                onClick={() => setInputType("text")}
              >
                Text
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                inputType === "url"
                  ? "https://github.com/... — paste any URL"
                  : "Paste your content here..."
              }
              className="textarea"
              rows={4}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
            />

            {error && <div className="error-msg">{error}</div>}

            {/* Aspect ratio */}
            <div className="aspect-row">
              <span className="aspect-label">Ratio</span>
              <div className="aspect-group">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.id}
                    className={`aspect-btn ${aspectRatio === r.id ? "aspect-btn--active" : ""}`}
                    onClick={() => setAspectRatio(r.id as "16:9" | "9:16")}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected style summary */}
            <div className="selected-style-row">
              <span className="selected-style-row__label">Style</span>
              <span className="selected-style-row__value">
                {STYLE_PRESETS.find(s => s.id === selectedStyle)?.nameCn}
                {" · "}
                {STYLE_PRESETS.find(s => s.id === selectedStyle)?.name}
              </span>
              <div className="selected-style-row__colors">
                {(() => {
                  const s = STYLE_PRESETS.find(s => s.id === selectedStyle)!;
                  return [s.accent, s.bg, s.text].map((c, i) => (
                    <span key={i} className="color-dot color-dot--lg" style={{ background: c }} />
                  ));
                })()}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="generate-btn"
            >
              {loading ? (
                <>
                  <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41Z"/>
                  </svg>
                  Generate Slides
                </>
              )}
            </button>

            {loading && (
              <p className="input-hint">Track progress in the Tasks panel ↑</p>
            )}
          </div>
        </section>
      </main>

      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0d0d0d;
          --surface: #161614;
          --surface-2: #1e1e1b;
          --border: rgba(212, 165, 116, 0.10);
          --border-hover: rgba(212, 165, 116, 0.30);
          --text: #f0ebe3;
          --text-muted: #7a746a;
          --text-dim: #4a4640;
          --accent: #d4a574;
          --accent-dim: rgba(212, 165, 116, 0.10);
          --accent-glow: rgba(212, 165, 116, 0.20);
          --danger: #c45c4a;
          --success: #5a9a6a;
          --font-body: 'DM Sans', 'Noto Sans SC', system-ui, sans-serif;
          --font-display: 'Fraunces', Georgia, serif;
          --font-mono: 'JetBrains Mono', monospace;
          --radius: 10px;
          --radius-sm: 6px;
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

        /* ── Top bar ── */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.7rem 1.5rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          flex-shrink: 0;
          z-index: 10;
        }

        .topbar__brand { display: flex; align-items: center; gap: 0.6rem; }

        .topbar__logo {
          width: 28px; height: 28px;
          background: var(--accent);
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-size: 14px; font-weight: 800;
          color: #0d0d0d;
        }

        .topbar__title { font-size: 0.86rem; font-weight: 700; color: var(--text); }

        .topbar__right { display: flex; align-items: center; gap: 0.75rem; }

        .topbar__count { font-size: 0.72rem; color: var(--text-muted); }

        .task-pill {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.35rem 0.75rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 100px;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-family: var(--font-body);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .task-pill:hover { border-color: var(--border-hover); color: var(--text); }
        .task-pill--running { background: rgba(212,165,116,0.06); border-color: rgba(212,165,116,0.2); color: var(--accent); }
        .task-pill--done { background: rgba(90,154,106,0.06); border-color: rgba(90,154,106,0.2); color: var(--success); }

        .task-pill__dot {
          width: 5px; height: 5px;
          background: var(--text-dim);
          border-radius: 50%;
        }

        .task-pill__dot--animate { background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }

        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* ── Task dropdown ── */
        .task-dropdown {
          position: fixed;
          top: 48px;
          right: 1.5rem;
          width: 290px;
          background: rgba(18,18,16,0.97);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          backdrop-filter: blur(16px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 200;
          overflow: hidden;
        }

        .task-dropdown__header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.6rem 0.85rem;
          font-size: 0.68rem; color: var(--text-muted);
          border-bottom: 1px solid var(--border);
          text-transform: uppercase; letter-spacing: 0.1em;
        }

        .task-dropdown__clear {
          background: none; border: none; color: var(--danger);
          font-size: 0.68rem; cursor: pointer;
          font-family: var(--font-body);
          text-transform: uppercase; letter-spacing: 0.05em;
        }

        .task-dropdown__empty {
          padding: 1.2rem; text-align: center;
          font-size: 0.8rem; color: var(--text-dim);
        }

        .task-item {
          padding: 0.6rem 0.85rem;
          border-bottom: 1px solid var(--border);
        }

        .task-item:last-child { border-bottom: none; }
        .task-item--generating { background: rgba(212,165,116,0.04); }
        .task-item--done { background: rgba(90,154,106,0.03); }
        .task-item--error { background: rgba(196,92,74,0.04); }

        .task-item__row {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 0.3rem;
        }

        .task-item__id { font-size: 0.65rem; color: var(--text-dim); font-family: var(--font-mono); }
        .task-item__pct { font-size: 0.65rem; color: var(--accent); font-weight: 600; font-family: var(--font-mono); }
        .task-item__link { font-size: 0.65rem; color: var(--success); text-decoration: none; font-weight: 600; }
        .task-item__error { font-size: 0.65rem; color: var(--danger); font-weight: 600; }

        .task-item__bar {
          height: 2px; background: rgba(255,255,255,0.06);
          border-radius: 1px; overflow: hidden;
          margin-bottom: 0.3rem;
        }

        .task-item__bar div {
          height: 100%; background: var(--accent);
          transition: width 0.4s;
        }

        .task-item__step { font-size: 0.75rem; color: var(--text-muted); }

        /* ── Main layout ── */
        .main {
          display: grid;
          grid-template-columns: 1fr 340px;
          flex: 1;
          overflow: hidden;
        }

        /* ── Style grid ── */
        .style-grid-section {
          border-right: 1px solid var(--border);
          padding: 1.25rem 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .style-grid-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .style-grid-header__label {
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 600;
        }

        .style-grid-header__selected {
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        .style-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 0.6rem;
        }

        .style-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          cursor: pointer;
          transition: all 0.15s;
          text-align: left;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .style-card:hover {
          border-color: var(--border-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }

        .style-card--selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent-glow);
        }

        .style-card__preview {
          height: 110px;
          overflow: hidden;
          position: relative;
        }

        .style-card__info {
          padding: 0.55rem 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-top: 1px solid var(--border);
        }

        .style-card__num {
          font-size: 0.6rem;
          color: var(--text-dim);
          font-family: var(--font-mono);
          font-weight: 600;
          flex-shrink: 0;
        }

        .style-card__names {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.05rem;
        }

        .style-card__name-cn {
          font-size: 0.72rem;
          color: var(--text);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .style-card__name-en {
          font-size: 0.6rem;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .style-card__colors {
          display: flex;
          gap: 0.25rem;
          flex-shrink: 0;
        }

        .style-card__check {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 18px;
          height: 18px;
          background: var(--accent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ── Color dots ── */
        .color-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.08);
        }

        .color-dot--lg {
          width: 12px; height: 12px;
        }

        /* ── Input section ── */
        .input-section {
          padding: 1.25rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .input-card {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .input-title {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        /* ── Tabs ── */
        .tab-group { display: flex; gap: 0.35rem; }

        .tab {
          padding: 0.4rem 0.85rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.8rem;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }

        .tab:hover { border-color: var(--border-hover); color: var(--text); }
        .tab--active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

        /* ── Textarea ── */
        .textarea {
          width: 100%;
          padding: 0.75rem 0.9rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text);
          font-size: 0.85rem;
          font-family: var(--font-body);
          resize: none;
          outline: none;
          transition: border-color 0.15s;
          line-height: 1.6;
        }

        .textarea::placeholder { color: var(--text-dim); }
        .textarea:focus { border-color: var(--border-hover); }

        /* ── Error ── */
        .error-msg {
          font-size: 0.75rem;
          color: var(--danger);
          padding: 0.45rem 0.7rem;
          background: rgba(196,92,74,0.08);
          border: 1px solid rgba(196,92,74,0.15);
          border-radius: var(--radius-sm);
        }

        /* ── Aspect ── */
        .aspect-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .aspect-label { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }

        .aspect-group { display: flex; gap: 0.3rem; }

        .aspect-btn {
          padding: 0.35rem 0.7rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.72rem;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.15s;
          font-weight: 500;
        }

        .aspect-btn:hover { border-color: var(--border-hover); color: var(--text); }
        .aspect-btn--active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

        /* ── Selected style row ── */
        .selected-style-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 0.75rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
        }

        .selected-style-row__label {
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          flex-shrink: 0;
        }

        .selected-style-row__value {
          font-size: 0.75rem;
          color: var(--text);
          font-weight: 500;
          flex: 1;
        }

        .selected-style-row__colors {
          display: flex;
          gap: 0.3rem;
          align-items: center;
        }

        /* ── Generate ── */
        .generate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.8rem;
          background: var(--accent);
          border: none;
          border-radius: var(--radius);
          color: #0d0d0d;
          font-size: 0.92rem;
          font-weight: 700;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all 0.2s;
        }

        .generate-btn:hover:not(:disabled) {
          background: #e8c49a;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px var(--accent-glow);
        }

        .generate-btn:disabled {
          opacity: 0.6; cursor: not-allowed; transform: none;
        }

        .input-hint {
          font-size: 0.7rem;
          color: var(--text-dim);
          text-align: center;
          margin: 0;
        }

        /* ── Spinner ── */
        .spinner { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 2px; }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          html, body { overflow: auto; }
          .main { grid-template-columns: 1fr; }
          .style-grid-section { border-right: none; border-bottom: 1px solid var(--border); }
          .input-section { padding-bottom: 2rem; }
          .style-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
        }
      `}</style>
    </div>
  );
}

/* ── Embedded mini previews (CSS-only, no iframe) ── */
function StylePreview({ style, index }: { style: typeof STYLE_PRESETS[0]; index: number }) {
  const n = String(index).padStart(2, "0");

  const previews: Record<string, React.ReactNode> = {
    "bold-signal": (
      <div style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "Archivo Black, sans-serif", fontSize: "1.4rem", color: "rgba(255,255,255,0.12)", fontWeight: 900 }}>{n}</div>
        <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, background: "#FF5722", padding: "8px 10px", borderRadius: 2 }}>
          <div style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "0.75rem", color: "#1a1a1a", fontWeight: 900, lineHeight: 1.1 }}>Slide Title</div>
          <div style={{ fontSize: "0.4rem", color: "rgba(26,26,26,0.7)", marginTop: 2 }}>Subtitle · 2024</div>
        </div>
      </div>
    ),
    "electric-studio": (
      <div style={{ background: "#0a0a0a", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: "45%", background: "#0a0a0a", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: "#4361ee" }} />
          <div style={{ position: "absolute", top: 8, left: 10, fontSize: "0.4rem", color: "#4361ee", fontWeight: 800, letterSpacing: "0.1em" }}>01 · SLIDE</div>
          <div style={{ position: "absolute", top: 22, left: 10, fontFamily: "Manrope, sans-serif", fontSize: "1.3rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>Slide<br/>Title</div>
        </div>
        <div style={{ height: "55%", background: "#ffffff", padding: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.38rem", color: "#0a0a0a", lineHeight: 1.5 }}>Content text goes here</div>
          <div style={{ fontSize: "0.3rem", color: "#888", marginTop: 4 }}>Meta · 2024</div>
        </div>
      </div>
    ),
    "creative-voltage": (
      <div style={{ background: "#1a1a2e", width: "100%", height: "100%", display: "flex" }}>
        <div style={{ width: "42%", background: "#0066ff", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "5px 5px" }} />
          <div style={{ position: "absolute", top: 6, left: 8, fontFamily: "Space Mono, monospace", fontSize: "0.35rem", fontWeight: 700, background: "#d4ff00", color: "#1a1a2e", padding: "1px 4px" }}>01</div>
          <div style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)", padding: "0 6px", fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            Slide<br/><span style={{ color: "#d4ff00" }}>Title</span>
          </div>
        </div>
        <div style={{ width: "58%", padding: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.3rem", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>// content</div>
          <div style={{ fontSize: "0.38rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            Key point with <strong style={{ color: "#d4ff00" }}>highlight</strong>
          </div>
        </div>
      </div>
    ),
    "dark-botanical": (
      <div style={{ background: "#0f0f0f", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40%", right: "-20%", width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(212,165,116,0.25) 0%, transparent 70%)", filter: "blur(18px)" }} />
        <div style={{ position: "absolute", bottom: "-30%", left: "-15%", width: 130, height: 130, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(232,180,184,0.2) 0%, transparent 70%)", filter: "blur(20px)" }} />
        <div style={{ position: "absolute", top: "15%", bottom: "15%", left: 12, width: 1, background: "linear-gradient(to bottom, transparent, #d4a574, transparent)" }} />
        <div style={{ position: "absolute", top: "50%", left: 20, transform: "translateY(-50%)" }}>
          <div style={{ fontSize: "0.3rem", color: "#d4a574", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 4 }}>01 · Slide</div>
          <div style={{ fontFamily: "Cormorant, serif", fontSize: "1.1rem", fontWeight: 400, lineHeight: 1.1, color: "#e8e4df" }}>Slide <em style={{ fontStyle: "italic", color: "#e8b4b8" }}>Title</em></div>
          <div style={{ fontSize: "0.35rem", color: "#9a9590", marginTop: 5, lineHeight: 1.5 }}>Subtitle text here</div>
        </div>
      </div>
    ),
    "neon-cyber": (
      <div style={{ background: "#0a0f1c", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,255,204,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,204,0.04) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
        <div style={{ position: "absolute", top: "-50%", left: "20%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,255,204,0.12) 0%, rgba(255,0,170,0.06) 50%, transparent 70%)", filter: "blur(16px)" }} />
        <div style={{ position: "absolute", top: 6, left: 8, fontSize: "0.3rem", fontWeight: 700, color: "#00ffcc", textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 16, height: 2, background: "#00ffcc", boxShadow: "0 0 6px #00ffcc", display: "inline-block" }} />
          01 · Slide
        </div>
        <div style={{ position: "absolute", top: "40%", left: 8, fontFamily: "Manrope, sans-serif", fontSize: "1.3rem", fontWeight: 800, color: "#e0e8ff", lineHeight: 0.95 }}>
          <span style={{ color: "#00ffcc", textShadow: "0 0 15px rgba(0,255,204,0.4)" }}>Slide</span><br/>
          <span style={{ color: "#ff00aa", textShadow: "0 0 15px rgba(255,0,170,0.4)" }}>Title</span>
        </div>
        <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 10 }}>
          <div><div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#00ffcc" }}>01</div><div style={{ fontSize: "0.25rem", color: "rgba(224,232,255,0.4)", textTransform: "uppercase" }}>Slide</div></div>
          <div><div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#00ffcc" }}>02</div><div style={{ fontSize: "0.25rem", color: "rgba(224,232,255,0.4)", textTransform: "uppercase" }}>Slide</div></div>
        </div>
      </div>
    ),
    "terminal-green": (
      <div style={{ background: "#0d1117", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}>
        <div style={{ width: "92%", background: "#161b22", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 6px", background: "#1c2128", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff5f56" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffbd2e" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#27c93f" }} />
            <div style={{ flex: 1, textAlign: "center", fontSize: "0.28rem", color: "#7d8590" }}>slide_01.md</div>
          </div>
          <div style={{ padding: "5px 6px" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.35rem" }}>$</span>
              <span style={{ fontSize: "0.32rem", color: "#e6edf3" }}>title: Slide 01</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.35rem" }}>$</span>
              <span style={{ fontSize: "0.32rem", color: "#7d8590" }}><span style={{ color: "#79c0ff" }}>→</span> content here</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <span style={{ color: "#39d353", fontWeight: 700, fontSize: "0.35rem" }}>$</span>
              <span style={{ display: "inline-block", width: 4, height: 7, background: "#39d353", verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    "notebook-tabs": (
      <div style={{ background: "#2d2d2d", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "88%", height: "82%", background: "#f8f6f1", borderRadius: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", padding: "8px 8px 8px 22px", position: "relative" }}>
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 6, height: 36, background: "repeating-linear-gradient(to bottom, transparent 0, transparent 5px, #2d2d2d 5px, #2d2d2d 8px, transparent 8px, transparent 13px)" }} />
          <div style={{ position: "absolute", right: -2, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            {[14, 22, 10, 18, 12].map((h, i) => (
              <div key={i} style={{ width: 5, height: h, borderRadius: "2px 0 0 2px", background: ["#98d4bb","#c7b8ea","#f4b8c5","#a8d8ea","#ffe6a7"][i] }} />
            ))}
          </div>
          <div style={{ fontSize: "0.28rem", color: "#c7b8ea", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>01 · Slide</div>
          <div style={{ fontFamily: "Bodoni Moda, serif", fontSize: "0.85rem", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>
            Slide <em style={{ fontStyle: "italic", color: "#f4b8c5" }}>Title</em>
          </div>
          <div style={{ fontSize: "0.3rem", color: "#888", marginTop: 3, lineHeight: 1.4 }}>Subtitle text</div>
          <div style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 6 }}>
            {[["Code","130"],["Tools","01"],["Core","Loop"]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <span style={{ fontSize: "0.22rem", color: "#bbb", textTransform: "uppercase" }}>{l}</span>
                <span style={{ fontSize: "0.3rem", fontWeight: 500, color: "#1a1a1a" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    "pastel-geometry": (
      <div style={{ background: "#c8d9e6", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "88%", height: "82%", background: "#faf9f7", borderRadius: 6, boxShadow: "0 3px 12px rgba(0,0,0,0.08)", padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
              <span style={{ fontSize: "0.28rem", fontWeight: 700, padding: "1px 5px", borderRadius: 10, background: "#f0b4d4", color: "#7a3a5a" }}>01</span>
              <span style={{ fontSize: "0.28rem", fontWeight: 700, padding: "1px 5px", borderRadius: 10, background: "#a8d4c4", color: "#3a6a5a" }}>Slide</span>
            </div>
            <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: "0.85rem", fontWeight: 800, color: "#1a1a1a", lineHeight: 1.1 }}>Title</div>
            <div style={{ fontSize: "0.3rem", color: "#888", marginTop: 2 }}>Subtitle</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, justifyContent: "center", height: "100%" }}>
            {[18, 30, 15, 26, 22].map((h, i) => (
              <div key={i} style={{ width: 14, height: h, borderRadius: 3, background: ["#f0b4d4","#a8d4c4","#5a7c6a","#9b8dc4","#7c6aad"][i] }} />
            ))}
          </div>
        </div>
      </div>
    ),
    "split-pastel": (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <div style={{ width: "50%", background: "#f5e6dc", padding: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: "0.3rem", fontWeight: 700, color: "#8a6a50", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>01 · Slide</div>
          <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "1rem", fontWeight: 800, color: "#1a1a1a", lineHeight: 0.95 }}>
            Slide<br/><span style={{ color: "#9b6ea0" }}>Title</span>
          </div>
        </div>
        <div style={{ width: "50%", background: "#e4dff0", position: "relative", padding: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(100,80,150,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(100,80,150,0.06) 1px, transparent 1px)", backgroundSize: "10px 10px" }} />
          {[["badge-m","#c8f0d8","#3a6a4a","130"],["badge-y","#f0f0c8","#6a6a3a","LOC"],["badge-p","#f0d4e0","#7a4a5a","01"]].map(([cls, bg, c, t]) => (
            <div key={cls as string} style={{ fontSize: "0.28rem", padding: "1px 6px", borderRadius: 20, marginBottom: 2, background: bg as string, color: c as string, fontWeight: 700, display: "inline-block" }}>{t}</div>
          ))}
          <div style={{ fontSize: "0.32rem", color: "#666", marginTop: 2, lineHeight: 1.4 }}>Content goes here</div>
        </div>
      </div>
    ),
    "vintage-editorial": (
      <div style={{ background: "#f5f3ee", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", width: 50, height: 50, border: "2px solid #e8d4c0", borderRadius: "50%", top: 6, right: 6 }} />
        <div style={{ position: "absolute", width: 35, height: 2, background: "#e8d4c0", bottom: 10, left: 6, transform: "rotate(-30deg)" }} />
        <div style={{ position: "absolute", width: 5, height: 5, background: "#e8d4c0", borderRadius: "50%", bottom: 14, right: 8 }} />
        <div style={{ textAlign: "center", maxWidth: "85%" }}>
          <div style={{ fontSize: "0.25rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>01 · Slide</div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em", color: "#1a1a1a" }}>
            Slide<span style={{ display: "block", fontSize: "0.38em", color: "#888", fontWeight: 700, letterSpacing: "0.08em" }}>Title</span>
          </div>
          <div style={{ fontSize: "0.32rem", color: "#888", marginTop: 5, lineHeight: 1.5 }}>Subtitle text here</div>
          <div style={{ display: "inline-block", border: "1.5px solid #1a1a1a", padding: "2px 8px", fontSize: "0.28rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a1a1a", marginTop: 6 }}>Read more</div>
        </div>
      </div>
    ),
    "swiss-modern": (
      <div style={{ background: "#ffffff", width: "100%", height: "100%", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#ff3300" }} />
        <div style={{ position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)", fontFamily: "Archivo Black, sans-serif", fontSize: "5rem", fontWeight: 900, color: "rgba(0,0,0,0.04)", lineHeight: 1 }}>{n}</div>
        <div style={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)" }}>
          <div style={{ fontSize: "0.3rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.15em", color: "#ff3300", marginBottom: 3 }}>01 · Slide</div>
          <div style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "1.5rem", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.02em" }}>SLIDE<br/>TITLE</div>
          <div style={{ fontSize: "0.35rem", color: "#444", marginTop: 5, lineHeight: 1.5, maxWidth: "30ch" }}>Subtitle text</div>
        </div>
        <div style={{ position: "absolute", bottom: 8, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {[["01","Slide"],["02","Content"]].map(([v, l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Archivo Black, sans-serif", fontSize: "0.85rem", color: "#000" }}>{v}</span>
              <span style={{ fontSize: "0.25rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#aaa" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    "paper-ink": (
      <div style={{ background: "#faf9f7", width: "100%", height: "100%", position: "relative" }}>
        <div style={{ position: "absolute", top: 10, left: 12, right: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "0.25rem", fontWeight: 500, color: "#6b6560", textTransform: "uppercase", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>01 · Slide</span>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #c41e3a, transparent)" }} />
        </div>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", width: "88%" }}>
          <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "1.4rem", fontWeight: 400, lineHeight: 1, marginBottom: 5 }}>
            Slide <em style={{ fontStyle: "italic", color: "#c41e3a" }}>Title</em>
          </div>
          <div style={{ fontSize: "0.32rem", color: "#6b6560", lineHeight: 1.6 }}>Content subtitle text</div>
        </div>
        <div style={{ position: "absolute", top: 8, right: 10, maxWidth: "16ch", textAlign: "right" }}>
          <blockquote style={{ fontFamily: "Cormorant Garamond, serif", fontSize: "0.32rem", fontStyle: "italic", color: "#6b6560", borderRight: "1.5px solid #c41e3a", paddingRight: 5, margin: 0 }}>"Quote"</blockquote>
        </div>
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #c41e3a)" }} />
          <span style={{ fontSize: "0.25rem", fontWeight: 500, color: "#6b6560", letterSpacing: "0.06em" }}>01 / 2024</span>
        </div>
      </div>
    ),
  };

  return previews[style.id] || (
    <div style={{ background: style.bg, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 800, color: style.accent }}>{n}</span>
    </div>
  );
}
