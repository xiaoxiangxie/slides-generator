import { executeDAG, buildDAG, createConnector } from 'agency-orchestrator';
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import type { WorkflowDefinition, DAGNode } from 'agency-orchestrator';

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
) {
  const yamlContent = readFileSync(yamlPath, 'utf-8');
  const workflow = yaml.load(yamlContent) as WorkflowDefinition;
  const dag = buildDAG(workflow);

  const connector = createConnector(workflow.llm);
  const inputsMap = new Map(Object.entries(inputs).map(([k, v]) => [k, String(v)]));

  await executeDAG(dag, {
    connector,
    agentsDir: workflow.agents_dir,
    llmConfig: workflow.llm,
    concurrency: workflow.concurrency ?? 1,
    inputs: inputsMap,
    onStepStart: callbacks?.onStepStart ? (node: DAGNode) => callbacks.onStepStart!(node.step.id) : undefined,
    onStepComplete: callbacks?.onStepComplete ? (node: DAGNode) => callbacks.onStepComplete!(node.step.id, node.result || '') : undefined,
    onBatchStart: callbacks?.onBatchStart ? (nodes: DAGNode[]) => callbacks.onBatchStart!(nodes.map((n: DAGNode) => n.step.id)) : undefined,
    onBatchComplete: callbacks?.onBatchComplete ? (nodes: DAGNode[]) => callbacks.onBatchComplete!(nodes.map((n: DAGNode) => n.step.id)) : undefined,
  });
}
