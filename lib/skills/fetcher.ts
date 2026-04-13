/**
 * 内容抓取 - 用本地 CLI 工具（agent-browser / Claude Code）
 *
 * 优先：agent-browser snapshot（无头浏览器，最可靠）
 * 退回：defuddle.me API
 *
 * 注意：不能在这里直接 execSync，会阻塞 Next.js API route
 */

import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "claude", "skills");
const BUN_BAOYU = path.join(SKILLS_DIR, "baoyu-url-to-markdown", "scripts", "main.ts");

export async function fetchContent(url: string): Promise<string> {
  // GitHub 仓库 → 直接取 raw README（最快）
  if (url.match(/github\.com\/[^/]+\/[^/]+/) && !url.includes("/blob/")) {
    try {
      const readme = await fetchGitHubReadme(url);
      if (readme) return readme;
    } catch (e) {
      console.warn("[fetcher] github readme failed:", e);
    }
  }

  // 尝试 agent-browser（无头 Chrome）
  try {
    const text = await fetchWithAgentBrowser(url);
    if (text && text.trim().length > 50) return text;
  } catch (e) {
    console.warn("[fetcher] agent-browser failed:", e);
  }

  // 退回 defuddle.me
  try {
    return await fetchWithDefuddle(url);
  } catch (e) {
    throw new Error(`无法抓取内容: ${url}`);
  }
}

/**
 * 用 agent-browser CLI 抓取页面文本
 * 返回 accessibility tree 的纯文本
 */
async function fetchWithAgentBrowser(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sessionName = `slides-${Date.now()}`;
    const { exec } = require("child_process");

    let stdout = "";
    let stderr = "";
    let done = false;

    const proc = exec(
      `agent-browser --session ${sessionName} open "${url}" && ` +
      `agent-browser --session ${sessionName} wait 2000 && ` +
      `agent-browser --session ${sessionName} snapshot`,
      { timeout: 40000, maxBuffer: 1024 * 1024 * 5 },
      (err: any, so: string, se: string) => {
        done = true;
        if (err) {
          reject(new Error(`agent-browser error: ${err.message}`));
        } else {
          stdout = so;
          stderr = se;
        }
      }
    );

    // 超时保护
    setTimeout(() => {
      if (!done) {
        proc.kill();
        reject(new Error("agent-browser timeout"));
      }
    }, 45000);

    // 收集 stdout（分批收到）
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // 等进程结束
    proc.on("close", () => {
      done = true;
      try {
        // 尝试解析 JSON
        let text = "";
        try {
          const parsed = JSON.parse(stdout);
          text = extractText(parsed);
        } catch {
          // 不是 JSON，整体当文本
          text = stripAnsi(stdout);
        }
        if (!text || text.length < 50) {
          text = stripAnsi(stderr) || stdout;
        }
        resolve(text || "");
      } catch (e) {
        reject(e);
      } finally {
        // 清理 session
        exec(`agent-browser --session ${sessionName} close`, {
          timeout: 5000,
        }, () => {});
      }
    });
  });
}

/**
 * 从 agent-browser snapshot JSON 中提取纯文本
 */
function extractText(data: any): string {
  if (!data) return "";
  if (typeof data === "string") return data.trim();
  if (data.text) return data.text.trim();
  if (data.content) return typeof data.content === "string"
    ? data.content.trim()
    : extractText(data.content);
  if (Array.isArray(data)) {
    return data.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof data === "object") {
    const parts: string[] = [];
    // 尝试常见字段
    for (const key of ["label", "name", "role", "value", "text", "children"]) {
      if (data[key]) parts.push(extractText(data[key]));
    }
    if (parts.length) return parts.join("\n");
    return Object.values(data).map(extractText).filter(Boolean).join("\n");
  }
  return "";
}

/**
 * 去掉 ANSI 颜色码
 */
function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[mGKHF]/g, "").replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").trim();
}

/**
 * GitHub 仓库直接取 raw README
 */
async function fetchGitHubReadme(repoUrl: string): Promise<string> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("invalid github url");
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");

  const names = ["README.md", "README.zh-CN.md", "README_zh.md", "README_cn.md"];
  const branches = ["main", "master"];

  for (const name of names) {
    for (const branch of branches) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${name}`;
        const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const text = await res.text();
          if (text.trim().length > 50) {
            return `# ${cleanRepo}\n\n${text}`;
          }
        }
      } catch {
        // try next
      }
    }
  }
  throw new Error("no readme found");
}

/**
 * defuddle.me API fallback
 */
async function fetchWithDefuddle(url: string): Promise<string> {
  const res = await fetch(`https://defuddle.md/${encodeURIComponent(url)}`, {
    headers: { Accept: "text/markdown" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`defuddle API error: ${res.status}`);
  const text = await res.text();
  // 去掉 frontmatter
  const bodyStart = text.indexOf("\n---\n");
  if (bodyStart !== -1) {
    const bodyEnd = text.indexOf("\n---", bodyStart + 4);
    if (bodyEnd !== -1) return text.slice(bodyEnd + 4).trim();
    return text.slice(bodyStart + 4).trim();
  }
  return text.trim();
}
