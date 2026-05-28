import { type AgentKey } from '../config.js';
import { runAgent, type AgentResult } from './run.js';

export function runWriter(findings: string, key: AgentKey): Promise<AgentResult> {
  const prompt = `Using these findings, write a detailed 4-paragraph draft (intro, two body paragraphs with specific examples, conclusion). Aim for depth and concrete detail over brevity.\n\n${findings}`;
  return runAgent('writer', key, prompt, 1000);
}
