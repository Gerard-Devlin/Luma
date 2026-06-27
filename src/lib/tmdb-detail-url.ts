import type { TmdbDetailMediaType } from '@/lib/tmdb-detail.client';

interface TmdbDetailPageUrlInput {
  id?: number | string | null;
  title?: string | null;
  mediaType?: TmdbDetailMediaType | 'show' | null;
  year?: string | null;
  poster?: string | null;
  score?: string | null;
  logoLang?: 'zh' | 'en' | null;
}

function normalizeMediaType(
  value?: TmdbDetailPageUrlInput['mediaType']
): TmdbDetailMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

export function buildTmdbDetailPageUrl(input: TmdbDetailPageUrlInput): string {
  const params = new URLSearchParams();
  const id = input.id ? String(input.id).trim() : '';
  const title = (input.title || '').trim();
  const year = (input.year || '').trim();
  const poster = (input.poster || '').trim();
  const score = (input.score || '').trim();

  if (id) {
    params.set('id', id);
  } else if (title) {
    params.set('title', title);
  }

  params.set('type', normalizeMediaType(input.mediaType));

  if (year) params.set('year', year);
  if (poster) params.set('poster', poster);
  if (score) params.set('score', score);
  if (input.logoLang) params.set('logoLang', input.logoLang);

  return `/detail?${params.toString()}`;
}
