"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
            setTimeout(() => setShowHtml(data.htmlPath || ""), 800);
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

  const currentSkill = state.skill ? (SKILL_LABELS[state.skill] || { name: state.skill, icon: "⚙️", desc: state.step }) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c10", color: "#f0f0f5", fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Top progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", background: "rgba(255,255,255,0.1)", zIndex: 200 }}>
        <div style={{
          height: "100%",
          background: state.status === "error" ? "#ff4444" : "#5b8df0",
          width: state.progress + "%",
          transition: "width 0.5s ease",
        }} />
      </div>

      {/* Main content */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        gap: "1.5rem",
      }}>
        {state.status === "loading" && (
          <>
            {/* Spinner */}
            <div style={{
              width: "56px",
              height: "56px",
              border: "3px solid rgba(91,141,240,0.15)",
              borderTopColor: "#5b8df0",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* Skill name — prominent */}
            {currentSkill && (
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: "0.7rem",
                  color: "rgba(91,141,240,0.7)",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  marginBottom: "0.5rem",
                  fontFamily: "monospace",
                }}>
                  {currentSkill.icon} CALLING SKILL
                </div>
                <div style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#5b8df0",
                  fontFamily: "monospace",
                  marginBottom: "0.3rem",
                }}>
                  {currentSkill.name}
                </div>
                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
                  {currentSkill.desc}
                </div>
              </div>
            )}

            {/* Step description */}
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", margin: 0, maxWidth: "360px", textAlign: "center" }}>
              {state.step}
            </p>

            {/* Progress */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ width: "120px", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ width: state.progress + "%", height: "100%", background: "#5b8df0", transition: "width 0.5s ease" }} />
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.8rem", fontFamily: "monospace" }}>{state.progress}%</span>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <div style={{ fontSize: "3rem" }}>⚠️</div>
            <p style={{ color: "#ff6b6b", fontSize: "1.1rem" }}>Generation Failed</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", maxWidth: "400px", textAlign: "center" }}>{state.error || "Unknown error"}</p>
            <button onClick={() => router.push("/")} style={{
              marginTop: "1rem",
              padding: "0.6rem 1.5rem",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}>Back to Home</button>
          </>
        )}

        {state.status === "done" && !showHtml && (
          <>
            <div style={{ fontSize: "3rem" }}>✅</div>
            <p style={{ color: "#5b8df0", fontSize: "1.1rem" }}>Done!</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" }}>Loading preview...</p>
          </>
        )}
      </div>

      {/* HTML preview */}
      {showHtml && (
        <iframe
          src={showHtml}
          style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", border: "none", zIndex: 100 }}
          title="Slide preview"
          sandbox="allow-scripts allow-same-origin"
        />
      )}

      {/* Action bar after done */}
      {state.status === "done" && showHtml && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", display: "flex", gap: "0.75rem", zIndex: 300 }}>
          <a href={showHtml} download style={{
            padding: "0.6rem 1.2rem",
            background: "#5b8df0",
            borderRadius: "8px",
            color: "#fff",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}>Download HTML</a>
          <button onClick={() => router.push("/")} style={{
            padding: "0.6rem 1.2rem",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "8px",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}>New</button>
        </div>
      )}
    </div>
  );
}
