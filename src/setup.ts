import { AGENT_ORDER, AGENTS, type AgentKey, type AgentName, type Persisted, loadSecret, loadState, saveState } from './config.js';
import { LavaApiError, LavaClient } from './lava.js';

export async function setup(): Promise<Persisted> {
  const lava = new LavaClient(loadSecret());
  const existing = await listOrExit(lava);
  const state = loadState();
  const reuseFromState = state?.keys ?? null;

  const keys = {} as Record<AgentName, AgentKey>;

  for (const name of AGENT_ORDER) {
    const cfg = AGENTS[name];
    const remoteMatch = existing.find((k) => k.name === name);
    const localMatch = reuseFromState?.[name];

    if (remoteMatch && localMatch && localMatch.spend_key_id === remoteMatch.spend_key_id) {
      keys[name] = localMatch;
      console.log(`  ${name.padEnd(10)} reusing ${remoteMatch.spend_key_id}  cap $${cfg.limitUsd.toFixed(2)}/${cfg.cycle}`);
      continue;
    }

    if (remoteMatch && !localMatch) {
      console.warn(`  ${name.padEnd(10)} found on Lava (${remoteMatch.spend_key_id}) but local secret missing — recreating.`);
      await lava.revokeSpendKey(remoteMatch.spend_key_id);
    }

    const created = await lava.createSpendKey({
      name,
      allowed_models: [cfg.model],
      spend_limit: { amount: cfg.limitUsd.toFixed(2), cycle: cfg.cycle },
      request_shape: 'anthropic',
    });
    if (!created.key?.startsWith('lava_sk_')) {
      throw new Error(`Unexpected key shape from Lava: ${JSON.stringify(created)}`);
    }
    keys[name] = { spend_key_id: created.spend_key_id, name, value: created.key };
    console.log(`  ${name.padEnd(10)} created ${created.spend_key_id}  cap $${cfg.limitUsd.toFixed(2)}/${cfg.cycle}  model=${cfg.model}`);
  }

  const persisted: Persisted = { createdAt: new Date().toISOString(), keys };
  saveState(persisted);
  console.log('\n  Wrote .agentbudget.json (chmod 600). Run `npm run demo -- "your topic"` next.');
  return persisted;
}

async function listOrExit(lava: LavaClient) {
  try {
    return await lava.listSpendKeys();
  } catch (e) {
    if (e instanceof LavaApiError && e.status === 401) {
      console.error('Lava secret key invalid (401). Check LAVA_SECRET_KEY.');
      process.exit(1);
    }
    throw e;
  }
}
