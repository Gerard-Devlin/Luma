import { NextResponse } from 'next/server';

import { normalizeTmdbLanguage } from '@/lib/tmdb-language';
import { SearchResult } from '@/lib/types';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_SEARCH_TIMEOUT_MS = 8000;
const TALK_SHOW_GENRE_ID = 10767;
const TV_EPISODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const tvEpisodeCountCache = new Map<
  number,
  {
    count: number;
    runtime: number;
    expiresAt: number;
  }
>();

interface TmdbMovieItem {
  id?: number;
  title?: string;
  poster_path?: string | null;
  overview?: string;
  release_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
  genre_ids?: number[];
}

interface TmdbTvItem {
  id?: number;
  name?: string;
  poster_path?: string | null;
  overview?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  original_language?: string;
  genre_ids?: number[];
}

interface TmdbTvDetailItem {
  number_of_episodes?: number;
  episode_run_time?: number[];
}

interface TmdbMovieDetailItem {
  runtime?: number;
}

interface TmdbKnownForItem {
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
}

interface TmdbPersonItem {
  id?: number;
  name?: string;
  profile_path?: string | null;
  popularity?: number;
  known_for_department?: string;
  known_for?: TmdbKnownForItem[];
}

interface TmdbSearchResponse<T> {
  results?: T[];
}

interface SearchPersonResult {
  id: number;
  name: string;
  profile: string;
  popularity: number;
  department: string;
  known_for: string[];
}

interface SearchMediaCandidate {
  result: SearchResult;
  matchScore: number;
  popularity: number;
}

interface SearchTmdbResponse {
  results: SearchResult[];
  people: SearchPersonResult[];
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

function normalizeText(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function toYear(value?: string): string {
  const year = (value || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : 'unknown';
}

function toScore(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function scoreMatch(title: string, query: string): number {
  const normalizedTitle = normalizeText(title).toLowerCase();
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return 4;
  if (normalizedTitle.startsWith(normalizedQuery)) return 3;
  if (normalizedTitle.includes(normalizedQuery)) return 2;
  return 0;
}

function buildTmdbSearchParams(
  apiKey: string,
  query: string,
  tmdbLanguage: string
): URLSearchParams {
  return new URLSearchParams({
    api_key: apiKey,
    query,
    page: '1',
    include_adult: 'false',
    language: tmdbLanguage,
  });
}

async function fetchTmdbList<T>(
  endpointPath: string,
  apiKey: string,
  query: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<T[]> {
  try {
    const params = buildTmdbSearchParams(apiKey, query, tmdbLanguage);
    const response = await fetch(
      `${TMDB_API_BASE_URL}${endpointPath}?${params.toString()}`,
      { signal }
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as TmdbSearchResponse<T>;
    return Array.isArray(payload.results) ? payload.results : [];
  } catch {
    return [];
  }
}

function mapMovieCandidate(
  raw: TmdbMovieItem,
  query: string
): SearchMediaCandidate | null {
  if (!raw.poster_path || !Number.isInteger(raw.id) || !raw.id) return null;
  const title = normalizeText(raw.title);
  if (!title) return null;

  return {
    result: {
      id: String(raw.id),
      title,
      poster: `${TMDB_IMAGE_BASE_URL}${raw.poster_path}`,
      episodes: ['movie'],
      total_episodes: 1,
      source: 'tmdb',
      source_name: 'TMDB',
      year: toYear(raw.release_date),
      score: toScore(raw.vote_average),
      desc: normalizeText(raw.overview),
      type_name: 'movie',
      genre_ids: raw.genre_ids || [],
      original_language: normalizeText(raw.original_language).toLowerCase(),
      popularity: raw.popularity || 0,
      vote_count: raw.vote_count || 0,
    },
    matchScore: scoreMatch(title, query),
    popularity: raw.popularity || 0,
  };
}

function mapTvCandidate(
  raw: TmdbTvItem,
  query: string
): SearchMediaCandidate | null {
  if (!raw.poster_path || !Number.isInteger(raw.id) || !raw.id) return null;
  if ((raw.genre_ids || []).includes(TALK_SHOW_GENRE_ID)) return null;
  const title = normalizeText(raw.name);
  if (!title) return null;

  return {
    result: {
      id: String(raw.id),
      title,
      poster: `${TMDB_IMAGE_BASE_URL}${raw.poster_path}`,
      episodes: ['tv-1', 'tv-2'],
      source: 'tmdb',
      source_name: 'TMDB',
      year: toYear(raw.first_air_date),
      score: toScore(raw.vote_average),
      desc: normalizeText(raw.overview),
      type_name: 'tv',
      genre_ids: raw.genre_ids || [],
      original_language: normalizeText(raw.original_language).toLowerCase(),
      popularity: raw.popularity || 0,
      vote_count: raw.vote_count || 0,
    },
    matchScore: scoreMatch(title, query),
    popularity: raw.popularity || 0,
  };
}

function getCachedTvMetadata(
  id: number
): { count: number; runtime: number } | null {
  const cached = tvEpisodeCountCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    tvEpisodeCountCache.delete(id);
    return null;
  }
  return { count: cached.count, runtime: cached.runtime };
}

function setCachedTvMetadata(id: number, count: number, runtime: number): void {
  tvEpisodeCountCache.set(id, {
    count,
    runtime,
    expiresAt: Date.now() + TV_EPISODE_CACHE_TTL_MS,
  });
}

async function fetchTvMetadata(
  id: number,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<{ count: number; runtime: number } | null> {
  const cached = getCachedTvMetadata(id);
  if (cached && cached.count > 0) return cached;

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: tmdbLanguage,
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/tv/${id}?${params.toString()}`,
      { signal }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as TmdbTvDetailItem;
    const count = payload.number_of_episodes;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
      return null;
    }
    const normalizedCount = Math.floor(count);
    const runtime = Math.max(0, Math.floor(payload.episode_run_time?.[0] || 0));
    setCachedTvMetadata(id, normalizedCount, runtime);
    return { count: normalizedCount, runtime };
  } catch {
    return null;
  }
}

async function hydrateTvEpisodeCounts(
  candidates: SearchMediaCandidate[],
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<void> {
  const tvCandidates = candidates.filter(
    (item) => item.result.type_name === 'tv'
  );
  if (tvCandidates.length === 0) return;

  await Promise.all(
    tvCandidates.map(async (candidate) => {
      const id = Number(candidate.result.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const metadata = await fetchTvMetadata(id, apiKey, tmdbLanguage, signal);
      if (!metadata) return;
      candidate.result.total_episodes = metadata.count;
      candidate.result.runtime = metadata.runtime;
    })
  );
}

async function hydrateMovieRuntimes(
  candidates: SearchMediaCandidate[],
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<void> {
  const movies = candidates.filter((item) => item.result.type_name === 'movie');
  await Promise.all(
    movies.map(async (candidate) => {
      try {
        const params = new URLSearchParams({
          api_key: apiKey,
          language: tmdbLanguage,
        });
        const response = await fetch(
          `${TMDB_API_BASE_URL}/movie/${
            candidate.result.id
          }?${params.toString()}`,
          { signal }
        );
        if (!response.ok) return;
        const payload = (await response.json()) as TmdbMovieDetailItem;
        if (payload.runtime && payload.runtime > 0) {
          candidate.result.runtime = Math.floor(payload.runtime);
        }
      } catch {
        // Runtime metadata is best-effort.
      }
    })
  );
}

function mapPeopleResults(rawPeople: TmdbPersonItem[]): SearchPersonResult[] {
  return rawPeople
    .filter((item) => Number.isInteger(item.id) && !!item.name)
    .map((item) => {
      const knownFor = (item.known_for || [])
        .filter((entry) => entry.poster_path)
        .map((entry) => normalizeText(entry.title || entry.name))
        .filter(Boolean)
        .slice(0, 4);

      return {
        id: item.id as number,
        name: normalizeText(item.name),
        profile: item.profile_path
          ? `${TMDB_IMAGE_BASE_URL}${item.profile_path}`
          : '',
        popularity: item.popularity || 0,
        department: normalizeText(item.known_for_department),
        known_for: knownFor,
      };
    })
    .filter((item) => item.known_for.length > 0 || !!item.profile)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 24);
}

function emptySearchResponse(): SearchTmdbResponse {
  return { results: [], people: [] };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeText(searchParams.get('q') || '');
  const tmdbLanguage = normalizeTmdbLanguage(searchParams.get('tmdbLanguage'));

  if (!query) {
    return NextResponse.json(emptySearchResponse(), {
      headers: buildNoStoreHeaders(),
    });
  }

  const apiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'tmdb api key missing', ...emptySearchResponse() },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TMDB_SEARCH_TIMEOUT_MS
  );

  try {
    const [movieRawList, tvRawList, peopleRawList] = await Promise.all([
      fetchTmdbList<TmdbMovieItem>(
        '/search/movie',
        apiKey,
        query,
        tmdbLanguage,
        controller.signal
      ),
      fetchTmdbList<TmdbTvItem>(
        '/search/tv',
        apiKey,
        query,
        tmdbLanguage,
        controller.signal
      ),
      fetchTmdbList<TmdbPersonItem>(
        '/search/person',
        apiKey,
        query,
        tmdbLanguage,
        controller.signal
      ),
    ]);

    const mediaCandidates = [
      ...movieRawList
        .map((item) => mapMovieCandidate(item, query))
        .filter((item): item is SearchMediaCandidate => Boolean(item)),
      ...tvRawList
        .map((item) => mapTvCandidate(item, query))
        .filter((item): item is SearchMediaCandidate => Boolean(item)),
    ];

    mediaCandidates.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.popularity - a.popularity;
    });

    await Promise.all([
      hydrateTvEpisodeCounts(
        mediaCandidates,
        apiKey,
        tmdbLanguage,
        controller.signal
      ),
      hydrateMovieRuntimes(
        mediaCandidates,
        apiKey,
        tmdbLanguage,
        controller.signal
      ),
    ]);

    const response: SearchTmdbResponse = {
      results: mediaCandidates.map((item) => item.result),
      people: mapPeopleResults(peopleRawList),
    };

    return NextResponse.json(response, { headers: buildNoStoreHeaders() });
  } catch {
    return NextResponse.json(
      { error: 'tmdb search failed', ...emptySearchResponse() },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
