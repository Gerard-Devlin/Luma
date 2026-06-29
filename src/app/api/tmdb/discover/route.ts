import { NextResponse } from 'next/server';

import { normalizeTmdbLanguage } from '@/lib/tmdb-language';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w1280';
const TMDB_DISCOVER_TIMEOUT_MS = 10000;
const MOVIE_SORT_BY_ALLOWLIST = new Set([
  'popularity.desc',
  'vote_average.desc',
  'vote_count.desc',
  'primary_release_date.desc',
  'revenue.desc',
]);
const TV_SORT_BY_ALLOWLIST = new Set([
  'popularity.desc',
  'vote_average.desc',
  'vote_count.desc',
  'first_air_date.desc',
]);

interface TmdbDiscoverMovieItem {
  id?: number;
  title?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
}

interface TmdbDiscoverTvItem {
  id?: number;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
}

interface TmdbDiscoverResponse<T> {
  page?: number;
  total_pages?: number;
  total_results?: number;
  results?: T[];
}

interface TmdbKeywordItem {
  id?: number;
}

interface TmdbKeywordResponse {
  results?: TmdbKeywordItem[];
}

function buildNoStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  };
}

function toYear(value?: string): string {
  const year = (value || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

function toRate(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function normalizeText(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function parsePositiveNumber(value: string | null): string {
  if (!value) return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(parsed);
}

function parseIdList(value: string | null): string {
  if (!value) return '';
  const ids = value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter((item) => /^\d+$/.test(item) && Number(item) > 0);

  if (!ids.length) return '';
  return Array.from(new Set(ids)).join(',');
}

function parseKeywordList(value: string | null): string {
  if (!value) return '';
  const keywords = value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter((item) => /^[\w-]+$/.test(item));

  if (!keywords.length) return '';
  return Array.from(new Set(keywords)).join(',');
}

function parsePage(value: string | null): number {
  const parsed = Number(value || '1');
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 500);
}

function parseMedia(value: string | null): 'movie' | 'tv' {
  return value === 'tv' ? 'tv' : 'movie';
}

function parseSortBy(
  value: string | null,
  mediaType: 'movie' | 'tv'
): string {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'popularity.desc';

  if (mediaType === 'movie' && MOVIE_SORT_BY_ALLOWLIST.has(normalized)) {
    return normalized;
  }
  if (mediaType === 'tv' && TV_SORT_BY_ALLOWLIST.has(normalized)) {
    return normalized;
  }

  return 'popularity.desc';
}

async function resolveKeywordIds(
  apiKey: string,
  keyword: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<string> {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return '';

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: normalizedKeyword,
      page: '1',
      language: tmdbLanguage,
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/search/keyword?${params.toString()}`,
      { signal }
    );
    if (!response.ok) return '';

    const payload = (await response.json()) as TmdbKeywordResponse;
    const ids = (payload.results || [])
      .map((item) => item.id)
      .filter(
        (id): id is number =>
          typeof id === 'number' && Number.isInteger(id) && id > 0
      )
      .slice(0, 5);

    return ids.join(',');
  } catch {
    return '';
  }
}

function buildDiscoverParams(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  searchParams: URLSearchParams,
  keywordIds: string,
  tmdbLanguage: string
): URLSearchParams {
  const sortBy = parseSortBy(searchParams.get('sort_by'), mediaType);
  const params = new URLSearchParams({
    api_key: apiKey,
    page: String(parsePage(searchParams.get('page'))),
    language: tmdbLanguage,
    sort_by: sortBy,
    include_adult: searchParams.get('include_adult') === 'true' ? 'true' : 'false',
  });

  const withGenres = normalizeText(searchParams.get('with_genres') || '');
  const withOriginCountry = normalizeText(
    searchParams.get('with_origin_country') || ''
  );
  const language = normalizeText(searchParams.get('language') || '');
  const releaseFrom = normalizeText(searchParams.get('release_from') || '');
  const releaseTo = normalizeText(searchParams.get('release_to') || '');
  const minRating = parsePositiveNumber(searchParams.get('vote_average_gte'));
  const maxRating = parsePositiveNumber(searchParams.get('vote_average_lte'));
  const minVotes = parsePositiveNumber(searchParams.get('vote_count_gte'));
  const maxVotes = parsePositiveNumber(searchParams.get('vote_count_lte'));
  const runtimeFrom = parsePositiveNumber(searchParams.get('runtime_gte'));
  const runtimeTo = parsePositiveNumber(searchParams.get('runtime_lte'));
  const withCompanies = parseIdList(searchParams.get('with_companies'));
  const withPeople = parseIdList(searchParams.get('with_people'));
  const withNetworks = parseIdList(searchParams.get('with_networks'));
  const withoutGenres = parseIdList(searchParams.get('without_genres'));
  const withoutKeywords = parseKeywordList(searchParams.get('without_keywords'));
  const withType = parsePositiveNumber(searchParams.get('with_type'));
  const withStatus = parsePositiveNumber(searchParams.get('with_status'));

  if (withGenres) params.set('with_genres', withGenres);
  if (withOriginCountry) params.set('with_origin_country', withOriginCountry);
  if (keywordIds) params.set('with_keywords', keywordIds);
  if (withCompanies) params.set('with_companies', withCompanies);
  if (withPeople) params.set('with_people', withPeople);
  if (withNetworks) params.set('with_networks', withNetworks);
  if (withoutGenres) params.set('without_genres', withoutGenres);
  if (withoutKeywords) params.set('without_keywords', withoutKeywords);
  if (withType) params.set('with_type', withType);
  if (withStatus) params.set('with_status', withStatus);
  if (language) params.set('with_original_language', language);
  if (minRating) params.set('vote_average.gte', minRating);
  if (maxRating) params.set('vote_average.lte', maxRating);
  if (minVotes) params.set('vote_count.gte', minVotes);
  if (maxVotes) params.set('vote_count.lte', maxVotes);
  if (runtimeFrom) params.set('with_runtime.gte', runtimeFrom);
  if (runtimeTo) params.set('with_runtime.lte', runtimeTo);

  if (mediaType === 'movie') {
    if (releaseFrom) params.set('primary_release_date.gte', releaseFrom);
    if (releaseTo) params.set('primary_release_date.lte', releaseTo);
  } else {
    if (releaseFrom) params.set('first_air_date.gte', releaseFrom);
    if (releaseTo) params.set('first_air_date.lte', releaseTo);
  }

  return params;
}

interface TmdbDiscoverListItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  backdrop?: string;
}

function mapMovieList(list: TmdbDiscoverMovieItem[]): TmdbDiscoverListItem[] {
  return list
    .filter((item) => Number.isInteger(item.id) && !!item.poster_path && !!item.title)
    .map((item) => ({
      id: String(item.id),
      title: normalizeText(item.title),
      poster: `${TMDB_IMAGE_BASE_URL}${item.poster_path}`,
      backdrop: item.backdrop_path
        ? `${TMDB_BACKDROP_IMAGE_BASE_URL}${item.backdrop_path}`
        : undefined,
      rate: toRate(item.vote_average),
      year: toYear(item.release_date),
    }));
}

function mapTvList(list: TmdbDiscoverTvItem[]): TmdbDiscoverListItem[] {
  return list
    .filter((item) => Number.isInteger(item.id) && !!item.poster_path && !!item.name)
    .map((item) => ({
      id: String(item.id),
      title: normalizeText(item.name),
      poster: `${TMDB_IMAGE_BASE_URL}${item.poster_path}`,
      backdrop: item.backdrop_path
        ? `${TMDB_BACKDROP_IMAGE_BASE_URL}${item.backdrop_path}`
        : undefined,
      rate: toRate(item.vote_average),
      year: toYear(item.first_air_date),
    }));
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: TmdbDiscoverListItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

function emptyResponse(): DiscoverApiResponse {
  return {
    code: 200,
    message: 'success',
    list: [],
    page: 1,
    total_pages: 1,
    total_results: 0,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mediaType = parseMedia(searchParams.get('media'));
  const page = parsePage(searchParams.get('page'));
  const tmdbLanguage = normalizeTmdbLanguage(searchParams.get('tmdbLanguage'));

  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'tmdb api key missing', ...emptyResponse() },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TMDB_DISCOVER_TIMEOUT_MS);

  try {
    const keywordIds = await resolveKeywordIds(
      apiKey,
      searchParams.get('keyword') || '',
      tmdbLanguage,
      controller.signal
    );

    const params = buildDiscoverParams(
      apiKey,
      mediaType,
      searchParams,
      keywordIds,
      tmdbLanguage
    );
    params.set('page', String(page));

    const response = await fetch(
      `${TMDB_API_BASE_URL}/discover/${mediaType}?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `tmdb discover failed: ${response.status}`, ...emptyResponse() },
        { status: response.status, headers: buildNoStoreHeaders() }
      );
    }

    if (mediaType === 'movie') {
      const payload = (await response.json()) as TmdbDiscoverResponse<TmdbDiscoverMovieItem>;
      const apiResponse: DiscoverApiResponse = {
        code: 200,
        message: 'success',
        list: mapMovieList(payload.results || []),
        page: payload.page || page,
        total_pages: payload.total_pages || 1,
        total_results: payload.total_results || 0,
      };
      return NextResponse.json(apiResponse, {
        headers: buildNoStoreHeaders(),
      });
    }

    const payload = (await response.json()) as TmdbDiscoverResponse<TmdbDiscoverTvItem>;
    const apiResponse: DiscoverApiResponse = {
      code: 200,
      message: 'success',
      list: mapTvList(payload.results || []),
      page: payload.page || page,
      total_pages: payload.total_pages || 1,
      total_results: payload.total_results || 0,
    };
    return NextResponse.json(apiResponse, {
      headers: buildNoStoreHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: 'tmdb discover request failed', ...emptyResponse() },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
