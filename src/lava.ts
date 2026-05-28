import { LAVA_BASE_URL } from './config.js';

const AUTH_HEADER = 'Authorization';
const AUTH_PREFIX = 'Bearer ';

export interface SpendLimit {
  amount: string;
  cycle: 'daily' | 'weekly' | 'monthly' | 'total';
}

export interface LavaSpendKey {
  spend_key_id: string;
  name: string;
  key?: string;
  key_preview: string;
  status: 'active' | 'paused';
  request_shape: 'openai' | 'anthropic';
  allowed_models: string[] | null;
  allowed_providers: string[] | null;
  spend_limit: SpendLimit | null;
  current_spend: string;
  total_spend: string;
  current_requests: number;
  total_requests: number;
  wallet_id?: string;
  created_at?: string;
  last_used_at?: string | null;
}

interface ListResponse<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface UsageTotals {
  total_requests: number;
  total_usage_tokens: number;
  total_cost: string;
  total_charge: string;
}

export interface UsageResponse {
  items: Array<{
    date: string;
    start: string;
    end: string;
  } & UsageTotals>;
  totals: UsageTotals;
}

export class LavaApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = 'LavaApiError';
  }
}

export class LavaClient {
  constructor(private secret: string, private baseUrl: string = LAVA_BASE_URL) {}

  async createSpendKey(input: {
    name: string;
    allowed_models: string[];
    spend_limit: SpendLimit;
    request_shape: 'anthropic';
  }): Promise<LavaSpendKey> {
    return this.request<LavaSpendKey>('POST', '/v1/spend_keys', input);
  }

  async listSpendKeys(): Promise<LavaSpendKey[]> {
    const res = await this.request<ListResponse<LavaSpendKey>>('GET', '/v1/spend_keys?limit=100');
    return res.data;
  }

  async revokeSpendKey(spendKeyId: string): Promise<void> {
    await this.request<{ success: true }>('DELETE', `/v1/spend_keys/${spendKeyId}`);
  }

  async getUsage(params: { start: string; end?: string }): Promise<UsageResponse> {
    const q = new URLSearchParams({ start: params.start });
    if (params.end) q.set('end', params.end);
    return this.request<UsageResponse>('GET', `/v1/usage?${q.toString()}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        [AUTH_HEADER]: `${AUTH_PREFIX}${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const apiMsg =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? (parsed as { error?: { message?: string } }).error?.message
          : undefined;
      throw new LavaApiError(res.status, parsed, apiMsg ?? `Lava ${method} ${path} failed: ${res.status}`);
    }
    return parsed as T;
  }
}
