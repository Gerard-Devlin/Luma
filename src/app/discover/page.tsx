'use client';

import {
  CalendarRange,
  ChevronDown,
  Clock3,
  Languages,
  ListFilter,
  RotateCcw,
  Star,
  Tags,
  UsersRound,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { mergeUniqueById, uniqueById } from '@/lib/unique-list';

import DiscoverCardSkeleton from '@/components/DiscoverCardSkeleton';
import { MEDIA_RANGE_INPUT_CLASS } from '@/components/MediaFilterControls';
import PageLayout from '@/components/PageLayout';
import TmdbHeroBanner from '@/components/TmdbHeroBanner';
import VideoCard from '@/components/VideoCard';

import { getCurrentTmdbLanguage } from '@/i18n/client';

interface GenreOption {
  id: number;
  labelKey: string;
}

interface ShowCountryOption {
  value: string;
  labelKey: string;
}

type DiscoverSortMode = 'popularity' | 'date' | 'rating';

interface SortOption {
  value: DiscoverSortMode;
  labelKey: string;
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: DiscoverItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface DiscoverItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

interface FilterState {
  releaseYearMin: string;
  releaseYearMax: string;
  selectedGenres: number[];
  excludedGenres: number[];
  language: string;
  ratingMin: string;
  ratingMax: string;
  minVoteCount: string;
  runtimeMin: string;
  runtimeMax: string;
}

const PAGE_SIZE_HINT = 20;
const MIN_RELEASE_YEAR = 1950;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_RUNTIME_MINUTES = 360;
const MIN_RATING = 0;
const MAX_RATING = 10;
const ANIME_KEYWORD_ID = 210024;

const MOVIE_GENRE_OPTIONS: GenreOption[] = [
  { id: 12, labelKey: 'discover.adventure' },
  { id: 18, labelKey: 'discover.drama' },
  { id: 28, labelKey: 'discover.action' },
  { id: 16, labelKey: 'discover.animation' },
  { id: 36, labelKey: 'discover.history' },
  { id: 35, labelKey: 'discover.comedy' },
  { id: 14, labelKey: 'discover.fantasy' },
  { id: 10751, labelKey: 'discover.family' },
  { id: 27, labelKey: 'discover.horror' },
  { id: 9648, labelKey: 'discover.mystery' },
  { id: 53, labelKey: 'discover.thriller' },
  { id: 10752, labelKey: 'discover.war' },
  { id: 10749, labelKey: 'discover.romance' },
  { id: 80, labelKey: 'discover.crime' },
  { id: 10770, labelKey: 'discover.tvMovie' },
  { id: 878, labelKey: 'discover.sciFi' },
  { id: 99, labelKey: 'discover.documentary' },
  { id: 37, labelKey: 'discover.western' },
  { id: 10402, labelKey: 'discover.music' },
];

const TV_GENRE_OPTIONS: GenreOption[] = [
  { id: 10765, labelKey: 'discover.sciFiFantasy' },
  { id: 10768, labelKey: 'discover.warPolitics' },
  { id: 10762, labelKey: 'discover.kids' },
  { id: 18, labelKey: 'discover.drama' },
  { id: 10759, labelKey: 'discover.actionAdventure' },
  { id: 16, labelKey: 'discover.animation' },
  { id: 35, labelKey: 'discover.comedy' },
  { id: 10751, labelKey: 'discover.family' },
  { id: 9648, labelKey: 'discover.mystery' },
  { id: 10763, labelKey: 'discover.news' },
  { id: 80, labelKey: 'discover.crime' },
  { id: 10764, labelKey: 'discover.reality' },
  { id: 99, labelKey: 'discover.documentary' },
  { id: 10766, labelKey: 'discover.soap' },
  { id: 10767, labelKey: 'discover.talk' },
  { id: 37, labelKey: 'discover.western' },
];

const ANIME_KEYWORD_OPTIONS: GenreOption[] = [
  { id: 207826, labelKey: 'discover.shounen' },
  { id: 9840, labelKey: 'discover.romance' },
  { id: 10873, labelKey: 'discover.school' },
  { id: 9914, labelKey: 'discover.sliceOfLife' },
  { id: 237451, labelKey: 'discover.isekai' },
  { id: 10046, labelKey: 'discover.mecha' },
  { id: 6075, labelKey: 'discover.sports' },
  { id: 283297, labelKey: 'discover.music' },
  { id: 6152, labelKey: 'discover.supernatural' },
  { id: 779, labelKey: 'discover.martialArts' },
  { id: 9194, labelKey: 'discover.harem' },
  { id: 2343, labelKey: 'discover.magic' },
  { id: 290799, labelKey: 'discover.idolAnime' },
];

const LANGUAGE_OPTIONS = [
  { value: '', labelKey: 'discover.anyLanguage' },
  { value: 'zh', labelKey: 'discover.chinese' },
  { value: 'en', labelKey: 'discover.english' },
  { value: 'ja', labelKey: 'discover.japanese' },
  { value: 'ko', labelKey: 'discover.korean' },
  { value: 'fr', labelKey: 'discover.french' },
  { value: 'de', labelKey: 'discover.german' },
  { value: 'es', labelKey: 'discover.spanish' },
];

const DEFAULT_FILTERS: FilterState = {
  releaseYearMin: String(MIN_RELEASE_YEAR),
  releaseYearMax: String(CURRENT_YEAR),
  selectedGenres: [],
  excludedGenres: [],
  language: '',
  ratingMin: String(MIN_RATING),
  ratingMax: String(MAX_RATING),
  minVoteCount: '',
  runtimeMin: '0',
  runtimeMax: String(MAX_RUNTIME_MINUTES),
};

type DiscoverType = 'movie' | 'tv' | 'anime' | 'show';

function normalizeType(value: string | null): DiscoverType {
  if (value === 'tv') return 'tv';
  if (value === 'anime') return 'anime';
  if (value === 'show') return 'show';
  return 'movie';
}

function parseNumberLike(value: string): string {
  const next = value.trim();
  if (!next) return '';
  const parsed = Number(next);
  if (!Number.isFinite(parsed) || parsed < 0) return '';
  return String(parsed);
}

const SHOW_GENRE_FILTER = '10764|10767';
const SHOW_HERO_COUNTRY_FILTER = 'CN|KR';
const SHOW_COUNTRY_OPTIONS: ShowCountryOption[] = [
  { value: 'CN', labelKey: 'discover.countryChina' },
  { value: 'KR', labelKey: 'discover.countryKorea' },
  { value: 'JP', labelKey: 'discover.countryJapan' },
  { value: 'US', labelKey: 'discover.countryUnitedStates' },
  { value: 'GB', labelKey: 'discover.countryUnitedKingdom' },
  { value: 'TH', labelKey: 'discover.countryThailand' },
  { value: 'FR', labelKey: 'discover.countryFrance' },
  { value: 'DE', labelKey: 'discover.countryGermany' },
];
const DEFAULT_SORT_MODE: DiscoverSortMode = 'popularity';
const SORT_OPTIONS: SortOption[] = [
  { value: 'popularity', labelKey: 'discover.popularity' },
  { value: 'date', labelKey: 'discover.date' },
  { value: 'rating', labelKey: 'discover.rating' },
];

function resolveDiscoverSortBy(
  sortMode: DiscoverSortMode,
  mediaType: 'movie' | 'tv'
): string {
  if (sortMode === 'rating') return 'vote_average.desc';
  if (sortMode === 'date') {
    return mediaType === 'movie'
      ? 'primary_release_date.desc'
      : 'first_air_date.desc';
  }
  return 'popularity.desc';
}

function DiscoverPageClient() {
  const { i18n, t } = useTranslation();
  const searchParams = useSearchParams();
  const type = normalizeType(searchParams.get('type'));
  const media = type === 'movie' ? 'movie' : 'tv';
  const hasTopHero = true;
  const isTmdbType = true;

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const showObserverRef = useRef<IntersectionObserver | null>(null);
  const showLoadingRef = useRef<HTMLDivElement | null>(null);
  const showDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [showCountries, setShowCountries] = useState<string[]>([]);
  const [showItems, setShowItems] = useState<DiscoverItem[]>([]);
  const [showLoading, setShowLoading] = useState(false);
  const [showLoadingMore, setShowLoadingMore] = useState(false);
  const [showCurrentPage, setShowCurrentPage] = useState(0);
  const [showHasMore, setShowHasMore] = useState(true);
  const [sortMode, setSortMode] = useState<DiscoverSortMode>(DEFAULT_SORT_MODE);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    setShowAdvancedFilters(false);
    setSortMode(DEFAULT_SORT_MODE);
    if (type === 'show') {
      setShowCountries([]);
    }
  }, [type]);

  const mergedGenres = useMemo(
    () => Array.from(new Set([...filters.selectedGenres])),
    [filters.selectedGenres]
  );
  const mergedExcludedGenres = useMemo(
    () => Array.from(new Set([...filters.excludedGenres])),
    [filters.excludedGenres]
  );
  const genreOptions = useMemo(() => {
    if (type === 'anime') return ANIME_KEYWORD_OPTIONS;
    const options = media === 'tv' ? TV_GENRE_OPTIONS : MOVIE_GENRE_OPTIONS;
    return options;
  }, [media, type]);
  const showCountryFilter = useMemo(() => {
    if (!showCountries.length) return '';
    const selected = new Set(
      showCountries.map((code) => code.trim().toUpperCase()).filter(Boolean)
    );
    return SHOW_COUNTRY_OPTIONS.map((option) => option.value)
      .filter((value) => selected.has(value))
      .join('|');
  }, [showCountries]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('media', media);
    params.set('include_adult', 'false');
    params.set('sort_by', resolveDiscoverSortBy(sortMode, media));

    const releaseYearMin = Number(filters.releaseYearMin);
    const releaseYearMax = Number(filters.releaseYearMax);
    if (Number.isInteger(releaseYearMin) && releaseYearMin > MIN_RELEASE_YEAR) {
      params.set('release_from', `${releaseYearMin}-01-01`);
    }
    if (Number.isInteger(releaseYearMax) && releaseYearMax < CURRENT_YEAR) {
      params.set('release_to', `${releaseYearMax}-12-31`);
    }
    if (type === 'anime') {
      params.set(
        'with_keywords',
        [ANIME_KEYWORD_ID, ...mergedGenres].join(',')
      );
      if (mergedExcludedGenres.length > 0) {
        params.set('without_keywords', mergedExcludedGenres.join(','));
      }
    } else {
      if (mergedGenres.length > 0) {
        params.set('with_genres', mergedGenres.join(','));
      }
      if (mergedExcludedGenres.length > 0) {
        params.set('without_genres', mergedExcludedGenres.join(','));
      }
    }
    if (filters.language) params.set('language', filters.language);
    const ratingMin = Number(
      parseNumberLike(filters.ratingMin) || String(MIN_RATING)
    );
    const ratingMax = Number(
      parseNumberLike(filters.ratingMax) || String(MAX_RATING)
    );
    if (ratingMin > MIN_RATING) {
      params.set('vote_average_gte', String(ratingMin));
    }
    if (ratingMax < MAX_RATING) {
      params.set('vote_average_lte', String(ratingMax));
    }
    if (parseNumberLike(filters.minVoteCount)) {
      params.set('vote_count_gte', parseNumberLike(filters.minVoteCount));
    }
    const runtimeMin = Number(parseNumberLike(filters.runtimeMin) || '0');
    const runtimeMax = Number(
      parseNumberLike(filters.runtimeMax) || String(MAX_RUNTIME_MINUTES)
    );
    if (runtimeMin > 0) {
      params.set('runtime_gte', String(runtimeMin));
    }
    if (runtimeMax < MAX_RUNTIME_MINUTES) {
      params.set('runtime_lte', String(runtimeMax));
    }

    return params.toString();
  }, [filters, media, mergedExcludedGenres, mergedGenres, sortMode, type]);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setLoading(true);
        }

        const params = new URLSearchParams(queryString);
        params.set('page', String(page));
        params.set('tmdbLanguage', getCurrentTmdbLanguage());

        const response = await fetch(`/api/tmdb/discover?${params.toString()}`);
        const data = (await response.json()) as DiscoverApiResponse;

        if (!response.ok || data.code !== 200) {
          throw new Error(data.message || 'Failed to fetch TMDB data');
        }

        setItems((prev) =>
          append ? mergeUniqueById(prev, data.list) : uniqueById(data.list)
        );
        setCurrentPage(data.page || page);
        setTotalPages(data.total_pages || 1);
        setTotalResults(data.total_results || 0);
        setHasMore((data.page || page) < (data.total_pages || 1));
      } catch {
        if (!append) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setIsLoadingMore(false);
      }
    },
    [i18n.language, queryString]
  );

  const loadShowPage = useCallback(
    async (page: number, append: boolean) => {
      try {
        if (append) {
          setShowLoadingMore(true);
        } else {
          setShowLoading(true);
        }

        const params = new URLSearchParams({
          media: 'tv',
          include_adult: 'false',
          page: String(page + 1),
          with_genres: SHOW_GENRE_FILTER,
          sort_by: resolveDiscoverSortBy(sortMode, 'tv'),
          tmdbLanguage: getCurrentTmdbLanguage(),
        });

        if (showCountryFilter) {
          params.set('with_origin_country', showCountryFilter);
        }

        const response = await fetch(`/api/tmdb/discover?${params.toString()}`);
        const data = (await response.json()) as DiscoverApiResponse;

        if (!response.ok || data.code !== 200) {
          throw new Error(data.message || 'Failed to fetch TMDB show data');
        }

        setShowItems((prev) =>
          append ? mergeUniqueById(prev, data.list) : uniqueById(data.list)
        );
        const current = data.page || page + 1;
        const total = data.total_pages || 1;
        setShowHasMore(current < total);
      } catch {
        if (!append) {
          setShowItems([]);
          setShowHasMore(false);
        }
      } finally {
        setShowLoading(false);
        setShowLoadingMore(false);
      }
    },
    [i18n.language, showCountryFilter, sortMode]
  );

  useEffect(() => {
    if (!isTmdbType) return;

    setItems([]);
    setCurrentPage(1);
    setTotalPages(1);
    setTotalResults(0);
    setHasMore(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage(1, false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPage, isTmdbType]);

  useEffect(() => {
    if (!isTmdbType) return;
    if (currentPage <= 1) return;
    fetchPage(currentPage, true);
  }, [currentPage, fetchPage, isTmdbType]);

  useEffect(() => {
    if (!isTmdbType) return;
    if (!loadingRef.current || !hasMore || loading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loading, isTmdbType]);

  useEffect(() => {
    if (type !== 'show') return;

    setShowItems([]);
    setShowCurrentPage(0);
    setShowHasMore(true);
    setShowLoadingMore(false);

    if (showDebounceRef.current) clearTimeout(showDebounceRef.current);
    showDebounceRef.current = setTimeout(() => {
      loadShowPage(0, false);
    }, 100);

    return () => {
      if (showDebounceRef.current) clearTimeout(showDebounceRef.current);
    };
  }, [type, showCountryFilter, loadShowPage]);

  useEffect(() => {
    if (type !== 'show') return;
    if (showCurrentPage <= 0) return;
    loadShowPage(showCurrentPage, true);
  }, [type, showCurrentPage, loadShowPage]);

  useEffect(() => {
    if (type !== 'show') return;
    if (
      !showLoadingRef.current ||
      !showHasMore ||
      showLoading ||
      showLoadingMore
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (showHasMore && !showLoadingMore) {
          setShowCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(showLoadingRef.current);
    showObserverRef.current = observer;

    return () => observer.disconnect();
  }, [type, showHasMore, showLoading, showLoadingMore]);

  const toggleGenre = useCallback((genreId: number) => {
    setFilters((prev) => {
      const exists = prev.selectedGenres.includes(genreId);
      const nextGenres = exists
        ? prev.selectedGenres.filter((id) => id !== genreId)
        : [...prev.selectedGenres, genreId];
      // Keep included and excluded genres mutually exclusive for stable results.
      const nextExcludedGenres = prev.excludedGenres.filter(
        (id) => id !== genreId
      );
      return {
        ...prev,
        selectedGenres: nextGenres,
        excludedGenres: nextExcludedGenres,
      };
    });
  }, []);

  const toggleExcludedGenre = useCallback((genreId: number) => {
    setFilters((prev) => {
      const exists = prev.excludedGenres.includes(genreId);
      const nextExcludedGenres = exists
        ? prev.excludedGenres.filter((id) => id !== genreId)
        : [...prev.excludedGenres, genreId];
      const nextGenres = prev.selectedGenres.filter((id) => id !== genreId);
      return {
        ...prev,
        selectedGenres: nextGenres,
        excludedGenres: nextExcludedGenres,
      };
    });
  }, []);

  const toggleShowCountry = useCallback((countryCode: string) => {
    setShowLoading(true);
    setShowCountries((prev) => {
      const exists = prev.includes(countryCode);
      if (exists) {
        return prev.filter((value) => value !== countryCode);
      }
      return [...prev, countryCode];
    });
  }, []);

  const activePath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('type', type);
    return `/discover?${params.toString()}`;
  }, [type]);

  const skeletonData = useMemo(
    () => Array.from({ length: PAGE_SIZE_HINT }, (_, index) => index),
    []
  );

  const releaseMinValue = Number(filters.releaseYearMin || MIN_RELEASE_YEAR);
  const releaseMaxValue = Number(filters.releaseYearMax || CURRENT_YEAR);
  const releaseLeft =
    ((releaseMinValue - MIN_RELEASE_YEAR) / (CURRENT_YEAR - MIN_RELEASE_YEAR)) *
    100;
  const releaseRight =
    100 -
    ((releaseMaxValue - MIN_RELEASE_YEAR) / (CURRENT_YEAR - MIN_RELEASE_YEAR)) *
      100;
  const releaseMidYear = Math.floor((MIN_RELEASE_YEAR + CURRENT_YEAR) / 2);

  const ratingMinValue = Number(filters.ratingMin || MIN_RATING);
  const ratingMaxValue = Number(filters.ratingMax || MAX_RATING);
  const ratingLeft =
    ((ratingMinValue - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100;
  const ratingRight =
    100 - ((ratingMaxValue - MIN_RATING) / (MAX_RATING - MIN_RATING)) * 100;

  const runtimeMinValue = Number(filters.runtimeMin || 0);
  const runtimeMaxValue = Number(filters.runtimeMax || MAX_RUNTIME_MINUTES);
  const runtimeLeft = (runtimeMinValue / MAX_RUNTIME_MINUTES) * 100;
  const runtimeRight = 100 - (runtimeMaxValue / MAX_RUNTIME_MINUTES) * 100;
  return (
    <PageLayout
      activePath={activePath}
      disableMobileTopPadding={hasTopHero}
      showDesktopTopSearch={isTmdbType}
    >
      <div
        className={`overflow-visible ${
          hasTopHero
            ? 'px-0 pb-4 sm:px-10 sm:pb-8'
            : 'px-4 py-4 sm:px-10 sm:py-8'
        }`}
      >
        {hasTopHero ? (
          <div className='px-2 sm:px-0'>
            <TmdbHeroBanner
              mediaFilter={media}
              withGenres={
                type === 'show' ? SHOW_GENRE_FILTER : ''
              }
              withKeywords={
                type === 'anime' ? String(ANIME_KEYWORD_ID) : ''
              }
              withOriginCountry={
                type === 'show' ? SHOW_HERO_COUNTRY_FILTER : ''
              }
            />
          </div>
        ) : null}

        <div className={hasTopHero ? 'px-4 sm:px-0' : ''}>
          <div className='mb-6 space-y-4 sm:mb-8 sm:space-y-6'>
            <div className='space-y-1'>
              <h1 className='text-2xl font-bold text-gray-800 dark:text-gray-200 sm:text-3xl'>
                {type === 'tv'
                  ? t('common.series')
                  : type === 'anime'
                  ? t('common.anime')
                  : type === 'show'
                  ? t('common.shows')
                  : t('common.movies')}
              </h1>
            </div>

            <div className='rounded-2xl border border-gray-200/60 bg-white/75 p-4 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/50 sm:p-6'>
              {type === 'show' ? (
                <>
                  <div className='mb-4 flex items-center justify-between'>
                    <div className='inline-flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-200'>
                      <ListFilter className='h-5 w-5' />
                      <span>{t('discover.filters')}</span>
                    </div>
                    <button
                      type='button'
                      onClick={() => {
                        setShowCountries([]);
                        setSortMode(DEFAULT_SORT_MODE);
                      }}
                      disabled={
                        showCountries.length === 0 &&
                        sortMode === DEFAULT_SORT_MODE
                      }
                      className='inline-flex items-center gap-1 px-1 py-1 text-sm font-medium text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:text-red-300'
                    >
                      <RotateCcw className='h-3.5 w-3.5' />
                      {t('discover.reset')}
                    </button>
                  </div>
                  <div className='space-y-4'>
                    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4'>
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
                        <Languages className='h-4 w-4' />
                        {t('discover.country')}
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {SHOW_COUNTRY_OPTIONS.map((country) => {
                          const active = showCountries.includes(country.value);
                          return (
                            <button
                              key={country.value}
                              type='button'
                              aria-pressed={active}
                              onClick={() => toggleShowCountry(country.value)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {t(country.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4'>
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
                        <Tags className='h-4 w-4' />
                        {t('discover.sort')}
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {SORT_OPTIONS.map((option) => {
                          const active = sortMode === option.value;
                          return (
                            <button
                              key={option.value}
                              type='button'
                              aria-pressed={active}
                              onClick={() => setSortMode(option.value)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {t(option.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className='mb-4 flex items-center justify-between'>
                    <button
                      type='button'
                      onClick={() => setShowAdvancedFilters((prev) => !prev)}
                      className='inline-flex items-center gap-2 text-lg font-semibold text-gray-700 transition hover:text-gray-900 dark:text-gray-200 dark:hover:text-gray-100'
                    >
                      <ListFilter className='h-5 w-5' />
                      <span>{t('discover.filters')}</span>
                      <span className='text-xs font-normal text-gray-500 dark:text-gray-400'>
                        {showAdvancedFilters
                          ? t('discover.clickToCollapse')
                          : t('discover.clickToExpand')}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          showAdvancedFilters ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        setFilters(DEFAULT_FILTERS);
                        setSortMode(DEFAULT_SORT_MODE);
                      }}
                      className='inline-flex items-center gap-1 px-1 py-1 text-sm font-medium text-red-500 transition hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'
                    >
                      <RotateCcw className='h-3.5 w-3.5' />
                      {t('discover.reset')}
                    </button>
                  </div>

                  <div className='space-y-4'>
                    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4'>
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0'>
                        <CalendarRange className='h-4 w-4' />
                        {t('discover.releaseDate')}
                      </div>
                      <div className='w-full'>
                        <div className='mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300'>
                          <span>{releaseMinValue}</span>
                          <span>{releaseMaxValue}</span>
                        </div>
                        <div className='relative h-8'>
                          <div className='absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700' />
                          <div
                            className='absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8C97A8]'
                            style={{
                              left: `${releaseLeft}%`,
                              right: `${releaseRight}%`,
                            }}
                          />
                          <input
                            type='range'
                            min={MIN_RELEASE_YEAR}
                            max={CURRENT_YEAR}
                            step='1'
                            value={releaseMinValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                releaseYearMin: String(
                                  Math.min(next, Number(prev.releaseYearMax))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-20`}
                          />
                          <input
                            type='range'
                            min={MIN_RELEASE_YEAR}
                            max={CURRENT_YEAR}
                            step='1'
                            value={releaseMaxValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                releaseYearMax: String(
                                  Math.max(next, Number(prev.releaseYearMin))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-30`}
                          />
                        </div>
                        <div className='mt-1 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400'>
                          <span>{MIN_RELEASE_YEAR}</span>
                          <span>{releaseMidYear}</span>
                          <span>{CURRENT_YEAR}</span>
                        </div>
                      </div>
                    </div>

                    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4'>
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
                        <Tags className='h-4 w-4' />
                        {t('discover.genres')}
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {genreOptions.map((genre) => {
                          const active = filters.selectedGenres.includes(
                            genre.id
                          );
                          return (
                            <button
                              key={genre.id}
                              type='button'
                              aria-pressed={active}
                              onClick={() => toggleGenre(genre.id)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {t(genre.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 ${
                        showAdvancedFilters ? '' : 'hidden'
                      }`}
                    >
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
                        <Tags className='h-4 w-4' />
                        {t('discover.excludeGenres')}
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {genreOptions.map((genre) => {
                          const active = filters.excludedGenres.includes(
                            genre.id
                          );
                          return (
                            <button
                              key={`exclude-${genre.id}`}
                              type='button'
                              aria-pressed={active}
                              onClick={() => toggleExcludedGenre(genre.id)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-900/20 dark:text-rose-300'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {t(genre.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4'>
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
                        <Tags className='h-4 w-4' />
                        {t('discover.sort')}
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        {SORT_OPTIONS.map((option) => {
                          const active = sortMode === option.value;
                          return (
                            <button
                              key={option.value}
                              type='button'
                              aria-pressed={active}
                              onClick={() => setSortMode(option.value)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                active
                                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {t(option.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${
                        showAdvancedFilters ? '' : 'hidden'
                      }`}
                    >
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0'>
                        <Languages className='h-4 w-4' />
                        {t('common.language')}
                      </div>
                      <select
                        value={filters.language}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            language: e.target.value,
                          }))
                        }
                        className='w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base outline-none ring-0 transition focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 sm:max-w-xs'
                      >
                        {LANGUAGE_OPTIONS.map((option) => (
                          <option
                            key={option.value || 'none'}
                            value={option.value}
                          >
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${
                        showAdvancedFilters ? '' : 'hidden'
                      }`}
                    >
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0'>
                        <Star className='h-4 w-4' />
                        {t('discover.userRating')}
                      </div>
                      <div className='w-full'>
                        <div className='mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300'>
                          <span>{ratingMinValue}</span>
                          <span>{ratingMaxValue}</span>
                        </div>
                        <div className='relative h-8'>
                          <div className='absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700' />
                          <div
                            className='absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8C97A8]'
                            style={{
                              left: `${ratingLeft}%`,
                              right: `${ratingRight}%`,
                            }}
                          />
                          <input
                            type='range'
                            min={MIN_RATING}
                            max={MAX_RATING}
                            step='0.5'
                            value={ratingMinValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                ratingMin: String(
                                  Math.min(next, Number(prev.ratingMax))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-20`}
                          />
                          <input
                            type='range'
                            min={MIN_RATING}
                            max={MAX_RATING}
                            step='0.5'
                            value={ratingMaxValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                ratingMax: String(
                                  Math.max(next, Number(prev.ratingMin))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-30`}
                          />
                        </div>
                        <div className='mt-1 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400'>
                          <span>0</span>
                          <span>5</span>
                          <span>10</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${
                        showAdvancedFilters ? '' : 'hidden'
                      }`}
                    >
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0'>
                        <UsersRound className='h-4 w-4' />
                        {t('discover.minimumVotes')}
                      </div>
                      <input
                        type='number'
                        min='0'
                        step='1'
                        value={filters.minVoteCount}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            minVoteCount: e.target.value,
                          }))
                        }
                        placeholder={t('discover.minVotesPlaceholder')}
                        className='w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base outline-none transition focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 sm:max-w-xs'
                      />
                    </div>

                    <div
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 ${
                        showAdvancedFilters ? '' : 'hidden'
                      }`}
                    >
                      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0'>
                        <Clock3 className='h-4 w-4' />
                        {t('discover.runtime')}
                      </div>
                      <div className='w-full'>
                        <div className='mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300'>
                          <span>{runtimeMinValue} min</span>
                          <span>{runtimeMaxValue} min</span>
                        </div>
                        <div className='relative h-8'>
                          <div className='absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700' />
                          <div
                            className='absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8C97A8]'
                            style={{
                              left: `${runtimeLeft}%`,
                              right: `${runtimeRight}%`,
                            }}
                          />
                          <input
                            type='range'
                            min='0'
                            max={MAX_RUNTIME_MINUTES}
                            step='10'
                            value={runtimeMinValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                runtimeMin: String(
                                  Math.min(next, Number(prev.runtimeMax))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-20`}
                          />
                          <input
                            type='range'
                            min='0'
                            max={MAX_RUNTIME_MINUTES}
                            step='10'
                            value={runtimeMaxValue}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              setFilters((prev) => ({
                                ...prev,
                                runtimeMax: String(
                                  Math.max(next, Number(prev.runtimeMin))
                                ),
                              }));
                            }}
                            className={`${MEDIA_RANGE_INPUT_CLASS} z-30`}
                          />
                        </div>
                        <div className='mt-1 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400'>
                          <span>0</span>
                          <span>120</span>
                          <span>240</span>
                          <span>{MAX_RUNTIME_MINUTES}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className='mt-8 overflow-visible'>
            <div className='grid grid-cols-2 justify-start gap-x-2 gap-y-8 px-0 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8 sm:px-2'>
              {(type === 'show' ? showLoading : loading)
                ? skeletonData.map((index) => (
                    <DiscoverCardSkeleton key={index} />
                  ))
                : (type === 'show' ? showItems : items).map((item) => (
                    <div key={item.id} className='w-full'>
                      <VideoCard
                        id={item.id}
                        source='tmdb'
                        from='discover'
                        title={item.title}
                        poster={item.poster}
                        rate={item.rate}
                        year={item.year}
                        displayVariant='poster-info'
                        type={type === 'show' ? 'tv' : media}
                      />
                    </div>
                  ))}
            </div>

            {(type === 'show' ? showHasMore : hasMore) &&
            !(type === 'show' ? showLoading : loading) ? (
              <div
                ref={type === 'show' ? showLoadingRef : loadingRef}
                className='mt-12 flex justify-center py-8'
              >
                {(type === 'show' ? showLoadingMore : isLoadingMore) ? (
                  <div className='flex items-center gap-2'>
                    <div className='h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500' />
                    <span className='text-gray-600 dark:text-gray-300'>
                      {t('common.loading')}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!(type === 'show' ? showHasMore : hasMore) &&
            (type === 'show' ? showItems.length : items.length) > 0 ? (
              <div className='py-8 text-center text-gray-500 dark:text-gray-400'>
                {t('common.allContentLoaded')}
              </div>
            ) : null}

            {!(type === 'show' ? showLoading : loading) &&
            (type === 'show' ? showItems.length : items.length) === 0 ? (
              <div className='py-8 text-center text-gray-500 dark:text-gray-400'>
                {t('common.noRelatedContentFound')}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverPageClient />
    </Suspense>
  );
}
