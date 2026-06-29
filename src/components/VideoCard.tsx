/* eslint-disable @typescript-eslint/no-explicit-any */

import { Bookmark, CheckCircle, Star } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  glassDialogCancelClass,
  glassDialogContentClass,
  glassDialogDangerActionClass,
  glassDialogDescriptionClass,
} from '@/components/dialogStyles';
import {
  buildTmdbDetailClientCacheKey as buildGlobalTmdbDetailCacheKey,
  fetchTmdbDetailWithClientCache as fetchGlobalTmdbDetailWithCache,
  prefetchTmdbDetail,
} from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { parseTmdbStorageId } from '@/lib/tmdb-history';
import {
  getTmdbImageLanguage,
  normalizeTmdbLanguage,
} from '@/lib/tmdb-language';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { normalizeReleaseDate } from '@/lib/tmdbRelease';
import { SearchResult } from '@/lib/types';

import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import PosterInfoCard from '@/components/PosterInfoCard';
import SeasonPickerModal from '@/components/SeasonPickerModal';
import TmdbDetailModal from '@/components/TmdbDetailModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  progress?: number;
  year?: string;
  subtitle?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'discover';
  currentEpisode?: number;
  onDelete?: () => void;
  rate?: string;
  items?: SearchResult[];
  type?: string;
  displayVariant?: 'default' | 'poster-info';
}

type TmdbMediaType = 'movie' | 'tv';

interface TmdbDetailCastItem {
  id: number;
  name: string;
  character: string;
}

interface TmdbCardDetail {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  logo?: string;
  overview: string;
  backdrop: string;
  poster: string;
  score: string;
  voteCount: number;
  year: string;
  releaseDate?: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  contentRating: string;
  genres: string[];
  language: string;
  popularity: number | null;
  cast: TmdbDetailCastItem[];
  trailerUrl: string;
}

interface TmdbDetailLookupInput {
  title: string;
  year: string;
  mediaType: TmdbMediaType;
  poster?: string;
  score?: string;
}

interface TmdbDetailRawGenre {
  name?: string;
}

interface TmdbDetailRawCast {
  id?: number;
  name?: string;
  character?: string;
}

interface TmdbDetailRawVideo {
  site?: string;
  type?: string;
  key?: string;
  official?: boolean;
  iso_639_1?: string | null;
}

interface TmdbDetailRawResponse {
  id?: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
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
  videos?: {
    results?: TmdbDetailRawVideo[];
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
}

interface TmdbSearchResultItem {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
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

const TMDB_CLIENT_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const TMDB_DETAIL_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES = 240;
const TMDB_DETAIL_PREFETCH_CONCURRENCY = 2;
const TMDB_DETAIL_PREFETCH_MAX_TOTAL = 48;

interface TmdbDetailClientCacheEntry {
  expiresAt: number;
  payload: TmdbCardDetail;
}

const tmdbDetailClientCache = new Map<string, TmdbDetailClientCacheEntry>();
const tmdbDetailClientPending = new Map<string, Promise<TmdbCardDetail>>();
const tmdbDetailPrefetchQueue: Array<() => void> = [];
const tmdbDetailPrefetchScheduledKeys = new Set<string>();
let tmdbDetailPrefetchActiveCount = 0;
const tmdbDetailPrefetchTotalCount = 0;

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
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

function selectBestLogoPath(
  logos: TmdbLogoItem[],
  tmdbLanguage = getCurrentTmdbLanguage()
): string {
  if (!logos.length) return '';

  const getLanguagePriority = (lang?: string | null): number => {
    if (normalizeTmdbLanguage(tmdbLanguage) === 'zh-CN') {
      if (lang === 'zh') return 4;
      if (lang === 'en') return 3;
      if (lang === null || lang === undefined) return 2;
      return 1;
    }
    if (lang === 'en') return 4;
    if (lang === 'zh') return 3;
    if (lang === null || lang === undefined) return 2;
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

  return sorted[0]?.file_path || '';
}

function normalizeMediaType(value?: string, episodes?: number): TmdbMediaType {
  if (value === 'tv' || value === 'show') return 'tv';
  if (value === 'movie') return 'movie';
  if (typeof episodes === 'number' && episodes > 1) return 'tv';
  return 'movie';
}

function normalizeDetailCacheTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildTmdbDetailCacheKey(input: TmdbDetailLookupInput): string {
  return buildGlobalTmdbDetailCacheKey({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    tmdbLanguage: getCurrentTmdbLanguage(),
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
  while (tmdbDetailClientCache.size > TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = tmdbDetailClientCache.keys().next().value;
    if (!oldestKey) break;
    tmdbDetailClientCache.delete(oldestKey);
  }
}

function readTmdbDetailClientCache(key: string): TmdbCardDetail | null {
  const hit = tmdbDetailClientCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    tmdbDetailClientCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeTmdbDetailClientCache(
  key: string,
  payload: TmdbCardDetail
): void {
  tmdbDetailClientCache.set(key, {
    payload,
    expiresAt: Date.now() + TMDB_DETAIL_CLIENT_CACHE_TTL_MS,
  });
  pruneTmdbDetailClientCache();
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
    task()
      .catch(() => {
        // ignore prefetch errors to keep interaction path clean
      })
      .finally(() => {
        tmdbDetailPrefetchActiveCount = Math.max(
          0,
          tmdbDetailPrefetchActiveCount - 1
        );
        pumpTmdbDetailPrefetchQueue();
      });
  });

  pumpTmdbDetailPrefetchQueue();
}

function hasSeasonHint(value: string): boolean {
  const text = (value || '').toLowerCase();
  if (!text.trim()) return false;
  return (
    /\u7b2c\s*[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*\u5b63/.test(
      text
    ) || /(?:season|series|s)\s*0*\d{1,2}/i.test(text)
  );
}

function stripSeasonHint(value: string): string {
  return (value || '')
    .replace(
      /\u7b2c\s*[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*\u5b63/gi,
      ' '
    )
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOOKUP_TITLE_PUNCTUATION_PATTERN =
  /[\u2018\u2019\u201c\u201d'"`.,;:!?()[\]{}<>/\-|\\\u3001\u3002\uFF0C\uFF01\uFF1F\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011]+/g;
const LOOKUP_ENGLISH_SEASON_DETECT_PATTERN =
  /\b(?:season|series|s)\s*0*\d{1,2}\b/i;
const LOOKUP_CHINESE_SEASON_DETECT_PATTERN =
  /\u7b2c\s*[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*(?:\u5b63|\u90e8|\u8f91)/i;
const LOOKUP_SPECIAL_FEATURE_KEYWORD_PATTERN =
  /(?:\u5e55\u540e|\u7279\u8f91|\u91cd\u9022|\u82b1\u7d6e|\u5236\u4f5c|\u7eaa\u5f55|\u756a\u5916|\u885d\u751f|making of|behind the scenes|behind the curtain|reunion|special|featurette|documentary)/i;

function normalizeLookupTitle(value: string): string {
  return stripSeasonHint(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(LOOKUP_TITLE_PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSeasonIntentForLookup(value: string): boolean {
  const normalized = (value || '').normalize('NFKC');
  return (
    LOOKUP_ENGLISH_SEASON_DETECT_PATTERN.test(normalized) ||
    LOOKUP_CHINESE_SEASON_DETECT_PATTERN.test(normalized)
  );
}

function buildLookupSearchQueries(value: string): string[] {
  const variants = new Set<string>();
  const push = (input: string) => {
    const normalized = (input || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    variants.add(normalized);
  };

  const raw = (value || '').trim();
  push(raw);
  push(stripSeasonHint(raw));
  return Array.from(variants);
}

function buildLookupQueryVariants(value: string): string[] {
  return buildLookupSearchQueries(value)
    .map((item) => normalizeLookupTitle(item))
    .filter(Boolean);
}

function buildLookupResultTitleVariants(
  candidate: TmdbSearchResultItem
): string[] {
  const variants = new Set<string>();
  const push = (input?: string) => {
    const normalized = normalizeLookupTitle(input || '');
    if (!normalized) return;
    variants.add(normalized);
  };

  push(candidate.title);
  push(candidate.name);
  push(candidate.original_title);
  push(candidate.original_name);
  return Array.from(variants);
}

function scoreLookupTitleSimilarity(
  queryVariants: string[],
  candidateVariants: string[]
): number {
  let best = 0;

  for (const queryVariant of queryVariants) {
    for (const candidateVariant of candidateVariants) {
      if (!queryVariant || !candidateVariant) continue;
      if (queryVariant === candidateVariant) {
        best = Math.max(best, 1);
        continue;
      }

      const longer =
        queryVariant.length >= candidateVariant.length
          ? queryVariant
          : candidateVariant;
      const shorter =
        queryVariant.length >= candidateVariant.length
          ? candidateVariant
          : queryVariant;

      if (!longer.includes(shorter)) continue;
      const coverage = shorter.length / longer.length;
      const score =
        coverage >= 0.92
          ? 0.98
          : coverage >= 0.75
          ? 0.9
          : coverage >= 0.6
          ? 0.8
          : coverage >= 0.45
          ? 0.68
          : coverage * 0.4;
      if (score > best) best = score;
    }
  }

  return best;
}

function scoreLookupYearMatch(
  inputYear: string,
  candidateYear: string
): number {
  if (!inputYear || !candidateYear) return 0;
  const delta = Math.abs(Number(inputYear) - Number(candidateYear));
  if (!Number.isFinite(delta)) return 0;
  if (delta === 0) return 0.08;
  if (delta === 1) return 0.03;
  if (delta >= 2) return -0.08;
  return 0;
}

function scoreLookupSpecialFeaturePenalty(
  hasSeasonIntent: boolean,
  candidateVariants: string[]
): number {
  if (!hasSeasonIntent) return 0;
  const hasSpecialKeyword = candidateVariants.some((titleVariant) =>
    LOOKUP_SPECIAL_FEATURE_KEYWORD_PATTERN.test(titleVariant)
  );
  return hasSpecialKeyword ? -0.26 : 0;
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
  const candidates = (raw.videos?.results || []).filter(
    (item) =>
      item.site === 'YouTube' && item.type === 'Trailer' && Boolean(item.key)
  );
  if (!candidates.length) return '';

  const getLangPriority = (lang?: string | null): number => {
    if (lang === 'zh') return 3;
    if (lang === 'en') return 2;
    if (lang === null || lang === undefined) return 1;
    return 0;
  };

  const sorted = [...candidates].sort((a, b) => {
    const officialDelta =
      Number(Boolean(b.official)) - Number(Boolean(a.official));
    if (officialDelta !== 0) return officialDelta;
    return getLangPriority(b.iso_639_1) - getLangPriority(a.iso_639_1);
  });

  const key = sorted[0]?.key;
  return key ? `https://www.youtube.com/watch?v=${key}` : '';
}

async function resolveTmdbTargetFromTitle(
  title: string,
  year: string,
  mediaType: TmdbMediaType
): Promise<{ id: number; mediaType: TmdbMediaType } | null> {
  if (!TMDB_CLIENT_API_KEY) return null;
  const tmdbLanguage = getCurrentTmdbLanguage();

  const queryHasSeasonIntent = hasSeasonIntentForLookup(title);
  const primaryMediaType: TmdbMediaType = queryHasSeasonIntent
    ? 'tv'
    : mediaType;
  const otherType: TmdbMediaType =
    primaryMediaType === 'movie' ? 'tv' : 'movie';
  const searchQueryVariants = buildLookupSearchQueries(title);
  const queryTitleVariants = buildLookupQueryVariants(title);
  const minSimilarityThreshold = 0.34;
  const attempts: Array<{
    endpoint: 'movie' | 'tv' | 'multi';
    year?: string;
  }> = queryHasSeasonIntent
    ? [
        // Season queries should not rely on first-air year in the first pass.
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
        api_key: TMDB_CLIENT_API_KEY,
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
          { cache: 'no-store' }
        );
        if (!response.ok) continue;

        const payload = (await response.json()) as {
          results?: TmdbSearchResultItem[];
        };
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

          const candidateTitleVariants =
            buildLookupResultTitleVariants(candidate);
          if (candidateTitleVariants.length === 0) continue;

          const titleScore = scoreLookupTitleSimilarity(
            queryTitleVariants,
            candidateTitleVariants
          );
          if (titleScore <= 0) continue;

          const candidateYear = toYear(
            candidate.release_date || candidate.first_air_date
          );
          const mediaBoost =
            queryHasSeasonIntent && candidateMediaType === 'tv' ? 0.05 : 0;
          const finalScore =
            titleScore +
            scoreLookupYearMatch(year, candidateYear) +
            scoreLookupSpecialFeaturePenalty(
              queryHasSeasonIntent,
              candidateTitleVariants
            ) +
            mediaBoost;

          if (!bestCandidate || finalScore > bestCandidate.score) {
            bestCandidate = {
              id: candidateId,
              mediaType: candidateMediaType,
              score: finalScore,
            };
          }
        }

        if (bestCandidate && bestCandidate.score >= minSimilarityThreshold) {
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

async function fetchTmdbLogo(
  mediaType: TmdbMediaType,
  id: number
): Promise<string> {
  if (!TMDB_CLIENT_API_KEY) return '';
  const tmdbLanguage = getCurrentTmdbLanguage();

  try {
    const params = new URLSearchParams({
      api_key: TMDB_CLIENT_API_KEY,
      include_image_language: getTmdbImageLanguage(tmdbLanguage),
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}/images?${params.toString()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return '';

    const data = (await response.json()) as TmdbImagesResponse;
    const logoPath = selectBestLogoPath(data.logos || [], tmdbLanguage);
    return logoPath ? `${TMDB_IMAGE_BASE_URL}/w500${logoPath}` : '';
  } catch {
    return '';
  }
}

async function fetchTmdbDetailByTitle(
  input: TmdbDetailLookupInput
): Promise<TmdbCardDetail> {
  const routeParams = new URLSearchParams({
    title: input.title,
    type: input.mediaType,
  });
  if (input.year) {
    routeParams.set('year', input.year);
  }
  if (input.poster) {
    routeParams.set('poster', input.poster);
  }
  if (input.score) {
    routeParams.set('score', input.score);
  }
  routeParams.set('tmdbLanguage', getCurrentTmdbLanguage());

  try {
    const routeResponse = await fetch(
      `/api/tmdb/detail?${routeParams.toString()}`
    );
    if (routeResponse.ok) {
      return (await routeResponse.json()) as TmdbCardDetail;
    }
  } catch {
    // Fallback to direct TMDB calls below.
  }

  const resolved = await resolveTmdbTargetFromTitle(
    input.title,
    input.year,
    input.mediaType
  );
  if (!resolved) {
    throw new Error('TMDB detail request failed: 404');
  }

  const appendToResponse =
    resolved.mediaType === 'movie'
      ? 'credits,videos,release_dates'
      : 'credits,videos,content_ratings';

  const params = new URLSearchParams({
    api_key: TMDB_CLIENT_API_KEY,
    language: getCurrentTmdbLanguage(),
    append_to_response: appendToResponse,
  });

  const [response, logo] = await Promise.all([
    fetch(
      `${TMDB_API_BASE_URL}/${resolved.mediaType}/${
        resolved.id
      }?${params.toString()}`,
      { cache: 'no-store' }
    ),
    fetchTmdbLogo(resolved.mediaType, resolved.id),
  ]);

  if (!response.ok) {
    throw new Error(`TMDB detail request failed: ${response.status}`);
  }

  const raw = (await response.json()) as TmdbDetailRawResponse;

  const cast = (raw.credits?.cast || [])
    .slice(0, 8)
    .map((member) => ({
      id: member.id ?? 0,
      name: member.name || '',
      character: member.character || '',
    }))
    .filter((member) => member.id > 0 && member.name);

  const contentRating =
    resolved.mediaType === 'movie'
      ? pickMovieContentRatingFromRaw(raw)
      : pickTvContentRatingFromRaw(raw);

  const runtime =
    resolved.mediaType === 'movie'
      ? raw.runtime ?? null
      : raw.episode_run_time?.[0] ?? null;

  return {
    id: raw.id || resolved.id,
    mediaType: resolved.mediaType,
    title: (raw.title || raw.name || input.title || '').trim(),
    logo: logo || undefined,
    overview: (raw.overview || '').trim() || 'No overview available.',
    backdrop: toImageUrl(raw.backdrop_path, 'original'),
    poster: toImageUrl(raw.poster_path, 'w500') || input.poster || '',
    score: toScore(raw.vote_average) || input.score || '',
    voteCount: raw.vote_count || 0,
    year: toYear(raw.release_date || raw.first_air_date) || input.year,
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
    trailerUrl: pickTrailerUrlFromRaw(raw),
  };
}

async function fetchTmdbDetailWithClientCache(
  input: TmdbDetailLookupInput
): Promise<TmdbCardDetail> {
  return fetchGlobalTmdbDetailWithCache<TmdbCardDetail>({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    poster: input.poster,
    score: input.score,
    tmdbLanguage: getCurrentTmdbLanguage(),
  });
}

function scheduleTmdbDetailPrefetch(input: TmdbDetailLookupInput): void {
  prefetchTmdbDetail({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    poster: input.poster,
    score: input.score,
    tmdbLanguage: getCurrentTmdbLanguage(),
  });
}

export default function VideoCard({
  id,
  title = '',
  query = '',
  poster = '',
  episodes,
  source,
  source_name,
  progress = 0,
  year,
  subtitle,
  from,
  currentEpisode,
  onDelete,
  rate,
  items,
  type = '',
  displayVariant = 'default',
}: VideoCardProps) {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbCardDetail | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [favoriteDeleteDialogOpen, setFavoriteDeleteDialogOpen] =
    useState(false);
  const [favoriteDeleteLoading, setFavoriteDeleteLoading] = useState(false);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [seasonPickerData, setSeasonPickerData] = useState<{
    tmdbId: string;
    baseTitle: string;
    year: string;
    poster: string;
    score: string;
    seasonCount: number;
  }>({
    tmdbId: '',
    baseTitle: '',
    year: '',
    poster: '',
    score: '',
    seasonCount: 0,
  });
  const detailCacheRef = useRef<Record<string, TmdbCardDetail>>({});
  const detailRequestIdRef = useRef(0);
  const suppressCardClickUntilRef = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hasScheduledPrefetchRef = useRef(false);

  const isAggregate = from === 'search' && !!items?.length;

  const aggregateData = useMemo(() => {
    if (!isAggregate || !items) return null;
    const episodeCountMap = new Map<number, number>();
    items.forEach((item) => {
      const totalEpisodes =
        typeof item.total_episodes === 'number' && item.total_episodes > 0
          ? Math.floor(item.total_episodes)
          : item.source === 'tmdb' &&
            (item.type_name || '').trim().toLowerCase() === 'tv'
          ? 0
          : item.episodes?.length || 0;
      if (totalEpisodes > 0) {
        episodeCountMap.set(
          totalEpisodes,
          (episodeCountMap.get(totalEpisodes) || 0) + 1
        );
      }
    });

    const getMostFrequent = <T extends string | number>(
      map: Map<T, number>
    ) => {
      let maxCount = 0;
      let result: T | undefined;
      map.forEach((cnt, key) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          result = key;
        }
      });
      return result;
    };

    return {
      first: items[0],
      mostFrequentEpisodes: getMostFrequent(episodeCountMap) || 0,
    };
  }, [isAggregate, items]);

  const actualTitle = aggregateData?.first.title ?? title;
  const actualPoster = aggregateData?.first.poster ?? poster;
  const actualSource = aggregateData?.first.source ?? source;
  const actualId = aggregateData?.first.id ?? id;
  const actualEpisodes = aggregateData?.mostFrequentEpisodes ?? episodes;
  const actualYear = aggregateData?.first.year ?? year;
  const actualSourceName =
    aggregateData?.first.source_name ?? source_name ?? '';
  const actualQuery = query || '';
  const aggregateFirstTypeName = (aggregateData?.first.type_name || '')
    .trim()
    .toLowerCase();
  const aggregateFirstEpisodeCount =
    typeof aggregateData?.first.total_episodes === 'number' &&
    aggregateData.first.total_episodes > 0
      ? Math.floor(aggregateData.first.total_episodes)
      : aggregateData?.first.source === 'tmdb' &&
        aggregateFirstTypeName === 'tv'
      ? 0
      : aggregateData?.first.episodes?.length || 0;
  const actualSearchType = isAggregate
    ? aggregateFirstTypeName === 'tv'
      ? 'tv'
      : aggregateFirstTypeName === 'movie'
      ? 'movie'
      : aggregateFirstEpisodeCount === 1
      ? 'movie'
      : 'tv'
    : type;
  const tmdbTrigger = useMemo<TmdbDetailLookupInput>(
    () => ({
      title: (actualTitle || '').trim(),
      year: normalizeYear(actualYear),
      mediaType: normalizeMediaType(actualSearchType, actualEpisodes),
      poster: actualPoster,
      score: rate || '',
    }),
    [
      actualTitle,
      actualYear,
      actualSearchType,
      actualEpisodes,
      actualPoster,
      rate,
    ]
  );
  const tmdbDetailCacheKey = useMemo(
    () => buildTmdbDetailCacheKey(tmdbTrigger),
    [i18n.language, tmdbTrigger]
  );

  // Keep favorite state synced with shared storage.
  useEffect(() => {
    if (from === 'discover' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        throw new Error('Failed to check favorite status');
      }
    };

    fetchFavoriteStatus();

    // Listen for favorite data changes.
    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        // Update this card from its storage key.
        const isNowFavorited = !!newFavorites[storageKey];
        setFavorited(isNowFavorited);
      }
    );

    return unsubscribe;
  }, [from, actualSource, actualId]);

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from === 'discover' || !actualSource || !actualId) return;
      try {
        if (favorited) {
          if (from === 'favorite') {
            setFavoriteDeleteDialogOpen(true);
            return;
          }
          // Remove favorite.
          await deleteFavorite(actualSource, actualId);
          setFavorited(false);
        } else {
          // Save favorite.
          await saveFavorite(actualSource, actualId, {
            title: actualTitle,
            source_name: source_name || '',
            year: actualYear || '',
            cover: actualPoster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          setFavorited(true);
        }
      } catch (err) {
        throw new Error('Failed to toggle favorite state');
      }
    },
    [
      from,
      actualSource,
      actualId,
      actualTitle,
      source_name,
      actualYear,
      actualPoster,
      actualEpisodes,
      favorited,
    ]
  );

  const handleConfirmDeleteFavorite = useCallback(async () => {
    if (!actualSource || !actualId) return;
    setFavoriteDeleteLoading(true);
    try {
      await deleteFavorite(actualSource, actualId);
      setFavorited(false);
      onDelete?.();
      setFavoriteDeleteDialogOpen(false);
    } catch {
      throw new Error('Failed to delete favorite');
    } finally {
      setFavoriteDeleteLoading(false);
    }
  }, [actualSource, actualId, onDelete]);

  const handleOpenDeleteDialog = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from !== 'playrecord' || !actualSource || !actualId) return;
      setDeleteDialogOpen(true);
    },
    [from, actualSource, actualId]
  );

  const handleConfirmDeleteRecord = useCallback(async () => {
    if (from !== 'playrecord' || !actualSource || !actualId) return;
    setDeleteLoading(true);
    try {
      await deletePlayRecord(actualSource, actualId);
      onDelete?.();
      setDeleteDialogOpen(false);
    } catch (err) {
      throw new Error('Failed to delete play record');
    } finally {
      setDeleteLoading(false);
    }
  }, [from, actualSource, actualId, onDelete]);

  const pushPlayByTitle = useCallback(
    (titleValue: string, yearValue: string, searchTypeValue: string) => {
      router.push(
        `/play?title=${encodeURIComponent(titleValue.trim())}${
          yearValue ? `&year=${yearValue}` : ''
        }${searchTypeValue ? `&stype=${searchTypeValue}` : ''}`
      );
    },
    [router]
  );

  const fetchTmdbSeasonCountByTitle = useCallback(
    async (titleValue: string, yearValue: string): Promise<number> => {
      const trimmedTitle = (titleValue || '').trim();
      if (!trimmedTitle) return 0;

      try {
        const payload = await fetchGlobalTmdbDetailWithCache<{
          mediaType?: 'movie' | 'tv';
          seasons?: number | null;
        }>({
          title: trimmedTitle,
          mediaType: 'tv',
          year: yearValue.trim(),
          tmdbLanguage: getCurrentTmdbLanguage(),
        });
        if (payload.mediaType !== 'tv') return 0;
        const seasons = payload.seasons;
        if (typeof seasons !== 'number' || !Number.isFinite(seasons)) return 0;
        return seasons > 0 ? Math.floor(seasons) : 0;
      } catch {
        return 0;
      }
    },
    [i18n.language]
  );

  const goToPlay = useCallback(async () => {
    const titleForPlay = actualTitle.trim();
    const tmdbStorage = parseTmdbStorageId(String(actualId || ''));

    if (actualSource === 'tmdb' && tmdbStorage) {
      const mediaType =
        tmdbStorage.season !== null ||
        detailData?.mediaType === 'tv' ||
        actualSearchType === 'tv' ||
        Number(actualEpisodes || 0) > 1
          ? 'tv'
          : 'movie';

      if (
        mediaType === 'tv' &&
        !tmdbStorage.season &&
        !hasSeasonHint(titleForPlay)
      ) {
        const detailSeasons =
          detailData?.mediaType === 'tv' &&
          typeof detailData.seasons === 'number' &&
          detailData.seasons > 1
            ? Math.floor(detailData.seasons)
            : 0;
        const seasonCount =
          detailSeasons ||
          (await fetchTmdbSeasonCountByTitle(titleForPlay, actualYear || ''));
        if (seasonCount > 1) {
          setDetailOpen(false);
          setDetailLoading(false);
          setDetailError(null);
          setSeasonPickerData({
            tmdbId: tmdbStorage.tmdbId,
            baseTitle: stripSeasonHint(titleForPlay) || titleForPlay,
            year: actualYear || '',
            poster: detailData?.poster || detailData?.backdrop || actualPoster,
            score: detailData?.score || rate || '',
            seasonCount,
          });
          setSeasonPickerOpen(true);
          return;
        }
      }

      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId: tmdbStorage.tmdbId,
          mediaType,
          title: titleForPlay,
          year: actualYear || '',
          poster: detailData?.poster || detailData?.backdrop || actualPoster,
          score: detailData?.score || rate || '',
          season: tmdbStorage.season || 1,
          episode: currentEpisode || 1,
        })
      );
      return;
    }

    if (from === 'discover') {
      if (detailData?.id) {
        router.push(
          buildTmdbPlayerPageUrl({
            tmdbId: detailData.id,
            mediaType: detailData.mediaType,
            title: detailData.title || titleForPlay,
            year: detailData.year || actualYear || '',
            poster: detailData.poster || detailData.backdrop || actualPoster,
            score: detailData.score || rate || '',
            season: 1,
            episode: 1,
          })
        );
        return;
      }

      pushPlayByTitle(titleForPlay, actualYear || '', actualSearchType || '');
      return;
    }

    if (actualSource && actualId) {
      router.push(
        `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
          actualTitle
        )}${actualYear ? `&year=${actualYear}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`
      );
    }
  }, [
    from,
    actualSource,
    actualId,
    actualTitle,
    actualEpisodes,
    actualSearchType,
    detailData,
    fetchTmdbSeasonCountByTitle,
    actualYear,
    actualPoster,
    rate,
    currentEpisode,
    pushPlayByTitle,
    router,
    isAggregate,
    actualQuery,
  ]);

  const handleSeasonPick = useCallback(
    (season: number) => {
      const tmdbId = seasonPickerData.tmdbId.trim();
      const base = seasonPickerData.baseTitle.trim();
      if (!tmdbId || !base) return;
      const yearForPlay = seasonPickerData.year;
      setSeasonPickerOpen(false);
      setSeasonPickerData({
        tmdbId: '',
        baseTitle: '',
        year: '',
        poster: '',
        score: '',
        seasonCount: 0,
      });
      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId,
          mediaType: 'tv',
          title: base,
          year: yearForPlay,
          poster: seasonPickerData.poster,
          score: seasonPickerData.score,
          season,
          episode: 1,
        })
      );
    },
    [router, seasonPickerData]
  );

  const handleSeasonPickerClose = useCallback(() => {
    setSeasonPickerOpen(false);
    setSeasonPickerData({
      tmdbId: '',
      baseTitle: '',
      year: '',
      poster: '',
      score: '',
      seasonCount: 0,
    });
  }, []);

  const config = useMemo(() => {
    const configs = {
      playrecord: {
        showSourceName: false,
        showProgress: true,
        showHeart: true,
        showCheckCircle: true,
        showRating: false,
      },
      favorite: {
        showSourceName: false,
        showProgress: false,
        showHeart: true,
        showCheckCircle: false,
        showRating: false,
      },
      search: {
        showSourceName: false,
        showProgress: false,
        showHeart: !isAggregate,
        showCheckCircle: false,
        showRating: false,
      },
      discover: {
        showSourceName: false,
        showProgress: false,
        showHeart: false,
        showCheckCircle: false,
        showRating: !!rate,
      },
    };
    return configs[from] || configs.search;
  }, [from, isAggregate, rate]);

  const prefetchTmdbDetail = useCallback(() => {
    if (hasScheduledPrefetchRef.current) return;
    if (from === 'playrecord') return;
    if (!tmdbTrigger.title) return;

    hasScheduledPrefetchRef.current = true;
    scheduleTmdbDetailPrefetch(tmdbTrigger);
  }, [from, i18n.language, tmdbTrigger]);

  useEffect(() => {
    hasScheduledPrefetchRef.current = false;
  }, [tmdbDetailCacheKey]);

  useEffect(() => {
    if (from === 'playrecord') return;
    if (!tmdbTrigger.title) return;
    if (!canUseTmdbDetailPrefetch()) return;

    const node = cardRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      prefetchTmdbDetail();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        prefetchTmdbDetail();
        observer.disconnect();
      },
      {
        rootMargin: '240px 0px 240px 0px',
        threshold: 0.05,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [from, prefetchTmdbDetail, tmdbTrigger.title]);

  const handleCloseDetail = useCallback(() => {
    suppressCardClickUntilRef.current = Date.now() + 220;
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const handleCardClick = useCallback(() => {
    if (Date.now() < suppressCardClickUntilRef.current) return;
    if (from === 'playrecord') {
      goToPlay();
      return;
    }
    if (!tmdbTrigger.title) {
      goToPlay();
      return;
    }

    const tmdbStorage =
      actualSource === 'tmdb' ? parseTmdbStorageId(String(actualId || '')) : null;
    const tmdbDetailId =
      tmdbStorage?.tmdbId ||
      (actualSource === 'tmdb' && /^\d+$/.test(String(actualId || ''))
        ? String(actualId)
        : '');

    const detailUrl = buildTmdbDetailPageUrl({
      id: tmdbDetailId || undefined,
      title: tmdbTrigger.title,
      mediaType: tmdbTrigger.mediaType,
      year: tmdbTrigger.year,
      poster: tmdbTrigger.poster,
      score: tmdbTrigger.score,
    });

    if (from === 'discover') {
      window.open(detailUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    router.push(detailUrl);
  }, [actualId, actualSource, from, goToPlay, router, tmdbTrigger]);

  const handleCardContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-card-action="true"]')) {
        return;
      }
      void handleCardClick();
    },
    [handleCardClick]
  );

  const handleRetryDetail = useCallback(async () => {
    if (!tmdbTrigger.title) return;

    setDetailError(null);

    const cached = detailCacheRef.current[tmdbDetailCacheKey];
    if (cached) {
      setDetailData(cached);
      setDetailLoading(false);
      return;
    }

    setDetailData(null);
    setDetailLoading(true);
    const requestId = ++detailRequestIdRef.current;

    try {
      const detail = await fetchTmdbDetailWithClientCache(tmdbTrigger);
      if (detailRequestIdRef.current !== requestId) return;
      detailCacheRef.current[tmdbDetailCacheKey] = detail;
      setDetailData(detail);
    } catch (err) {
      if (detailRequestIdRef.current !== requestId) return;
      setDetailError((err as Error).message || 'TMDB detail load failed');
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, [i18n.language, tmdbDetailCacheKey, tmdbTrigger]);

  useEffect(() => {
    if (!detailOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseDetail();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen, handleCloseDetail]);

  const cardActionButtonClassName =
    'inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all duration-300 ease-out hover:bg-black/60 hover:shadow-[0_10px_28px_rgba(0,0,0,0.36)]';

  const clampedProgress = Math.min(100, Math.max(0, progress || 0));
  const visibleProgress =
    clampedProgress > 0 ? Math.max(clampedProgress, 14) : 0;
  const showProgress = config.showProgress && progress !== undefined;
  const cardActionPositionClassName =
    displayVariant === 'poster-info' && showProgress
      ? 'top-3 right-3'
      : 'bottom-3 right-3';

  const cardActionButtons =
    config.showHeart || config.showCheckCircle ? (
      <div
        data-card-action='true'
        className={`absolute ${cardActionPositionClassName} z-10 flex gap-2 opacity-0 translate-y-2 transition-all duration-300 ease-in-out group-hover:opacity-100 group-hover:translate-y-0`}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {config.showCheckCircle && (
          <button
            type='button'
            data-card-action='true'
            aria-label='delete-play-record'
            onClick={handleOpenDeleteDialog}
            onMouseDown={(event) => event.stopPropagation()}
            className={`${cardActionButtonClassName} hover:text-red-400`}
          >
            <CheckCircle size={18} />
          </button>
        )}
        {config.showHeart && (
          <button
            type='button'
            data-card-action='true'
            aria-label='toggle-favorite'
            onClick={handleToggleFavorite}
            onMouseDown={(event) => event.stopPropagation()}
            className={cardActionButtonClassName}
          >
            <Bookmark
              size={18}
              className={`transition-all duration-300 ease-out ${
                favorited
                  ? 'fill-yellow-300 stroke-yellow-300'
                  : 'fill-transparent stroke-white hover:stroke-yellow-300'
              } hover:scale-[1.1]`}
            />
          </button>
        )}
      </div>
    ) : null;

  const progressBar = showProgress ? (
    <div className='mt-1 h-1 w-full overflow-hidden rounded-full bg-black/35 backdrop-blur-md'>
      <div
        className='h-full rounded-full bg-zinc-100/95 transition-all duration-500 ease-out'
        style={{ width: `${visibleProgress}%` }}
      />
    </div>
  ) : null;

  const posterInfoProgressOverlay = showProgress ? (
    <div className='absolute bottom-3 left-1/2 z-10 h-1.5 w-[82%] -translate-x-1/2 overflow-hidden rounded-full bg-black/35 backdrop-blur-md'>
      <div
        className='h-full rounded-full bg-zinc-100/95 transition-all duration-500 ease-out'
        style={{ width: `${visibleProgress}%` }}
      />
    </div>
  ) : null;

  const cardBody =
    displayVariant === 'poster-info' ? (
      <PosterInfoCard
        title={actualTitle}
        poster={actualPoster}
        year={actualYear}
        subtitle={subtitle}
        rating={config.showRating ? rate : ''}
        variant='listing'
        onImageLoaded={() => setIsLoading(true)}
        overlay={
          <>
            {cardActionButtons}
            {posterInfoProgressOverlay}
          </>
        }
      />
    ) : (
      <>
        <div className='relative aspect-[2/3] overflow-hidden rounded-[var(--ui-radius-card)]'>
          {!isLoading && <ImagePlaceholder aspectRatio='aspect-[2/3]' />}
          {actualPoster ? (
            <Image
              src={actualPoster}
              alt={actualTitle}
              fill
              className='object-cover'
              referrerPolicy='no-referrer'
              onLoadingComplete={() => setIsLoading(true)}
            />
          ) : null}

          <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100' />

          {cardActionButtons}

          {config.showRating && rate ? (
            <div className='absolute top-2 left-2 bg-black/70 text-yellow-300 text-xs font-bold h-7 px-2.5 rounded-full flex items-center gap-1 shadow-md'>
              <Star size={14} stroke='currentColor' fill='currentColor' />
              <span>{rate}</span>
            </div>
          ) : null}

          {actualEpisodes && actualEpisodes > 1 && (
            <div className='absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded-md shadow-md opacity-0 -translate-y-1 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-110'>
              {currentEpisode
                ? `${currentEpisode}/${actualEpisodes}`
                : actualEpisodes}
            </div>
          )}
        </div>

        {progressBar}

        <div className='mt-2 text-center'>
          <div className='relative'>
            <span className='block text-sm font-semibold truncate text-gray-900 dark:text-gray-100 transition-colors duration-300 ease-in-out group-hover:text-blue-600 dark:group-hover:text-blue-400 peer'>
              {actualTitle}
            </span>
            <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none'>
              {actualTitle}
              <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
            </div>
          </div>
          {config.showSourceName && source_name && (
            <span className='block text-xs text-gray-500 dark:text-gray-400 mt-1'>
              <span className='inline-block border rounded px-2 py-0.5 border-gray-500/60 dark:border-gray-400/60 transition-all duration-300 ease-in-out group-hover:border-blue-500/60 group-hover:text-blue-600 dark:group-hover:text-blue-400 blur-[3px] opacity-70 group-hover:blur-0 group-hover:opacity-100'>
                {source_name}
              </span>
            </span>
          )}
        </div>
      </>
    );

  return (
    <div
      ref={cardRef}
      className='group relative w-full rounded-[var(--ui-radius-card)] bg-transparent cursor-pointer transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-[500]'
      onClick={handleCardContainerClick}
      onPointerEnter={prefetchTmdbDetail}
      onTouchStart={prefetchTmdbDetail}
    >
      {cardBody}

      <TmdbDetailModal
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        titleLogo={detailData?.logo}
        favoriteTarget={
          config.showHeart && actualSource && actualId
            ? {
                source: actualSource,
                id: actualId,
                title: actualTitle,
                sourceName: actualSourceName,
                year: actualYear || '',
                cover: actualPoster,
                totalEpisodes: actualEpisodes ?? 1,
                searchTitle: actualQuery || actualTitle,
              }
            : undefined
        }
        onClose={handleCloseDetail}
        onRetry={() => {
          void handleRetryDetail();
        }}
        onPlay={goToPlay}
      />
      <SeasonPickerModal
        open={seasonPickerOpen}
        title={seasonPickerData.baseTitle || actualTitle}
        logo={detailData?.logo}
        backdrop={detailData?.backdrop || detailData?.poster || actualPoster}
        seasonCount={seasonPickerData.seasonCount}
        onClose={handleSeasonPickerClose}
        onPickSeason={handleSeasonPick}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          className={glassDialogContentClass}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('my.confirmDeletion')}</AlertDialogTitle>
            <AlertDialogDescription className={glassDialogDescriptionClass}>
              {t('home.deleteWatchHistoryItem')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteLoading}
              className={glassDialogCancelClass}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteRecord();
              }}
              className={glassDialogDangerActionClass}
            >
              {deleteLoading ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={favoriteDeleteDialogOpen}
        onOpenChange={setFavoriteDeleteDialogOpen}
      >
        <AlertDialogContent
          className={glassDialogContentClass}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('my.removeFavoriteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className={glassDialogDescriptionClass}>
              {t('my.removeFavoriteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={favoriteDeleteLoading}
              className={glassDialogCancelClass}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={favoriteDeleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteFavorite();
              }}
              className={glassDialogDangerActionClass}
            >
              {favoriteDeleteLoading
                ? t('common.processing')
                : t('common.removeFromFavorites')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
