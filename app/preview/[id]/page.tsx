"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface GenerationState {
  status: "loading" | "done" | "error";
  skill: string;
  step: string;
  progress: number;
  htmlPath?: string;
  error?: string;
}

const SKILL_LABELS: Record<string, { name: string; icon: string; desc: string }> = {
  "agent-browser": {
    name: "agent-browser",
    icon: "🌐",
    desc: "正在用无头浏览器抓取页面内容",
  },
  "baoyu-url-to-markdown": {
    name: "baoyu-url-to-markdown",
    icon: "📄",
    desc: "正在将 URL 转成 Markdown",
  },
  "ljg-writes": {
    name: "ljg-writes",
    icon: "✍️",
    desc: "正在规划内容结构与旁白",
  },
  "frontend-slides": {
    name: "frontend-slides",
    icon: "🎨",
    desc: "正在生成 HTML 幻灯片",
  },
  "remotion-video": {
    name: "remotion-video",
    icon: "🎬",
    desc: "正在生成动画视频",
  },
};

export default function PreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [state, setState] = useState<GenerationState>({
    status: "loading",
    skill: "",
    step: "Connecting...",
    progress: 5,
  });
  const [showHtml, setShowHtml] = useState<string>("");
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    // Generate floating particles for atmosphere
    const p = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 4,
      duration: Math.random() * 6 + 4,
    }));
    setParticles(p);
  }, []);

  useEffect(() => {
    if (!id) return;
    let eventSource: EventSource;

    async function startGeneration() {
      try {
        setState({ status: "loading", skill: "", step: "Connecting...", progress: 5 });
        eventSource = new EventSource("/api/generate/sse?id=" + id);

        eventSource.onmessage = (e) => {
          const data = JSON.parse(e.data);

          if (data.type === "progress") {
            setState({
              status: "loading",
              skill: data.skill || "",
              step: data.step || "Working...",
              progress: data.progress || 50,
            });
          } else if (data.type === "done") {
            setState({
              status: "done",
              skill: "",
              step: "Done!",
              progress: 100,
              htmlPath: data.htmlPath,
            });
            eventSource.close();
            setTimeout(() => setShowHtml(data.htmlPath || ""), 600);
          } else if (data.type === "error") {
            setState({
              status: "error",
              skill: "",
              step: "Failed",
              progress: 0,
              error: data.message,
            });
            eventSource.close();
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          pollResult();
        };
      } catch (e: any) {
        setState({ status: "error", skill: "", step: "Start failed", progress: 0, error: e.message });
      }
    }

    async function pollResult() {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/generate/result/" + id);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "done") {
              clearInterval(interval);
              setState({
                status: "done",
                skill: "",
                step: "Done!",
                progress: 100,
                htmlPath: data.htmlPath,
              });
              setShowHtml(data.htmlPath || "");
            } else if (data.status === "error") {
              clearInterval(interval);
              setState({ status: "error", skill: "", step: "Failed", progress: 0, error: data.error });
            } else {
              setState((prev) => ({
                ...prev,
                skill: data.skill || prev.skill,
                step: data.step || prev.step,
                progress: data.progress || prev.progress,
              }));
            }
          }
        } catch {}
      }, 2000);
      setTimeout(() => clearInterval(interval), 300000);
    }

    startGeneration();
    return () => eventSource?.close();
  }, [id]);

  const currentSkill = state.skill
    ? SKILL_LABELS[state.skill] || { name: state.skill, icon: "⚙️", desc: state.step }
    : null;

  return (
    <div className="preview-root">
      {/* Atmospheric particles */}
      <div className="particles" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Top progress line */}
      <div className="progress-track" aria-hidden="true">
        <div
          className={`progress-fill ${state.status === "error" ? "progress-fill--error" : ""}`}
          style={{ width: `${state.progress}%` }}
        />
      </div>

      {/* Loading state */}
      {state.status === "loading" && (
        <div className="loading-screen">
          <div className="loading-content">
            {/* Orb / logo mark */}
            <div className="loading-orb">
              <div className="loading-orb__inner" />
              <div className="loading-orb__ring" />
              {currentSkill && (
                <div className="loading-orb__skill">
                  <span className="loading-orb__skill-icon">{currentSkill.icon}</span>
                </div>
              )}
            </div>

            {/* Skill callout */}
            {currentSkill && (
              <div className="skill-callout">
                <div className="skill-callout__tag">
                  <span className="skill-callout__pulse" />
                  Calling Skill
                </div>
                <div className="skill-callout__name">{currentSkill.name}</div>
                <div className="skill-callout__desc">{currentSkill.desc}</div>
              </div>
            )}

            {/* Step + progress */}
            <div className="loading-progress">
              <p className="loading-step">{state.step}</p>
              <div className="loading-bar">
                <div
                  className="loading-bar__fill"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <span className="loading-pct">{state.progress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <div className="error-screen">
          <div className="error-content">
            <div className="error-icon">
              <WarningIcon />
            </div>
            <h2 className="error-title">Generation Failed</h2>
            <p className="error-msg">{state.error || "An unknown error occurred."}</p>
            <button onClick={() => router.push("/")} className="error-btn">
              <ArrowLeftIcon />
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Done (before iframe loads) */}
      {state.status === "done" && !showHtml && (
        <div className="done-screen">
          <div className="done-content">
            <div className="done-check">
              <CheckBigIcon />
            </div>
            <h2 className="done-title">Slides Ready</h2>
            <p className="done-sub">Loading your presentation...</p>
          </div>
        </div>
      )}

      {/* HTML iframe */}
      {showHtml && (
        <iframe
          src={showHtml}
          className="preview-iframe"
          title="Slide preview"
          sandbox="allow-scripts allow-same-origin"
        />
      )}

      {/* Action bar */}
      {state.status === "done" && showHtml && (
        <div className="action-bar">
          <a href={showHtml} download className="action-btn action-btn--primary">
            <DownloadIcon />
            Download HTML
          </a>
          <button onClick={() => router.push("/")} className="action-btn action-btn--ghost">
            <PlusIcon />
            New Slide
          </button>
        </div>
      )}

      <style>{`
        /* ── Root ── */
        .preview-root {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          position: relative;
          overflow: hidden;
        }

        /* ── Particles ── */
        .particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .particle {
          position: absolute;
          background: var(--accent);
          border-radius: 50%;
          opacity: 0;
          animation: particle-float linear infinite;
        }

        @keyframes particle-float {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0.5);
          }
          20% {
            opacity: 0.15;
          }
          80% {
            opacity: 0.08;
          }
          100% {
            opacity: 0;
            transform: translateY(-40px) scale(1);
          }
        }

        /* ── Progress track ── */
        .progress-track {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(212, 165, 116, 0.08);
          z-index: 200;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), var(--accent-light));
          transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .progress-fill--error {
          background: var(--danger);
        }

        /* ── Loading screen ── */
        .loading-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2.5rem;
          text-align: center;
          padding: 2rem;
          max-width: 440px;
          animation: fadeUp 0.6s var(--ease-out);
        }

        /* Orb */
        .loading-orb {
          position: relative;
          width: 88px;
          height: 88px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .loading-orb__inner {
          width: 48px;
          height: 48px;
          background: var(--accent);
          border-radius: 50%;
          animation: orb-pulse 2s ease-in-out infinite;
        }

        .loading-orb__ring {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(212, 165, 116, 0.2);
          border-radius: 50%;
          animation: ring-expand 2s ease-out infinite;
        }

        @keyframes orb-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 var(--accent-glow);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 24px 6px var(--accent-glow);
          }
        }

        @keyframes ring-expand {
          0% {
            transform: scale(0.8);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }

        .loading-orb__skill {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 28px;
          height: 28px;
          background: var(--surface-2);
          border: 1px solid var(--border-hover);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          animation: float 3s ease-in-out infinite;
        }

        .loading-orb__skill-icon {
          line-height: 1;
        }

        /* Skill callout */
        .skill-callout {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }

        .skill-callout__tag {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.65rem;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .skill-callout__pulse {
          width: 6px;
          height: 6px;
          background: var(--accent);
          border-radius: 50%;
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        .skill-callout__name {
          font-family: var(--font-mono);
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--accent-light);
          letter-spacing: 0.02em;
        }

        .skill-callout__desc {
          font-size: 0.82rem;
          color: var(--text-muted);
        }

        /* Progress */
        .loading-progress {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          max-width: 280px;
        }

        .loading-step {
          font-size: 0.88rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
        }

        .loading-bar {
          width: 100%;
          height: 2px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 1px;
          overflow: hidden;
        }

        .loading-bar__fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), var(--accent-light));
          border-radius: 1px;
          transition: width 0.5s var(--ease-out);
        }

        .loading-pct {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: var(--text-dim);
        }

        /* ── Error screen ── */
        .error-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .error-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
          padding: 2rem;
          max-width: 400px;
          animation: fadeUp 0.5s var(--ease-out);
        }

        .error-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(196, 92, 74, 0.1);
          border: 1px solid rgba(196, 92, 74, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--danger);
          margin-bottom: 0.5rem;
        }

        .error-title {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .error-msg {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.6;
          max-width: 320px;
        }

        .error-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
          padding: 0.65rem 1.4rem;
          background: var(--surface);
          border: 1px solid var(--border-hover);
          border-radius: var(--radius-md);
          color: var(--text);
          font-size: 0.88rem;
          font-family: var(--font-body);
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
        }

        .error-btn:hover {
          background: var(--accent-dim);
          border-color: var(--accent);
          color: var(--accent);
        }

        /* ── Done screen ── */
        .done-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }

        .done-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          text-align: center;
          animation: fadeUp 0.5s var(--ease-out);
        }

        .done-check {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(90, 154, 106, 0.1);
          border: 1px solid rgba(90, 154, 106, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--success);
          margin-bottom: 0.5rem;
          animation: done-pop 0.5s var(--ease-spring);
        }

        @keyframes done-pop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        .done-title {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .done-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        /* ── Preview iframe ── */
        .preview-iframe {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          border: none;
          z-index: 100;
          animation: fadeIn 0.4s var(--ease-out);
        }

        /* ── Action bar ── */
        .action-bar {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          display: flex;
          gap: 0.6rem;
          z-index: 300;
          animation: fadeUp 0.5s var(--ease-out) 0.3s both;
        }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.6rem 1.1rem;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-weight: 600;
          font-family: var(--font-body);
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
          text-decoration: none;
          border: 1px solid transparent;
        }

        .action-btn--primary {
          background: var(--accent);
          color: #0d0d0d;
          border-color: var(--accent);
        }

        .action-btn--primary:hover {
          background: var(--accent-light);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px var(--accent-glow);
        }

        .action-btn--ghost {
          background: rgba(22, 22, 20, 0.9);
          color: var(--text-muted);
          border-color: var(--border);
          backdrop-filter: blur(8px);
        }

        .action-btn--ghost:hover {
          border-color: var(--border-hover);
          color: var(--text);
          background: var(--surface);
        }

        /* ── Animations ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        @keyframes pulse-glow {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--accent-glow); }
          50% { opacity: 0.8; box-shadow: 0 0 8px 2px var(--accent-glow); }
        }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .action-bar {
            bottom: 1rem;
            right: 1rem;
            left: 1rem;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Icon Components ── */
function CheckBigIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
