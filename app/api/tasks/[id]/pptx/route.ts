import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/db";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

interface SlideData {
  type: string;
  title: string;
  subtitle?: string;
  points?: string[];
  summary_cards?: { label: string; value: string }[];
  narration?: string;
  narrations?: string;
}

function parseOutline(content: string): SlideData[] {
  try {
    const cleaned = content.replace(/```(?:json|markdown)?\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

function getNarration(slide: SlideData): string {
  return slide.narration || slide.narrations || "";
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
  const outlinePath = path.join(process.cwd(), "public", "output", dateStr, id, `${id}-outline.md`);

  let outlineContent: string;
  try {
    outlineContent = await readFile(outlinePath, "utf-8");
  } catch {
    return NextResponse.json({ error: "大纲文件不存在" }, { status: 404 });
  }

  const slides = parseOutline(outlineContent);

  // Dynamically import pptxgenjs
  const PptxGenJS = (await import("pptxgenjs")).default;

  const pptx = new PptxGenJS();
  pptx.title = job.name || "Slides";
  pptx.author = "Slides Generator";

  // Determine layout based on aspect ratio (default to 16:9 wide)
  const layout = "LAYOUT_16x9";

  for (const slideData of slides) {
    const slide = pptx.addSlide();

    if (slideData.type === "title") {
      // Title slide
      slide.addText(slideData.title, {
        x: 0.5,
        y: 2.5,
        w: "90%",
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: "FFFFFF",
      });
      if (slideData.subtitle) {
        slide.addText(slideData.subtitle, {
          x: 0.5,
          y: 4.0,
          w: "90%",
          h: 0.8,
          fontSize: 20,
          color: "CCCCCC",
        });
      }
    } else {
      // Content slide
      slide.addText(slideData.title, {
        x: 0.5,
        y: 0.4,
        w: "90%",
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: "FFFFFF",
      });

      // Add bullet points
      if (slideData.points && slideData.points.length > 0) {
        const bulletItems = slideData.points.map((point) => ({
          text: point,
          options: { bullet: true, breakLine: true },
        }));
        slide.addText(bulletItems, {
          x: 0.5,
          y: 1.4,
          w: "90%",
          h: 3.5,
          fontSize: 18,
          color: "E0E0E0",
          valign: "top",
        });
      }

      // Add summary cards if present
      if (slideData.summary_cards && slideData.summary_cards.length > 0) {
        const cardTexts = slideData.summary_cards.map((card) => ({
          text: `${card.label}: ${card.value}`,
          options: { bullet: true, breakLine: true },
        }));
        slide.addText(cardTexts, {
          x: 0.5,
          y: 1.4,
          w: "90%",
          h: 3.5,
          fontSize: 16,
          color: "E0E0E0",
          valign: "top",
        });
      }
    }

    // Add narration as slide notes
    const narration = getNarration(slideData);
    if (narration) {
      slide.addNotes(narration);
    }
  }

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), "public", "output", dateStr, id);
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${id}.pptx`);
  const blob = await pptx.write();
  const arrayBuffer = await blob.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));

  return NextResponse.json({ url: `/output/${dateStr}/${id}/${id}.pptx` });
}
