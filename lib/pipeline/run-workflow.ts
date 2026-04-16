import { executeDAG, buildDAG, createConnector } from 'agency-orchestrator';
import { readFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import yaml from 'js-yaml';
import type { WorkflowDefinition, DAGNode } from 'agency-orchestrator';

export interface WorkflowInputs {
  source: string;
  input_type: 'url' | 'text';
  style_id: string;
  style_json: string;
  aspect_ratio: '16:9' | '9:16';
  video_style: 'normal' | 'fast' | 'slow';
  output_dir: string;
  width: number;
  height: number;
  /** 预填充的 raw_content（URL提取或文本直接输入的内容）*/
  raw_content?: string;
}

export async function runSlidesWorkflow(
  yamlPath: string,
  inputs: WorkflowInputs,
  callbacks?: {
    onStepStart?: (stepId: string) => void;
    onStepComplete?: (stepId: string, output: string, failed?: boolean) => void;
    onBatchStart?: (stepIds: string[]) => void;
    onBatchComplete?: (stepIds: string[]) => void;
  },
  opts?: {
    /** 预填充 raw_content 到 inputsMap */
    preloadOutputs?: { raw_content?: string };
    /** 跳过指定步骤（stepId → result），executor 会跳过 agent 执行直接使用结果 */
    skipSteps?: Map<string, string>;
  }
) {
  const yamlContent = readFileSync(yamlPath, 'utf-8');
  const workflow = yaml.load(yamlContent) as WorkflowDefinition;
  const dag = buildDAG(workflow);
  const connector = createConnector(workflow.llm);
  const inputsMap = new Map(Object.entries(inputs).map(([k, v]) => [k, String(v)]));
  // 预填充 raw_content 到 inputsMap
  if (inputs.raw_content) {
    inputsMap.set("raw_content", inputs.raw_content);
  }

  const cwd = process.cwd();
  const resolvedAgentsDir = isAbsolute(workflow.agents_dir)
    ? workflow.agents_dir
    : join(cwd, workflow.agents_dir);

  // 预填充 raw_content 到 inputsMap
  if (opts?.preloadOutputs?.raw_content) {
    inputsMap.set("raw_content", opts.preloadOutputs.raw_content);
  }

  await executeDAG(dag, {
    connector,
    agentsDir: resolvedAgentsDir,
    llmConfig: workflow.llm,
    concurrency: workflow.concurrency ?? 1,
    inputs: inputsMap,
    skipStepIds: opts?.skipSteps ? new Set(opts.skipSteps.keys()) : undefined,
    onStepStart: callbacks?.onStepStart ? (node: DAGNode) => {
      callbacks.onStepStart!(node.step.id);
    } : undefined,
    onStepComplete: callbacks?.onStepComplete ? (node: DAGNode) => {
      const failed = node.status === 'failed';
      // 如果该步骤有预填充结果（在 skipSteps 中），用预填充结果替换
      if (opts?.skipSteps?.has(node.step.id)) {
        callbacks.onStepComplete!(node.step.id, opts.skipSteps.get(node.step.id) || '', false);
        return;
      }
      callbacks.onStepComplete!(node.step.id, node.result || '', failed);
    } : undefined,
    onBatchStart: callbacks?.onBatchStart ? (nodes: DAGNode[]) => {
      callbacks.onBatchStart!(nodes.map((n: DAGNode) => n.step.id));
    } : undefined,
    onBatchComplete: callbacks?.onBatchComplete ? (nodes: DAGNode[]) => {
      callbacks.onBatchComplete!(nodes.map((n: DAGNode) => n.step.id));
    } : undefined,
  });
}
