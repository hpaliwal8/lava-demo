import { type AgentKey } from '../config.js';
import { runAgent, type AgentResult } from './run.js';

export function runResearcher(topic: string, key: AgentKey): Promise<AgentResult> {
  const prompt = `Produce exactly 3 bullet-point research findings on: ${topic}. One sentence each, factual tone.`;
  return runAgent('researcher', key, prompt, 600);
}
