import { AGENTS, AGENT_ORDER, type AgentName, type Persisted } from './config.js';
import { LavaClient, type LavaSpendKey } from './lava.js';

export interface AgentTokenTally {
  input_tokens: number;
  output_tokens: number;
}
export type SessionTokens = Record<AgentName, AgentTokenTally>;

export function emptyTokens(): SessionTokens {
  return {
    researcher: { input_tokens: 0, output_tokens: 0 },
    writer: { input_tokens: 0, output_tokens: 0 },
    reviewer: { input_tokens: 0, output_tokens: 0 },
  };
}

export interface Row {
  agent: AgentName;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
  budgetRemaining: string;
}

export async function buildDashboard(
  lava: LavaClient,
  state: Persisted,
  sessionTokens: SessionTokens,
  exhausted: Set<AgentName>,
): Promise<{ rows: Row[]; walletSpendToday: string | null }> {
  const remoteKeys = await lava.listSpendKeys();
  const byId = new Map<string, LavaSpendKey>(remoteKeys.map((k) => [k.spend_key_id, k]));

  const rows: Row[] = AGENT_ORDER.map((name) => {
    const cfg = AGENTS[name];
    const local = state.keys[name];
    const remote = byId.get(local.spend_key_id);
    const currentSpend = remote ? parseFloat(remote.current_spend) : 0;
    const limit = remote?.spend_limit ? parseFloat(remote.spend_limit.amount) : cfg.limitUsd;
    const remaining = limit - currentSpend;
    const isExhausted = exhausted.has(name) || remaining <= 0;
    const tokens = sessionTokens[name];
    return {
      agent: name,
      model: cfg.model,
      tokensIn: tokens.input_tokens,
      tokensOut: tokens.output_tokens,
      costUsd: `$${currentSpend.toFixed(4)}`,
      budgetRemaining: isExhausted ? 'EXHAUSTED' : `$${remaining.toFixed(4)}`,
    };
  });

  let walletSpendToday: string | null = null;
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const usage = await lava.getUsage({ start: startOfDay.toISOString() });
    walletSpendToday = `$${parseFloat(usage.totals.total_cost).toFixed(4)}`;
  } catch {
    walletSpendToday = null;
  }

  return { rows, walletSpendToday };
}

export function printDashboard(rows: Row[], walletSpendToday: string | null): void {
  console.log('');
  console.table(rows);
  if (walletSpendToday !== null) {
    console.log(`  Total wallet spend today (per Lava): ${walletSpendToday}`);
  }
}
