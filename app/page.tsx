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
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    setTasks(getTasks());
    const handleResize = () => {
      const container = document.getElementById("preview-container");
      if (container) setPreviewScale(container.clientWidth / 400);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Poll SSE for running tasks
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

  const selectedPreset = STYLE_PRESETS.find((s) => s.id === selectedStyle)!;
  const runningCount = tasks.filter((t) => t.status === "generating").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <main>
      {/* ============================================
          TASK LIST FLOATING WIDGET
          ============================================ */}
      <div style={{ position: "fixed", top: "1rem", left: "1rem", zIndex: 1000 }}>
        <button
          onClick={() => setShowTaskList((v) => !v)}
          className="task-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.4rem 0.85rem",
            background: runningCount > 0 ? "var(--accent-dim)" : "var(--surface)",
            border: "1px solid " + (runningCount > 0 ? "var(--border-hover)" : "var(--border)"),
            borderRadius: "20px",
            color: runningCount > 0 ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.78rem",
            fontFamily: "inherit",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s",
          }}
        >
          <span>📋</span>
          <span style={{ fontWeight: 600 }}>Tasks</span>
          {runningCount > 0 && (
            <span className="task-badge-running">{runningCount}</span>
          )}
          {doneCount > 0 && !runningCount && (
            <span className="task-badge-done">{doneCount}</span>
          )}
        </button>

        {showTaskList && (
          <div className="task-dropdown">
            <div className="task-dropdown-header">
              {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
            </div>
            {tasks.length === 0 && (
              <div style={{ padding: "1.2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No tasks yet
              </div>
            )}
            {[...tasks].reverse().map((task) => (
              <div key={task.id} className={
                task.status === "generating" ? "task-item task-running" :
                task.status === "done" ? "task-item task-done" :
                "task-item task-error"
              }>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "monospace" }}>#{task.id}</span>
                  {task.status === "generating" && <span className="task-pct">{task.progress}%</span>}
                  {task.status === "done" && (
                    <a href={"/preview/" + task.id} target="_blank" rel="noopener" onClick={() => setShowTaskList(false)}
                      style={{ fontSize: "0.65rem", color: "#3fc878", textDecoration: "none", fontWeight: 600 }}>Open ↗</a>
                  )}
                  {task.status === "error" && <span style={{ fontSize: "0.65rem", color: "#ff6060" }}>Error</span>}
                </div>
                {task.status === "generating" && (
                  <div className="task-progress-bar">
                    <div className="task-progress-fill" style={{ width: task.progress + "%" }} />
                  </div>
                )}
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{task.step}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "1.25rem 2.5rem",
        display: "flex", alignItems: "center",
        background: "linear-gradient(to bottom, rgba(13,13,13,0.95) 60%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{
            width: 38, height: 38,
            background: "var(--accent)",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 700, color: "#0d0d0d",
          }}>S</div>
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>Slides Generator</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Claude Code + frontend-slides</div>
          </div>
        </div>
      </nav>

      {/* Hero + content */}
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "7rem 2rem 4rem",
        gap: "2.5rem",
      }}>
        {/* Headline */}
        <div style={{ textAlign: "center", maxWidth: "560px" }}>
          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: 800,
            color: "var(--text)",
            lineHeight: 1.1,
            marginBottom: "0.85rem",
            letterSpacing: "-0.02em",
          }}>
            URL or text →{" "}
            <span style={{ color: "var(--accent)" }}>HTML slides</span>
            <br />in seconds
          </h1>
          <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            输入链接或文本，AI 自动生成专业幻灯片。支持 12 种风格，横屏 16:9 与竖屏 9:16。
          </p>
        </div>

        {/* Style preview */}
        <div style={{ width: "100%", maxWidth: "700px" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.6rem",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Style · {STYLE_PRESETS.findIndex((s) => s.id === selectedStyle) + 1}/{STYLE_PRESETS.length}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {selectedPreset.nameCn} · {selectedPreset.name}
            </div>
          </div>

          {/* iframe preview */}
          <div id="preview-container" style={{
            width: "100%",
            height: "230px",
            background: "#000",
            borderRadius: "10px",
            overflow: "hidden",
            border: "1px solid var(--border)",
            position: "relative",
          }}>
            <iframe
              src={"/styles/" + selectedPreset.file}
              style={{
                width: "400px",
                height: "100%",
                border: "none",
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
              title="Style preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>

        {/* Style grid */}
        <div style={{ width: "100%", maxWidth: "700px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
            gap: "0.5rem",
          }}>
            {STYLE_PRESETS.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                style={{
                  padding: "0.5rem",
                  background: selectedStyle === style.id ? "var(--accent-dim)" : "var(--surface)",
                  border: "1px solid " + (selectedStyle === style.id ? "var(--border-hover)" : "var(--border)"),
                  borderRadius: "8px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                <div style={{
                  width: "100%",
                  height: "38px",
                  borderRadius: "4px",
                  background: style.bg,
                  marginBottom: "0.4rem",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(135deg, ${style.accent}33, ${style.text}11)`,
                  }} />
                </div>
                <div style={{
                  fontSize: "0.62rem",
                  color: selectedStyle === style.id ? "var(--accent)" : "var(--text-muted)",
                  fontWeight: selectedStyle === style.id ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {style.nameCn}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Input card */}
        <div style={{
          width: "100%",
          maxWidth: "640px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "1.5rem",
        }}>
          {/* Input type toggle */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {(["url", "text"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setInputType(type)}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: "1px solid " + (inputType === type ? "var(--accent)" : "var(--border)"),
                  background: inputType === type ? "var(--accent-dim)" : "transparent",
                  color: inputType === type ? "var(--accent)" : "var(--text-muted)",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s",
                }}
              >
                {type === "url" ? "🔗 URL" : "📝 Text"}
              </button>
            ))}
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputType === "url" ? "https://github.com/..." : "Paste your content here..."}
            style={{
              width: "100%",
              minHeight: "100px",
              padding: "0.75rem 1rem",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              color: "var(--text)",
              fontSize: "0.9rem",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--border-hover)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />

          {error && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--danger)" }}>{error}</div>
          )}

          {/* Aspect ratio */}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => setAspectRatio(ratio.id as "16:9" | "9:16")}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  background: aspectRatio === ratio.id ? "var(--accent-dim)" : "transparent",
                  border: "1px solid " + (aspectRatio === ratio.id ? "var(--accent)" : "var(--border)"),
                  borderRadius: "8px",
                  color: aspectRatio === ratio.id ? "var(--accent)" : "var(--text-muted)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {ratio.name}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: "100%",
              marginTop: "1rem",
              padding: "0.85rem",
              background: loading ? "var(--accent-dim)" : "var(--accent)",
              border: "none",
              borderRadius: "10px",
              color: "#0d0d0d",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            {loading ? (
              <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Generating...</>
            ) : (
              <>⚡ Generate Slides</>
            )}
          </button>

          {loading && (
            <div style={{ marginTop: "0.7rem", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
              Check progress in the top-left Tasks panel
            </div>
          )}
        </div>

        <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: "var(--text-muted)", opacity: 0.5 }}>
          Built with Claude Code · frontend-slides skill · Next.js
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .task-toggle:hover { border-color: var(--border-hover) !important; }
        .task-badge-running {
          background: var(--accent);
          color: #0d0d0d;
          border-radius: 10px;
          padding: 0 0.4rem;
          font-size: 0.65rem;
          font-weight: 700;
        }
        .task-badge-done {
          background: rgba(63,200,120,0.2);
          color: #3fc878;
          border-radius: 10px;
          padding: 0 0.4rem;
          font-size: 0.65rem;
          font-weight: 600;
        }
        .task-dropdown {
          margin-top: 0.5rem;
          width: 320px;
          max-height: 480px;
          overflow-y: auto;
          background: rgba(22,22,20,0.97);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.5rem;
          backdrop-filter: blur(16px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .task-dropdown-header {
          padding: 0.3rem 0.5rem;
          margin-bottom: 0.3rem;
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .task-item {
          padding: 0.6rem 0.7rem;
          border-radius: 8px;
          margin-bottom: 0.3rem;
        }
        .task-running { background: var(--accent-dim); border: 1px solid var(--border); }
        .task-done { background: rgba(63,200,120,0.06); border: 1px solid rgba(63,200,120,0.15); }
        .task-error { background: rgba(255,80,80,0.06); border: 1px solid rgba(255,80,80,0.15); }
        .task-pct { font-size: 0.65rem; color: var(--accent); font-weight: 600; }
        .task-progress-bar {
          height: 2px;
          background: rgba(255,255,255,0.08);
          border-radius: 1px;
          margin-bottom: 0.3rem;
          overflow: hidden;
        }
        .task-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), #e8c49a);
          transition: width 0.5s ease;
        }
      `}</style>
    </main>
  );
}
