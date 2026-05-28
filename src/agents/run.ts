import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { AGENTS, LAVA_BASE_URL, type AgentKey, type AgentName } from '../config.js';

export interface AgentResult {
  agent: AgentName;
  output: string;
  usage: { input_tokens: number; output_tokens: number };
  status: 'ok' | 'exhausted' | 'error';
  errorMessage?: string;
}

export async function runAgent(
  name: AgentName,
  key: AgentKey,
  prompt: string,
  maxTokens: number,
): Promise<AgentResult> {
  const client = new Anthropic({ apiKey: key.value, baseURL: LAVA_BASE_URL });
  try {
    const msg = await client.messages.create({
      model: AGENTS[name].model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const output = msg.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      agent: name,
      output,
      usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
      status: 'ok',
    };
  } catch (e) {
    return classifyError(name, e);
  }
}

function classifyError(name: AgentName, e: unknown): AgentResult {
  const empty = { input_tokens: 0, output_tokens: 0 };
  if (e instanceof APIError) {
    const body = (e.error ?? {}) as { error?: { code?: string; message?: string } };
    const code = body.error?.code ?? '';
    const msg = body.error?.message ?? e.message;
    const isBudget =
      e.status === 402 ||
      e.status === 403 ||
      /spend.?limit|budget|exceed|insufficient|wallet/i.test(code) ||
      /spend.?limit|budget|exceed|insufficient|wallet/i.test(msg);
    if (isBudget) {
      return { agent: name, output: '', usage: empty, status: 'exhausted', errorMessage: msg };
    }
    return { agent: name, output: '', usage: empty, status: 'error', errorMessage: `${e.status}: ${msg}` };
  }
  return { agent: name, output: '', usage: empty, status: 'error', errorMessage: String(e) };
}
