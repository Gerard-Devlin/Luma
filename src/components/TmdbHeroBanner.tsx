'use client';

import { Bookmark, Clock3, Info, Play, Star, Users } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type SyntheticEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import {
  DEFAULT_TMDB_LANGUAGE,
  getStableTmdbImageLanguage,
  normalizeTmdbLanguage,
} from '@/lib/tmdb-language';
import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { fetchTmdbDetailWithClientCache } from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { isFutureReleaseDate, normalizeReleaseDate } from '@/lib/tmdbRelease';

import ReleaseYearBadge from '@/components/ReleaseYearBadge';
import SeasonPickerModal from '@/components/SeasonPickerModal';
import TmdbDetailModal from '@/components/TmdbDetailModal';

interface TmdbHeroItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  year: string;
  score: string;
  backdrop: string;
  poster: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  releaseDate: string;
  logo?: string;
}

interface TmdbHeroResponse {
  results?: TmdbHeroItem[];
}

interface TmdbRawItem {
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

interface TmdbRawResponse {
  results?: TmdbRawItem[];
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

interface TmdbLogoItem {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
}

interface TmdbImagesResponse {
  logos?: TmdbLogoItem[];
}

interface TmdbDetailCastItem {
  id: number;
  name: string;
  character: string;
  profile: string;
}

interface TmdbHeroDetail {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  backdrop: string;
  poster: string;
  score: string;
  voteCount: number;
  year: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  contentRating: string;
  genres: string[];
  language: string;
  popularity: number | null;
  cast: TmdbDetailCastItem[];
  releaseDate: string;
  trailerUrl: string;
}

interface TmdbDetailRawGenre {
  name?: string;
}

interface TmdbDetailRawCast {
  id?: number;
  name?: string;
  character?: string;
  profile_path?: string | null;
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

type HeroMediaFilter = 'all' | 'movie' | 'tv';

interface TmdbHeroBannerProps {
  mediaFilter?: HeroMediaFilter;
  withGenres?: string;
  withOriginCountry?: string;
  personalizedSeeds?: TmdbHeroRecommendationSeed[] | null;
  requireLogo?: boolean;
}

export interface TmdbHeroRecommendationSeed {
  title: string;
  search_title?: string;
  year?: string;
  tmdb_id?: string;
  media_type?: 'movie' | 'tv';
  total_episodes?: number;
  index?: number;
  play_time?: number;
  total_time?: number;
  save_time?: number;
  seed_type?: 'play' | 'favorite';
}

interface SeasonPickerState {
  open: boolean;
  item: TmdbHeroItem | null;
  baseTitle: string;
  year: string;
  seasonCount: number;
}

const TMDB_CLIENT_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const HERO_ITEM_LIMIT = 7;
const DESKTOP_HERO_PANEL_CLASS =
  'absolute bottom-0 left-0 z-20 hidden w-full p-4 md:block md:w-3/4 md:px-[clamp(2rem,3vw,4rem)] md:pt-[clamp(1rem,3dvh,3rem)] md:pb-[clamp(1rem,2.2dvh,1.5rem)] lg:w-1/2';
const DESKTOP_HERO_STACK_CLASS =
  'flex flex-col gap-[clamp(0.5rem,1.45dvh,1rem)] rounded-lg p-2 md:p-3';
const DESKTOP_HERO_LOGO_CLASS =
  'relative h-[clamp(5.5rem,14dvh,10.5rem)] w-auto max-w-[min(40rem,58vw)]';
const DESKTOP_HERO_GRID_CLASS =
  'grid w-fit max-w-full gap-[clamp(0.375rem,0.7dvh,0.5rem)] pb-[clamp(0.25rem,0.7dvh,0.5rem)]';

function getDesktopHeroGridStyle(itemCount: number) {
  return {
    gridTemplateColumns: `repeat(${Math.max(
      itemCount,
      1
    )}, minmax(0, clamp(3.75rem, 8.5dvh, 7.25rem)))`,
  };
}
const SWIPE_THRESHOLD_PX = 48;
const WHEEL_SWIPE_THRESHOLD_PX = 80;
const WHEEL_SWIPE_COOLDOWN_MS = 520;
const WHEEL_GESTURE_IDLE_MS = 180;

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

function mapRawItemToHero(item: TmdbRawItem): TmdbHeroItem | null {
  const mediaType =
    item.media_type === 'tv'
      ? 'tv'
      : item.media_type === 'movie'
      ? 'movie'
      : null;
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
    backdrop: `${TMDB_IMAGE_BASE_URL}/original${backdropPath}`,
    poster: `${TMDB_IMAGE_BASE_URL}/w500${posterPath}`,
    runtime: null,
    seasons: null,
    episodes: null,
    releaseDate: normalizeReleaseDate(item.release_date || item.first_air_date),
  };
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
      const lp =
        getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
      if (lp !== 0) return lp;
      const vr = (b.vote_average || 0) - (a.vote_average || 0);
      if (vr !== 0) return vr;
      return (b.width || 0) - (a.width || 0);
    });

  return sorted[0]?.file_path || '';
}

function buildPlayUrl(item: TmdbHeroItem): string {
  return buildTmdbPlayerPageUrl({
    tmdbId: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    poster: item.poster,
    score: item.score,
    season: 1,
    episode: 1,
  });
}

function hasSeasonHint(value: string): boolean {
  const text = (value || '').toLowerCase();
  if (!text.trim()) return false;
  return (
    /第\s*[一二三四五六七八九十百千万两\d]+\s*季/.test(text) ||
    /(?:season|series|s)\s*0*\d{1,2}/i.test(text)
  );
}

function stripSeasonHint(value: string): string {
  return (value || '')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*季/gi, ' ')
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
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

function mapRawDetailToHeroDetail(
  raw: TmdbDetailRawResponse,
  item: TmdbHeroItem
): TmdbHeroDetail {
  const cast = (raw.credits?.cast || [])
    .slice(0, 8)
    .map((member) => ({
      id: member.id ?? 0,
      name: member.name || '',
      character: member.character || '',
      profile: member.profile_path
        ? `${TMDB_IMAGE_BASE_URL}/w185${member.profile_path}`
        : '',
    }))
    .filter((member) => member.id > 0 && member.name);

  const contentRating =
    item.mediaType === 'movie'
      ? pickMovieContentRatingFromRaw(raw)
      : pickTvContentRatingFromRaw(raw);

  const runtime =
    item.mediaType === 'movie'
      ? raw.runtime ?? null
      : raw.episode_run_time?.[0] ?? null;

  return {
    id: raw.id || item.id,
    mediaType: item.mediaType,
    title: (raw.title || raw.name || item.title || '').trim(),
    overview:
      (raw.overview || item.overview || '').trim() || 'No overview available.',
    backdrop: raw.backdrop_path
      ? `${TMDB_IMAGE_BASE_URL}/original${raw.backdrop_path}`
      : item.backdrop,
    poster: raw.poster_path
      ? `${TMDB_IMAGE_BASE_URL}/w500${raw.poster_path}`
      : item.poster,
    score: toScore(raw.vote_average) || item.score,
    voteCount: raw.vote_count || 0,
    year: toYear(raw.release_date || raw.first_air_date) || item.year,
    releaseDate:
      normalizeReleaseDate(raw.release_date || raw.first_air_date) ||
      item.releaseDate,
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

function matchesMediaFilter(
  mediaType: 'movie' | 'tv',
  mediaFilter: HeroMediaFilter
): boolean {
  return mediaFilter === 'all' || mediaType === mediaFilter;
}

export default function TmdbHeroBanner({
  mediaFilter = 'all',
  withGenres = '',
  withOriginCountry = '',
  personalizedSeeds,
  requireLogo = false,
}: TmdbHeroBannerProps) {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<TmdbHeroItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);
  const [logoRatios, setLogoRatios] = useState<Record<string, number>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TmdbHeroItem | null>(null);
  const [detailData, setDetailData] = useState<TmdbHeroDetail | null>(null);
  const [favoriteMap, setFavoriteMap] = useState<Record<string, boolean>>({});
  const [favoritePendingKey, setFavoritePendingKey] = useState('');
  const [seasonPicker, setSeasonPicker] = useState<SeasonPickerState>({
    open: false,
    item: null,
    baseTitle: '',
    year: '',
    seasonCount: 0,
  });
  const heroRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchAxisRef = useRef<'x' | 'y' | null>(null);
  const wheelDeltaXRef = useRef(0);
  const wheelLastSlideAtRef = useRef(0);
  const wheelGestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const detailCacheRef = useRef<Record<string, TmdbHeroDetail>>({});
  const detailRequestIdRef = useRef(0);
  const heroRequestIdRef = useRef(0);
  const fullWidthSectionClass = 'relative mb-8 -mx-2 sm:-mx-10';

  const goToNext = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const goToPrev = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleHeroTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      touchAxisRef.current = null;
      setIsDragging(false);
      setDragOffsetX(0);
    },
    []
  );

  const clearTouchState = useCallback(() => {
    touchStartRef.current = null;
    touchAxisRef.current = null;
    setIsDragging(false);
    setDragOffsetX(0);
  }, []);

  const handleHeroTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      if (!start || items.length <= 1) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (touchAxisRef.current === null && (absX > 6 || absY > 6)) {
        touchAxisRef.current = absX > absY ? 'x' : 'y';
      }

      if (touchAxisRef.current !== 'x') return;

      setIsDragging(true);
      const limit = heroWidth > 0 ? heroWidth * 0.9 : 320;
      const nextOffset = Math.max(-limit, Math.min(limit, deltaX));
      setDragOffsetX(nextOffset);
    },
    [heroWidth, items.length]
  );

  const handleHeroTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || items.length <= 1) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      const isHorizontalGesture =
        touchAxisRef.current === 'x' || (absX > absY && absX > 8);
      touchAxisRef.current = null;

      if (!isHorizontalGesture) {
        setIsDragging(false);
        setDragOffsetX(0);
        return;
      }

      setIsDragging(false);
      setDragOffsetX(0);

      if (absX < SWIPE_THRESHOLD_PX || absX <= absY) return;

      if (deltaX < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    },
    [goToNext, goToPrev, items.length]
  );

  const handleHeroWheel = useCallback(
    (event: WheelEvent) => {
      if (items.length <= 1 || detailOpen || seasonPicker.open) return;

      const deltaModeMultiplier =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
          ? Math.max(heroWidth || 0, 320)
          : 1;
      const deltaX = event.deltaX * deltaModeMultiplier;
      const deltaY = event.deltaY * deltaModeMultiplier;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < 2 || absX <= absY * 1.15) return;

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      if (wheelGestureTimeoutRef.current) {
        clearTimeout(wheelGestureTimeoutRef.current);
      }
      wheelGestureTimeoutRef.current = setTimeout(() => {
        wheelDeltaXRef.current = 0;
      }, WHEEL_GESTURE_IDLE_MS);

      wheelDeltaXRef.current += deltaX;
      const now = Date.now();
      if (now - wheelLastSlideAtRef.current < WHEEL_SWIPE_COOLDOWN_MS) {
        return;
      }

      if (Math.abs(wheelDeltaXRef.current) < WHEEL_SWIPE_THRESHOLD_PX) {
        return;
      }

      if (wheelDeltaXRef.current > 0) {
        goToNext();
      } else {
        goToPrev();
      }

      wheelDeltaXRef.current = 0;
      wheelLastSlideAtRef.current = now;
    },
    [detailOpen, goToNext, goToPrev, heroWidth, items.length, seasonPicker.open]
  );

  const fetchLogoForItem = useCallback(
    async (
      mediaType: 'movie' | 'tv',
      id: number,
      signal?: AbortSignal
    ): Promise<string> => {
      try {
        if (!TMDB_CLIENT_API_KEY) return '';
        const tmdbLanguage = getCurrentTmdbLanguage();
        const params = new URLSearchParams({
          api_key: TMDB_CLIENT_API_KEY,
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
    },
    [i18n.language]
  );

  const fetchHeroMetaForItem = useCallback(
    async (
      mediaType: 'movie' | 'tv',
      id: number,
      signal?: AbortSignal
    ): Promise<TmdbHeroMeta> => {
      try {
        if (!TMDB_CLIENT_API_KEY) {
          return emptyHeroMeta();
        }
        const tmdbLanguage = getCurrentTmdbLanguage();
        const params = new URLSearchParams({
          api_key: TMDB_CLIENT_API_KEY,
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
          releaseDate: normalizeReleaseDate(
            data.release_date || data.first_air_date
          ),
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
    },
    [i18n.language]
  );

  const fetchDirectFromTmdb = useCallback(
    async (signal?: AbortSignal) => {
      if (!TMDB_CLIENT_API_KEY) return [];
      const tmdbLanguage = getCurrentTmdbLanguage();
      const generationLanguage = DEFAULT_TMDB_LANGUAGE;

      const normalizedGenres = (withGenres || '').trim();
      const normalizedOriginCountry = (withOriginCountry || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
      const shouldUseDiscover = Boolean(
        normalizedGenres || normalizedOriginCountry
      );
      const discoverMediaType: 'movie' | 'tv' =
        mediaFilter === 'movie' ? 'movie' : 'tv';
      const params = new URLSearchParams({
        api_key: TMDB_CLIENT_API_KEY,
        language: generationLanguage,
        page: '1',
      });
      if (shouldUseDiscover) {
        params.set('sort_by', 'popularity.desc');
        params.set('include_adult', 'false');
        if (normalizedGenres) {
          params.set('with_genres', normalizedGenres);
        }
        if (normalizedOriginCountry) {
          params.set('with_origin_country', normalizedOriginCountry);
        }
      }

      const endpoint = shouldUseDiscover
        ? `${TMDB_API_BASE_URL}/discover/${discoverMediaType}`
        : `${TMDB_API_BASE_URL}/trending/all/day`;

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        signal,
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as TmdbRawResponse;
      const baseItemLimit = requireLogo ? HERO_ITEM_LIMIT * 3 : HERO_ITEM_LIMIT;
      const baseItems = (data.results || [])
        .map((item) =>
          shouldUseDiscover
            ? mapRawItemToHero({ ...item, media_type: discoverMediaType })
            : mapRawItemToHero(item)
        )
        .filter((item): item is TmdbHeroItem => item !== null)
        .filter((item) => matchesMediaFilter(item.mediaType, mediaFilter))
        .slice(0, baseItemLimit);

      const itemsWithLogo = await Promise.all(
        baseItems.map(async (item) => {
          const [logo, meta] = await Promise.all([
            fetchLogoForItem(item.mediaType, item.id, signal),
            fetchHeroMetaForItem(item.mediaType, item.id, signal),
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
      const logoOnlyItems = itemsWithLogo.filter((item) => Boolean(item.logo));
      if (requireLogo) {
        return logoOnlyItems;
      }
      return logoOnlyItems.length > 0 ? logoOnlyItems : itemsWithLogo;
    },
    [
      fetchHeroMetaForItem,
      fetchLogoForItem,
      mediaFilter,
      requireLogo,
      withGenres,
      withOriginCountry,
    ]
  );

  const fetchPersonalizedFromHistory = useCallback(
    async (signal?: AbortSignal): Promise<TmdbHeroItem[]> => {
      if (!Array.isArray(personalizedSeeds) || personalizedSeeds.length === 0) {
        return [];
      }

      const response = await fetch('/api/tmdb/recommendations', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: personalizedSeeds,
          mediaType: mediaFilter,
          tmdbLanguage: getCurrentTmdbLanguage(),
        }),
        signal,
      });

      if (!response.ok) return [];

      const data = (await response.json()) as TmdbHeroResponse;
      return (data.results || [])
        .filter((item) => matchesMediaFilter(item.mediaType, mediaFilter))
        .filter((item) => !requireLogo || Boolean(item.logo));
    },
    [i18n.language, mediaFilter, personalizedSeeds, requireLogo]
  );

  const safeImageUrl = useCallback((url: string): string => {
    return url;
  }, []);

  const handleLogoLoad = useCallback(
    (key: string, event: SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      if (!naturalWidth || !naturalHeight) return;
      const ratio = naturalWidth / naturalHeight;
      setLogoRatios((prev) =>
        prev[key] === ratio ? prev : { ...prev, [key]: ratio }
      );
    },
    []
  );

  const fetchDetailDirectFromTmdb = useCallback(
    async (item: TmdbHeroItem) => {
      if (!TMDB_CLIENT_API_KEY) return null;

      const appendToResponse =
        item.mediaType === 'movie'
          ? 'credits,videos,release_dates'
          : 'credits,videos,content_ratings';

      const params = new URLSearchParams({
        api_key: TMDB_CLIENT_API_KEY,
        language: getCurrentTmdbLanguage(),
        append_to_response: appendToResponse,
      });

      const response = await fetch(
        `${TMDB_API_BASE_URL}/${item.mediaType}/${
          item.id
        }?${params.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) return null;

      const raw = (await response.json()) as TmdbDetailRawResponse;
      return mapRawDetailToHeroDetail(raw, item);
    },
    [i18n.language]
  );

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const handleCloseSeasonPicker = useCallback(() => {
    setSeasonPicker({
      open: false,
      item: null,
      baseTitle: '',
      year: '',
      seasonCount: 0,
    });
  }, []);

  const handleOpenDetail = useCallback(
    (item: TmdbHeroItem) => {
      router.push(
        buildTmdbDetailPageUrl({
          id: item.id,
          title: item.title,
          mediaType: item.mediaType,
          year: item.year,
          poster: item.poster,
          score: item.score,
        })
      );
    },
    [router]
  );

  const loadDetailForModal = useCallback(
    async (item: TmdbHeroItem) => {
      const cacheKey = `${getCurrentTmdbLanguage()}-${item.mediaType}-${
        item.id
      }`;
      setDetailOpen(true);
      setDetailItem(item);
      setDetailError(null);

      const cached = detailCacheRef.current[cacheKey];
      if (cached) {
        setDetailData(cached);
        setDetailLoading(false);
        return;
      }

      setDetailData(null);
      setDetailLoading(true);
      const requestId = ++detailRequestIdRef.current;
      let resolved: TmdbHeroDetail | null = null;
      try {
        const data = await fetchTmdbDetailWithClientCache<TmdbHeroDetail>({
          id: item.id,
          mediaType: item.mediaType,
        });
        if (!data?.id) {
          throw new Error('TMDB detail returned empty payload');
        }
        resolved = data;
      } catch (err) {
        try {
          resolved = await fetchDetailDirectFromTmdb(item);
        } catch {
          resolved = null;
        }

        if (!resolved && detailRequestIdRef.current === requestId) {
          setDetailError((err as Error).message || t('detail.failedToLoad'));
        }
      } finally {
        if (detailRequestIdRef.current === requestId) {
          if (resolved) {
            detailCacheRef.current[cacheKey] = resolved;
            setDetailData(resolved);
            setDetailError(null);
          }
          setDetailLoading(false);
        }
      }
    },
    [fetchDetailDirectFromTmdb, t]
  );

  const resolveSeasonCountForItem = useCallback(
    async (item: TmdbHeroItem): Promise<number> => {
      if (item.mediaType !== 'tv') return 0;

      if (typeof item.seasons === 'number' && item.seasons > 1) {
        return Math.floor(item.seasons);
      }

      if (
        detailItem?.id === item.id &&
        detailData?.mediaType === 'tv' &&
        typeof detailData.seasons === 'number' &&
        detailData.seasons > 1
      ) {
        return Math.floor(detailData.seasons);
      }

      try {
        const detail = await fetchTmdbDetailWithClientCache<{
          seasons?: number | null;
        }>({
          id: item.id,
          mediaType: 'tv',
        });
        const seasons = detail.seasons;
        if (
          typeof seasons === 'number' &&
          Number.isFinite(seasons) &&
          seasons > 1
        ) {
          return Math.floor(seasons);
        }
      } catch {
        // ignore and fallback to title lookup
      }

      try {
        const detail = await fetchTmdbDetailWithClientCache<{
          seasons?: number | null;
        }>({
          title: item.title,
          mediaType: 'tv',
          year: item.year,
        });
        const seasons = detail.seasons;
        if (
          typeof seasons !== 'number' ||
          !Number.isFinite(seasons) ||
          seasons <= 1
        ) {
          return 0;
        }
        return Math.floor(seasons);
      } catch {
        return 0;
      }
    },
    [detailData, detailItem?.id]
  );

  const handlePlayFromItem = useCallback(
    async (item: TmdbHeroItem) => {
      if (isFutureReleaseDate(item.releaseDate)) return;

      if (item.mediaType === 'tv' && !hasSeasonHint(item.title)) {
        const seasonCount = await resolveSeasonCountForItem(item);
        if (seasonCount > 1) {
          setSeasonPicker({
            open: true,
            item,
            baseTitle: stripSeasonHint(item.title) || item.title,
            year: item.year || '',
            seasonCount,
          });
          return;
        }
      }

      router.push(buildPlayUrl(item));
    },
    [resolveSeasonCountForItem, router]
  );

  const handleToggleFavorite = useCallback(
    async (item: TmdbHeroItem) => {
      const favoriteSource = 'tmdb';
      const favoriteId = String(item.id);
      const favoriteKey = generateStorageKey(favoriteSource, favoriteId);
      if (favoritePendingKey === favoriteKey) return;

      setFavoritePendingKey(favoriteKey);
      try {
        const currentlyFavorited =
          favoriteMap[favoriteKey] ??
          (await isFavorited(favoriteSource, favoriteId));

        if (currentlyFavorited) {
          await deleteFavorite(favoriteSource, favoriteId);
          setFavoriteMap((prev) => ({ ...prev, [favoriteKey]: false }));
          return;
        }

        await saveFavorite(favoriteSource, favoriteId, {
          title: item.title,
          source_name: 'TMDB',
          year: item.year || '',
          cover: item.poster || item.backdrop || '',
          total_episodes: item.episodes || (item.mediaType === 'movie' ? 1 : 0),
          save_time: Date.now(),
          search_title: item.title,
        });
        setFavoriteMap((prev) => ({ ...prev, [favoriteKey]: true }));
      } finally {
        setFavoritePendingKey('');
      }
    },
    [favoriteMap, favoritePendingKey]
  );

  const handleSeasonPick = useCallback(
    (season: number) => {
      const current = seasonPicker;
      if (!current.item) return;
      handleCloseSeasonPicker();
      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId: current.item.id,
          mediaType: 'tv',
          title: current.item.title,
          year: current.year,
          poster: current.item.poster,
          score: current.item.score,
          season,
          episode: 1,
        })
      );
    },
    [handleCloseSeasonPicker, router, seasonPicker]
  );

  const fetchHeroData = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++heroRequestIdRef.current;
      const isLatestRequest = () => heroRequestIdRef.current === requestId;

      if (personalizedSeeds === null) {
        if (isLatestRequest()) {
          setLoading(true);
        }
        return;
      }

      try {
        if (isLatestRequest()) {
          setLoading(true);
          setError(null);
        }

        if (Array.isArray(personalizedSeeds) && personalizedSeeds.length > 0) {
          const personalizedItems = await fetchPersonalizedFromHistory(signal);
          if (!isLatestRequest() || signal?.aborted) return;

          const limitedPersonalizedItems = personalizedItems.slice(
            0,
            HERO_ITEM_LIMIT
          );
          if (limitedPersonalizedItems.length > 0) {
            setActiveIndex(0);
            setItems(limitedPersonalizedItems);
            setError(null);
            return;
          }
        }

        const params = new URLSearchParams();
        if (mediaFilter !== 'all') {
          params.set('mediaType', mediaFilter);
        }
        const normalizedGenres = (withGenres || '').trim();
        if (normalizedGenres) {
          params.set('with_genres', normalizedGenres);
        }
        const normalizedOriginCountry = (withOriginCountry || '')
          .trim()
          .replace(/\s+/g, '')
          .toUpperCase();
        if (normalizedOriginCountry) {
          params.set('with_origin_country', normalizedOriginCountry);
        }
        params.set('tmdbLanguage', getCurrentTmdbLanguage());
        const response = await fetch(
          `/api/tmdb/hero${params.toString() ? `?${params.toString()}` : ''}`,
          {
            signal,
          }
        );
        if (!isLatestRequest() || signal?.aborted) return;

        if (!response.ok) {
          const directItems = await fetchDirectFromTmdb(signal);
          if (!isLatestRequest() || signal?.aborted) return;

          const limitedItems = directItems.slice(0, HERO_ITEM_LIMIT);
          if (limitedItems.length > 0) {
            setActiveIndex(0);
            setItems(limitedItems);
          }
          setError(
            limitedItems.length > 0
              ? null
              : `TMDB request failed: ${response.status}`
          );
          return;
        }
        const data = (await response.json()) as TmdbHeroResponse;
        if (!isLatestRequest() || signal?.aborted) return;

        let nextItems = (data.results || []).filter((item) =>
          matchesMediaFilter(item.mediaType, mediaFilter)
        );
        if (nextItems.length === 0) {
          nextItems = await fetchDirectFromTmdb(signal);
          if (!isLatestRequest() || signal?.aborted) return;
        }
        const logoOnlyItems = nextItems.filter((item) => Boolean(item.logo));
        const finalItems = requireLogo
          ? logoOnlyItems
          : logoOnlyItems.length > 0
          ? logoOnlyItems
          : nextItems;
        const limitedItems = finalItems.slice(0, HERO_ITEM_LIMIT);
        if (limitedItems.length > 0) {
          setActiveIndex(0);
          setItems(limitedItems);
        }
        if (limitedItems.length === 0) {
          setError('TMDB returned empty results');
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        try {
          const directItems = await fetchDirectFromTmdb(signal);
          if (!isLatestRequest() || signal?.aborted) return;

          const limitedItems = directItems.slice(0, HERO_ITEM_LIMIT);
          if (limitedItems.length > 0) {
            setActiveIndex(0);
            setItems(limitedItems);
          }
          setError(
            limitedItems.length > 0
              ? null
              : (err as Error).message || 'TMDB fetch failed'
          );
        } catch {
          if (!isLatestRequest() || signal?.aborted) return;

          setError((err as Error).message || 'TMDB fetch failed');
        }
      } finally {
        if (isLatestRequest()) {
          setLoading(false);
        }
      }
    },
    [
      fetchDirectFromTmdb,
      fetchPersonalizedFromHistory,
      i18n.language,
      mediaFilter,
      personalizedSeeds,
      requireLogo,
      withGenres,
      withOriginCountry,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchHeroData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchHeroData]);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    const updateWidth = () => {
      setHeroWidth(el.clientWidth || 0);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (wheelGestureTimeoutRef.current) {
        clearTimeout(wheelGestureTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    el.addEventListener('wheel', handleHeroWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleHeroWheel);
    };
  }, [handleHeroWheel]);

  useEffect(() => {
    if (items.length <= 1) return;
    if (isDragging) return;
    if (detailOpen) return;
    if (seasonPicker.open) return;
    const timer = setInterval(() => {
      goToNext();
    }, 7000);
    return () => clearInterval(timer);
  }, [detailOpen, goToNext, isDragging, items.length, seasonPicker.open]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!detailOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseDetail();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen, handleCloseDetail]);

  const activeItem = useMemo(() => items[activeIndex], [items, activeIndex]);
  const activeLogoKey = activeItem
    ? `${activeItem.mediaType}-${activeItem.id}`
    : '';
  const activeFavoriteKey = activeItem
    ? generateStorageKey('tmdb', String(activeItem.id))
    : '';
  const activeFavorited = activeFavoriteKey
    ? Boolean(favoriteMap[activeFavoriteKey])
    : false;
  const activeFavoritePending = favoritePendingKey === activeFavoriteKey;
  const activeCanPlay = activeItem
    ? !isFutureReleaseDate(activeItem.releaseDate)
    : false;
  const dragOffsetPercent = heroWidth > 0 ? (dragOffsetX / heroWidth) * 100 : 0;

  useEffect(() => {
    if (!activeItem || !activeFavoriteKey) return;
    let cancelled = false;

    const loadFavoriteStatus = async () => {
      try {
        const nextFavorited = await isFavorited('tmdb', String(activeItem.id));
        if (!cancelled) {
          setFavoriteMap((prev) => ({
            ...prev,
            [activeFavoriteKey]: nextFavorited,
          }));
        }
      } catch {
        if (!cancelled) {
          setFavoriteMap((prev) => ({ ...prev, [activeFavoriteKey]: false }));
        }
      }
    };

    void loadFavoriteStatus();

    return () => {
      cancelled = true;
    };
  }, [activeFavoriteKey, activeItem]);

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, unknown>) => {
        setFavoriteMap((prev) => {
          const next = { ...prev };
          items.forEach((item) => {
            const key = generateStorageKey('tmdb', String(item.id));
            next[key] = Boolean(favorites[key]);
          });
          return next;
        });
      }
    );

    return unsubscribe;
  }, [items]);

  const getCircularOffset = useCallback(
    (index: number): number => {
      const total = items.length;
      if (total <= 1) return 0;
      let relative = index - activeIndex;
      if (relative > total / 2) relative -= total;
      if (relative < -total / 2) relative += total;
      return relative;
    },
    [activeIndex, items.length]
  );

  if (loading) {
    return (
      <section className={fullWidthSectionClass}>
        <div className='relative h-[100svh] overflow-hidden bg-slate-950 text-white md:h-screen'>
          <div className='absolute inset-0 bg-gradient-to-br from-slate-700/30 via-slate-900/50 to-black' />
          <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10 md:from-black/50 md:via-black/15 md:to-transparent' />
          <div className='absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/5 md:from-black/30 md:to-transparent' />
          <div className='absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent md:hidden' />

          <div className={DESKTOP_HERO_PANEL_CLASS}>
            <div className={`${DESKTOP_HERO_STACK_CLASS} animate-pulse`}>
              <div
                className={`${DESKTOP_HERO_LOGO_CLASS} w-full rounded-md bg-white/20`}
              />

              <div className='flex flex-wrap items-center gap-3'>
                <span className='h-5 w-16 rounded-full bg-white/25' />
                <span className='h-5 w-14 rounded-full bg-white/20' />
                <span className='h-5 w-16 rounded-full bg-white/20' />
                <span className='h-5 w-24 rounded-full bg-white/20' />
              </div>

              <div className='max-w-xl space-y-2'>
                <div className='h-4 w-full rounded bg-white/20' />
                <div className='h-4 w-[88%] rounded bg-white/20' />
                <div className='h-4 w-[74%] rounded bg-white/10' />
              </div>

              <div className='flex flex-wrap items-center gap-3'>
                <div className='inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.32)]'>
                  <Play size={16} className='opacity-0' aria-hidden='true' />
                  <span className='text-sm font-semibold text-transparent'>
                    {t('common.play')}
                  </span>
                </div>
                <div className='inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.26)] backdrop-blur-md'>
                  <Info size={14} className='opacity-0' aria-hidden='true' />
                  <span className='text-sm font-semibold text-transparent'>
                    {t('common.details')}
                  </span>
                </div>
                <div className='h-9 w-9 rounded-full border border-white/35 bg-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.26)] backdrop-blur-md' />
              </div>

              <div className='hidden pt-[clamp(0.25rem,0.7dvh,0.5rem)] md:block'>
                <div
                  className={DESKTOP_HERO_GRID_CLASS}
                  style={getDesktopHeroGridStyle(HERO_ITEM_LIMIT)}
                >
                  {Array.from({ length: HERO_ITEM_LIMIT }).map((_, index) => (
                    <div
                      key={`hero-skeleton-thumb-${index}`}
                      className='flex min-w-0 flex-col items-center'
                    >
                      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg border-2 border-white/30 bg-white/10' />
                      <div className='mt-2 flex w-full justify-center'>
                        <div className='h-3 w-[76%] rounded bg-white/20' />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className='absolute inset-x-0 bottom-0 z-20 md:hidden'>
            <div className='flex w-full flex-col items-center px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-center animate-pulse'>
              <div className='h-36 w-full max-w-[24rem] rounded-md bg-white/20' />
              <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
                <span className='h-5 w-14 rounded-full bg-white/20' />
                <span className='h-5 w-12 rounded-full bg-white/15' />
                <span className='h-5 w-14 rounded-full bg-white/15' />
                <span className='h-5 w-16 rounded-full bg-white/15' />
              </div>
              <div className='mt-4 w-full max-w-md space-y-2'>
                <div className='mx-auto h-3.5 w-full rounded bg-white/20' />
                <div className='mx-auto h-3.5 w-[88%] rounded bg-white/15' />
                <div className='mx-auto h-3.5 w-[70%] rounded bg-white/10' />
              </div>
              <div className='mt-5 flex w-full max-w-md gap-3'>
                <div className='h-11 flex-1 rounded-full bg-white/35' />
                <div className='h-11 w-24 rounded-full border border-white/25 bg-white/15' />
                <div className='h-11 w-11 shrink-0 rounded-full border border-white/25 bg-white/15' />
              </div>
              <div className='mt-5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'>
                {Array.from({ length: HERO_ITEM_LIMIT }).map((_, index) => (
                  <div
                    key={`skeleton-dot-${index}`}
                    className={`h-1.5 rounded-full ${
                      index === 0 ? 'w-7 bg-white/50' : 'w-1.5 bg-white/25'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className='absolute inset-x-0 bottom-6 z-20 hidden justify-center md:flex'>
            <div className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'>
              {Array.from({ length: HERO_ITEM_LIMIT }).map((_, index) => (
                <div
                  key={`desktop-skeleton-dot-${index}`}
                  className={`h-1.5 rounded-full ${
                    index === 0 ? 'w-7 bg-white/50' : 'w-1.5 bg-white/25'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!activeItem) {
    return (
      <section className={fullWidthSectionClass}>
        <div className='relative min-h-[320px] overflow-hidden bg-slate-900 px-6 py-8 text-white sm:min-h-[420px] sm:px-12 sm:py-10'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(14,165,233,0.18),transparent_45%)]' />
          <div className='relative z-10 max-w-2xl space-y-3'>
            <h2 className='text-2xl font-bold sm:text-3xl'>
              {t('hero.unavailable')}
            </h2>
            <p className='text-sm text-white/75 sm:text-base'>
              {error || t('hero.noData')}
            </p>
            <button
              type='button'
              onClick={() => fetchHeroData()}
              className='inline-flex items-center rounded-full border border-white/25 bg-black/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/50'
            >
              {t('hero.retry')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={fullWidthSectionClass}>
      <div
        ref={heroRef}
        className='relative h-[100svh] overflow-hidden bg-slate-950 text-white md:h-screen'
        onTouchStart={handleHeroTouchStart}
        onTouchMove={handleHeroTouchMove}
        onTouchEnd={handleHeroTouchEnd}
        onTouchCancel={clearTouchState}
        style={{ overscrollBehaviorX: 'contain', touchAction: 'pan-y' }}
      >
        <div className='absolute inset-0 z-0 overflow-hidden'>
          {items.map((item, index) => {
            const offset = getCircularOffset(index) * 100 + dragOffsetPercent;
            const isCurrent = index === activeIndex;
            return (
              <div
                key={`hero-bg-${item.id}`}
                className={`absolute inset-0 ${
                  isDragging
                    ? 'transition-none'
                    : 'transition-transform duration-300 ease-out'
                }`}
                style={{
                  transform: `translate3d(${offset}%, 0, 0)`,
                }}
              >
                <Image
                  src={safeImageUrl(item.backdrop)}
                  alt={item.title}
                  fill
                  priority={isCurrent}
                  className='object-cover object-center brightness-[0.56]'
                />
              </div>
            );
          })}
        </div>
        <div className='absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-black/10 md:from-black/50 md:via-black/15 md:to-transparent' />
        <div className='absolute inset-0 z-10 bg-gradient-to-r from-black/20 via-transparent to-black/5 md:from-black/30 md:to-transparent' />
        <div className='absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/45 to-transparent md:hidden' />

        <div className={DESKTOP_HERO_PANEL_CLASS}>
          <div className={DESKTOP_HERO_STACK_CLASS}>
            {activeItem.logo ? (
              <div
                className={DESKTOP_HERO_LOGO_CLASS}
                style={
                  logoRatios[activeLogoKey]
                    ? { aspectRatio: logoRatios[activeLogoKey] }
                    : { width: '100%' }
                }
              >
                <Image
                  src={safeImageUrl(activeItem.logo)}
                  alt={`${activeItem.title} logo`}
                  fill
                  onLoad={(event) => handleLogoLoad(activeLogoKey, event)}
                  className='object-contain object-left drop-shadow-[0_10px_26px_rgba(0,0,0,0.65)]'
                />
              </div>
            ) : (
              <h2 className='text-[clamp(2rem,5dvh,3.75rem)] font-extrabold leading-tight text-white'>
                {activeItem.title}
              </h2>
            )}

            <div className='flex flex-wrap items-center gap-3 text-sm text-white/90'>
              {activeItem.score && (
                <span className='inline-flex items-center gap-1'>
                  <Star
                    size={16}
                    className='text-yellow-400'
                    fill='currentColor'
                  />
                  <span className='font-semibold'>{activeItem.score}</span>
                </span>
              )}
              <ReleaseYearBadge
                year={activeItem.year}
                releaseDate={activeItem.releaseDate}
                iconSize={14}
                className='text-white/80'
              />
              <span className='rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-medium uppercase text-white/90'>
                {activeItem.mediaType === 'movie'
                  ? t('common.movie')
                  : t('common.series')}
              </span>
              {activeItem.mediaType === 'movie' && activeItem.runtime ? (
                <span className='inline-flex items-center gap-1 text-white/80'>
                  <Clock3 size={14} />
                  {formatRuntime(activeItem.runtime)}
                </span>
              ) : null}
              {activeItem.mediaType === 'tv' &&
              activeItem.seasons &&
              activeItem.episodes ? (
                <span className='inline-flex items-center gap-1 text-white/80'>
                  <Users size={14} />
                  {t('hero.tvMeta', {
                    seasons: activeItem.seasons,
                    episodes: activeItem.episodes,
                  })}
                </span>
              ) : null}
            </div>

            <p className='max-w-2xl text-[13px] leading-5 text-white/80 line-clamp-2 sm:text-sm sm:leading-6 min-[768px]:line-clamp-3'>
              {activeItem.overview}
            </p>

            <div className='flex flex-wrap items-center gap-3'>
              {activeCanPlay ? (
                <button
                  type='button'
                  onClick={() => {
                    void handlePlayFromItem(activeItem);
                  }}
                  className='inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(0,0,0,0.32)] transition-all duration-200 hover:bg-white/90 hover:shadow-xl'
                >
                  <Play size={16} fill='currentColor' />
                  {t('common.play')}
                </button>
              ) : null}
              <button
                type='button'
                onClick={() => handleOpenDetail(activeItem)}
                className='inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.26)] backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:shadow-xl'
              >
                <Info size={14} />
                {t('common.details')}
              </button>
              <button
                type='button'
                onClick={() => {
                  void handleToggleFavorite(activeItem);
                }}
                disabled={activeFavoritePending}
                aria-label={
                  activeFavorited
                    ? t('common.removeFromFavorites')
                    : t('common.addToFavorites')
                }
                title={
                  activeFavorited
                    ? t('common.removeFromFavorites')
                    : t('common.addToFavorites')
                }
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/10 text-white shadow-[0_10px_24px_rgba(0,0,0,0.26)] backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:shadow-xl disabled:pointer-events-none disabled:opacity-60 ${
                  activeFavorited
                    ? 'border-yellow-300/45 bg-yellow-400/15 text-yellow-300 hover:bg-yellow-400/20'
                    : ''
                }`}
              >
                <Bookmark
                  className='h-4 w-4 transition-transform duration-200'
                  fill={activeFavorited ? 'currentColor' : 'none'}
                />
              </button>
            </div>

            <div className='relative hidden pt-[clamp(0.25rem,0.7dvh,0.5rem)] md:block'>
              <div
                className={DESKTOP_HERO_GRID_CLASS}
                style={getDesktopHeroGridStyle(items.length)}
              >
                {items.map((item, index) => (
                  <button
                    key={`${item.mediaType}-${item.id}`}
                    type='button'
                    onClick={() => setActiveIndex(index)}
                    className='group flex min-w-0 flex-col items-center text-center'
                    aria-label={`Switch to ${item.title}`}
                  >
                    <div
                      className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg border-2 transition-all duration-300 ${
                        index === activeIndex
                          ? 'border-sky-300'
                          : 'border-transparent group-hover:border-white/70'
                      }`}
                    >
                      <Image
                        src={safeImageUrl(item.poster)}
                        alt={item.title}
                        fill
                        className='object-cover transition-transform duration-300 group-hover:scale-105'
                      />
                    </div>
                    <span
                      className={`mt-[clamp(0.25rem,0.7dvh,0.5rem)] line-clamp-2 text-[clamp(0.625rem,1.05dvh,0.6875rem)] font-medium text-white transition-opacity duration-300 ${
                        index === activeIndex
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {item.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className='absolute inset-x-0 bottom-0 z-20 md:hidden'>
          <div className='flex w-full flex-col items-center px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-center'>
            {activeItem.logo ? (
              <div
                className='relative h-36 w-auto max-w-[24rem]'
                style={
                  logoRatios[activeLogoKey]
                    ? { aspectRatio: logoRatios[activeLogoKey] }
                    : { width: '100%' }
                }
              >
                <Image
                  src={safeImageUrl(activeItem.logo)}
                  alt={`${activeItem.title} logo`}
                  fill
                  onLoad={(event) => handleLogoLoad(activeLogoKey, event)}
                  className='object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)]'
                />
              </div>
            ) : (
              <h3 className='line-clamp-2 text-4xl font-black leading-tight text-white drop-shadow-[0_10px_26px_rgba(0,0,0,0.8)]'>
                {activeItem.title}
              </h3>
            )}

            <div className='mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] font-medium text-white/85'>
              {activeItem.score && (
                <span className='inline-flex items-center gap-1 text-white'>
                  <Star
                    size={14}
                    className='text-yellow-400'
                    fill='currentColor'
                  />
                  <span>{activeItem.score}</span>
                </span>
              )}
              {activeItem.year && <span>{activeItem.year}</span>}
              <span className='rounded border border-white/35 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90'>
                {activeItem.mediaType === 'movie'
                  ? t('common.movie')
                  : t('common.series')}
              </span>
              {activeItem.mediaType === 'movie' && activeItem.runtime ? (
                <span className='inline-flex items-center gap-1'>
                  <Clock3 size={12} />
                  {formatRuntime(activeItem.runtime)}
                </span>
              ) : null}
              {activeItem.mediaType === 'tv' &&
              activeItem.seasons &&
              activeItem.episodes ? (
                <span className='inline-flex items-center gap-1'>
                  <Users size={12} />
                  {t('hero.tvMetaShort', {
                    seasons: activeItem.seasons,
                    episodes: activeItem.episodes,
                  })}
                </span>
              ) : null}
            </div>

            <p className='mt-4 line-clamp-3 max-w-md text-[13px] leading-5 text-white/80 sm:text-sm sm:leading-6'>
              {activeItem.overview}
            </p>

            <div className='mt-5 flex w-full max-w-md gap-3'>
              {activeCanPlay ? (
                <button
                  type='button'
                  onClick={() => {
                    void handlePlayFromItem(activeItem);
                  }}
                  className='inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white/95 px-4 py-3 text-sm font-semibold text-black shadow-[0_10px_28px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-transform duration-200 active:scale-[0.98]'
                >
                  <Play size={16} fill='currentColor' />
                  {t('common.play')}
                </button>
              ) : null}
              <button
                type='button'
                onClick={() => handleOpenDetail(activeItem)}
                className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/35 bg-white/15 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(0,0,0,0.3)] backdrop-blur-md transition-colors duration-200 active:bg-white/25 ${
                  activeCanPlay ? '' : 'flex-1'
                }`}
                aria-label={t('common.details')}
              >
                <Info size={14} />
                {t('common.details')}
              </button>
              <button
                type='button'
                onClick={() => {
                  void handleToggleFavorite(activeItem);
                }}
                disabled={activeFavoritePending}
                aria-label={
                  activeFavorited
                    ? t('common.removeFromFavorites')
                    : t('common.addToFavorites')
                }
                title={
                  activeFavorited
                    ? t('common.removeFromFavorites')
                    : t('common.addToFavorites')
                }
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 text-white shadow-[0_10px_28px_rgba(0,0,0,0.3)] backdrop-blur-md transition-colors duration-200 active:bg-white/25 disabled:pointer-events-none disabled:opacity-60 ${
                  activeFavorited
                    ? 'border-yellow-300/45 bg-yellow-400/15 text-yellow-300 active:bg-yellow-400/20'
                    : ''
                }`}
              >
                <Bookmark
                  className='h-4 w-4'
                  fill={activeFavorited ? 'currentColor' : 'none'}
                />
              </button>
            </div>

            <div className='mt-5 flex items-center'>
              <div className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'>
                {items.map((item, index) => (
                  <button
                    key={`mobile-dot-${item.id}`}
                    type='button'
                    onClick={() => setActiveIndex(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      activeIndex === index
                        ? 'w-7 bg-white'
                        : 'w-1.5 bg-white/35 active:bg-white/65'
                    }`}
                    aria-label={t('hero.goToSlide', { count: index + 1 })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className='absolute inset-x-0 bottom-6 z-20 hidden justify-center md:flex'>
          <div className='inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'>
            {items.map((item, index) => (
              <button
                key={`desktop-dot-${item.id}`}
                type='button'
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeIndex === index
                    ? 'w-7 bg-white'
                    : 'w-1.5 bg-white/35 hover:bg-white/65'
                }`}
                aria-label={t('hero.goToSlide', { count: index + 1 })}
              />
            ))}
          </div>
        </div>

        <TmdbDetailModal
          open={detailOpen}
          loading={detailLoading}
          error={detailError}
          detail={detailData}
          titleLogo={detailItem?.logo}
          favoriteTarget={
            detailItem
              ? {
                  source: 'tmdb',
                  id: String(detailItem.id),
                  title: detailItem.title,
                  sourceName: 'TMDB',
                  year: detailItem.year || '',
                  cover: detailItem.poster || detailItem.backdrop || '',
                  totalEpisodes:
                    detailItem.episodes ||
                    (detailItem.mediaType === 'movie' ? 1 : 0),
                  searchTitle: detailItem.title,
                }
              : undefined
          }
          onClose={handleCloseDetail}
          onRetry={
            detailItem
              ? () => {
                  void loadDetailForModal(detailItem);
                }
              : undefined
          }
          onPlay={() => {
            if (detailItem) {
              void handlePlayFromItem(detailItem);
            }
          }}
        />
        <SeasonPickerModal
          open={seasonPicker.open}
          title={seasonPicker.baseTitle || seasonPicker.item?.title || ''}
          logo={seasonPicker.item?.logo || ''}
          backdrop={
            seasonPicker.item?.backdrop ||
            seasonPicker.item?.poster ||
            detailData?.backdrop ||
            ''
          }
          seasonCount={seasonPicker.seasonCount}
          onClose={handleCloseSeasonPicker}
          onPickSeason={handleSeasonPick}
        />
      </div>
    </section>
  );
}
