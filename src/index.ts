import { type AgentName, loadSecret, loadState } from './config.js';
import { buildDashboard, emptyTokens, printDashboard, type SessionTokens } from './dashboard.js';
import { LavaClient } from './lava.js';
import { runResearcher } from './agents/researcher.js';
import { runReviewer } from './agents/reviewer.js';
import { runWriter } from './agents/writer.js';
import type { AgentResult } from './agents/run.js';
import { setup } from './setup.js';

const [, , cmd, ...rest] = process.argv;

try {
  switch (cmd) {
    case 'setup':
      await setup();
      break;
    case 'dashboard': {
      const state = requireState();
      const lava = new LavaClient(loadSecret());
      const { rows, walletSpendToday } = await buildDashboard(lava, state, emptyTokens(), new Set());
      printDashboard(rows, walletSpendToday);
      break;
    }
    case 'demo': {
      const topic = rest.join(' ').trim() || 'the rise of small language models';
      await runDemo(topic);
      break;
    }
    case 'enforce':
      await runEnforce();
      break;
    default:
      printHelp();
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
}

async function runDemo(topic: string): Promise<void> {
  const state = requireState();
  const lava = new LavaClient(loadSecret());
  const tokens = emptyTokens();
  const exhausted = new Set<AgentName>();

  console.log(`Topic: ${topic}\n`);

  const research = await stepAgent('researcher', () => runResearcher(topic, state.keys.researcher), tokens, exhausted);
  if (research.status !== 'ok') return finish(lava, state, tokens, exhausted);

  const draft = await stepAgent('writer', () => runWriter(research.output, state.keys.writer), tokens, exhausted);
  if (draft.status !== 'ok') return finish(lava, state, tokens, exhausted);

  await stepAgent('reviewer', () => runReviewer(draft.output, state.keys.reviewer), tokens, exhausted);
  await finish(lava, state, tokens, exhausted);
}

async function runEnforce(): Promise<void> {
  const state = requireState();
  const lava = new LavaClient(loadSecret());
  const tokens = emptyTokens();
  const exhausted = new Set<AgentName>();
  const MAX_WRITER_CALLS = 60;
  const fixedTopic = 'edge-deployed language models';
  const fixedFindings = '- SLMs run efficiently on phones and laptops.\n- Training on curated data helps.\n- Latency is lower than cloud APIs.';
  const fixedDraft = 'Small language models are reshaping AI by running locally on devices, achieving competitive performance through curated training, and eliminating cloud round-trips.';

  console.log('Running enforce — researcher + reviewer once (parallel); writer loops until $0.05 cap.\n');

  const peers = Promise.all([
    stepAgent('researcher', () => runResearcher(fixedTopic, state.keys.researcher), tokens, exhausted),
    stepAgent('reviewer', () => runReviewer(fixedDraft, state.keys.reviewer), tokens, exhausted),
  ]);

  console.log('── writer loop ──');
  for (let i = 1; i <= MAX_WRITER_CALLS; i++) {
    const r = await runWriter(fixedFindings, state.keys.writer);
    tokens.writer.input_tokens += r.usage.input_tokens;
    tokens.writer.output_tokens += r.usage.output_tokens;
    if (r.status === 'ok') {
      console.log(`  [${i.toString().padStart(2)}] ok  in=${r.usage.input_tokens} out=${r.usage.output_tokens}`);
    } else if (r.status === 'exhausted') {
      console.log(`  [${i.toString().padStart(2)}] EXHAUSTED — ${r.errorMessage}`);
      exhausted.add('writer');
      break;
    } else {
      console.log(`  [${i.toString().padStart(2)}] error — ${r.errorMessage}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!exhausted.has('writer')) {
    console.log(`  writer did not exhaust within ${MAX_WRITER_CALLS} iterations — increase loop cap or lower spend_limit.`);
  }

  await peers;
  await finish(lava, state, tokens, exhausted);
}

async function stepAgent(
  name: AgentName,
  invoke: () => Promise<AgentResult>,
  tokens: SessionTokens,
  exhausted: Set<AgentName>,
): Promise<AgentResult> {
  console.log(`── ${name} ──`);
  const r = await invoke();
  tokens[name].input_tokens += r.usage.input_tokens;
  tokens[name].output_tokens += r.usage.output_tokens;
  if (r.status === 'ok') {
    console.log(`${r.output}\n`);
  } else if (r.status === 'exhausted') {
    console.log(`EXHAUSTED — ${r.errorMessage}\n`);
    exhausted.add(name);
  } else {
    console.log(`ERROR — ${r.errorMessage}\n`);
  }
  return r;
}

async function finish(lava: LavaClient, state: ReturnType<typeof requireState>, tokens: SessionTokens, exhausted: Set<AgentName>) {
  const { rows, walletSpendToday } = await buildDashboard(lava, state, tokens, exhausted);
  printDashboard(rows, walletSpendToday);
}

function requireState() {
  const s = loadState();
  if (!s) {
    console.error('No .agentbudget.json found. Run `npm run setup` first.');
    process.exit(1);
  }
  return s;
}

function printHelp() {
  console.log(`AgentBudget — Lava gateway demo

Commands:
  setup                  Create the 3 spend keys (researcher / writer / reviewer).
  demo "<topic>"         Run the full 3-agent pipeline on a topic.
  enforce                Loop the writer until its $0.05/day cap is hit.
  dashboard              Print current per-agent spend from Lava.

Env: LAVA_SECRET_KEY (your aks_live_* admin key) — required.`);
}

void rest;
