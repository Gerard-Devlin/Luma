'use client';

import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  ListFilter,
  Play,
  Shuffle,
  Tags,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import type { Favorite, PlayRecord } from '@/lib/db.client';
import {
  deleteFavorite,
  deletePlayRecord,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  buildTmdbHistoryPlayUrl,
  filterTmdbHistoryRecords,
  parseTmdbStorageId,
  parseStorageKey,
} from '@/lib/tmdb-history';
import { fetchTmdbDetailWithClientCache } from '@/lib/tmdb-detail.client';
import {
  glassDialogCancelClass,
  glassDialogContentClass,
  glassDialogDangerActionClass,
  glassDialogDescriptionClass,
} from '@/components/dialogStyles';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
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
import VideoCard from '@/components/VideoCard';

type PlayRecordItem = PlayRecord & { key: string };

interface FavoriteItem {
  key: string;
  source: string;
  id: string;
  title: string;
  poster: string;
  year: string;
  episodes: number;
  sourceName: string;
  currentEpisode?: number;
  searchTitle?: string;
}

interface TmdbDisplayLookupDetail {
  title?: string;
  poster?: string;
  year?: string;
}

interface TmdbPosterLookupTarget {
  key: string;
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string;
  poster: string;
}

type ActiveTab = 'play' | 'favorite';
type PlayToolbarSortMode = 'latest' | 'titleAsc' | 'titleDesc';
type PlayToolbarFilterMode = 'all' | 'movie' | 'tv';

const TMDB_POSTER_LOOKUP_LIMIT = 40;
const LONG_PRESS_DURATION_MS = 420;
const SUPPORTED_GENRES = [
  '冒险',
  '剧情',
  '动作',
  '动画',
  '历史',
  '喜剧',
  '奇幻',
  '家庭',
  '恐怖',
  '悬疑',
  '惊悚',
  '战争',
  '爱情',
  '犯罪',
  '科幻',
  '纪录',
  '西部',
  '音乐',
] as const;

type SupportedGenre = (typeof SUPPORTED_GENRES)[number];

const GENRE_DISPLAY_LABELS: Record<SupportedGenre, string> = {
  冒险: 'Adventure',
  剧情: 'Drama',
  动作: 'Action',
  动画: 'Animation',
  历史: 'History',
  喜剧: 'Comedy',
  奇幻: 'Fantasy',
  家庭: 'Family',
  恐怖: 'Horror',
  悬疑: 'Mystery',
  惊悚: 'Thriller',
  战争: 'War',
  爱情: 'Romance',
  犯罪: 'Crime',
  科幻: 'Sci-Fi',
  纪录: 'Documentary',
  西部: 'Western',
  音乐: 'Music',
};

const GENRE_ALIAS_MAP: Record<string, SupportedGenre> = {
  adventure: '冒险',
  'action & adventure': '动作',
  动作冒险: '动作',
  drama: '剧情',
  action: '动作',
  animation: '动画',
  history: '历史',
  comedy: '喜剧',
  fantasy: '奇幻',
  family: '家庭',
  horror: '恐怖',
  mystery: '悬疑',
  thriller: '惊悚',
  war: '战争',
  'war & politics': '战争',
  romance: '爱情',
  crime: '犯罪',
  'science fiction': '科幻',
  'science fiction & fantasy': '科幻',
  sci_fi: '科幻',
  sci_fi__fantasy: '科幻',
  科幻与奇幻: '科幻',
  documentary: '纪录',
  纪录片: '纪录',
  western: '西部',
  music: '音乐',
  冒险: '冒险',
  剧情: '剧情',
  动作: '动作',
  动画: '动画',
  历史: '历史',
  喜剧: '喜剧',
  奇幻: '奇幻',
  家庭: '家庭',
  恐怖: '恐怖',
  悬疑: '悬疑',
  惊悚: '惊悚',
  战争: '战争',
  爱情: '爱情',
  犯罪: '犯罪',
  科幻: '科幻',
  纪录: '纪录',
  西部: '西部',
  音乐: '音乐',
};

function normalizeGenreName(rawGenre: string): SupportedGenre | null {
  const normalized = rawGenre.trim().toLowerCase();
  return GENRE_ALIAS_MAP[normalized] || null;
}

function formatGenreLabel(genre: string): string {
  return GENRE_DISPLAY_LABELS[genre as SupportedGenre] || genre;
}

function getGenreLabelKey(genre: string): string {
  const keyByGenre: Record<SupportedGenre, string> = {
    冒险: 'discover.adventure',
    剧情: 'discover.drama',
    动作: 'discover.action',
    动画: 'discover.animation',
    历史: 'discover.history',
    喜剧: 'discover.comedy',
    奇幻: 'discover.fantasy',
    家庭: 'discover.family',
    恐怖: 'discover.horror',
    悬疑: 'discover.mystery',
    惊悚: 'discover.thriller',
    战争: 'discover.war',
    爱情: 'discover.romance',
    犯罪: 'discover.crime',
    科幻: 'discover.sciFi',
    纪录: 'discover.documentary',
    西部: 'discover.western',
    音乐: 'discover.music',
  };

  return keyByGenre[genre as SupportedGenre] || '';
}

function buildPlayUrl(record: PlayRecordItem): string {
  return buildTmdbHistoryPlayUrl(record.key, record);
}

function buildFavoritePlayUrl(item: FavoriteItem): string {
  const normalizedTitle = (item.title || '').trim();
  const normalizedSearchTitle = (item.searchTitle || '').trim();
  const normalizedYear = (item.year || '').trim();
  const params = new URLSearchParams();

  if (item.source && item.id) {
    params.set('source', item.source);
    params.set('id', item.id);
  }
  params.set(
    'title',
    normalizedTitle || normalizedSearchTitle || 'Unknown title'
  );
  if (normalizedSearchTitle) {
    params.set('stitle', normalizedSearchTitle);
  }
  if (normalizedYear) {
    params.set('year', normalizedYear);
  }
  if ((item.episodes || 0) > 1) {
    params.set('stype', 'tv');
  }

  return `/play?${params.toString()}`;
}

function buildTmdbPosterLookupTarget(input: {
  key: string;
  title: string;
  year?: string;
  poster?: string;
  episodes?: number;
}): TmdbPosterLookupTarget | null {
  const { source, id } = parseStorageKey(input.key);
  if (source !== 'tmdb') return null;

  const parsed = parseTmdbStorageId(id);
  if (!parsed) return null;

  const episodes = Math.max(0, Number(input.episodes || 0));
  return {
    key: input.key,
    tmdbId: parsed.tmdbId,
    mediaType: parsed.season !== null || episodes > 1 ? 'tv' : 'movie',
    title: (input.title || '').trim(),
    year: (input.year || '').trim(),
    poster: (input.poster || '').trim(),
  };
}

function stripSeasonHintFromTitle(title: string): string {
  return (title || '')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*季/gi, ' ')
    .replace(/第\s*\d+\s*部/gi, ' ')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*辑/gi, ' ')
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTmdbTitleCandidates(
  record: Pick<PlayRecord, 'title'> & { search_title?: string }
): string[] {
  const candidates: string[] = [];
  const dedupe = new Set<string>();

  const push = (value?: string) => {
    const normalized = (value || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    candidates.push(normalized);
  };

  push(record.title);
  push(record.search_title);
  push(stripSeasonHintFromTitle(record.title));
  push(stripSeasonHintFromTitle(record.search_title || ''));

  return candidates;
}

function getWatchFormat(
  record: Pick<
    PlayRecord,
    'index' | 'total_episodes' | 'title' | 'search_title'
  >
): 'movie' | 'tv' {
  const totalEpisodes = Number(record.total_episodes || 0);
  if (Number.isFinite(totalEpisodes) && totalEpisodes > 1) return 'tv';

  const watchedIndex = Number(record.index || 0);
  if (Number.isFinite(watchedIndex) && watchedIndex > 1) return 'tv';

  const titleText = `${record.title || ''} ${
    record.search_title || ''
  }`.toLowerCase();
  if (
    /(第\s*\d+\s*集|全\s*\d+\s*集|更新至\s*\d+\s*集|s\s*\d{1,2}\s*e\s*\d{1,3}|ep?\s*\d{1,3})/i.test(
      titleText
    )
  ) {
    return 'tv';
  }

  return 'movie';
}

function getProgressPercent(record: PlayRecord): number {
  if (!record.total_time) return 0;
  return (record.play_time / record.total_time) * 100;
}

function formatHistoryEpisodeMeta(
  record: PlayRecordItem,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (getWatchFormat(record) !== 'tv') return '';

  const { id } = parseStorageKey(record.key);
  const parsed = parseTmdbStorageId(id);
  const season = parsed?.season || 1;
  const episode = Math.max(1, Number(record.index || 1));

  return `${t('history.season', { season })} · ${t('common.episode', {
    count: episode,
  })}`;
}

function JumpingDots({ label }: { label: string }) {
  return (
    <span
      className='inline-flex h-5 translate-y-0.5 items-center gap-1 text-gray-500 dark:text-gray-400'
      role='status'
      aria-label={label}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className='h-1.5 w-1.5 animate-bounce rounded-full bg-current'
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function MyPageClient() {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [playRecords, setPlayRecords] = useState<PlayRecordItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [isPlayBatchMode, setIsPlayBatchMode] = useState(false);
  const [isFavoriteBatchMode, setIsFavoriteBatchMode] = useState(false);
  const [selectedPlayKeys, setSelectedPlayKeys] = useState<Set<string>>(
    new Set()
  );
  const [selectedFavoriteKeys, setSelectedFavoriteKeys] = useState<Set<string>>(
    new Set()
  );
  const [deleteTarget, setDeleteTarget] = useState<'play' | 'favorite' | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [playSearchKeyword, setPlaySearchKeyword] = useState('');
  const [playSortMode, setPlaySortMode] =
    useState<PlayToolbarSortMode>('latest');
  const [playFilterMode, setPlayFilterMode] =
    useState<PlayToolbarFilterMode>('all');
  const [favoriteSortMode, setFavoriteSortMode] =
    useState<PlayToolbarSortMode>('latest');
  const [favoriteFilterMode, setFavoriteFilterMode] =
    useState<PlayToolbarFilterMode>('all');
  const [selectedPlayGenres, setSelectedPlayGenres] = useState<
    SupportedGenre[]
  >([]);
  const [selectedFavoriteGenres, setSelectedFavoriteGenres] = useState<
    SupportedGenre[]
  >([]);
  const [showPlayFilterPanel, setShowPlayFilterPanel] = useState(false);
  const [showFavoriteFilterPanel, setShowFavoriteFilterPanel] = useState(false);
  const [loadingPlayGenreFilters, setLoadingPlayGenreFilters] = useState(false);
  const [loadingFavoriteGenreFilters, setLoadingFavoriteGenreFilters] =
    useState(false);
  const [playRecordGenres, setPlayRecordGenres] = useState<
    Record<string, SupportedGenre[]>
  >({});
  const [favoriteItemGenres, setFavoriteItemGenres] = useState<
    Record<string, SupportedGenre[]>
  >({});
  const [tmdbDisplayByKey, setTmdbDisplayByKey] = useState<
    Record<string, { title?: string; poster?: string; year?: string }>
  >({});
  const tmdbLanguage = getCurrentTmdbLanguage();
  const genreCacheRef = useRef<Map<string, string[]>>(new Map());
  const tmdbPosterLookupKeysRef = useRef<Set<string>>(new Set());
  const longPressTimerRef = useRef<number | null>(null);
  const suppressPlayCardClickRef = useRef(false);
  const suppressFavoriteCardClickRef = useRef(false);
  const playToolbarRef = useRef<HTMLDivElement | null>(null);
  const favoriteToolbarRef = useRef<HTMLDivElement | null>(null);

  const updatePlayRecords = useCallback(
    (records: Record<string, PlayRecord>) => {
      const sorted = Object.entries(filterTmdbHistoryRecords(records))
        .map(([key, record]) => ({ ...record, key }))
        .sort((a, b) => b.save_time - a.save_time);
      setPlayRecords(sorted);
    },
    []
  );

  const updateFavorites = useCallback(
    async (favorites: Record<string, Favorite>) => {
      const allPlayRecords = await getAllPlayRecords();
      const sorted = Object.entries(favorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const { source, id } = parseStorageKey(key);
          const playRecord = allPlayRecords[key];
          return {
            key,
            source,
            id,
            title: fav.title,
            poster: fav.cover,
            year: fav.year,
            episodes: fav.total_episodes,
            sourceName: fav.source_name,
            currentEpisode: playRecord?.index,
            searchTitle: fav.search_title,
          } satisfies FavoriteItem;
        });
      setFavoriteItems(sorted);
    },
    []
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPlayRecords(true);
        setLoadingFavorites(true);
        const [records, favorites] = await Promise.all([
          getAllPlayRecords(),
          getAllFavorites(),
        ]);
        updatePlayRecords(records);
        await updateFavorites(favorites);
      } finally {
        setLoadingPlayRecords(false);
        setLoadingFavorites(false);
      }
    };

    void load();

    const unsubPlay = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );
    const unsubFav = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, Favorite>) => {
        void updateFavorites(newFavorites);
      }
    );

    return () => {
      unsubPlay();
      unsubFav();
    };
  }, [updateFavorites, updatePlayRecords]);

  useEffect(() => {
    const targets = [
      ...playRecords.map((record) =>
        buildTmdbPosterLookupTarget({
          key: record.key,
          title: record.title,
          year: record.year,
          poster: record.cover,
          episodes: record.total_episodes,
        })
      ),
      ...favoriteItems.map((item) =>
        buildTmdbPosterLookupTarget({
          key: item.key,
          title: item.title,
          year: item.year,
          poster: item.poster,
          episodes: item.episodes,
        })
      ),
    ]
      .filter((target): target is TmdbPosterLookupTarget => Boolean(target))
      .filter(
        (target) => {
          const displayKey = `${tmdbLanguage}:${target.key}`;
          return (
            !tmdbDisplayByKey[displayKey] &&
            !tmdbPosterLookupKeysRef.current.has(displayKey)
          );
        }
      )
      .slice(0, TMDB_POSTER_LOOKUP_LIMIT);

    if (targets.length === 0) return;

    let cancelled = false;
    targets.forEach((target) => {
      tmdbPosterLookupKeysRef.current.add(`${tmdbLanguage}:${target.key}`);
    });

    const run = async () => {
      const settled = await Promise.allSettled(
        targets.map(async (target) => {
          try {
            const detail =
              await fetchTmdbDetailWithClientCache<TmdbDisplayLookupDetail>({
                id: target.tmdbId,
                title: target.title,
                mediaType: target.mediaType,
                year: target.year,
                poster: target.poster,
                logoLanguagePreference: 'en',
                tmdbLanguage,
              });
            const title = (detail.title || '').trim();
            const poster = (detail.poster || '').trim();
            const year = (detail.year || '').trim();
            if (!title && !poster && !year) return null;
            return [
              `${tmdbLanguage}:${target.key}`,
              { title, poster, year },
            ] as const;
          } catch {
            return null;
          } finally {
            tmdbPosterLookupKeysRef.current.delete(
              `${tmdbLanguage}:${target.key}`
            );
          }
        })
      );

      if (cancelled) return;

      setTmdbDisplayByKey((prev) => {
        const next = { ...prev };
        settled.forEach((result) => {
          if (result.status !== 'fulfilled' || !result.value) return;
          const [key, display] = result.value;
          next[key] = display;
        });
        return next;
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [favoriteItems, playRecords, tmdbDisplayByKey, tmdbLanguage]);

  useEffect(() => {
    setSelectedPlayKeys((prev) => {
      const validKeys = new Set(playRecords.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [playRecords]);

  useEffect(() => {
    setSelectedFavoriteKeys((prev) => {
      const validKeys = new Set(favoriteItems.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [favoriteItems]);

  useEffect(() => {
    setDeleteTarget(null);
    if (activeTab === 'play') {
      setIsFavoriteBatchMode(false);
      setSelectedFavoriteKeys(new Set());
      return;
    }
    if (activeTab === 'favorite') {
      setIsPlayBatchMode(false);
      setSelectedPlayKeys(new Set());
      return;
    }
    setIsPlayBatchMode(false);
    setIsFavoriteBatchMode(false);
    setSelectedPlayKeys(new Set());
    setSelectedFavoriteKeys(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'play') {
      setShowFavoriteFilterPanel(false);
      return;
    }
    if (activeTab === 'favorite') {
      setShowPlayFilterPanel(false);
      return;
    }
    setShowPlayFilterPanel(false);
    setShowFavoriteFilterPanel(false);
  }, [activeTab]);

  const clearLongPressTimer = useCallback(() => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const fetchGenresForRecord = useCallback(
    async (record: PlayRecordItem): Promise<string[]> => {
      const cacheKey = `play:${tmdbLanguage}:${record.key}`;
      const cached = genreCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const { source, id } = parseStorageKey(record.key);
      const baseParams = new URLSearchParams();
      baseParams.set('mediaType', record.total_episodes > 1 ? 'tv' : 'movie');
      if (record.year) baseParams.set('year', record.year);
      if (record.cover) baseParams.set('poster', record.cover);

      const fetchGenresWithParams = async (
        params: URLSearchParams
      ): Promise<string[] | null> => {
        try {
          const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
          if (!response.ok) {
            return null;
          }
          const payload = (await response.json()) as { genres?: unknown };
          const genres = Array.isArray(payload.genres)
            ? payload.genres
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
            : [];
          return genres;
        } catch {
          return null;
        }
      };

      if (source === 'tmdb' && /^\d+$/.test(id)) {
        const params = new URLSearchParams(baseParams);
        params.set('id', id);
        params.set('tmdbLanguage', tmdbLanguage);
        const genres = (await fetchGenresWithParams(params)) || [];
        genreCacheRef.current.set(cacheKey, genres);
        return genres;
      }

      const titleCandidates = buildTmdbTitleCandidates(record);
      if (titleCandidates.length === 0) {
        genreCacheRef.current.set(cacheKey, []);
        return [];
      }

      for (const titleCandidate of titleCandidates) {
        const params = new URLSearchParams(baseParams);
        params.set('title', titleCandidate);
        params.set('tmdbLanguage', tmdbLanguage);
        const genres = await fetchGenresWithParams(params);
        if (genres && genres.length > 0) {
          genreCacheRef.current.set(cacheKey, genres);
          return genres;
        }
      }

      genreCacheRef.current.set(cacheKey, []);
      return [];
    },
    [tmdbLanguage]
  );

  useEffect(() => {
    if (!showPlayFilterPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!playToolbarRef.current) return;
      if (playToolbarRef.current.contains(event.target as Node)) return;
      setShowPlayFilterPanel(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowPlayFilterPanel(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showPlayFilterPanel]);

  useEffect(() => {
    if (!showFavoriteFilterPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!favoriteToolbarRef.current) return;
      if (favoriteToolbarRef.current.contains(event.target as Node)) return;
      setShowFavoriteFilterPanel(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowFavoriteFilterPanel(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showFavoriteFilterPanel]);

  useEffect(() => {
    const validKeys = new Set(playRecords.map((record) => record.key));
    setPlayRecordGenres((prev) => {
      const next: Record<string, SupportedGenre[]> = {};
      Object.entries(prev).forEach(([key, genres]) => {
        if (!validKeys.has(key)) return;
        next[key] = genres;
      });
      return next;
    });
  }, [playRecords]);

  useEffect(() => {
    const validKeys = new Set(favoriteItems.map((item) => item.key));
    setFavoriteItemGenres((prev) => {
      const next: Record<string, SupportedGenre[]> = {};
      Object.entries(prev).forEach(([key, genres]) => {
        if (!validKeys.has(key)) return;
        next[key] = genres;
      });
      return next;
    });
  }, [favoriteItems]);

  useEffect(() => {
    if (activeTab !== 'play') return;
    if (!showPlayFilterPanel && selectedPlayGenres.length === 0) return;
    if (playRecords.length === 0) return;

    const missingTargets = playRecords.filter(
      (record) => !playRecordGenres[record.key]
    );
    if (missingTargets.length === 0) return;

    let cancelled = false;
    const run = async () => {
      setLoadingPlayGenreFilters(true);
      try {
        const settled = await Promise.allSettled(
          missingTargets.map((record) => fetchGenresForRecord(record))
        );
        if (cancelled) return;
        setPlayRecordGenres((prev) => {
          const next = { ...prev };
          settled.forEach((result, index) => {
            const record = missingTargets[index];
            if (result.status !== 'fulfilled') {
              next[record.key] = [];
              return;
            }
            const normalizedGenres = Array.from(
              new Set(
                result.value
                  .map((rawGenre) => normalizeGenreName(rawGenre))
                  .filter(Boolean)
              )
            ) as SupportedGenre[];
            next[record.key] = normalizedGenres;
          });
          return next;
        });
      } finally {
        if (!cancelled) {
          setLoadingPlayGenreFilters(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    fetchGenresForRecord,
    playRecordGenres,
    playRecords,
    selectedPlayGenres.length,
    showPlayFilterPanel,
  ]);

  const playGenreOptions = useMemo(() => {
    return SUPPORTED_GENRES.filter((genre) =>
      playRecords.some((record) =>
        (playRecordGenres[record.key] || []).includes(genre)
      )
    );
  }, [playRecordGenres, playRecords]);

  const fetchGenresForFavorite = useCallback(
    async (item: FavoriteItem): Promise<string[]> => {
      const cacheKey = `favorite:${tmdbLanguage}:${item.key}`;
      const cached = genreCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const baseParams = new URLSearchParams();
      baseParams.set('mediaType', (item.episodes || 0) > 1 ? 'tv' : 'movie');
      if (item.year) baseParams.set('year', item.year);
      if (item.poster) baseParams.set('poster', item.poster);

      const fetchGenresWithParams = async (
        params: URLSearchParams
      ): Promise<string[] | null> => {
        try {
          const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
          if (!response.ok) {
            return null;
          }
          const payload = (await response.json()) as { genres?: unknown };
          const genres = Array.isArray(payload.genres)
            ? payload.genres
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean)
            : [];
          return genres;
        } catch {
          return null;
        }
      };

      if (item.source === 'tmdb' && /^\d+$/.test(item.id)) {
        const params = new URLSearchParams(baseParams);
        params.set('id', item.id);
        params.set('tmdbLanguage', tmdbLanguage);
        const genres = (await fetchGenresWithParams(params)) || [];
        genreCacheRef.current.set(cacheKey, genres);
        return genres;
      }

      const titleCandidates = buildTmdbTitleCandidates({
        title: item.title,
        search_title: item.searchTitle,
      });
      if (titleCandidates.length === 0) {
        genreCacheRef.current.set(cacheKey, []);
        return [];
      }

      for (const titleCandidate of titleCandidates) {
        const params = new URLSearchParams(baseParams);
        params.set('title', titleCandidate);
        params.set('tmdbLanguage', tmdbLanguage);
        const genres = await fetchGenresWithParams(params);
        if (genres && genres.length > 0) {
          genreCacheRef.current.set(cacheKey, genres);
          return genres;
        }
      }

      genreCacheRef.current.set(cacheKey, []);
      return [];
    },
    [tmdbLanguage]
  );

  useEffect(() => {
    if (activeTab !== 'favorite') return;
    if (!showFavoriteFilterPanel && selectedFavoriteGenres.length === 0) return;
    if (favoriteItems.length === 0) return;

    const missingTargets = favoriteItems.filter(
      (item) => !favoriteItemGenres[item.key]
    );
    if (missingTargets.length === 0) return;

    let cancelled = false;
    const run = async () => {
      setLoadingFavoriteGenreFilters(true);
      try {
        const settled = await Promise.allSettled(
          missingTargets.map((item) => fetchGenresForFavorite(item))
        );
        if (cancelled) return;
        setFavoriteItemGenres((prev) => {
          const next = { ...prev };
          settled.forEach((result, index) => {
            const item = missingTargets[index];
            if (result.status !== 'fulfilled') {
              next[item.key] = [];
              return;
            }
            const normalizedGenres = Array.from(
              new Set(
                result.value
                  .map((rawGenre) => normalizeGenreName(rawGenre))
                  .filter(Boolean)
              )
            ) as SupportedGenre[];
            next[item.key] = normalizedGenres;
          });
          return next;
        });
      } finally {
        if (!cancelled) {
          setLoadingFavoriteGenreFilters(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    favoriteItemGenres,
    favoriteItems,
    fetchGenresForFavorite,
    selectedFavoriteGenres.length,
    showFavoriteFilterPanel,
  ]);

  const favoriteGenreOptions = useMemo(() => {
    return SUPPORTED_GENRES.filter((genre) =>
      favoriteItems.some((item) =>
        (favoriteItemGenres[item.key] || []).includes(genre)
      )
    );
  }, [favoriteItemGenres, favoriteItems]);

  const normalizedPlaySearchKeyword = playSearchKeyword.trim().toLowerCase();
  const filteredPlayRecords = useMemo(() => {
    const searched = playRecords.filter((record) => {
      if (!normalizedPlaySearchKeyword) return true;
      return [
        record.title,
        record.source_name,
        record.year,
        record.search_title,
      ].some((value) =>
        (value || '').toLowerCase().includes(normalizedPlaySearchKeyword)
      );
    });

    const mediaFiltered = searched.filter((record) => {
      if (playFilterMode === 'all') return true;
      return getWatchFormat(record) === playFilterMode;
    });

    const genreFiltered = mediaFiltered.filter((record) => {
      if (selectedPlayGenres.length === 0) return true;
      const genres = playRecordGenres[record.key] || [];
      return selectedPlayGenres.every((genre) => genres.includes(genre));
    });

    if (playSortMode === 'latest') {
      return genreFiltered;
    }

    const sorted = [...genreFiltered].sort((a, b) => {
      const aTitle = (a.search_title || a.title || '').trim();
      const bTitle = (b.search_title || b.title || '').trim();
      const result = aTitle.localeCompare(bTitle, 'zh-Hans-CN', {
        sensitivity: 'base',
        numeric: true,
      });
      return playSortMode === 'titleAsc' ? result : -result;
    });

    return sorted;
  }, [
    normalizedPlaySearchKeyword,
    playFilterMode,
    playRecordGenres,
    playRecords,
    playSortMode,
    selectedPlayGenres,
  ]);

  const filteredFavoriteItems = useMemo(() => {
    const mediaFiltered = favoriteItems.filter((item) => {
      if (favoriteFilterMode === 'all') return true;
      return (item.episodes || 0) > 1
        ? favoriteFilterMode === 'tv'
        : favoriteFilterMode === 'movie';
    });

    const genreFiltered = mediaFiltered.filter((item) => {
      if (selectedFavoriteGenres.length === 0) return true;
      const genres = favoriteItemGenres[item.key] || [];
      return selectedFavoriteGenres.every((genre) => genres.includes(genre));
    });

    if (favoriteSortMode === 'latest') {
      return genreFiltered;
    }

    return [...genreFiltered].sort((a, b) => {
      const aTitle = (a.searchTitle || a.title || '').trim();
      const bTitle = (b.searchTitle || b.title || '').trim();
      const result = aTitle.localeCompare(bTitle, 'zh-Hans-CN', {
        sensitivity: 'base',
        numeric: true,
      });
      return favoriteSortMode === 'titleAsc' ? result : -result;
    });
  }, [
    favoriteFilterMode,
    favoriteItemGenres,
    favoriteItems,
    favoriteSortMode,
    selectedFavoriteGenres,
  ]);

  const togglePlaySelection = (key: string) => {
    setSelectedPlayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleFavoriteSelection = (key: string) => {
    setSelectedFavoriteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handlePlayLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isPlayBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsPlayBatchMode(true);
        setIsFavoriteBatchMode(false);
        setSelectedFavoriteKeys(new Set());
        setSelectedPlayKeys(new Set([key]));
        suppressPlayCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isPlayBatchMode]
  );

  const handleFavoriteLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isFavoriteBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsFavoriteBatchMode(true);
        setIsPlayBatchMode(false);
        setSelectedPlayKeys(new Set());
        setSelectedFavoriteKeys(new Set([key]));
        suppressFavoriteCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isFavoriteBatchMode]
  );

  const handleLongPressEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handlePlayCardClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressPlayCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressPlayCardClickRef.current = false;
    },
    []
  );

  const handleFavoriteCardClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressFavoriteCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressFavoriteCardClickRef.current = false;
    },
    []
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'play') {
        const targets = playRecords.filter((item) =>
          selectedPlayKeys.has(item.key)
        );
        await Promise.all(
          targets.map((item) => {
            const { source, id } = parseStorageKey(item.key);
            return deletePlayRecord(source, id);
          })
        );
        setPlayRecords((prev) =>
          prev.filter((item) => !selectedPlayKeys.has(item.key))
        );
        setSelectedPlayKeys(new Set());
        setIsPlayBatchMode(false);
      } else {
        const targets = favoriteItems.filter((item) =>
          selectedFavoriteKeys.has(item.key)
        );
        await Promise.all(
          targets.map((item) => deleteFavorite(item.source, item.id))
        );
        setFavoriteItems((prev) =>
          prev.filter((item) => !selectedFavoriteKeys.has(item.key))
        );
        setSelectedFavoriteKeys(new Set());
        setIsFavoriteBatchMode(false);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handlePlayFirstRecord = useCallback(() => {
    if (filteredPlayRecords.length === 0) return;
    router.push(buildPlayUrl(filteredPlayRecords[0]));
  }, [filteredPlayRecords, router]);

  const handlePlayRandomRecord = useCallback(() => {
    if (filteredPlayRecords.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredPlayRecords.length);
    router.push(buildPlayUrl(filteredPlayRecords[randomIndex]));
  }, [filteredPlayRecords, router]);

  const handleToggleTitleSort = useCallback(() => {
    setPlaySortMode((prev) => {
      if (prev === 'titleAsc') return 'titleDesc';
      return 'titleAsc';
    });
  }, []);

  const handleFavoriteFirstRecord = useCallback(() => {
    if (filteredFavoriteItems.length === 0) return;
    router.push(buildFavoritePlayUrl(filteredFavoriteItems[0]));
  }, [filteredFavoriteItems, router]);

  const handleFavoriteRandomRecord = useCallback(() => {
    if (filteredFavoriteItems.length === 0) return;
    const randomIndex = Math.floor(
      Math.random() * filteredFavoriteItems.length
    );
    router.push(buildFavoritePlayUrl(filteredFavoriteItems[randomIndex]));
  }, [filteredFavoriteItems, router]);

  const handleToggleFavoriteTitleSort = useCallback(() => {
    setFavoriteSortMode((prev) => {
      if (prev === 'titleAsc') return 'titleDesc';
      return 'titleAsc';
    });
  }, []);

  const togglePlayGenreFilter = useCallback((genre: SupportedGenre) => {
    setSelectedPlayGenres((prev) => {
      if (prev.includes(genre)) {
        return prev.filter((item) => item !== genre);
      }
      return [...prev, genre];
    });
  }, []);

  const resetPlayToolbar = useCallback(() => {
    setPlaySortMode('latest');
    setPlayFilterMode('all');
    setSelectedPlayGenres([]);
    setPlaySearchKeyword('');
  }, []);

  const toggleFavoriteGenreFilter = useCallback((genre: SupportedGenre) => {
    setSelectedFavoriteGenres((prev) => {
      if (prev.includes(genre)) {
        return prev.filter((item) => item !== genre);
      }
      return [...prev, genre];
    });
  }, []);

  const resetFavoriteToolbar = useCallback(() => {
    setFavoriteSortMode('latest');
    setFavoriteFilterMode('all');
    setSelectedFavoriteGenres([]);
  }, []);

  const hasActivePlayFilters =
    playFilterMode !== 'all' || selectedPlayGenres.length > 0;
  const hasActiveFavoriteFilters =
    favoriteFilterMode !== 'all' || selectedFavoriteGenres.length > 0;
  const translateGenreLabel = useCallback(
    (genre: string) => {
      const labelKey = getGenreLabelKey(genre);
      return labelKey ? t(labelKey) : formatGenreLabel(genre);
    },
    [t]
  );

  return (
    <PageLayout activePath='/my'>
      <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
        <div className='space-y-3 px-4 pt-6 sm:space-y-3 sm:px-0 sm:pt-8 md:pt-4'>
          <div className='flex justify-center'>
            <CapsuleSwitch
              options={[
                { label: t('my.watchHistory'), value: 'play' },
                { label: t('my.favorites'), value: 'favorite' },
              ]}
              active={activeTab}
              onChange={(value) => setActiveTab(value as ActiveTab)}
            />
          </div>

          {activeTab === 'play' ? (
            <section className='space-y-3'>
              <div ref={playToolbarRef} className='space-y-3'>
                <div className='mx-auto flex max-w-full flex-wrap items-center justify-center gap-2 py-1'>
                  <span className='shrink-0 text-xs font-semibold tracking-wide text-zinc-400'>
                    {t('my.itemCount', { count: filteredPlayRecords.length })}
                  </span>
                  <button
                    type='button'
                    disabled={filteredPlayRecords.length === 0}
                    onClick={handlePlayFirstRecord}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42] disabled:cursor-not-allowed disabled:opacity-45'
                  >
                    <Play className='h-4 w-4 fill-current text-zinc-300' />
                    {t('my.play')}
                  </button>
                  <button
                    type='button'
                    disabled={filteredPlayRecords.length === 0}
                    onClick={handlePlayRandomRecord}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42] disabled:cursor-not-allowed disabled:opacity-45'
                  >
                    <Shuffle className='h-4 w-4 text-zinc-300' />
                    {t('my.shufflePlay')}
                  </button>
                  <button
                    type='button'
                    onClick={handleToggleTitleSort}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42]'
                  >
                    {t('my.title')}
                    {playSortMode === 'titleDesc' ? (
                      <ArrowDown className='h-4 w-4 text-zinc-300' />
                    ) : (
                      <ArrowUp className='h-4 w-4 text-zinc-300' />
                    )}
                  </button>
                  <button
                    type='button'
                    aria-label={t('my.filter')}
                    onClick={() => {
                      setShowPlayFilterPanel((prev) => !prev);
                    }}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 text-zinc-200 transition-colors ${
                      showPlayFilterPanel || hasActivePlayFilters
                        ? 'bg-[#3a3f46]'
                        : 'bg-[#2d3035] hover:bg-[#383c42]'
                    }`}
                  >
                    <ListFilter className='h-4 w-4' />
                  </button>
                </div>

                {showPlayFilterPanel ? (
                  <div className='rounded-2xl border border-gray-200/60 bg-white/75 p-4 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/50 sm:p-6'>
                    <div className='mb-4 flex items-center justify-between'>
                      <div className='inline-flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-200'>
                        <ListFilter className='h-5 w-5' />
                        {t('my.filter')}
                      </div>
                      <button
                        type='button'
                        onClick={resetPlayToolbar}
                        className='inline-flex items-center gap-1 px-1 py-1 text-sm font-medium text-red-500 transition hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'
                      >
                        {t('my.resetFilters')}
                      </button>
                    </div>
                    <div className='space-y-4'>
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2'>
                        <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-24 sm:flex-shrink-0 sm:pt-1'>
                          <Clapperboard className='h-4 w-4' />
                          {t('my.format')}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          {[
                            { value: 'all', label: t('common.all') },
                            { value: 'movie', label: t('common.movies') },
                            { value: 'tv', label: t('common.series') },
                          ].map((option) => {
                            const active = playFilterMode === option.value;
                            return (
                              <button
                                key={option.value}
                                type='button'
                                aria-pressed={active}
                                onClick={() =>
                                  setPlayFilterMode(
                                    option.value as PlayToolbarFilterMode
                                  )
                                }
                                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                  active
                                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2'>
                        <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-24 sm:flex-shrink-0 sm:pt-1'>
                          <Tags className='h-4 w-4' />
                          {t('my.genres')}
                        </div>
                        {loadingPlayGenreFilters ? (
                          <JumpingDots label={t('my.syncGenres')} />
                        ) : playGenreOptions.length > 0 ? (
                          <div className='flex flex-wrap gap-2'>
                            {playGenreOptions.map((genre) => {
                              const active = selectedPlayGenres.includes(genre);
                              return (
                                <button
                                  key={genre}
                                  type='button'
                                  aria-pressed={active}
                                  onClick={() => togglePlayGenreFilter(genre)}
                                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                    active
                                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {translateGenreLabel(genre)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className='text-sm text-gray-500 dark:text-gray-400'>
                            {t('my.noGenresAvailable')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {loadingPlayRecords ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={`my-play-skeleton-${index}`}
                        className='skeleton-card-surface relative aspect-[2/3] overflow-hidden animate-pulse'
                      />
                    ))}
                  </div>
                </div>
              ) : filteredPlayRecords.length > 0 ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {filteredPlayRecords.map((record) => {
                      const { source, id } = parseStorageKey(record.key);
                      const isSelected = selectedPlayKeys.has(record.key);
                      const localizedDisplay =
                        tmdbDisplayByKey[`${tmdbLanguage}:${record.key}`];
                      return (
                        <div
                          key={record.key}
                          className='relative'
                          onPointerDown={(event) =>
                            handlePlayLongPressStart(
                              record.key,
                              event.pointerType
                            )
                          }
                          onPointerUp={handleLongPressEnd}
                          onPointerLeave={handleLongPressEnd}
                          onPointerCancel={handleLongPressEnd}
                          onClickCapture={handlePlayCardClickCapture}
                        >
                          <VideoCard
                            id={id}
                            source={source}
                            title={localizedDisplay?.title || record.title}
                            poster={localizedDisplay?.poster || ''}
                            source_name={record.source_name}
                            year={localizedDisplay?.year || record.year}
                            episodes={record.total_episodes}
                            currentEpisode={record.index}
                            subtitle={formatHistoryEpisodeMeta(record, t)}
                            progress={getProgressPercent(record)}
                            query={record.search_title}
                            from='playrecord'
                            type={record.total_episodes > 1 ? 'tv' : ''}
                            displayVariant='poster-info'
                            onDelete={() =>
                              setPlayRecords((prev) =>
                                prev.filter((item) => item.key !== record.key)
                              )
                            }
                          />
                          {isPlayBatchMode ? (
                            <button
                              type='button'
                              aria-label='toggle-play-record-selection'
                              className='absolute inset-0 z-20 rounded-[var(--ui-radius-card)] bg-black/10 transition-colors hover:bg-black/15'
                              onClick={() => togglePlaySelection(record.key)}
                            >
                              <span
                                className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                                  isSelected
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-white/80 bg-black/40 text-transparent'
                                }`}
                              >
                                {'\u2713'}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className='py-8 text-center text-sm text-gray-500 dark:text-gray-400'>
                  {playRecords.length === 0
                    ? t('my.emptyHistory')
                    : t('my.matchingHistoryNotFound')}
                </div>
              )}
            </section>
          ) : (
            <section className='space-y-3'>
              <div ref={favoriteToolbarRef} className='space-y-3'>
                <div className='mx-auto flex max-w-full flex-wrap items-center justify-center gap-2 py-1'>
                  <span className='shrink-0 text-xs font-semibold tracking-wide text-zinc-400'>
                    {t('my.itemCount', {
                      count: filteredFavoriteItems.length,
                    })}
                  </span>
                  <button
                    type='button'
                    disabled={filteredFavoriteItems.length === 0}
                    onClick={handleFavoriteFirstRecord}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42] disabled:cursor-not-allowed disabled:opacity-45'
                  >
                    <Play className='h-4 w-4 fill-current text-zinc-300' />
                    {t('my.play')}
                  </button>
                  <button
                    type='button'
                    disabled={filteredFavoriteItems.length === 0}
                    onClick={handleFavoriteRandomRecord}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42] disabled:cursor-not-allowed disabled:opacity-45'
                  >
                    <Shuffle className='h-4 w-4 text-zinc-300' />
                    {t('my.shufflePlay')}
                  </button>
                  <button
                    type='button'
                    onClick={handleToggleFavoriteTitleSort}
                    className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/5 bg-[#2d3035] px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-[#383c42]'
                  >
                    {t('my.title')}
                    {favoriteSortMode === 'titleDesc' ? (
                      <ArrowDown className='h-4 w-4 text-zinc-300' />
                    ) : (
                      <ArrowUp className='h-4 w-4 text-zinc-300' />
                    )}
                  </button>
                  <button
                    type='button'
                    aria-label={t('my.filter')}
                    onClick={() => {
                      setShowFavoriteFilterPanel((prev) => !prev);
                    }}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 text-zinc-200 transition-colors ${
                      showFavoriteFilterPanel || hasActiveFavoriteFilters
                        ? 'bg-[#3a3f46]'
                        : 'bg-[#2d3035] hover:bg-[#383c42]'
                    }`}
                  >
                    <ListFilter className='h-4 w-4' />
                  </button>
                </div>

                {showFavoriteFilterPanel ? (
                  <div className='rounded-2xl border border-gray-200/60 bg-white/75 p-4 backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/50 sm:p-6'>
                    <div className='mb-4 flex items-center justify-between'>
                      <div className='inline-flex items-center gap-2 text-lg font-semibold text-gray-700 dark:text-gray-200'>
                        <ListFilter className='h-5 w-5' />
                        {t('my.filter')}
                      </div>
                      <button
                        type='button'
                        onClick={resetFavoriteToolbar}
                        className='inline-flex items-center gap-1 px-1 py-1 text-sm font-medium text-red-500 transition hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'
                      >
                        {t('my.resetFilters')}
                      </button>
                    </div>
                    <div className='space-y-4'>
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2'>
                        <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-24 sm:flex-shrink-0 sm:pt-1'>
                          <Clapperboard className='h-4 w-4' />
                          {t('my.format')}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          {[
                            { value: 'all', label: t('common.all') },
                            { value: 'movie', label: t('common.movies') },
                            { value: 'tv', label: t('common.series') },
                          ].map((option) => {
                            const active = favoriteFilterMode === option.value;
                            return (
                              <button
                                key={option.value}
                                type='button'
                                aria-pressed={active}
                                onClick={() =>
                                  setFavoriteFilterMode(
                                    option.value as PlayToolbarFilterMode
                                  )
                                }
                                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                  active
                                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2'>
                        <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-24 sm:flex-shrink-0 sm:pt-1'>
                          <Tags className='h-4 w-4' />
                          {t('my.genres')}
                        </div>
                        {loadingFavoriteGenreFilters ? (
                          <JumpingDots label={t('my.syncGenres')} />
                        ) : favoriteGenreOptions.length > 0 ? (
                          <div className='flex flex-wrap gap-2'>
                            {favoriteGenreOptions.map((genre) => {
                              const active =
                                selectedFavoriteGenres.includes(genre);
                              return (
                                <button
                                  key={genre}
                                  type='button'
                                  aria-pressed={active}
                                  onClick={() =>
                                    toggleFavoriteGenreFilter(genre)
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                                    active
                                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
                                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                  }`}
                                >
                                  {translateGenreLabel(genre)}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className='text-sm text-gray-500 dark:text-gray-400'>
                            {t('my.noGenresAvailable')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {loadingFavorites ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={`my-favorite-skeleton-${index}`}
                        className='skeleton-card-surface relative aspect-[2/3] overflow-hidden animate-pulse'
                      />
                    ))}
                  </div>
                </div>
              ) : filteredFavoriteItems.length > 0 ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {filteredFavoriteItems.map((item) => {
                      const localizedDisplay =
                        tmdbDisplayByKey[`${tmdbLanguage}:${item.key}`];
                      const displayYear = localizedDisplay?.year || item.year;
                      return (
                        <div
                          key={item.key}
                          className='relative'
                          onPointerDown={(event) =>
                            handleFavoriteLongPressStart(
                              item.key,
                              event.pointerType
                            )
                          }
                          onPointerUp={handleLongPressEnd}
                          onPointerLeave={handleLongPressEnd}
                          onPointerCancel={handleLongPressEnd}
                          onClickCapture={handleFavoriteCardClickCapture}
                        >
                          <VideoCard
                            id={item.id}
                            source={item.source}
                            title={localizedDisplay?.title || item.title}
                            poster={localizedDisplay?.poster || item.poster}
                            source_name={item.sourceName}
                            year={displayYear}
                            episodes={item.episodes}
                            currentEpisode={item.currentEpisode}
                            subtitle={displayYear}
                            query={item.searchTitle}
                            from='favorite'
                            type={item.episodes > 1 ? 'tv' : ''}
                            displayVariant='poster-info'
                          />
                          {isFavoriteBatchMode ? (
                            <button
                              type='button'
                              aria-label='toggle-favorite-selection'
                              className='absolute inset-0 z-20 rounded-[var(--ui-radius-card)] bg-black/10 transition-colors hover:bg-black/15'
                              onClick={() => toggleFavoriteSelection(item.key)}
                            >
                              <span
                                className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                                  selectedFavoriteKeys.has(item.key)
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-white/80 bg-black/40 text-transparent'
                                }`}
                              >
                                {'\u2713'}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className='px-0'>
                  <div className='py-8 text-center text-sm text-gray-500 dark:text-gray-400'>
                    {favoriteItems.length === 0
                      ? t('my.emptyFavorites')
                      : t('my.matchingFavoritesNotFound')}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className={glassDialogContentClass}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('my.confirmDeletion')}</AlertDialogTitle>
            <AlertDialogDescription className={glassDialogDescriptionClass}>
              {deleteTarget === 'play'
                ? t('my.deleteHistoryDescription', {
                    count: selectedPlayKeys.size,
                  })
                : t('my.deleteFavoritesDescription', {
                    count: selectedFavoriteKeys.size,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className={glassDialogCancelClass}
            >
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              className={glassDialogDangerActionClass}
            >
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

export default function MyPage() {
  return (
    <Suspense>
      <MyPageClient />
    </Suspense>
  );
}
