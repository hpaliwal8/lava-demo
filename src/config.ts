import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';

export type AgentName = 'researcher' | 'writer' | 'reviewer';

export interface AgentKey {
  spend_key_id: string;
  name: AgentName;
  value: string;
}

export interface Persisted {
  createdAt: string;
  keys: Record<AgentName, AgentKey>;
}

export const AGENT_ORDER: readonly AgentName[] = ['researcher', 'writer', 'reviewer'] as const;

export const AGENTS: Record<AgentName, { model: string; limitUsd: number; cycle: 'daily' }> = {
  researcher: { model: 'claude-sonnet-4-6', limitUsd: 2.0, cycle: 'daily' },
  writer: { model: 'claude-haiku-4-5', limitUsd: 0.05, cycle: 'daily' },
  reviewer: { model: 'claude-opus-4-7', limitUsd: 5.0, cycle: 'daily' },
};

export const STATE_FILE = '.agentbudget.json';
export const LAVA_BASE_URL = 'https://api.lava.so';

export function loadSecret(): string {
  const v = process.env.LAVA_SECRET_KEY;
  if (!v) {
    console.error('LAVA_SECRET_KEY missing. Export it or `source .env` before running.');
    process.exit(1);
  }
  return v;
}

export function loadState(): Persisted | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Persisted;
    if (!parsed.keys?.researcher || !parsed.keys?.writer || !parsed.keys?.reviewer) return null;
    return parsed;
  } catch (e) {
    console.warn(`Warning: ${STATE_FILE} is corrupt (${(e as Error).message}); treating as missing.`);
    return null;
  }
}

export function saveState(s: Persisted): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  chmodSync(STATE_FILE, 0o600);
}
