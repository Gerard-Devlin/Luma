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

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  buildTmdbDetailClientCacheKey as buildGlobalTmdbDetailCacheKey,
  fetchTmdbDetailWithClientCache as fetchGlobalTmdbDetailWithCache,
  prefetchTmdbDetail,
} from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { parseTmdbStorageId } from '@/lib/tmdb-history';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { SearchResult } from '@/lib/types';

import {
  glassDialogCancelClass,
  glassDialogContentClass,
  glassDialogDangerActionClass,
  glassDialogDescriptionClass,
} from '@/components/dialogStyles';
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

import { getCurrentTmdbLanguage } from '@/i18n/client';

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

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function normalizeMediaType(value?: string, episodes?: number): TmdbMediaType {
  if (value === 'tv' || value === 'show') return 'tv';
  if (value === 'movie') return 'movie';
  if (typeof episodes === 'number' && episodes > 1) return 'tv';
  return 'movie';
}

function getTmdbDetailId(
  id: string | undefined,
  source: string | undefined,
  from: VideoCardProps['from']
): string {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return '';

  const tmdbStorage =
    source === 'tmdb' ? parseTmdbStorageId(normalizedId) : null;
  if (tmdbStorage?.tmdbId) return tmdbStorage.tmdbId;

  if (source === 'tmdb' && /^\d+$/.test(normalizedId)) {
    return normalizedId;
  }

  if (from === 'discover' && /^\d+$/.test(normalizedId)) {
    return normalizedId;
  }

  return '';
}

function buildTmdbDetailCacheKey(input: TmdbDetailLookupInput, language?: string): string {
  return buildGlobalTmdbDetailCacheKey({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    tmdbLanguage: getCurrentTmdbLanguage(language),
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

async function fetchTmdbDetailWithClientCache(
  input: TmdbDetailLookupInput,
  language?: string
): Promise<TmdbCardDetail> {
  return fetchGlobalTmdbDetailWithCache<TmdbCardDetail>({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    poster: input.poster,
    score: input.score,
    tmdbLanguage: getCurrentTmdbLanguage(language),
  });
}

function scheduleTmdbDetailPrefetch(input: TmdbDetailLookupInput, language?: string): void {
  prefetchTmdbDetail({
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    poster: input.poster,
    score: input.score,
    tmdbLanguage: getCurrentTmdbLanguage(language),
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
    () => buildTmdbDetailCacheKey(tmdbTrigger, i18n.language),
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
          tmdbLanguage: getCurrentTmdbLanguage(i18n.language),
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
        showHeart: !isAggregate && displayVariant !== 'poster-info',
        showCheckCircle: false,
        showRating: displayVariant === 'poster-info' && !!rate,
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
  }, [from, isAggregate, rate, displayVariant]);

  const prefetchTmdbDetail = useCallback(() => {
    if (hasScheduledPrefetchRef.current) return;
    if (from === 'playrecord') return;
    if (!tmdbTrigger.title) return;

    hasScheduledPrefetchRef.current = true;
    scheduleTmdbDetailPrefetch(tmdbTrigger, i18n.language);
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

    const tmdbDetailId = getTmdbDetailId(actualId, actualSource, from);

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
      const detail = await fetchTmdbDetailWithClientCache(tmdbTrigger, i18n.language);
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
