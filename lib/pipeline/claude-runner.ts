// input:  prompt string or file path, execution options (timeout, cwd)
// output: structured result { success, stdout, stderr, exitCode }
// pos:    底层 Claude Code CLI 调用封装，Pipeline 的每一步都通过它执行
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import path from "path";

export interface ClaudeRunnerOptions {
  /** 工作目录，默认 process.cwd() */
  cwd?: string;
  /** 超时毫秒数，默认 180000 (3min) */
  timeout?: number;
  /** 附加参数 */
  extraArgs?: string[];
  /** 进度回调，每收到 stdout 数据时触发 */
  onStdout?: (chunk: string) => void;
  /** stderr 回调 */
  onStderr?: (chunk: string) => void;
}

export interface ClaudeRunnerResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * 检测 Claude Code CLI 的路径
 * 优先用 PATH 中的 claude，fallback 到 homebrew 路径
 */
function findClaudeBin(): string {
  const candidates = [
    "claude",
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    path.join(process.env.HOME || "~", ".local/bin/claude"),
  ];

  for (const bin of candidates) {
    try {
      const { execSync } = require("child_process");
      execSync(`${bin} --version`, { stdio: "ignore", timeout: 5000 });
      return bin;
    } catch {
      // try next
    }
  }

  // 默认返回 claude，让 spawn 自己报错
  return "claude";
}

let _claudeBin: string | null = null;

function getClaudeBin(): string {
  if (!_claudeBin) {
    _claudeBin = findClaudeBin();
  }
  return _claudeBin;
}

/**
 * 调用 Claude Code CLI 执行 prompt
 *
 * 用法：
 *   await callClaude("请读取 SKILL.md 并做 XXX", { timeout: 180000 })
 *
 * 内部逻辑：
 * 1. 将 prompt 写入临时文件
 * 2. spawn: claude --print --no-session-persistence --dangerously-skip-permissions --model sonnet < prompt.txt
 * 3. 收集 stdout / stderr
 * 4. 超时保护
 * 5. 清理临时文件
 */
export async function callClaude(
  prompt: string,
  options: ClaudeRunnerOptions = {}
): Promise<ClaudeRunnerResult> {
  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout || 180_000; // 3 min default

  // 写 prompt 到临时文件
  const promptFile = path.join(cwd, `.claude-pipeline/.prompt-${Date.now()}.txt`);
  writeFileSync(promptFile, prompt, "utf-8");

  try {
    return await runClaudeProcess(promptFile, cwd, timeout, options);
  } finally {
    // 清理 prompt 临时文件
    try {
      if (existsSync(promptFile)) unlinkSync(promptFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

function runClaudeProcess(
  promptFile: string,
  cwd: string,
  timeout: number,
  options: ClaudeRunnerOptions
): Promise<ClaudeRunnerResult> {
  return new Promise((resolve, reject) => {
    const claudeBin = getClaudeBin();

    const args = [
        "--bare",
        "--print",
        "--no-session-persistence",
        "--dangerously-skip-permissions",
        "--model",
        "sonnet",
    ];
    if (options.extraArgs) {
        args.push(...options.extraArgs);
    }

    const proc = spawn(
      claudeBin,
      args,
      {
        cwd,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`
        },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });

    const promptText = readFileSync(promptFile, "utf-8");
    proc.stdin.write(promptText);
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      // 给进程 5 秒优雅退出
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 5000);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: stderr + "\n[claude-runner] Timeout after " + (timeout / 1000) + "s",
      });
    }, timeout);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      const exitCode = code ?? 1;
      resolve({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
      });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: stderr + "\n[claude-runner] Process error: " + err.message,
      });
    });
  });
}
