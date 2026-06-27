/* eslint-disable no-console */

import {
  clearAllDanmakuCache,
  clearDanmakuCache,
  clearExpiredDanmakuCache,
  generateCacheKey,
  getDanmakuCacheStats,
  getDanmakuFromCache,
  saveDanmakuToCache,
} from './cache';
import type {
  DanmakuComment,
  DanmakuCommentsResponse,
  DanmakuEpisodesResponse,
  DanmakuMatchRequest,
  DanmakuMatchResponse,
  DanmakuSearchResponse,
  DanmakuSettings,
} from './types';

let cacheCleanupInitialized = false;

type ApiErrorBody = {
  errorMessage?: string;
  message?: string;
  error?: string;
};

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const statusMessage = `${fallback} (${response.status})`;

  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = (await response.json()) as ApiErrorBody;
      const detail = data.errorMessage || data.message || data.error;
      return detail ? `${statusMessage}: ${detail}` : statusMessage;
    }

    const text = (await response.text()).trim();
    return text ? `${statusMessage}: ${text.slice(0, 240)}` : statusMessage;
  } catch {
    return statusMessage;
  }
}

export function initDanmakuModule(): void {
  if (typeof window === 'undefined') return;
  if (cacheCleanupInitialized) return;

  cacheCleanupInitialized = true;

  clearExpiredDanmakuCache().catch((error) => {
    console.error('Failed to cleanup expired danmaku cache:', error);
  });
}

export {
  clearAllDanmakuCache,
  clearDanmakuCache,
  clearExpiredDanmakuCache,
  generateCacheKey,
  getDanmakuCacheStats,
  getDanmakuFromCache,
};

export async function searchAnime(keyword: string): Promise<DanmakuSearchResponse> {
  try {
    const response = await fetch(`/api/danmaku/search?keyword=${encodeURIComponent(keyword)}`);
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Failed to search danmaku source'));
    }
    return (await response.json()) as DanmakuSearchResponse;
  } catch (error) {
    console.error('searchAnime failed:', error);
    return {
      errorCode: -1,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'search failed',
      animes: [],
    };
  }
}

export async function matchAnime(fileName: string): Promise<DanmakuMatchResponse> {
  try {
    const body: DanmakuMatchRequest = { fileName };
    const response = await fetch('/api/danmaku/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Failed to match danmaku source'));
    }

    return (await response.json()) as DanmakuMatchResponse;
  } catch (error) {
    console.error('matchAnime failed:', error);
    return {
      errorCode: -1,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'match failed',
      isMatched: false,
      matches: [],
    };
  }
}

export async function getEpisodes(animeId: number | string): Promise<DanmakuEpisodesResponse> {
  try {
    const response = await fetch(`/api/danmaku/episodes?animeId=${animeId}`);
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Failed to load danmaku episodes'));
    }
    return (await response.json()) as DanmakuEpisodesResponse;
  } catch (error) {
    console.error('getEpisodes failed:', error);
    return {
      errorCode: -1,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'load failed',
      bangumi: {
        bangumiId: '',
        animeTitle: '',
        episodes: [],
      },
    };
  }
}

export async function getDanmakuById(
  episodeId: number,
  title?: string,
  episodeIndex?: number,
  metadata?: {
    animeId?: number;
    animeTitle?: string;
    episodeTitle?: string;
    searchKeyword?: string;
    danmakuCount?: number;
  }
): Promise<DanmakuComment[]> {
  try {
    if (title && episodeIndex !== undefined) {
      const cached = await getDanmakuFromCache(title, episodeIndex);
      if (cached) {
        return cached.comments;
      }
    }

    const response = await fetch(`/api/danmaku/comment?episodeId=${episodeId}`);
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Failed to load danmaku comments'));
    }

    const data = (await response.json()) as DanmakuCommentsResponse;
    const comments = data.comments || [];

    if (comments.length > 0 && title && episodeIndex !== undefined) {
      await saveDanmakuToCache(title, episodeIndex, comments, {
        animeId: metadata?.animeId,
        episodeId,
        animeTitle: metadata?.animeTitle,
        episodeTitle: metadata?.episodeTitle,
        searchKeyword: metadata?.searchKeyword,
        danmakuCount: metadata?.danmakuCount ?? comments.length,
      });
    }

    return comments;
  } catch (error) {
    console.error('getDanmakuById failed:', error);
    return [];
  }
}

export async function getDanmakuByUrl(url: string): Promise<DanmakuComment[]> {
  try {
    const response = await fetch(`/api/danmaku/comment?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Failed to load danmaku comments'));
    }

    const data = (await response.json()) as DanmakuCommentsResponse;
    return data.comments || [];
  } catch (error) {
    console.error('getDanmakuByUrl failed:', error);
    return [];
  }
}

export function convertDanmakuFormat(
  comments: DanmakuComment[]
): Array<{
  text: string;
  time: number;
  color: string;
  border: boolean;
  mode: number;
}> {
  return comments.map((comment) => {
    const parts = comment.p.split(',');
    const time = Number.parseFloat(parts[0]) || 0;
    const type = Number.parseInt(parts[1] || '1', 10);
    const colorValue = Number.parseInt(parts[3] || '16777215', 10);

    let mode = 0;
    if (type === 5) mode = 1;
    if (type === 4) mode = 2;

    return {
      text: comment.m,
      time,
      color: `#${colorValue.toString(16).padStart(6, '0')}`,
      border: false,
      mode,
    };
  });
}

export const DEFAULT_DANMAKU_SETTINGS: DanmakuSettings = {
  enabled: true,
  opacity: 1,
  fontSize: 25,
  speed: 5,
  marginTop: 10,
  marginBottom: 50,
  maxlength: 100,
  filterRules: [],
  unlimited: false,
  synchronousPlayback: false,
};

export function loadDanmakuSettings(): DanmakuSettings {
  if (typeof window === 'undefined') return DEFAULT_DANMAKU_SETTINGS;

  try {
    const raw = localStorage.getItem('danmaku_settings');
    if (!raw) return DEFAULT_DANMAKU_SETTINGS;

    return {
      ...DEFAULT_DANMAKU_SETTINGS,
      ...(JSON.parse(raw) as Partial<DanmakuSettings>),
    };
  } catch (error) {
    console.error('Failed to load danmaku settings:', error);
    return DEFAULT_DANMAKU_SETTINGS;
  }
}

export function saveDanmakuSettings(settings: DanmakuSettings): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('danmaku_settings', JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save danmaku settings:', error);
  }
}

export function saveDanmakuDisplayState(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('danmaku_display_enabled', String(enabled));
  } catch (error) {
    console.error('Failed to save danmaku display state:', error);
  }
}

export function loadDanmakuDisplayState(): boolean | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem('danmaku_display_enabled');
    if (raw === null) return null;
    return raw === 'true';
  } catch (error) {
    console.error('Failed to load danmaku display state:', error);
    return null;
  }
}

