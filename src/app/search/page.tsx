/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client';

import { Users, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import {
  addSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { fetchTmdbDetailWithClientCache } from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { SearchResult } from '@/lib/types';

import Loader from '@/components/Loader';
import PageLayout from '@/components/PageLayout';
import SearchGlassInput from '@/components/SearchGlassInput';
import SearchPreviewPanel from '@/components/SearchPreviewPanel';
import SeasonPickerModal from '@/components/SeasonPickerModal';
import TmdbDetailModal, {
  type TmdbDetailMediaType,
  type TmdbDetailModalData,
} from '@/components/TmdbDetailModal';
import VideoCard from '@/components/VideoCard';

interface SearchPersonResult {
  id: number;
  name: string;
  profile: string;
  popularity: number;
  department: string;
  known_for: string[];
}

interface SearchPayload {
  results?: SearchResult[];
}

interface TmdbTopSearchDetail extends TmdbDetailModalData {
  logo?: string;
}

const SEARCH_SUGGEST_DEBOUNCE_MS = 220;
const SEARCH_SUGGEST_LIMIT = 6;

const DEPARTMENT_LABEL_KEYS: Record<string, string> = {
  Acting: 'searchPage.actor',
  Directing: 'searchPage.director',
  Production: 'searchPage.producer',
  Writing: 'searchPage.writer',
  Creator: 'searchPage.creator',
  Camera: 'searchPage.camera',
  Editing: 'searchPage.editor',
  Sound: 'searchPage.sound',
  Art: 'searchPage.art',
  'Costume & Make-Up': 'searchPage.costumeMakeUp',
  'Visual Effects': 'searchPage.visualEffects',
};

function formatDepartment(
  value: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const normalized = value.trim();
  if (!normalized) return '';
  const labelKey = DEPARTMENT_LABEL_KEYS[normalized];
  return labelKey ? t(labelKey) : normalized;
}

function getMediaType(item: SearchResult): TmdbDetailMediaType {
  if (item.type_name === 'tv') return 'tv';
  return 'movie';
}

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

function getEpisodeCount(item: SearchResult): number {
  if (typeof item.total_episodes === 'number' && item.total_episodes > 0) {
    return item.total_episodes;
  }
  if (
    item.source === 'tmdb' &&
    (item.type_name || '').trim().toLowerCase() === 'tv'
  ) {
    return 0;
  }
  return Array.isArray(item.episodes) ? item.episodes.length : 0;
}

function isTvResult(item: SearchResult): boolean {
  const normalizedType = (item.type_name || '').trim().toLowerCase();
  if (normalizedType === 'tv') return true;
  if (normalizedType === 'movie') return false;
  return getEpisodeCount(item) > 1;
}

function SearchPageClient() {
  const { i18n, t } = useTranslation();
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLDivElement | null>(null);
  const searchFieldRef = useRef<HTMLInputElement | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailCacheRef = useRef<Record<string, TmdbTopSearchDetail>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [suggestionResults, setSuggestionResults] = useState<SearchResult[]>(
    []
  );
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [hasSuggestionSearched, setHasSuggestionSearched] = useState(false);
  const [activeResult, setActiveResult] = useState<SearchResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbTopSearchDetail | null>(
    null
  );
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [seasonPickerData, setSeasonPickerData] = useState<{
    tmdbId: string;
    baseTitle: string;
    year: string;
    seasonCount: number;
    logo: string;
    backdrop: string;
  }>({
    tmdbId: '',
    baseTitle: '',
    year: '',
    seasonCount: 0,
    logo: '',
    backdrop: '',
  });
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [personResults, setPersonResults] = useState<SearchPersonResult[]>([]);
  const trimmedSearchQuery = searchQuery.trim();
  const shouldShowSuggestionDropdown =
    suggestionOpen &&
    trimmedSearchQuery.length > 0 &&
    (suggestionLoading || hasSuggestionSearched);
  const focusSearchField = useCallback((selectAll = true) => {
    const input = searchFieldRef.current;
    if (!input) return;
    input.focus();
    if (selectAll) {
      input.select();
    }
  }, []);

  useEffect(() => {
    if (!searchParams.get('q')) {
      focusSearchField(false);
    }

    getSearchHistory().then(setSearchHistory);

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [focusSearchField]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchInputRef.current) return;
      if (searchInputRef.current.contains(event.target as Node)) return;
      setSuggestionOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

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
        setDetailOpen(false);
        setDetailLoading(false);
        setDetailError(null);
        detailRequestIdRef.current += 1;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen]);

  useEffect(() => {
    if (!suggestionOpen || !trimmedSearchQuery) {
      if (!trimmedSearchQuery) {
        setSuggestionResults([]);
        setSuggestionLoading(false);
        setHasSuggestionSearched(false);
      }
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      setHasSuggestionSearched(true);
      try {
        const response = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(
            trimmedSearchQuery
          )}&tmdbLanguage=${encodeURIComponent(getCurrentTmdbLanguage())}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setSuggestionResults([]);
          return;
        }
        const payload = (await response.json()) as SearchPayload;
        const results = Array.isArray(payload.results) ? payload.results : [];
        setSuggestionResults(results.slice(0, SEARCH_SUGGEST_LIMIT));
      } catch {
        if (!controller.signal.aborted) {
          setSuggestionResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionLoading(false);
        }
      }
    }, SEARCH_SUGGEST_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [i18n.language, trimmedSearchQuery, suggestionOpen]);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      setSuggestionOpen(false);
      fetchSearchResults(query);
      addSearchHistory(query);
    } else {
      setShowResults(false);
      setPersonResults([]);
      setSuggestionOpen(false);
    }
  }, [searchParams]);

  const fetchSearchResults = async (query: string) => {
    try {
      setIsLoading(true);
      const trimmedQuery = query.trim();

      const tmdbPayload = await fetch(
        `/api/tmdb/search?q=${encodeURIComponent(
          trimmedQuery
        )}&tmdbLanguage=${encodeURIComponent(getCurrentTmdbLanguage())}`
      )
        .then(async (response) => {
          if (!response.ok) return { results: [], people: [] };
          return (await response.json()) as {
            results?: SearchResult[];
            people?: SearchPersonResult[];
          };
        })
        .catch(() => ({ results: [], people: [] }));

      const results = Array.isArray(tmdbPayload.results)
        ? tmdbPayload.results
        : [];
      const people = Array.isArray(tmdbPayload.people)
        ? tmdbPayload.people
        : [];
      setSearchResults(
        results.sort((a: SearchResult, b: SearchResult) => {
          const aExactMatch = a.title === trimmedQuery;
          const bExactMatch = b.title === trimmedQuery;

          if (aExactMatch && !bExactMatch) return -1;
          if (!aExactMatch && bExactMatch) return 1;

          if (a.year === b.year) {
            return a.title.localeCompare(b.title);
          }

          if (a.year === 'unknown' && b.year === 'unknown') return 0;
          if (a.year === 'unknown') return 1;
          if (b.year === 'unknown') return -1;
          return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
        })
      );
      setPersonResults(people);
      setShowResults(true);
    } catch (error) {
      setSearchResults([]);
      setPersonResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setSuggestionOpen(false);
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);

    fetchSearchResults(trimmed);

    addSearchHistory(trimmed);
  };

  const loadDetailForResult = useCallback(
    async (result: SearchResult) => {
      const mediaType = getMediaType(result);
      const year = normalizeYear(result.year);
      const tmdbLanguage = getCurrentTmdbLanguage();
      const cacheKey = `${tmdbLanguage}-${mediaType}-${result.title.trim()}-${year}`;
      const cached = detailCacheRef.current[cacheKey];
      if (cached) {
        setDetailData(cached);
        setDetailError(null);
        setDetailLoading(false);
        return;
      }

      const requestId = ++detailRequestIdRef.current;
      setDetailLoading(true);
      setDetailError(null);
      setDetailData(null);

      try {
        const payload =
          await fetchTmdbDetailWithClientCache<TmdbTopSearchDetail>({
            title: result.title,
            mediaType,
            year,
            poster: result.poster,
            tmdbLanguage,
          });
        if (detailRequestIdRef.current !== requestId) return;
        detailCacheRef.current[cacheKey] = payload;
        setDetailData(payload);
      } catch {
        if (detailRequestIdRef.current !== requestId) return;
        setDetailError(t('detail.failedToLoad'));
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [t]
  );

  const handleOpenDetail = useCallback(
    (result: SearchResult) => {
      const normalizedKeyword = normalizeKeyword(searchQuery);
      if (normalizedKeyword) {
        void addSearchHistory(normalizedKeyword);
      }
      setSuggestionOpen(false);
      router.push(
        buildTmdbDetailPageUrl({
          id: result.source === 'tmdb' ? result.id : undefined,
          title: result.title,
          mediaType: getMediaType(result),
          year: normalizeYear(result.year),
          poster: result.poster,
          score: result.score,
        })
      );
    },
    [router, searchQuery]
  );

  const handleRetryDetail = useCallback(() => {
    if (!activeResult) return;
    void loadDetailForResult(activeResult);
  }, [activeResult, loadDetailForResult]);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const pushPlayByTitle = useCallback(
    (title: string, mediaType: TmdbDetailMediaType, year: string) => {
      router.push(
        `/play?title=${encodeURIComponent(title)}${
          year ? `&year=${year}` : ''
        }&stype=${mediaType}`
      );
    },
    [router]
  );

  const fetchTmdbSeasonCountByTitle = useCallback(
    async (title: string, year: string): Promise<number> => {
      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) return 0;

      try {
        const payload = await fetchTmdbDetailWithClientCache<{
          mediaType?: 'movie' | 'tv';
          seasons?: number | null;
        }>({
          title: trimmedTitle,
          mediaType: 'tv',
          year,
        });
        if (payload.mediaType !== 'tv') return 0;
        if (typeof payload.seasons !== 'number' || payload.seasons <= 1)
          return 0;
        return Math.floor(payload.seasons);
      } catch {
        return 0;
      }
    },
    []
  );

  const handleCloseSeasonPicker = useCallback(() => {
    setSeasonPickerOpen(false);
    setSeasonPickerData({
      tmdbId: '',
      baseTitle: '',
      year: '',
      seasonCount: 0,
      logo: '',
      backdrop: '',
    });
  }, []);

  const handleSeasonPick = useCallback(
    (season: number) => {
      const tmdbId = seasonPickerData.tmdbId.trim();
      const base = seasonPickerData.baseTitle.trim();
      if (!tmdbId || !base) return;
      const year = seasonPickerData.year;
      handleCloseSeasonPicker();
      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId,
          mediaType: 'tv',
          title: base,
          year,
          poster: seasonPickerData.backdrop,
          season,
          episode: 1,
        })
      );
    },
    [
      handleCloseSeasonPicker,
      router,
      seasonPickerData.baseTitle,
      seasonPickerData.backdrop,
      seasonPickerData.tmdbId,
      seasonPickerData.year,
    ]
  );

  const handlePlayFromDetail = useCallback(async () => {
    const title = (detailData?.title || activeResult?.title || '').trim();
    if (!title) return;
    const mediaType =
      detailData?.mediaType ||
      (activeResult ? getMediaType(activeResult) : 'movie');
    const year = normalizeYear(detailData?.year || activeResult?.year);

    if (mediaType === 'tv' && !hasSeasonHint(title)) {
      const detailSeasons =
        typeof detailData?.seasons === 'number' && detailData.seasons > 1
          ? Math.floor(detailData.seasons)
          : 0;
      const seasonCount =
        detailSeasons || (await fetchTmdbSeasonCountByTitle(title, year));
      if (seasonCount > 1) {
        handleCloseDetail();
        setSeasonPickerData({
          tmdbId:
            (detailData?.id ? String(detailData.id) : '') ||
            (activeResult?.source === 'tmdb' ? activeResult.id : ''),
          baseTitle: stripSeasonHint(title) || title,
          year,
          seasonCount,
          logo: detailData?.logo || '',
          backdrop:
            detailData?.backdrop ||
            detailData?.poster ||
            activeResult?.poster ||
            '',
        });
        setSeasonPickerOpen(true);
        return;
      }
    }

    const tmdbId =
      detailData?.id ||
      (activeResult?.source === 'tmdb' ? activeResult.id : '');
    if (tmdbId) {
      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId,
          mediaType,
          title,
          year,
          poster:
            detailData?.poster || detailData?.backdrop || activeResult?.poster,
          score: detailData?.score || activeResult?.score,
          season: 1,
          episode: 1,
        })
      );
    }
    handleCloseDetail();
  }, [
    activeResult,
    detailData,
    fetchTmdbSeasonCountByTitle,
    handleCloseDetail,
    router,
  ]);

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestionResults([]);
    setSuggestionOpen(false);
    setHasSuggestionSearched(false);
    setSearchResults([]);
    setPersonResults([]);
    setShowResults(false);
    router.replace('/search');
    focusSearchField(false);
  };

  const handleDeleteSearchHistory = async (keyword: string) => {
    await deleteSearchHistory(keyword);
  };

  return (
    <div className='min-h-screen w-full'>
      <div className='relative w-full'>
        <PageLayout activePath='/search'>
          <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
            <div className='px-4 pt-3 sm:px-0'>
              <div
                ref={searchInputRef}
                className='relative mx-auto mb-8 w-full max-w-[720px] md:max-w-[calc(100vw_-_9rem)] lg:max-w-[720px]'
              >
                <SearchGlassInput
                  inputRef={searchFieldRef}
                  inputId='searchInput'
                  value={searchQuery}
                  onValueChange={(nextQuery) => {
                    setSearchQuery(nextQuery);
                    setSuggestionOpen(true);
                  }}
                  onSubmit={handleSearch}
                  active={suggestionOpen || trimmedSearchQuery.length > 0}
                  className='w-full'
                  onFocus={() => setSuggestionOpen(true)}
                  onInputKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setSuggestionOpen(false);
                    }
                  }}
                  onClear={clearSearch}
                  onShortcutClick={() => focusSearchField(false)}
                />
                {shouldShowSuggestionDropdown && (
                  <SearchPreviewPanel
                    className='absolute right-0 top-full z-[740] mt-2 w-full'
                    results={suggestionResults}
                    loading={suggestionLoading}
                    keyword={trimmedSearchQuery}
                    onItemClick={handleOpenDetail}
                    itemKeyPrefix='search-page-suggest'
                  />
                )}
              </div>

              <div className='mt-8 overflow-visible'>
                {isLoading ? (
                  <div className='flex justify-center items-center h-40'>
                    <Loader />
                  </div>
                ) : showResults ? (
                  <section className='mb-12'>
                    {personResults.length > 0 && (
                      <div className='mb-10'>
                        <h3 className='mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200'>
                          {t('searchPage.people')}
                        </h3>
                        <div className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'>
                          {personResults.map((person) => (
                            <Link
                              key={`person-${person.id}`}
                              href={`/person/${person.id}`}
                              className='group flex w-[88px] flex-shrink-0 flex-col items-center text-center sm:w-[104px]'
                            >
                              <div className='relative h-[82px] w-[82px] overflow-hidden rounded-full border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] shadow-[var(--ui-shadow-control)] sm:h-24 sm:w-24'>
                                {person.profile ? (
                                  <Image
                                    src={person.profile}
                                    alt={person.name}
                                    fill
                                    unoptimized
                                    className='object-cover transition-transform duration-300 group-hover:scale-105'
                                  />
                                ) : (
                                  <div className='flex h-full w-full items-center justify-center text-white/50'>
                                    <Users className='h-5 w-5' />
                                  </div>
                                )}
                              </div>
                              <div className='mt-2 w-full'>
                                <p className='truncate text-xs font-semibold leading-4 text-gray-900 dark:text-gray-100 sm:text-[13px]'>
                                  {person.name}
                                </p>
                                {person.department && (
                                  <p className='mt-0.5 truncate text-[11px] leading-4 text-gray-500 dark:text-gray-400'>
                                    {formatDepartment(person.department, t)}
                                  </p>
                                )}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className='mb-8 flex items-center justify-between'>
                      <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                        {t('searchPage.searchResults')}
                      </h2>
                    </div>
                    <div className='grid grid-cols-2 justify-start gap-x-2 gap-y-8 px-0 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8 sm:px-2'>
                      {searchResults.map((item) => (
                        <div
                          key={`all-${item.source}-${item.id}`}
                          className='w-full'
                        >
                          <VideoCard
                            id={item.id}
                            title={item.title}
                            poster={item.poster}
                            episodes={getEpisodeCount(item)}
                            source={item.source}
                            source_name={item.source_name}
                            query={
                              searchQuery.trim() !== item.title
                                ? searchQuery.trim()
                                : ''
                            }
                            year={item.year}
                            rate={item.score}
                            from='search'
                            type={isTvResult(item) ? 'tv' : 'movie'}
                            displayVariant='poster-info'
                          />
                        </div>
                      ))}
                      {searchResults.length === 0 && (
                        <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                          {personResults.length > 0
                            ? t('searchPage.noMovieTvResults')
                            : t('common.noSearchResults')}
                        </div>
                      )}
                    </div>
                  </section>
                ) : searchHistory.length > 0 ? (
                  <section className='mb-12'>
                    <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                      {t('searchPage.searchHistory')}
                      {/* {searchHistory.length > 0 && (
                  <button
                    onClick={() => {
                    className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                  >
                  </button>
                )} */}
                    </h2>
                    <div className='flex flex-wrap gap-2'>
                      {searchHistory.map((item) => (
                        <div key={item} className='relative group'>
                          <button
                            onClick={() => {
                              setSearchQuery(item);
                              router.push(
                                `/search?q=${encodeURIComponent(item.trim())}`
                              );
                            }}
                            className='ui-glass-control px-4 py-2 text-sm'
                          >
                            {item}
                          </button>
                          <button
                            type='button'
                            aria-label={t(
                              'searchPage.deleteSearchHistoryItem',
                              {
                                item,
                              }
                            )}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteSearchHistory(item);
                            }}
                            className='absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ui-glass-control-bg-hover)] text-white opacity-0 shadow-sm ring-1 ring-[var(--ui-glass-border)] transition-all duration-150 hover:bg-red-500 group-hover:opacity-100 focus:opacity-100'
                          >
                            <X className='h-3 w-3' />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </PageLayout>

        <TmdbDetailModal
          open={detailOpen}
          loading={detailLoading}
          error={detailError}
          detail={detailData}
          titleLogo={detailData?.logo}
          onClose={handleCloseDetail}
          onRetry={handleRetryDetail}
          onPlay={() => {
            void handlePlayFromDetail();
          }}
        />

        <SeasonPickerModal
          open={seasonPickerOpen}
          title={seasonPickerData.baseTitle}
          logo={seasonPickerData.logo}
          backdrop={seasonPickerData.backdrop}
          seasonCount={seasonPickerData.seasonCount}
          onClose={handleCloseSeasonPicker}
          onPickSeason={handleSeasonPick}
        />
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
