import { NextResponse } from 'next/server';

import {
  DEFAULT_TMDB_LANGUAGE,
  getStableTmdbImageLanguage,
  normalizeTmdbLanguage,
} from '@/lib/tmdb-language';
import { normalizeReleaseDate } from '@/lib/tmdbRelease';


const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

type TmdbMediaType = 'movie' | 'tv';
type HeroMediaFilter = 'all' | TmdbMediaType;

interface TmdbTrendingItem {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbTrendingResponse {
  results?: TmdbTrendingItem[];
  total_pages?: number;
}

interface TmdbHeroItem {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  overview: string;
  year: string;
  score: string;
  releaseDate: string;
  backdrop: string;
  poster: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  logo?: string;
}

interface TmdbLogoItem {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
}

interface TmdbImagesResponse {
  logos?: TmdbLogoItem[];
}

interface TmdbRuntimeResponse {
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
}

interface TmdbHeroMeta {
  title: string;
  overview: string;
  year: string;
  score: string;
  releaseDate: string;
  backdrop: string;
  poster: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
}

const HERO_ITEM_LIMIT = 7;
const HERO_LOGO_SEARCH_PAGE_LIMIT = 5;

function emptyHeroMeta(): TmdbHeroMeta {
  return {
    title: '',
    overview: '',
    year: '',
    score: '',
    releaseDate: '',
    backdrop: '',
    poster: '',
    runtime: null,
    seasons: null,
    episodes: null,
  };
}

function toYear(value?: string): string {
  if (!value) return '';
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

function toScore(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function mapHeroItem(
  item: TmdbTrendingItem,
  fallbackMediaType?: TmdbMediaType
): TmdbHeroItem | null {
  const mediaType: TmdbMediaType | null =
    fallbackMediaType ||
    (item.media_type === 'tv'
      ? 'tv'
      : item.media_type === 'movie'
        ? 'movie'
        : null);
  const title = (item.title || item.name || '').trim();
  const backdropPath = item.backdrop_path || '';
  const posterPath = item.poster_path || '';

  if (!mediaType || !title || !backdropPath || !posterPath) return null;

  return {
    id: item.id,
    mediaType,
    title,
    overview: (item.overview || '').trim() || 'No overview available.',
    year: toYear(item.release_date || item.first_air_date),
    score: toScore(item.vote_average),
    releaseDate: normalizeReleaseDate(item.release_date || item.first_air_date),
    backdrop: `${TMDB_IMAGE_BASE_URL}/original${backdropPath}`,
    poster: `${TMDB_IMAGE_BASE_URL}/w500${posterPath}`,
    runtime: null,
    seasons: null,
    episodes: null,
  };
}

function selectBestLogoPath(
  logos: TmdbLogoItem[],
  tmdbLanguage: string
): string {
  if (!logos.length) return '';

  const getLanguagePriority = (lang?: string | null): number => {
    if (normalizeTmdbLanguage(tmdbLanguage) === 'zh-CN') {
      if (lang === 'zh') return 4;
      if (lang === 'en') return 3;
      if (lang === null) return 2;
      if (lang === undefined) return 2;
      return 1;
    }
    if (lang === 'en') return 4;
    if (lang === 'zh') return 3;
    if (lang === null) return 2;
    if (lang === undefined) return 2;
    return 1;
  };

  const sorted = logos
    .filter((logo) => logo.file_path)
    .sort((a, b) => {
      const lp = getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
      if (lp !== 0) return lp;
      const vr = (b.vote_average || 0) - (a.vote_average || 0);
      if (vr !== 0) return vr;
      return (b.width || 0) - (a.width || 0);
    });

  return sorted[0]?.file_path || '';
}

async function fetchLogoForItem(
  mediaType: TmdbMediaType,
  id: number,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<string> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      include_image_language: getStableTmdbImageLanguage(),
    });

    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}/images?${params.toString()}`,
      { signal }
    );

    if (!response.ok) return '';

    const data = (await response.json()) as TmdbImagesResponse;
    const logoPath = selectBestLogoPath(data.logos || [], tmdbLanguage);
    return logoPath ? `${TMDB_IMAGE_BASE_URL}/w500${logoPath}` : '';
  } catch {
    return '';
  }
}

async function fetchHeroMetaForItem(
  mediaType: TmdbMediaType,
  id: number,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<TmdbHeroMeta> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: tmdbLanguage,
    });

    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}?${params.toString()}`,
      { signal }
    );
    if (!response.ok) {
      return emptyHeroMeta();
    }

    const data = (await response.json()) as TmdbRuntimeResponse;
    const runtime =
      mediaType === 'movie' ? data.runtime : data.episode_run_time?.[0];
    const seasons = data.number_of_seasons;
    const episodes = data.number_of_episodes;
    return {
      title: (data.title || data.name || '').trim(),
      overview: (data.overview || '').trim(),
      year: toYear(data.release_date || data.first_air_date),
      score: toScore(data.vote_average),
      releaseDate: normalizeReleaseDate(data.release_date || data.first_air_date),
      backdrop: data.backdrop_path
        ? `${TMDB_IMAGE_BASE_URL}/original${data.backdrop_path}`
        : '',
      poster: data.poster_path
        ? `${TMDB_IMAGE_BASE_URL}/w500${data.poster_path}`
        : '',
      runtime: typeof runtime === 'number' && runtime > 0 ? runtime : null,
      seasons:
        mediaType === 'tv' && typeof seasons === 'number' && seasons > 0
          ? seasons
          : null,
      episodes:
        mediaType === 'tv' && typeof episodes === 'number' && episodes > 0
          ? episodes
          : null,
    };
  } catch {
    return emptyHeroMeta();
  }
}

function normalizeMediaFilter(value: string | null): HeroMediaFilter {
  if (value === 'movie' || value === 'tv') return value;
  return 'all';
}

function normalizeWithGenres(value: string | null): string {
  return (value || '').trim().replace(/\s+/g, '');
}

function normalizeWithOriginCountry(value: string | null): string {
  return (value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mediaFilter = normalizeMediaFilter(searchParams.get('mediaType'));
  const withGenres = normalizeWithGenres(searchParams.get('with_genres'));
  const withKeywords = normalizeWithGenres(searchParams.get('with_keywords'));
  const withOriginCountry = normalizeWithOriginCountry(
    searchParams.get('with_origin_country')
  );
  const requireLogo = searchParams.get('requireLogo') === 'true';
  const tmdbLanguage = normalizeTmdbLanguage(searchParams.get('tmdbLanguage'));
  const generationLanguage = DEFAULT_TMDB_LANGUAGE;

  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { results: [] },
      {
        status: 200,
        headers: buildNoStoreHeaders(),
      }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const shouldUseDiscover = Boolean(
      withGenres || withKeywords || withOriginCountry
    );
    const discoverMediaType: TmdbMediaType =
      mediaFilter === 'movie' ? 'movie' : 'tv';
    const params = new URLSearchParams({
      api_key: apiKey,
      language: generationLanguage,
      page: '1',
    });
    if (shouldUseDiscover) {
      params.set('sort_by', 'popularity.desc');
      params.set('include_adult', 'false');
      if (withGenres) {
        params.set('with_genres', withGenres);
      }
      if (withKeywords) {
        params.set('with_keywords', withKeywords);
      }
      if (withOriginCountry) {
        params.set('with_origin_country', withOriginCountry);
      }
    }

    const endpoint = shouldUseDiscover
      ? `${TMDB_API_BASE_URL}/discover/${discoverMediaType}`
      : `${TMDB_API_BASE_URL}/trending/all/day`;

    const fetchCandidatePage = async (page: number) => {
      const pageParams = new URLSearchParams(params);
      pageParams.set('page', String(page));
      const response = await fetch(`${endpoint}?${pageParams.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const data = (await response.json()) as TmdbTrendingResponse;
      const results = (data.results || [])
        .filter((item) =>
          shouldUseDiscover
            ? true
            : item.media_type === 'movie' || item.media_type === 'tv'
        )
        .filter((item) =>
          shouldUseDiscover
            ? true
            : mediaFilter === 'all' || item.media_type === mediaFilter
        )
        .map((item) =>
          shouldUseDiscover
            ? mapHeroItem(item, discoverMediaType)
            : mapHeroItem(item)
        )
        .filter((item): item is TmdbHeroItem => Boolean(item));

      return {
        results,
        totalPages: Math.max(1, data.total_pages || 1),
      };
    };

    const firstPage = await fetchCandidatePage(1);
    if (!firstPage) {
      return NextResponse.json(
        { results: [] },
        { status: 200, headers: buildNoStoreHeaders() }
      );
    }

    let baseResults = firstPage.results.slice(0, 8);
    const preloadedLogos = new Map<string, string>();

    if (requireLogo) {
      const logoResults: TmdbHeroItem[] = [];
      const seenItems = new Set<string>();
      const maxPages = Math.min(
        firstPage.totalPages,
        HERO_LOGO_SEARCH_PAGE_LIMIT
      );

      for (let page = 1; page <= maxPages; page += 1) {
        const candidatePage =
          page === 1 ? firstPage : await fetchCandidatePage(page);
        if (!candidatePage) continue;

        const candidates = candidatePage.results.filter((item) => {
          const key = `${item.mediaType}:${item.id}`;
          if (seenItems.has(key)) return false;
          seenItems.add(key);
          return true;
        });
        const candidatesWithLogos = await Promise.all(
          candidates.map(async (item) => ({
            item,
            logo: await fetchLogoForItem(
              item.mediaType,
              item.id,
              apiKey,
              tmdbLanguage,
              controller.signal
            ),
          }))
        );

        for (const { item, logo } of candidatesWithLogos) {
          if (!logo) continue;
          preloadedLogos.set(`${item.mediaType}:${item.id}`, logo);
          logoResults.push(item);
          if (logoResults.length === HERO_ITEM_LIMIT) break;
        }
        if (logoResults.length === HERO_ITEM_LIMIT) break;
      }

      baseResults = logoResults;
    }

    const results = await Promise.all(
      baseResults.map(async (item) => {
        const preloadedLogo = preloadedLogos.get(
          `${item.mediaType}:${item.id}`
        );
        const [logo, meta] = await Promise.all([
          preloadedLogo
            ? Promise.resolve(preloadedLogo)
            : fetchLogoForItem(
                item.mediaType,
                item.id,
                apiKey,
                tmdbLanguage,
                controller.signal
              ),
          fetchHeroMetaForItem(
            item.mediaType,
            item.id,
            apiKey,
            tmdbLanguage,
            controller.signal
          ),
        ]);
        return {
          ...item,
          title: meta.title || item.title,
          overview: meta.overview || item.overview,
          year: meta.year || item.year,
          score: meta.score || item.score,
          releaseDate: meta.releaseDate || item.releaseDate,
          backdrop: meta.backdrop || item.backdrop,
          poster: meta.poster || item.poster,
          runtime: meta.runtime,
          seasons: meta.seasons,
          episodes: meta.episodes,
          logo: logo || undefined,
        };
      })
    );

    return NextResponse.json(
      { results },
      {
        headers: buildNoStoreHeaders(),
      }
    );
  } catch {
    return NextResponse.json(
      { results: [] },
      { status: 200, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
