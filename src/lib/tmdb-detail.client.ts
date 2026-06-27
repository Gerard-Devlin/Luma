/* eslint-disable @typescript-eslint/no-explicit-any */

export type TmdbDetailMediaType = 'movie' | 'tv';
export type TmdbLogoLanguagePreference = 'zh' | 'en';

export interface TmdbDetailClientRequest {
  id?: number | string | null;
  title?: string | null;
  mediaType?: TmdbDetailMediaType | 'show' | null;
  year?: string | null;
  poster?: string | null;
  score?: string | null;
  logoLanguagePreference?: TmdbLogoLanguagePreference | null;
  signal?: AbortSignal;
}

interface NormalizedTmdbDetailRequest {
  id: number | null;
  title: string;
  mediaType: TmdbDetailMediaType;
  year: string;
  poster: string;
  score: string;
  logoLanguagePreference: TmdbLogoLanguagePreference;
  signal?: AbortSignal;
}

interface TmdbDetailClientCacheEntry {
  expiresAt: number;
  payload: unknown;
}

const TMDB_DETAIL_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES = 320;
const TMDB_DETAIL_PREFETCH_CONCURRENCY = 2;
const TMDB_DETAIL_PREFETCH_MAX_TOTAL = 72;

const tmdbDetailClientCache = new Map<string, TmdbDetailClientCacheEntry>();
const tmdbDetailClientPending = new Map<string, Promise<unknown>>();
const tmdbDetailPrefetchQueue: Array<() => void> = [];
const tmdbDetailPrefetchScheduledKeys = new Set<string>();
let tmdbDetailPrefetchActiveCount = 0;
let tmdbDetailPrefetchTotalCount = 0;

function normalizeYear(value?: string | null): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function normalizeMediaType(
  value?: TmdbDetailClientRequest['mediaType']
): TmdbDetailMediaType {
  if (value === 'tv' || value === 'show') return 'tv';
  return 'movie';
}

function normalizeLogoLanguagePreference(
  value: TmdbLogoLanguagePreference | null | undefined,
  mediaType: TmdbDetailMediaType
): TmdbLogoLanguagePreference {
  if (value === 'en' || value === 'zh') return value;
  return mediaType === 'movie' ? 'en' : 'zh';
}

function normalizeId(value?: number | string | null): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }
  const raw = (value || '').toString().trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeTitleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(toAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(toAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function canUseTmdbDetailPrefetch(): boolean {
  if (typeof navigator === 'undefined') return true;

  const connection = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
      };
    }
  ).connection;

  if (!connection) return true;
  if (connection.saveData) return false;

  const effectiveType = (connection.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return false;
  }

  return true;
}

function pruneTmdbDetailClientCache(): void {
  const now = Date.now();
  tmdbDetailClientCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      tmdbDetailClientCache.delete(key);
    }
  });

  while (tmdbDetailClientCache.size > TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = tmdbDetailClientCache.keys().next().value;
    if (!oldestKey) break;
    tmdbDetailClientCache.delete(oldestKey);
  }
}

function readTmdbDetailClientCache(cacheKey: string): unknown | null {
  const hit = tmdbDetailClientCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    tmdbDetailClientCache.delete(cacheKey);
    return null;
  }
  return hit.payload;
}

function writeTmdbDetailClientCache(cacheKey: string, payload: unknown): void {
  tmdbDetailClientCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + TMDB_DETAIL_CLIENT_CACHE_TTL_MS,
  });
  pruneTmdbDetailClientCache();
}

function normalizeTmdbDetailRequest(
  request: TmdbDetailClientRequest
): NormalizedTmdbDetailRequest {
  const mediaType = normalizeMediaType(request.mediaType);
  const normalized: NormalizedTmdbDetailRequest = {
    id: normalizeId(request.id),
    title: (request.title || '').trim(),
    mediaType,
    year: normalizeYear(request.year),
    poster: (request.poster || '').trim(),
    score: (request.score || '').trim(),
    logoLanguagePreference: normalizeLogoLanguagePreference(
      request.logoLanguagePreference,
      mediaType
    ),
    signal: request.signal,
  };

  if (normalized.id === null && !normalized.title) {
    throw new Error('missing id or title for TMDB detail request');
  }

  return normalized;
}

export function buildTmdbDetailClientCacheKey(
  request: TmdbDetailClientRequest
): string {
  const normalized = normalizeTmdbDetailRequest(request);
  if (normalized.id !== null) {
    return `id:${normalized.mediaType}:${normalized.logoLanguagePreference}:${normalized.id}`;
  }

  const normalizedTitle = normalizeTitleKey(normalized.title);
  const normalizedYear = normalized.year || 'unknown';
  return `title:${normalized.mediaType}:${normalized.logoLanguagePreference}:${normalizedTitle}:${normalizedYear}`;
}

function buildTmdbDetailRequestParams(
  normalized: NormalizedTmdbDetailRequest
): URLSearchParams {
  const params = new URLSearchParams();
  if (normalized.id !== null) {
    params.set('id', String(normalized.id));
  } else {
    params.set('title', normalized.title);
    if (normalized.year) {
      params.set('year', normalized.year);
    }
  }

  params.set('type', normalized.mediaType);
  params.set('logoLang', normalized.logoLanguagePreference);

  if (normalized.poster) {
    params.set('poster', normalized.poster);
  }
  if (normalized.score) {
    params.set('score', normalized.score);
  }

  return params;
}

async function fetchTmdbDetailDirect(
  normalized: NormalizedTmdbDetailRequest
): Promise<unknown> {
  const params = buildTmdbDetailRequestParams(normalized);
  const response = await fetch(`/api/tmdb/detail?${params.toString()}`);

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error.trim()) ||
      `TMDB detail request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function fetchTmdbDetailCachedInternal(
  normalized: NormalizedTmdbDetailRequest
): Promise<unknown> {
  const cacheKey = buildTmdbDetailClientCacheKey(normalized);
  const cached = readTmdbDetailClientCache(cacheKey);
  if (cached) return cached;

  const pending = tmdbDetailClientPending.get(cacheKey);
  if (pending) return pending;

  const request = fetchTmdbDetailDirect(normalized)
    .then((payload) => {
      writeTmdbDetailClientCache(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      tmdbDetailClientPending.delete(cacheKey);
    });

  tmdbDetailClientPending.set(cacheKey, request);
  return request;
}

function pumpTmdbDetailPrefetchQueue(): void {
  while (
    tmdbDetailPrefetchActiveCount < TMDB_DETAIL_PREFETCH_CONCURRENCY &&
    tmdbDetailPrefetchQueue.length > 0
  ) {
    const runner = tmdbDetailPrefetchQueue.shift();
    if (!runner) return;
    tmdbDetailPrefetchActiveCount += 1;
    runner();
  }
}

function enqueueTmdbDetailPrefetch(task: () => Promise<void>): void {
  tmdbDetailPrefetchQueue.push(() => {
    void task().finally(() => {
      tmdbDetailPrefetchActiveCount = Math.max(
        0,
        tmdbDetailPrefetchActiveCount - 1
      );
      pumpTmdbDetailPrefetchQueue();
    });
  });
  pumpTmdbDetailPrefetchQueue();
}

export function prefetchTmdbDetail(request: TmdbDetailClientRequest): void {
  let normalized: NormalizedTmdbDetailRequest;
  try {
    normalized = normalizeTmdbDetailRequest(request);
  } catch {
    return;
  }

  if (!canUseTmdbDetailPrefetch()) return;
  if (tmdbDetailPrefetchTotalCount >= TMDB_DETAIL_PREFETCH_MAX_TOTAL) return;

  const cacheKey = buildTmdbDetailClientCacheKey(normalized);
  if (readTmdbDetailClientCache(cacheKey)) return;
  if (tmdbDetailClientPending.has(cacheKey)) return;
  if (tmdbDetailPrefetchScheduledKeys.has(cacheKey)) return;

  tmdbDetailPrefetchScheduledKeys.add(cacheKey);
  tmdbDetailPrefetchTotalCount += 1;

  enqueueTmdbDetailPrefetch(async () => {
    try {
      await fetchTmdbDetailCachedInternal(normalized);
    } catch {
      // Prefetch is best-effort; callers that need errors use the explicit fetch API.
    } finally {
      tmdbDetailPrefetchScheduledKeys.delete(cacheKey);
    }
  });
}

export async function fetchTmdbDetailWithClientCache<T = unknown>(
  request: TmdbDetailClientRequest
): Promise<T> {
  const normalized = normalizeTmdbDetailRequest(request);
  const sharedRequest = fetchTmdbDetailCachedInternal(normalized) as Promise<T>;
  return withAbortSignal(sharedRequest, normalized.signal);
}
