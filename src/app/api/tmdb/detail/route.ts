import { NextResponse } from 'next/server';

import {
  getTmdbImageLanguage,
  getTmdbVideoLanguage,
  normalizeTmdbLanguage,
} from '@/lib/tmdb-language';
import { normalizeReleaseDate } from '@/lib/tmdbRelease';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const DETAIL_REQUEST_TIMEOUT_MS = 10000;

type TmdbMediaType = 'movie' | 'tv';
type LogoLanguagePreference = 'zh' | 'en';

interface TmdbLogoItem {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
  height?: number;
  aspect_ratio?: number;
}

interface TmdbDetailRawGenre {
  name?: string;
}

interface TmdbDetailRawCast {
  id?: number;
  name?: string;
  original_name?: string;
  character?: string;
  profile_path?: string | null;
}

interface TmdbDetailRawAggregateRole {
  character?: string;
  episode_count?: number;
}

interface TmdbDetailRawAggregateCast {
  id?: number;
  name?: string;
  original_name?: string;
  profile_path?: string | null;
  roles?: TmdbDetailRawAggregateRole[];
}

interface TmdbDetailRawVideo {
  site?: string;
  type?: string;
  key?: string;
  official?: boolean;
  iso_639_1?: string | null;
}

interface TmdbRecommendationRawItem {
  id?: number;
  media_type?: 'movie' | 'tv' | string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbCollectionSummaryRaw {
  id?: number;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

interface TmdbCollectionRawResponse extends TmdbCollectionSummaryRaw {
  overview?: string;
  parts?: TmdbRecommendationRawItem[];
}

interface TmdbDetailRawResponse {
  id?: number;
  imdb_id?: string | null;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  belongs_to_collection?: TmdbCollectionSummaryRaw | null;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  original_language?: string;
  popularity?: number;
  genres?: TmdbDetailRawGenre[];
  credits?: {
    cast?: TmdbDetailRawCast[];
  };
  aggregate_credits?: {
    cast?: TmdbDetailRawAggregateCast[];
  };
  videos?: {
    results?: TmdbDetailRawVideo[];
  };
  images?: {
    logos?: TmdbLogoItem[];
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
  content_ratings?: {
    results?: Array<{
      iso_3166_1?: string;
      rating?: string;
    }>;
  };
  recommendations?: {
    results?: TmdbRecommendationRawItem[];
  };
  external_ids?: {
    imdb_id?: string | null;
  };
}

interface TmdbSearchResponse {
  results?: Array<{
    id?: number;
    media_type?: 'movie' | 'tv' | string;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
  }>;
}

interface TmdbDetailResponse {
  id: number;
  mediaType: TmdbMediaType;
  imdbId: string;
  title: string;
  logo?: string;
  logoAspectRatio?: number;
  overview: string;
  backdrop: string;
  poster: string;
  score: string;
  voteCount: number;
  year: string;
  releaseDate: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  contentRating: string;
  genres: string[];
  language: string;
  popularity: number | null;
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profile?: string;
  }>;
  recommendations: Array<{
    id: number;
    mediaType: TmdbMediaType;
    title: string;
    poster: string;
    backdrop: string;
    year: string;
    score: string;
    voteCount: number;
  }>;
  collection?: {
    id: number;
    name: string;
    overview: string;
    poster: string;
    backdrop: string;
    parts: Array<{
      id: number;
      mediaType: 'movie';
      title: string;
      poster: string;
      backdrop: string;
      year: string;
      score: string;
      voteCount: number;
    }>;
  };
  trailerUrl: string;
}

function normalizeMediaType(value: string | null): TmdbMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

function normalizeLogoLanguagePreference(
  value: string | null,
  tmdbLanguage?: string | null
): LogoLanguagePreference {
  if (value === 'en' || value === 'zh') return value;
  return normalizeTmdbLanguage(tmdbLanguage) === 'zh-CN' ? 'zh' : 'en';
}

function normalizeYear(value: string | null): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

const TITLE_QUOTE_PUNCTUATION_PATTERN = /[\u2018\u2019\u201c\u201d'"`]/g;
const TITLE_SYMBOL_PUNCTUATION_PATTERN =
  /[\u3001\uFF0C\u3002\uFF01\uFF1F,.;:!?()[\]{}<>\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011/_|\\~@#$%^&*+=-]+/g;
const ENGLISH_SEASON_HINT_PATTERN = /\b(?:season|series|s)\s*0*\d{1,2}\b/gi;
const ENGLISH_SEASON_HINT_DETECT_PATTERN =
  /\b(?:season|series|s)\s*0*\d{1,2}\b/i;
const CHINESE_SEASON_HINT_PATTERN =
  /\u7b2c\s*[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*(?:\u5b63|\u90e8|\u8f91)/gi;
const CHINESE_SEASON_HINT_DETECT_PATTERN =
  /\u7b2c\s*[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*(?:\u5b63|\u90e8|\u8f91)/i;
const TITLE_SOURCE_CODE_PATTERN = /\b[a-z]{2,6}\s*[-_ ]\s*\d{2,6}\b/gi;
const TITLE_SOURCE_CODE_COMPACT_PATTERN = /\b[a-z]{2,6}\d{2,6}\b/gi;
const ENGLISH_MEDIA_WORD_PATTERN = /\b(?:tv|movie|show)\b/gi;
const CJK_MEDIA_WORD_PATTERN =
  /(?:\u7535\u89c6\u5267|\u96fb\u8996\u5287|\u7535\u5f71|\u96fb\u5f71|\u5267\u96c6|\u5287\u96c6|\u7efc\u827a|\u7d9c\u85dd|\u771f\u4eba\u79c0)/gi;
const QUOTED_TITLE_PATTERN =
  /[\u300a\u300c\u300e]([^\u300a\u300b\u300c\u300d\u300e\u300f]{2,80})[\u300b\u300d\u300f]/;
const TITLE_FIRST_CHUNK_SPLITTER_PATTERN = /[\uFF0C\u3002\uFF01\uFF1F,!?]/;
const TITLE_PUNCTUATION_COUNTER_PATTERN =
  /[\u300c\u300d\u300e\u300f\u3010\u3011\u300a\u300b\uFF08\uFF09\uFF0C\u3002\uFF1F\uFF01]/g;
const SPECIAL_FEATURE_KEYWORD_PATTERN =
  /(?:\u5e55\u540e|\u7279\u8f91|\u91cd\u9022|\u82b1\u7d6e|\u5236\u4f5c|\u7eaa\u5f55|\u756a\u5916|\u885d\u751f|making of|behind the scenes|behind the curtain|reunion|special|featurette|documentary)/i;

function stripSeasonAndMediaWords(value: string): string {
  return (value || '')
    .normalize('NFKC')
    .replace(ENGLISH_SEASON_HINT_PATTERN, ' ')
    .replace(CHINESE_SEASON_HINT_PATTERN, ' ')
    .replace(ENGLISH_MEDIA_WORD_PATTERN, ' ')
    .replace(CJK_MEDIA_WORD_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSeasonIntent(value: string): boolean {
  const normalized = (value || '').normalize('NFKC');
  return (
    ENGLISH_SEASON_HINT_DETECT_PATTERN.test(normalized) ||
    CHINESE_SEASON_HINT_DETECT_PATTERN.test(normalized)
  );
}

function normalizeTitleForMatch(value: string): string {
  return stripSeasonAndMediaWords(value || '')
    .toLowerCase()
    .replace(TITLE_QUOTE_PUNCTUATION_PATTERN, ' ')
    .replace(TITLE_SYMBOL_PUNCTUATION_PATTERN, ' ')
    .replace(TITLE_SOURCE_CODE_PATTERN, ' ')
    .replace(TITLE_SOURCE_CODE_COMPACT_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCompactTitleForMatch(value: string): string {
  return normalizeTitleForMatch(value).replace(/\s+/g, '');
}

function createBigrams(value: string): Map<string, number> {
  const text = value || '';
  const result = new Map<string, number>();
  if (!text) return result;
  if (text.length === 1) {
    result.set(text, 1);
    return result;
  }

  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text.slice(index, index + 2);
    result.set(gram, (result.get(gram) || 0) + 1);
  }
  return result;
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aBigrams = createBigrams(a);
  const bBigrams = createBigrams(b);
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0;

  let intersection = 0;
  let totalA = 0;
  let totalB = 0;

  aBigrams.forEach((count) => {
    totalA += count;
  });
  bBigrams.forEach((count) => {
    totalB += count;
  });

  aBigrams.forEach((countA, gram) => {
    const countB = bBigrams.get(gram) || 0;
    intersection += Math.min(countA, countB);
  });

  if (totalA + totalB === 0) return 0;
  return (2 * intersection) / (totalA + totalB);
}

function containmentScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.includes(shorter)) return 0;

  const coverage = shorter.length / longer.length;
  if (coverage >= 0.92) return 0.98;
  if (coverage >= 0.75) return 0.9;
  if (coverage >= 0.6) return 0.8;
  if (coverage >= 0.45) return 0.68;
  return coverage * 0.4;
}

function computeTitleSimilarity(
  sourceTitle: string,
  targetTitle: string
): number {
  const source = toCompactTitleForMatch(sourceTitle);
  const target = toCompactTitleForMatch(targetTitle);
  if (!source || !target) return 0;
  if (source === target) return 1;

  const byContainment = containmentScore(source, target);
  const byDice = diceCoefficient(source, target);
  return Math.max(byContainment, byDice);
}

function buildQueryTitleVariants(queryTitle: string): string[] {
  const variants = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeTitleForMatch(value);
    if (!normalized) return;
    variants.add(normalized);
  };

  const raw = (queryTitle || '').trim();
  push(raw);

  const stripped = stripSeasonAndMediaWords(raw);
  if (stripped && stripped !== raw) {
    push(stripped);
  }

  const quoted = raw.match(QUOTED_TITLE_PATTERN);
  if (quoted?.[1]) push(quoted[1]);

  const firstChunk = stripped
    .split(TITLE_FIRST_CHUNK_SPLITTER_PATTERN)[0]
    ?.trim();
  if (firstChunk && firstChunk !== stripped) push(firstChunk);

  return Array.from(variants);
}

function buildSearchQueryVariants(queryTitle: string): string[] {
  const variants = new Set<string>();
  const push = (value: string) => {
    const normalized = (value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    variants.add(normalized);
  };

  const raw = (queryTitle || '').trim();
  push(raw);

  const stripped = stripSeasonAndMediaWords(raw);
  push(stripped);

  const firstChunk = stripped
    .split(TITLE_FIRST_CHUNK_SPLITTER_PATTERN)[0]
    ?.trim();
  if (firstChunk && firstChunk !== stripped) {
    push(firstChunk);
  }

  return Array.from(variants);
}

function buildResultTitleVariants(item: {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
}): string[] {
  const variants = new Set<string>();
  const push = (value?: string) => {
    const normalized = normalizeTitleForMatch(value || '');
    if (!normalized) return;
    variants.add(normalized);
  };

  push(item.title);
  push(item.name);
  push(item.original_title);
  push(item.original_name);

  return Array.from(variants);
}

function scoreYearMatch(inputYear: string, candidateYear: string): number {
  if (!inputYear || !candidateYear) return 0;
  const delta = Math.abs(Number(inputYear) - Number(candidateYear));
  if (!Number.isFinite(delta)) return 0;
  if (delta === 0) return 0.08;
  if (delta === 1) return 0.03;
  if (delta >= 2) return -0.08;
  return 0;
}

function isLikelyNoisyQueryTitle(title: string): boolean {
  const raw = title || '';
  const hasSourceCode =
    /\b[a-z]{2,6}\s*[-_ ]\s*\d{2,6}\b/i.test(raw) ||
    /\b[a-z]{2,6}\d{2,6}\b/i.test(raw);
  const normalizedLength = toCompactTitleForMatch(raw).length;
  const punctuationCount = (raw.match(TITLE_PUNCTUATION_COUNTER_PATTERN) || [])
    .length;
  return hasSourceCode || (normalizedLength >= 18 && punctuationCount >= 3);
}

function getMinimumSimilarityThreshold(title: string): number {
  return isLikelyNoisyQueryTitle(title) ? 0.58 : 0.34;
}

function getBestSimilarityScore(
  queryVariants: string[],
  candidateVariants: string[]
): number {
  let best = 0;
  for (const queryVariant of queryVariants) {
    for (const candidateVariant of candidateVariants) {
      const score = computeTitleSimilarity(queryVariant, candidateVariant);
      if (score > best) best = score;
    }
  }
  return best;
}

function scoreSpecialFeaturePenalty(
  queryHasSeasonIntent: boolean,
  candidateVariants: string[]
): number {
  if (!queryHasSeasonIntent) return 0;
  const hasSpecialKeyword = candidateVariants.some((titleVariant) =>
    SPECIAL_FEATURE_KEYWORD_PATTERN.test(titleVariant)
  );
  return hasSpecialKeyword ? -0.26 : 0;
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

function toImageUrl(path?: string | null, size = 'w500'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function pickPreferredCertification(byCountry: Map<string, string>): string {
  const preferredCountries = ['US', 'CN', 'GB', 'HK', 'JP'];
  for (const country of preferredCountries) {
    const certification = byCountry.get(country);
    if (certification) return certification;
  }
  const first = byCountry.values().next();
  return first.done ? '' : first.value;
}

function pickMovieContentRatingFromRaw(raw: TmdbDetailRawResponse): string {
  const byCountry = new Map<string, string>();
  for (const item of raw.release_dates?.results || []) {
    const country = (item.iso_3166_1 || '').toUpperCase();
    if (!country) continue;
    const certification =
      item.release_dates?.find((entry) => (entry.certification || '').trim())
        ?.certification || '';
    if (!certification) continue;
    byCountry.set(country, certification);
  }
  return pickPreferredCertification(byCountry);
}

function pickTvContentRatingFromRaw(raw: TmdbDetailRawResponse): string {
  const byCountry = new Map<string, string>();
  for (const item of raw.content_ratings?.results || []) {
    const country = (item.iso_3166_1 || '').toUpperCase();
    const rating = (item.rating || '').trim();
    if (!country || !rating) continue;
    byCountry.set(country, rating);
  }
  return pickPreferredCertification(byCountry);
}

function pickTrailerUrlFromRaw(raw: TmdbDetailRawResponse): string {
  const typePriority: Record<string, number> = {
    Trailer: 4,
    Teaser: 3,
    Clip: 2,
    Featurette: 1,
  };

  const candidates = (raw.videos?.results || []).filter((item) => {
    const site = (item.site || '').toLowerCase();
    const type = item.type || '';
    return (
      site === 'youtube' &&
      Boolean(typePriority[type]) &&
      Boolean((item.key || '').trim())
    );
  });
  if (!candidates.length) return '';

  const getLangPriority = (lang?: string | null): number => {
    if (lang === 'zh') return 3;
    if (lang === 'en') return 2;
    if (lang === null || lang === undefined) return 1;
    return 0;
  };

  const sorted = [...candidates].sort((a, b) => {
    const typeDelta =
      (typePriority[b.type || ''] || 0) - (typePriority[a.type || ''] || 0);
    if (typeDelta !== 0) return typeDelta;
    const officialDelta =
      Number(Boolean(b.official)) - Number(Boolean(a.official));
    if (officialDelta !== 0) return officialDelta;
    return getLangPriority(b.iso_639_1) - getLangPriority(a.iso_639_1);
  });

  const key = sorted[0]?.key?.trim();
  return key ? `https://www.youtube.com/watch?v=${key}` : '';
}

function selectBestLogo(
  logos: TmdbLogoItem[],
  logoLanguagePreference: LogoLanguagePreference
): { filePath: string; aspectRatio?: number } | null {
  if (!logos.length) return null;

  const getLanguagePriority = (lang?: string | null): number => {
    if (logoLanguagePreference === 'en') {
      if (lang === 'en') return 4;
      if (lang === null || lang === undefined || lang === '') return 3;
      if (lang === 'zh') return 2;
      return 1;
    }

    if (lang === 'zh') return 4;
    if (lang === null || lang === undefined || lang === '') return 3;
    if (lang === 'en') return 2;
    return 1;
  };

  const sorted = logos
    .filter((logo) => logo.file_path)
    .sort((a, b) => {
      const lp =
        getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
      if (lp !== 0) return lp;
      const vr = (b.vote_average || 0) - (a.vote_average || 0);
      if (vr !== 0) return vr;
      return (b.width || 0) - (a.width || 0);
    });

  const best = sorted[0];
  if (!best?.file_path) return null;

  const aspectRatioRaw =
    typeof best.aspect_ratio === 'number' && Number.isFinite(best.aspect_ratio)
      ? best.aspect_ratio
      : typeof best.width === 'number' &&
        typeof best.height === 'number' &&
        best.width > 0 &&
        best.height > 0
      ? best.width / best.height
      : null;

  return {
    filePath: best.file_path,
    ...(aspectRatioRaw && aspectRatioRaw > 0
      ? { aspectRatio: aspectRatioRaw }
      : {}),
  };
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

async function resolveTmdbTargetFromTitle(
  title: string,
  year: string,
  mediaType: TmdbMediaType,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<{ id: number; mediaType: TmdbMediaType } | null> {
  const queryHasSeasonIntent = hasSeasonIntent(title);
  const primaryMediaType: TmdbMediaType = queryHasSeasonIntent
    ? 'tv'
    : mediaType;
  const otherType: TmdbMediaType =
    primaryMediaType === 'movie' ? 'tv' : 'movie';
  const queryVariants = buildQueryTitleVariants(title);
  const searchQueryVariants = buildSearchQueryVariants(title);
  const minSimilarity = getMinimumSimilarityThreshold(title);
  const attempts: Array<{
    endpoint: 'movie' | 'tv' | 'multi';
    year?: string;
  }> = queryHasSeasonIntent
    ? [
        // For season-style queries, first-air year filtering often points to specials.
        { endpoint: 'tv' },
        { endpoint: 'tv', year },
        { endpoint: otherType },
        { endpoint: otherType, year },
        { endpoint: 'multi' },
      ]
    : [
        { endpoint: primaryMediaType, year },
        { endpoint: primaryMediaType },
        { endpoint: otherType, year },
        { endpoint: otherType },
        { endpoint: 'multi' },
      ];

  for (const attempt of attempts) {
    for (const searchQuery of searchQueryVariants) {
      const params = new URLSearchParams({
        api_key: apiKey,
        language: tmdbLanguage,
        include_adult: 'false',
        query: searchQuery,
        page: '1',
      });

      if (attempt.year && attempt.endpoint !== 'multi') {
        params.set(
          attempt.endpoint === 'movie' ? 'year' : 'first_air_date_year',
          attempt.year
        );
      }

      try {
        const response = await fetch(
          `${TMDB_API_BASE_URL}/search/${
            attempt.endpoint
          }?${params.toString()}`,
          {
            signal,
            headers: {
              Accept: 'application/json',
            },
          }
        );
        if (!response.ok) continue;

        const payload = (await response.json()) as TmdbSearchResponse;
        const candidates = (payload.results || []).slice(0, 8);
        let bestCandidate: {
          id: number;
          mediaType: TmdbMediaType;
          score: number;
        } | null = null;

        for (const candidate of candidates) {
          const candidateId = Number(candidate.id);
          if (!Number.isInteger(candidateId) || candidateId <= 0) continue;

          const candidateMediaType: TmdbMediaType | null =
            attempt.endpoint === 'multi'
              ? candidate.media_type === 'movie' ||
                candidate.media_type === 'tv'
                ? candidate.media_type
                : null
              : attempt.endpoint;
          if (!candidateMediaType) continue;

          const candidateVariants = buildResultTitleVariants(candidate);
          if (candidateVariants.length === 0) continue;

          const titleScore = getBestSimilarityScore(
            queryVariants,
            candidateVariants
          );
          if (titleScore <= 0) continue;

          const candidateYear = toYear(
            candidate.release_date || candidate.first_air_date
          );
          const finalScore =
            titleScore +
            scoreYearMatch(year, candidateYear) +
            scoreSpecialFeaturePenalty(queryHasSeasonIntent, candidateVariants);

          if (!bestCandidate || finalScore > bestCandidate.score) {
            bestCandidate = {
              id: candidateId,
              mediaType: candidateMediaType,
              score: finalScore,
            };
          }
        }

        if (bestCandidate && bestCandidate.score >= minSimilarity) {
          return {
            id: bestCandidate.id,
            mediaType: bestCandidate.mediaType,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function fetchTmdbDetailRaw(
  mediaType: TmdbMediaType,
  id: number,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal,
  logoLanguagePreference: LogoLanguagePreference
): Promise<TmdbDetailRawResponse | null> {
  const appendToResponse =
    mediaType === 'movie'
      ? 'credits,videos,release_dates,images,recommendations,external_ids'
      : 'aggregate_credits,credits,videos,content_ratings,images,recommendations,external_ids';

  const includeImageLanguage = getTmdbImageLanguage(tmdbLanguage);

  const params = new URLSearchParams({
    api_key: apiKey,
    language: tmdbLanguage,
    append_to_response: appendToResponse,
    include_image_language: includeImageLanguage,
    include_video_language: getTmdbVideoLanguage(tmdbLanguage),
  });

  try {
    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}?${params.toString()}`,
      {
        signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as TmdbDetailRawResponse;
  } catch {
    return null;
  }
}

async function fetchTmdbCollectionRaw(
  id: number,
  apiKey: string,
  tmdbLanguage: string,
  signal: AbortSignal
): Promise<TmdbCollectionRawResponse | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    language: tmdbLanguage,
  });

  try {
    const response = await fetch(
      `${TMDB_API_BASE_URL}/collection/${id}?${params.toString()}`,
      {
        signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as TmdbCollectionRawResponse;
  } catch {
    return null;
  }
}

function mapRawDetailToResponse(
  raw: TmdbDetailRawResponse,
  input: {
    id: number;
    mediaType: TmdbMediaType;
    logoLanguagePreference: LogoLanguagePreference;
    fallbackTitle: string;
    fallbackYear: string;
    fallbackPoster: string;
    fallbackScore: string;
    collectionRaw?: TmdbCollectionRawResponse | null;
  }
): TmdbDetailResponse {
  const normalizedMovieCast = (raw.credits?.cast || []).map((member) => ({
    id: member.id ?? 0,
    name: (member.name || member.original_name || '').trim(),
    character: (member.character || '').trim(),
    profile: toImageUrl(member.profile_path, 'w185'),
  }));

  const normalizedTvAggregateCast = (raw.aggregate_credits?.cast || []).map(
    (member) => {
      const primaryRole = (
        member.roles || []
      ).reduce<TmdbDetailRawAggregateRole>(
        (best, role) =>
          (role.episode_count || 0) > (best.episode_count || 0) ? role : best,
        {}
      );

      return {
        id: member.id ?? 0,
        name: (member.name || member.original_name || '').trim(),
        character: (primaryRole.character || '').trim(),
        profile: toImageUrl(member.profile_path, 'w185'),
      };
    }
  );

  const castSource =
    input.mediaType === 'tv' && normalizedTvAggregateCast.length > 0
      ? normalizedTvAggregateCast
      : normalizedMovieCast;

  const castDedupe = new Set<number>();
  const cast = castSource.filter((member) => {
    if (member.id <= 0 || !member.name) return false;
    if (castDedupe.has(member.id)) return false;
    castDedupe.add(member.id);
    return true;
  });

  const contentRating =
    input.mediaType === 'movie'
      ? pickMovieContentRatingFromRaw(raw)
      : pickTvContentRatingFromRaw(raw);

  const runtime =
    input.mediaType === 'movie'
      ? raw.runtime ?? null
      : raw.episode_run_time?.[0] ?? null;

  const selectedLogo = selectBestLogo(
    raw.images?.logos || [],
    input.logoLanguagePreference
  );
  const recommendations = (raw.recommendations?.results || [])
    .slice(0, 24)
    .map((item) => {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id <= 0) return null;

      const title = (item.title || item.name || '').trim();
      if (!title) return null;

      const overview = (item.overview || '').trim();
      if (!overview) return null;

      const recommendationMediaType =
        item.media_type === 'movie' || item.media_type === 'tv'
          ? item.media_type
          : input.mediaType;

      return {
        id,
        mediaType: recommendationMediaType,
        title,
        poster:
          toImageUrl(item.poster_path, 'w500') ||
          toImageUrl(item.backdrop_path, 'w500'),
        backdrop: toImageUrl(item.backdrop_path, 'original'),
        year: toYear(item.release_date || item.first_air_date),
        score: toScore(item.vote_average),
        voteCount: item.vote_count || 0,
      };
    })
    .filter(
      (
        item
      ): item is {
        id: number;
        mediaType: TmdbMediaType;
        title: string;
        poster: string;
        backdrop: string;
        year: string;
        score: string;
        voteCount: number;
      } => Boolean(item)
    );

  const collectionSource = input.collectionRaw || raw.belongs_to_collection;
  const collectionParts =
    input.collectionRaw?.parts
      ?.map((item) => {
        const id = Number(item.id);
        if (!Number.isInteger(id) || id <= 0) return null;

        const title = (item.title || item.name || '').trim();
        if (!title) return null;

        return {
          id,
          mediaType: 'movie' as const,
          title,
          poster:
            toImageUrl(item.poster_path, 'w500') ||
            toImageUrl(item.backdrop_path, 'w500'),
          backdrop: toImageUrl(item.backdrop_path, 'original'),
          year: toYear(item.release_date || item.first_air_date),
          score: toScore(item.vote_average),
          voteCount: item.vote_count || 0,
        };
      })
      .filter(
        (
          item
        ): item is {
          id: number;
          mediaType: 'movie';
          title: string;
          poster: string;
          backdrop: string;
          year: string;
          score: string;
          voteCount: number;
        } => Boolean(item)
      )
      .sort((a, b) => {
        const ay = Number(a.year || 0);
        const by = Number(b.year || 0);
        return ay - by;
      }) || [];

  const collectionId = Number(collectionSource?.id);
  const collectionName = (collectionSource?.name || '').trim();
  const collection =
    input.mediaType === 'movie' &&
    Number.isInteger(collectionId) &&
    collectionId > 0 &&
    collectionName
      ? {
          id: collectionId,
          name: collectionName,
          overview: (input.collectionRaw?.overview || '').trim(),
          poster:
            toImageUrl(collectionSource?.poster_path, 'w500') ||
            toImageUrl(input.collectionRaw?.poster_path, 'w500'),
          backdrop:
            toImageUrl(collectionSource?.backdrop_path, 'original') ||
            toImageUrl(input.collectionRaw?.backdrop_path, 'original'),
          parts: collectionParts,
        }
      : undefined;

  return {
    id: raw.id || input.id,
    mediaType: input.mediaType,
    imdbId: (raw.imdb_id || raw.external_ids?.imdb_id || '').trim(),
    title: (raw.title || raw.name || input.fallbackTitle || '').trim(),
    logo: selectedLogo?.filePath
      ? `${TMDB_IMAGE_BASE_URL}/w500${selectedLogo.filePath}`
      : undefined,
    logoAspectRatio: selectedLogo?.aspectRatio,
    overview: (raw.overview || '').trim() || 'No overview available.',
    backdrop: toImageUrl(raw.backdrop_path, 'original'),
    poster: toImageUrl(raw.poster_path, 'w500') || input.fallbackPoster || '',
    score: toScore(raw.vote_average) || input.fallbackScore || '',
    voteCount: raw.vote_count || 0,
    year: toYear(raw.release_date || raw.first_air_date) || input.fallbackYear,
    releaseDate: normalizeReleaseDate(raw.release_date || raw.first_air_date),
    runtime,
    seasons: raw.number_of_seasons ?? null,
    episodes: raw.number_of_episodes ?? null,
    contentRating,
    genres: (raw.genres || [])
      .map((genre) => (genre.name || '').trim())
      .filter(Boolean),
    language: (raw.original_language || '').toUpperCase(),
    popularity:
      typeof raw.popularity === 'number' ? Math.round(raw.popularity) : null,
    cast,
    recommendations,
    collection,
    trailerUrl: pickTrailerUrlFromRaw(raw),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').trim();
  const year = normalizeYear(searchParams.get('year'));
  const fallbackPoster = (searchParams.get('poster') || '').trim();
  const fallbackScore = (searchParams.get('score') || '').trim();
  const mediaType = normalizeMediaType(
    searchParams.get('mediaType') || searchParams.get('type')
  );
  const logoLanguageParam =
    searchParams.get('logoLang') ||
    searchParams.get('logo_language') ||
    searchParams.get('logo_lang');
  const tmdbLanguage = normalizeTmdbLanguage(searchParams.get('tmdbLanguage'));
  let logoLanguagePreference = normalizeLogoLanguagePreference(
    logoLanguageParam,
    tmdbLanguage
  );

  const rawId = Number(searchParams.get('id'));
  const hasValidId = Number.isInteger(rawId) && rawId > 0;

  if (!hasValidId && !title) {
    return NextResponse.json(
      { error: 'missing id or title parameter' },
      { status: 400, headers: buildNoStoreHeaders() }
    );
  }

  const apiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'tmdb api key missing' },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DETAIL_REQUEST_TIMEOUT_MS
  );

  try {
    let resolvedId = rawId;
    let resolvedMediaType = mediaType;

    if (!hasValidId) {
      const resolved = await resolveTmdbTargetFromTitle(
        title,
        year,
        mediaType,
        apiKey,
        tmdbLanguage,
        controller.signal
      );
      if (!resolved) {
        return NextResponse.json(
          { error: 'tmdb detail not found' },
          { status: 404, headers: buildNoStoreHeaders() }
        );
      }
      resolvedId = resolved.id;
      resolvedMediaType = resolved.mediaType;
      logoLanguagePreference = normalizeLogoLanguagePreference(
        logoLanguageParam,
        tmdbLanguage
      );
    }

    const rawDetail = await fetchTmdbDetailRaw(
      resolvedMediaType,
      resolvedId,
      apiKey,
      tmdbLanguage,
      controller.signal,
      logoLanguagePreference
    );

    if (!rawDetail) {
      return NextResponse.json(
        { error: 'tmdb detail request failed' },
        { status: 502, headers: buildNoStoreHeaders() }
      );
    }

    if (!hasValidId) {
      const queryVariants = buildQueryTitleVariants(title);
      const detailVariants = buildResultTitleVariants({
        title: rawDetail.title,
        name: rawDetail.name,
      });
      const similarity = getBestSimilarityScore(queryVariants, detailVariants);
      const minSimilarity = getMinimumSimilarityThreshold(title);
      if (similarity < minSimilarity) {
        return NextResponse.json(
          { error: 'tmdb detail not found' },
          { status: 404, headers: buildNoStoreHeaders() }
        );
      }
    }

    const collectionId = Number(rawDetail.belongs_to_collection?.id);
    const collectionRaw =
      resolvedMediaType === 'movie' &&
      Number.isInteger(collectionId) &&
      collectionId > 0
        ? await fetchTmdbCollectionRaw(
            collectionId,
            apiKey,
            tmdbLanguage,
            controller.signal
          )
        : null;

    const payload = mapRawDetailToResponse(rawDetail, {
      id: resolvedId,
      mediaType: resolvedMediaType,
      logoLanguagePreference,
      fallbackTitle: title,
      fallbackYear: year,
      fallbackPoster,
      fallbackScore,
      collectionRaw,
    });

    return NextResponse.json(payload, { headers: buildNoStoreHeaders() });
  } catch {
    return NextResponse.json(
      { error: 'tmdb detail request failed' },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
