/**
 * Agency Orchestrator 封装层
 * 替代原来的 pipeline/index.ts
 */
import path from 'path';
import { runSlidesWorkflow, type WorkflowInputs } from './run-workflow';
import { updateJob, getJob } from '@/lib/db';
import type { StylePreset } from '@/lib/style-presets';

const WORKFLOW_YAML = path.join(process.cwd(), 'workflows', 'slides-generator.yaml');

export interface OrchestratorInput {
  id: string;
  input: string;
  inputType: 'url' | 'text';
  style: StylePreset;
  aspectRatio: string;
  taskName?: string;
  videoStyle?: 'normal' | 'fast' | 'slow';
}

function isCancelled(id: string): boolean {
  const job = getJob(id);
  return job?.status === 'cancelled';
}

function abortIfCancelled(id: string): void {
  if (isCancelled(id)) {
    throw new Error('TASK_CANCELLED');
  }
}

export async function runPipeline(opts: OrchestratorInput): Promise<void> {
  const { id, input, inputType, style, aspectRatio, taskName, videoStyle = 'normal' } = opts;
  const cwd = process.cwd();

  const dateStr = new Date().toISOString().slice(0, 10);
  const htmlPath = `/output/${dateStr}/${id}/${id}.html`;
  const outputDir = path.join(cwd, 'public', 'output', dateStr, id);
  const dimensions = {
    width: aspectRatio === '16:9' ? 1920 : 1080,
    height: aspectRatio === '16:9' ? 1080 : 1920,
  };

  const workflowInputs: WorkflowInputs = {
    source: input,
    input_type: inputType,
    style_id: style.id,
    aspect_ratio: aspectRatio as '16:9' | '9:16',
    video_style: videoStyle,
    output_dir: outputDir,
    width: dimensions.width,
    height: dimensions.height,
  };

  try {
    updateJob(id, {
      status: 'generating',
      skill: 'agent-browser',
      step: '正在启动工作流...',
      progress: 5,
    });

    abortIfCancelled(id);

    await runSlidesWorkflow(WORKFLOW_YAML, workflowInputs, {
      onStepStart: (stepId) => {
        updateJob(id, {
          status: 'generating',
          skill: stepId,
          step: `正在执行: ${stepId}...`,
          progress: 30,
        });
      },
      onStepComplete: (stepId, output) => {
        const progressMap: Record<string, number> = {
          'extract_content': 25,
          'use_text_directly': 25,
          'analyze_length': 40,
          'plan_slides': 55,
          'generate_slides': 75,
          'render_video': 90,
        };
        updateJob(id, {
          skill: stepId,
          step: `完成: ${stepId}`,
          progress: progressMap[stepId] ?? 50,
        });
      },
      onBatchComplete: (stepIds) => {
        abortIfCancelled(id);
      },
    });

    updateJob(id, {
      status: 'done',
      skill: '',
      step: 'Done!',
      progress: 100,
      htmlPath,
      endedAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: any) {
    if (e.message === 'TASK_CANCELLED') return;

    updateJob(id, {
      status: 'error',
      skill: '',
      step: 'Failed: ' + e.message,
      error: e.message,
      endedAt: Math.floor(Date.now() / 1000),
    });
    throw e;
  }
}
