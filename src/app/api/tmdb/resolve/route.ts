import { NextResponse } from 'next/server';

import { normalizeTmdbLanguage } from '@/lib/tmdb-language';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_WEB_BASE_URL = 'https://www.themoviedb.org';

type TmdbMediaType = 'movie' | 'tv';

interface TmdbSearchResponse {
  results?: Array<{
    id: number;
  }>;
}

function buildNoStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  };
}

function normalizeType(value: string | null): TmdbMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

function normalizeYear(value: string | null): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function buildTmdbSearchUrl(
  title: string,
  mediaType: TmdbMediaType,
  year: string,
  tmdbLanguage: string
): string {
  const params = new URLSearchParams({
    query: year ? `${title} ${year}` : title,
    language: tmdbLanguage,
  });
  return `${TMDB_WEB_BASE_URL}/search/${mediaType}?${params.toString()}`;
}

async function resolveTmdbId(
  title: string,
  mediaType: TmdbMediaType,
  year: string,
  apiKey: string,
  tmdbLanguage: string
): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: tmdbLanguage,
      include_adult: 'false',
      query: title,
      page: '1',
    });

    if (year) {
      params.set(mediaType === 'movie' ? 'year' : 'first_air_date_year', year);
    }

    const response = await fetch(
      `${TMDB_API_BASE_URL}/search/${mediaType}?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as TmdbSearchResponse;
    const first = data.results?.[0];
    return first?.id ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').trim();

  if (!title) {
    return NextResponse.json(
      { error: 'missing title parameter' },
      { status: 400, headers: buildNoStoreHeaders() }
    );
  }

  const mediaType = normalizeType(searchParams.get('type'));
  const year = normalizeYear(searchParams.get('year'));
  const tmdbLanguage = normalizeTmdbLanguage(searchParams.get('tmdbLanguage'));
  const fallbackUrl = buildTmdbSearchUrl(
    title,
    mediaType,
    year,
    tmdbLanguage
  );
  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY;

  const resolvedId = apiKey
    ? await resolveTmdbId(title, mediaType, year, apiKey, tmdbLanguage)
    : null;
  const targetUrl = resolvedId
    ? `${TMDB_WEB_BASE_URL}/${mediaType}/${resolvedId}?language=${tmdbLanguage}`
    : fallbackUrl;

  return NextResponse.redirect(targetUrl, {
    status: 307,
    headers: buildNoStoreHeaders(),
  });
}
