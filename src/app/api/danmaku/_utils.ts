/* eslint-disable no-console */

import { getConfig } from '@/lib/config';

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function hasProtocol(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function shouldUseHttp(value: string): boolean {
  return /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1)(:\d+)?(\/|$)/.test(
    value
  );
}

function normalizeApiBase(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) {
    throw new Error('Danmaku API base is empty');
  }

  const withProtocol = hasProtocol(trimmed)
    ? trimmed
    : `${shouldUseHttp(trimmed) ? 'http' : 'https'}://${trimmed}`;

  const url = new URL(withProtocol);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';

  const serialized = url.toString();
  return serialized.endsWith('/') ? serialized.slice(0, -1) : serialized;
}

function appendPathSegment(base: string, segment: string): string {
  const normalizedSegment = trimSlashes(segment.trim());
  if (!normalizedSegment) return base;

  const url = new URL(base);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${normalizedSegment}`.replace(/\/{2,}/g, '/');

  const serialized = url.toString();
  return serialized.endsWith('/') ? serialized.slice(0, -1) : serialized;
}

function dedupeBases(candidates: string[]): string[] {
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || unique.includes(candidate)) continue;
    unique.push(candidate);
  }

  return unique;
}

export async function resolveDanmakuApiBases(): Promise<string[]> {
  const envBase =
    process.env.DANMAKU_API_BASE ||
    process.env.NEXT_PUBLIC_DANMAKU_API_BASE ||
    'http://localhost:9321';
  const envToken =
    process.env.DANMAKU_API_TOKEN ||
    process.env.NEXT_PUBLIC_DANMAKU_API_TOKEN ||
    '87654321';
  let base = envBase;
  let token = envToken;

  try {
    const config = await getConfig();
    const siteConfig = (config.SiteConfig || {}) as Record<string, unknown>;

    if (typeof siteConfig.DanmakuApiBase === 'string' && siteConfig.DanmakuApiBase.trim()) {
      base = siteConfig.DanmakuApiBase;
    }
    if (typeof siteConfig.DanmakuApiToken === 'string' && siteConfig.DanmakuApiToken.trim()) {
      token = siteConfig.DanmakuApiToken;
    }
  } catch (error) {
    console.error('Failed to read danmaku config from admin config:', error);
  }

  const candidates: string[] = [];

  const collectByPair = (baseValue: string, tokenValue: string) => {
    const normalizedBase = normalizeApiBase(baseValue);
    const normalizedToken = trimSlashes(tokenValue.trim());
    candidates.push(normalizedBase);

    if (!normalizedToken) return;

    const segments = new URL(normalizedBase).pathname.split('/').filter(Boolean);
    const hasTokenSegment = segments.includes(normalizedToken);
    if (!hasTokenSegment) {
      candidates.push(appendPathSegment(normalizedBase, normalizedToken));
    }
  };

  collectByPair(base, token);

  if (base !== envBase || token !== envToken) {
    collectByPair(envBase, envToken);
  }

  return dedupeBases(candidates);
}

export async function resolveDanmakuApiBase(): Promise<string> {
  const [base] = await resolveDanmakuApiBases();
  return base;
}

function buildApiUrl(base: string, endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${normalizedEndpoint}`;
}

export async function requestDanmakuApi(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
  action: string
): Promise<Response> {
  const bases = await resolveDanmakuApiBases();
  const errors: string[] = [];

  for (const base of bases) {
    const apiUrl = buildApiUrl(base, endpoint);

    try {
      const response = await fetchWithTimeout(apiUrl, init, timeoutMs);
      if (response.ok) {
        return response;
      }

      const upstreamMessage = await readUpstreamErrorBody(response);
      const statusMessage = upstreamMessage
        ? `${response.status}: ${upstreamMessage}`
        : `${response.status}`;
      const host = new URL(apiUrl).host;

      errors.push(`${host} -> ${statusMessage}`);
    } catch (error) {
      const host = new URL(apiUrl).host;
      const reason = getErrorMessage(error, 'request failed');
      errors.push(`${host} -> ${reason}`);
    }
  }

  if (errors.length === 0) {
    throw new Error(`${action} failed`);
  }

  throw new Error(`${action} failed: ${errors.join(' | ')}`);
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      keepalive: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readUpstreamErrorBody(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = (await response.json()) as {
        errorMessage?: string;
        message?: string;
        error?: string;
      };
      return data.errorMessage || data.message || data.error || '';
    }

    const text = (await response.text()).trim();
    if (!text) return '';
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const errorWithCause = error as Error & { cause?: unknown };
  const cause = errorWithCause.cause;
  const causeMessage =
    typeof cause === 'string'
      ? cause
      : cause instanceof Error
        ? cause.message
        : '';

  if (causeMessage && !error.message.includes(causeMessage)) {
    return `${error.message}: ${causeMessage}`;
  }

  return error.message || fallback;
}
