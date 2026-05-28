import { type AgentKey } from '../config.js';
import { runAgent, type AgentResult } from './run.js';

export function runReviewer(draft: string, key: AgentKey): Promise<AgentResult> {
  const prompt = `Critique this draft in exactly 3 bullets — strengths, weaknesses, one improvement:\n\n${draft}`;
  return runAgent('reviewer', key, prompt, 500);
}
