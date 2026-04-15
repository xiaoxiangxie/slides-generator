import { readFileSync } from 'fs';
import { join } from 'path';
import { run } from 'agency-orchestrator';
import type { WorkflowResult, DAGNode } from 'agency-orchestrator';

export interface WorkflowInputs {
  source: string;
  input_type: 'url' | 'text';
  style_id: string;
  aspect_ratio: '16:9' | '9:16';
  video_style: 'normal' | 'fast' | 'slow';
  output_dir: string;
  width: number;
  height: number;
}

export async function runSlidesWorkflow(
  yamlPath: string,
  inputs: WorkflowInputs,
  callbacks?: {
    onStepStart?: (stepId: string) => void;
    onStepComplete?: (stepId: string, output: string) => void;
    onBatchStart?: (stepIds: string[]) => void;
    onBatchComplete?: (stepIds: string[]) => void;
  }
): Promise<WorkflowResult> {
  const yamlContent = readFileSync(yamlPath, 'utf-8');

  const result = await run(yamlContent, {
    source: inputs.source,
    input_type: inputs.input_type,
    style_id: inputs.style_id,
    aspect_ratio: inputs.aspect_ratio,
    video_style: inputs.video_style,
    output_dir: inputs.output_dir,
    width: String(inputs.width),
    height: String(inputs.height),
  }, {
    onStepStart: (node: DAGNode) => callbacks?.onStepStart?.(node.step.id),
    onStepComplete: (node: DAGNode) => callbacks?.onStepComplete?.(node.step.id, node.result || ''),
    onBatchStart: (nodes: DAGNode[]) => callbacks?.onBatchStart?.(nodes.map(n => n.step.id)),
    onBatchComplete: (nodes: DAGNode[]) => callbacks?.onBatchComplete?.(nodes.map(n => n.step.id)),
  });

  return result;
}
