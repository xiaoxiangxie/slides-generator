import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

interface SrtEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

function parseSrt(content: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const indexLine = lines[0].trim();
    const timeLine = lines[1].trim();
    const textLines = lines.slice(2);

    const index = parseInt(indexLine, 10);
    if (isNaN(index)) continue;

    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) continue;

    entries.push({
      index,
      startTime: timeMatch[1],
      endTime: timeMatch[2],
      text: textLines.join("\n").trim(),
    });
  }

  return entries;
}

function generateHtml(entries: SrtEntry[]): string {
  const rows = entries
    .map(
      (e) => `
      <div class="entry">
        <div class="time">${e.startTime} → ${e.endTime}</div>
        <div class="text">${e.text.replace(/\n/g, "<br>")}</div>
      </div>
    `
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      padding: 16px;
      font-size: 14px;
      line-height: 1.6;
    }
    .entry {
      display: flex;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid #2a2a4a;
    }
    .entry:last-child { border-bottom: none; }
    .time {
      flex-shrink: 0;
      width: 120px;
      color: #888;
      font-size: 12px;
      font-family: monospace;
    }
    .text { flex: 1; }
  </style>
</head>
<body>
${rows}
</body>
</html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  const dateStr = new Date(job.createdAt * 1000).toISOString().slice(0, 10);
  const srtPath = path.join(process.cwd(), "public", "output", dateStr, id, `${id}.srt`);

  let content: string;
  try {
    content = await readFile(srtPath, "utf-8");
  } catch {
    return NextResponse.json({ error: "字幕文件不存在" }, { status: 404 });
  }

  const entries = parseSrt(content);
  const html = generateHtml(entries);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
