'use client';

import { ChevronLeft, ChevronRight, Play, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import {
  buildCuratedCategoryQuery,
  CuratedCategoryConfig,
  HOME_CURATED_CATEGORY_CONFIGS,
  TOP_RATED_CATEGORY_CONFIGS,
} from '@/lib/curated-categories';
import { fetchTmdbDetailWithClientCache } from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';
import SeasonPickerModal from '@/components/SeasonPickerModal';
import TmdbDetailModal, { TmdbDetailModalData } from '@/components/TmdbDetailModal';

type TmdbMediaType = 'movie' | 'tv';
type LogoLanguagePreference = 'zh' | 'en';
type LogoAspectType = 'ultraWide' | 'wide' | 'standard' | 'squareish' | 'tall';
const TOP_RATED_DISPLAY_COUNT = 9;

interface RankedDiscoverItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  backdrop?: string;
  logo?: string;
  logoAspectRatio?: number;
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: RankedDiscoverItem[];
}

interface TmdbDetailResponse extends TmdbDetailModalData {
  logo?: string;
  logoAspectRatio?: number;
}

interface RankedSectionProps {
  title: string;
  href: string;
  mediaType: TmdbMediaType;
  items: RankedDiscoverItem[];
  loading: boolean;
  onOpenDetail: (item: RankedDiscoverItem, mediaType: TmdbMediaType) => void;
  onNavigateWithMatrixLoading: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string
  ) => void;
}

interface ActiveRankedItem {
  id: string;
  mediaType: TmdbMediaType;
  title: string;
  year: string;
}

interface SeasonPickerState {
  open: boolean;
  tmdbId: string;
  baseTitle: string;
  year: string;
  seasonCount: number;
  logo?: string;
  backdrop?: string;
}

const MOVIE_TOP_RATED_CONFIG =
  TOP_RATED_CATEGORY_CONFIGS.find((item) => item.slug === 'top-rated-movies') ||
  ({
    slug: 'top-rated-movies',
    title: 'Top Rated Movies',
    mediaType: 'movie',
    query: { sort_by: 'vote_average.desc', vote_average_gte: '7.0', vote_count_gte: '3000' },
    fallbackQuery: { sort_by: 'popularity.desc', vote_count_gte: '1000' },
  } satisfies CuratedCategoryConfig);

const TV_TOP_RATED_CONFIG =
  TOP_RATED_CATEGORY_CONFIGS.find((item) => item.slug === 'top-rated-tvshows') ||
  ({
    slug: 'top-rated-tvshows',
    title: 'Top Rated Series',
    mediaType: 'tv',
    query: { sort_by: 'vote_average.desc', vote_average_gte: '7.0', vote_count_gte: '500' },
    fallbackQuery: { sort_by: 'popularity.desc', vote_count_gte: '300' },
  } satisfies CuratedCategoryConfig);

const POPULAR_MOVIE_CONFIG =
  HOME_CURATED_CATEGORY_CONFIGS.find((item) => item.slug === 'popular-movies') ||
  ({
    slug: 'popular-movies',
    title: 'Popular Movies',
    mediaType: 'movie',
    query: {
      vote_count_gte: '500',
      sort_by: 'popularity.desc',
    },
  } satisfies CuratedCategoryConfig);

function safeImageUrl(url: string): string {
  return url;
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

function getRankGradientClass(rank: number): string {
  if (rank === 1) {
    return 'from-[#fff6c4] via-[#f2c44a] to-[#8c5a08]';
  }
  if (rank === 2) {
    return 'from-[#f8fafc] via-[#cbd5e1] to-[#64748b]';
  }
  if (rank === 3) {
    return 'from-[#ffd7ae] via-[#c27a36] to-[#6b3e16]';
  }
  return 'from-slate-100 via-slate-300 to-slate-600';
}

function getLogoAspectType(aspectRatio?: number): LogoAspectType {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return 'standard';
  }
  if (aspectRatio > 3.2) return 'ultraWide';
  if (aspectRatio > 2) return 'wide';
  if (aspectRatio >= 1.2) return 'standard';
  if (aspectRatio >= 0.8) return 'squareish';
  return 'tall';
}

function getRankedLogoContainerClass(aspectRatio?: number): string {
  const aspectType = getLogoAspectType(aspectRatio);
  if (aspectType === 'ultraWide') {
    return 'h-8 max-w-56 sm:h-9 sm:max-w-64 md:h-10 md:max-w-80';
  }
  if (aspectType === 'wide') {
    return 'h-12 max-w-48 sm:h-14 sm:max-w-56 md:h-16 md:max-w-64';
  }
  if (aspectType === 'squareish') {
    return 'h-16 max-w-16 sm:h-20 sm:max-w-20 md:h-24 md:max-w-24';
  }
  if (aspectType === 'tall') {
    return 'h-20 max-w-24 sm:h-24 sm:max-w-28 md:h-28 md:max-w-32';
  }
  return 'h-10 max-w-32 sm:h-12 sm:max-w-40 md:h-14 md:max-w-48';
}

function getLogoLanguagePreferenceForMediaType(
  _mediaType: TmdbMediaType
): LogoLanguagePreference {
  return 'en';
}

async function fetchDiscoverItems(
  query: URLSearchParams,
  signal: AbortSignal
): Promise<RankedDiscoverItem[]> {
  query.set('tmdbLanguage', getCurrentTmdbLanguage());
  const response = await fetch(`/api/tmdb/discover?${query.toString()}`, {
    signal,
  });
  const payload = (await response.json()) as DiscoverApiResponse;
  if (!response.ok || payload.code !== 200) {
    throw new Error(payload.message || 'Failed to fetch ranked content');
  }
  return payload.list.slice(0, TOP_RATED_DISPLAY_COUNT);
}

async function fetchTmdbDetailById(
  id: string,
  mediaType: TmdbMediaType,
  options?: {
    signal?: AbortSignal;
    logoLanguagePreference?: LogoLanguagePreference;
  }
): Promise<TmdbDetailResponse> {
  return fetchTmdbDetailWithClientCache<TmdbDetailResponse>({
    id,
    mediaType,
    logoLanguagePreference: options?.logoLanguagePreference || 'zh',
    signal: options?.signal,
  });
}

function RankedCard({
  item,
  rank,
  mediaType,
  onOpenDetail,
}: {
  item: RankedDiscoverItem;
  rank: number;
  mediaType: TmdbMediaType;
  onOpenDetail: (item: RankedDiscoverItem, mediaType: TmdbMediaType) => void;
}) {
  const background = item.backdrop || item.poster;
  const score = item.rate || '--';

  return (
    <button
      type='button'
      onClick={() => onOpenDetail(item, mediaType)}
      className='group relative block w-full overflow-hidden rounded-[var(--ui-radius-card)] border border-white/15 bg-black text-left shadow-[0_20px_50px_rgba(2,6,23,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_26px_58px_rgba(2,6,23,0.58)]'
    >
      <div className='relative aspect-[16/9] w-full'>
        {background ? (
          <Image
            src={background}
            alt={item.title}
            fill
            className='object-cover transition-transform duration-500 group-hover:scale-105'
            sizes='(max-width: 768px) 90vw, 33vw'
            unoptimized
          />
        ) : (
          <div className='absolute inset-0 bg-gradient-to-br from-sky-700/70 to-zinc-950' />
        )}

        <div className='absolute inset-0 bg-gradient-to-r from-black/90 via-black/35 to-black/70' />
        <div className='absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/20' />

        <div className='absolute inset-x-4 bottom-4 z-10 flex items-end gap-3'>
          <span
            className={`w-10 text-5xl font-black tracking-tight tabular-nums leading-none bg-gradient-to-b bg-clip-text text-transparent ${getRankGradientClass(
              rank
            )}`}
          >
            {rank}
          </span>
          <div className='min-w-0 flex-1 pb-1'>
            {item.logo ? (
              <div
                className={`flex items-center justify-start rounded-md bg-transparent ${getRankedLogoContainerClass(
                  item.logoAspectRatio
                )}`}
              >
                <div className='relative h-full w-full'>
                  <Image
                    src={safeImageUrl(item.logo)}
                    alt={`${item.title} logo`}
                    fill
                    className='object-contain object-left drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]'
                    sizes='(max-width: 640px) 192px, (max-width: 768px) 224px, 256px'
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              <h3 className='truncate text-xl font-bold text-white'>{item.title}</h3>
            )}
            <div className='mt-2 flex items-center gap-2 text-sm text-zinc-200/90'>
              {item.year ? <span>{item.year}</span> : null}
              <span className='text-zinc-400'>{'\u00b7'}</span>
              <span className='inline-flex items-center gap-1'>
                <Star className='h-3.5 w-3.5 text-amber-400' fill='currentColor' />
                {score}
              </span>
            </div>
          </div>
        </div>

        <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
          <Play className='h-12 w-12 text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]' />
        </div>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div className='relative hidden md:block'>
        <div className='-mx-1 overflow-x-auto pb-1 pt-1 scrollbar-hide'>
          <div className='flex min-w-max gap-5 px-1'>
            {Array.from({ length: TOP_RATED_DISPLAY_COUNT }).map((_, index) => (
              <div
                key={`ranked-loading-desktop-${index}`}
                className='w-[clamp(320px,31vw,560px)] flex-shrink-0'
              >
                <div className='skeleton-surface aspect-[16/9] w-full animate-pulse rounded-[var(--ui-radius-card)]' />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className='-mx-2 overflow-x-auto pb-1 md:hidden'>
        <div className='flex min-w-max gap-3 px-2'>
          {Array.from({ length: TOP_RATED_DISPLAY_COUNT }).map((_, index) => (
            <div
              key={`ranked-loading-mobile-${index}`}
              className='w-[86vw] max-w-[560px] flex-shrink-0'
            >
              <div className='skeleton-surface aspect-[16/9] w-full animate-pulse rounded-[var(--ui-radius-card)]' />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RankedSection({
  title,
  href,
  mediaType,
  items,
  loading,
  onOpenDetail,
  onNavigateWithMatrixLoading,
}: RankedSectionProps) {
  const { t } = useTranslation();
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const desktopScrollFrameRef = useRef<number | null>(null);
  const showLeftScrollRef = useRef(false);
  const showRightScrollRef = useRef(false);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [desktopHovered, setDesktopHovered] = useState(false);

  const measureDesktopScroll = useCallback(() => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const { scrollWidth, clientWidth, scrollLeft } = node;
    const threshold = 1;
    const nextRight = scrollWidth - (scrollLeft + clientWidth) > threshold;
    const nextLeft = scrollLeft > threshold;

    if (showRightScrollRef.current !== nextRight) {
      showRightScrollRef.current = nextRight;
      setShowRightScroll(nextRight);
    }

    if (showLeftScrollRef.current !== nextLeft) {
      showLeftScrollRef.current = nextLeft;
      setShowLeftScroll(nextLeft);
    }
  }, []);

  const checkDesktopScroll = useCallback(() => {
    if (desktopScrollFrameRef.current !== null) return;
    desktopScrollFrameRef.current = window.requestAnimationFrame(() => {
      desktopScrollFrameRef.current = null;
      measureDesktopScroll();
    });
  }, [measureDesktopScroll]);

  useEffect(() => {
    checkDesktopScroll();
    window.addEventListener('resize', checkDesktopScroll);
    return () => {
      window.removeEventListener('resize', checkDesktopScroll);
      if (desktopScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(desktopScrollFrameRef.current);
        desktopScrollFrameRef.current = null;
      }
    };
  }, [checkDesktopScroll, items, loading]);

  const scrollDesktopBy = useCallback((direction: 'left' | 'right') => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const amount = Math.max(node.clientWidth * 0.9, 420);
    node.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  }, []);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className='mb-6'>
      <div className='relative z-[650] mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-900 dark:text-zinc-100'>{title}</h2>
        <Link
          href={href}
          onClick={(event) => onNavigateWithMatrixLoading(event, href)}
          className='group inline-flex items-center gap-2 text-base font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
        >
          <span>{t('common.seeAll')}</span>
          <span className='text-2xl leading-none transition-transform duration-200 group-hover:translate-x-0.5'>
            ›
          </span>
        </Link>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div
            className='relative hidden md:block'
            onMouseEnter={() => {
              setDesktopHovered(true);
              checkDesktopScroll();
            }}
            onMouseLeave={() => setDesktopHovered(false)}
          >
            <div
              ref={desktopScrollRef}
              className='-mx-1 overflow-x-auto pb-1 pt-1 scrollbar-hide'
              onScroll={checkDesktopScroll}
            >
              <div className='flex min-w-max gap-5 px-1'>
                {items.slice(0, TOP_RATED_DISPLAY_COUNT).map((item, index) => (
                  <div
                    key={`${mediaType}-desktop-${item.id}-${index}`}
                    className='w-[clamp(320px,31vw,560px)] flex-shrink-0'
                  >
                    <RankedCard
                      item={item}
                      rank={index + 1}
                      mediaType={mediaType}
                      onOpenDetail={onOpenDetail}
                    />
                  </div>
                ))}
              </div>
            </div>

            {showLeftScroll ? (
              <div
                className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                  desktopHovered ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ background: 'transparent', pointerEvents: 'none' }}
              >
                <div
                  className='absolute inset-0 flex items-center justify-center'
                  style={{
                    top: '40%',
                    bottom: '60%',
                    left: '-4.5rem',
                    pointerEvents: desktopHovered ? 'auto' : 'none',
                  }}
                >
                  <button
                    type='button'
                    onClick={() => scrollDesktopBy('left')}
                    className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                    aria-label={t('detail.scrollLeft')}
                  >
                    <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                  </button>
                </div>
              </div>
            ) : null}

            {showRightScroll ? (
              <div
                className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                  desktopHovered ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ background: 'transparent', pointerEvents: 'none' }}
              >
                <div
                  className='absolute inset-0 flex items-center justify-center'
                  style={{
                    top: '40%',
                    bottom: '60%',
                    right: '-4.5rem',
                    pointerEvents: desktopHovered ? 'auto' : 'none',
                  }}
                >
                  <button
                    type='button'
                    onClick={() => scrollDesktopBy('right')}
                    className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                    aria-label={t('detail.scrollRight')}
                  >
                    <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className='-mx-2 overflow-x-auto pb-1 md:hidden'>
            <div className='flex min-w-max gap-3 px-2'>
              {items.slice(0, TOP_RATED_DISPLAY_COUNT).map((item, index) => (
                <div
                  key={`${mediaType}-mobile-${item.id}-${index}`}
                  className='w-[86vw] max-w-[560px] flex-shrink-0'
                >
                  <RankedCard
                    item={item}
                    rank={index + 1}
                    mediaType={mediaType}
                    onOpenDetail={onOpenDetail}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

interface TopRatedRankedRowsProps {
  className?: string;
}

export default function TopRatedRankedRows({ className }: TopRatedRankedRowsProps) {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const { showMatrixLoading, navigateLinkWithMatrixLoading } =
    useMatrixRouteTransition();
  const [popularMovieItems, setPopularMovieItems] = useState<
    RankedDiscoverItem[]
  >([]);
  const [movieItems, setMovieItems] = useState<RankedDiscoverItem[]>([]);
  const [tvItems, setTvItems] = useState<RankedDiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbDetailResponse | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveRankedItem | null>(null);
  const [seasonPicker, setSeasonPicker] = useState<SeasonPickerState>({
    open: false,
    tmdbId: '',
    baseTitle: '',
    year: '',
    seasonCount: 0,
  });
  const detailCacheRef = useRef<Map<string, TmdbDetailResponse>>(new Map());
  const detailRequestIdRef = useRef(0);

  const cacheKey = useCallback(
    (
      id: string,
      mediaType: TmdbMediaType,
      logoLanguagePreference: LogoLanguagePreference
    ) =>
      `${mediaType}:${logoLanguagePreference}:${getCurrentTmdbLanguage()}:${id}`,
    []
  );

  const applyLogoToList = useCallback(
    (
      id: string,
      mediaType: TmdbMediaType,
      logo?: string,
      logoAspectRatio?: number
    ) => {
      if (!logo) return;
      const updater = (prev: RankedDiscoverItem[]) =>
        prev.map((item) =>
          item.id === id ? { ...item, logo, logoAspectRatio } : item
        );

      if (mediaType === 'movie') {
        setPopularMovieItems(updater);
        setMovieItems(updater);
        return;
      }
      setTvItems(updater);
    },
    []
  );

  const fetchRankedItems = useCallback(
    async (config: CuratedCategoryConfig, signal: AbortSignal) => {
      try {
        const primary = await fetchDiscoverItems(
          buildCuratedCategoryQuery(config, 1, false),
          signal
        );
        if (primary.length > 0) return primary;
      } catch {
        // Try fallback query below.
      }

      if (config.fallbackQuery) {
        try {
          return await fetchDiscoverItems(
            buildCuratedCategoryQuery(config, 1, true),
            signal
          );
        } catch {
          return [];
        }
      }

      return [];
    },
    []
  );

  const hydrateItemDetails = useCallback(
    async (
      items: RankedDiscoverItem[],
      mediaType: TmdbMediaType,
      signal: AbortSignal
    ) => {
      if (!items.length) return;
      const logoLanguagePreference =
        getLogoLanguagePreferenceForMediaType(mediaType);

      const tasks = items.map(async (item) => {
        const key = cacheKey(item.id, mediaType, logoLanguagePreference);
        const cached = detailCacheRef.current.get(key);
        if (cached) {
          return { id: item.id, detail: cached };
        }

        const detail = await fetchTmdbDetailById(item.id, mediaType, {
          signal,
          logoLanguagePreference,
        });
        detailCacheRef.current.set(key, detail);
        return { id: item.id, detail };
      });

      const results = await Promise.allSettled(tasks);
      if (signal.aborted) return;

      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const { id, detail } = result.value;
        applyLogoToList(id, mediaType, detail.logo, detail.logoAspectRatio);
      });
    },
    [applyLogoToList, cacheKey]
  );

  const loadDetail = useCallback(
    async (target: ActiveRankedItem) => {
      setActiveItem(target);
      setDetailOpen(true);
      setDetailError(null);

      const logoLanguagePreference = getLogoLanguagePreferenceForMediaType(
        target.mediaType
      );
      const key = cacheKey(
        target.id,
        target.mediaType,
        logoLanguagePreference
      );
      const cached = detailCacheRef.current.get(key);
      if (cached) {
        setDetailData(cached);
        setDetailLoading(false);
        applyLogoToList(
          target.id,
          target.mediaType,
          cached.logo,
          cached.logoAspectRatio
        );
        return;
      }

      const requestId = ++detailRequestIdRef.current;
      setDetailLoading(true);
      setDetailData(null);

      try {
        const detail = await fetchTmdbDetailById(target.id, target.mediaType, {
          logoLanguagePreference,
        });
        if (detailRequestIdRef.current !== requestId) return;

        detailCacheRef.current.set(key, detail);
        setDetailData(detail);
        applyLogoToList(
          target.id,
          target.mediaType,
          detail.logo,
          detail.logoAspectRatio
        );
      } catch (error) {
        if (detailRequestIdRef.current !== requestId) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to fetch TMDB detail';
        setDetailError(message);
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [applyLogoToList, cacheKey]
  );

  const handleOpenDetail = useCallback(
    (item: RankedDiscoverItem, mediaType: TmdbMediaType) => {
      router.push(
        buildTmdbDetailPageUrl({
          id: item.id,
          title: item.title,
          mediaType,
          year: item.year,
          poster: item.poster,
          score: item.rate,
          logoLang: getLogoLanguagePreferenceForMediaType(mediaType),
        })
      );
    },
    [router]
  );

  const handleRetryDetail = useCallback(() => {
    if (!activeItem) return;
    void loadDetail(activeItem);
  }, [activeItem, loadDetail]);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
  }, []);

  const handleCloseSeasonPicker = useCallback(() => {
    setSeasonPicker({
      open: false,
      tmdbId: '',
      baseTitle: '',
      year: '',
      seasonCount: 0,
    });
  }, []);

  const resolveSeasonCountForPlay = useCallback(
    async (
      title: string,
      year: string,
      currentItem: ActiveRankedItem | null
    ): Promise<number> => {
      if (
        detailData?.mediaType === 'tv' &&
        typeof detailData.seasons === 'number' &&
        Number.isFinite(detailData.seasons) &&
        detailData.seasons > 1
      ) {
        return Math.floor(detailData.seasons);
      }

      const targetId =
        detailData?.mediaType === 'tv'
          ? String(detailData.id)
          : currentItem?.mediaType === 'tv'
          ? currentItem.id
          : '';

      if (targetId) {
        try {
          const detail = await fetchTmdbDetailWithClientCache<TmdbDetailResponse>({
            id: targetId,
            mediaType: 'tv',
          });
          if (
            typeof detail.seasons === 'number' &&
            Number.isFinite(detail.seasons) &&
            detail.seasons > 1
          ) {
            return Math.floor(detail.seasons);
          }
        } catch {
          // fallback to title lookup
        }
      }

      try {
        const detail = await fetchTmdbDetailWithClientCache<{
          seasons?: number | null;
        }>({
          title,
          mediaType: 'tv',
          year,
        });
        const seasons = detail.seasons;
        if (typeof seasons !== 'number' || !Number.isFinite(seasons) || seasons <= 1) {
          return 0;
        }
        return Math.floor(seasons);
      } catch {
        return 0;
      }
    },
    [detailData]
  );

  const handleSeasonPick = useCallback(
    (season: number) => {
      const tmdbId = seasonPicker.tmdbId.trim();
      if (!tmdbId) return;
      handleCloseSeasonPicker();
      router.push(
        buildTmdbPlayerPageUrl({
          tmdbId,
          mediaType: 'tv',
          title: seasonPicker.baseTitle,
          year: seasonPicker.year,
          poster: seasonPicker.backdrop || '',
          season,
          episode: 1,
        })
      );
    },
    [handleCloseSeasonPicker, router, seasonPicker]
  );

  const handlePlayFromDetail = useCallback(async () => {
    const title = (detailData?.title || activeItem?.title || '').trim();
    if (!title) return;

    const year = (detailData?.year || activeItem?.year || '').trim();
    const mediaType = detailData?.mediaType || activeItem?.mediaType || 'movie';

    if (mediaType === 'tv' && !hasSeasonHint(title)) {
      const seasonCount = await resolveSeasonCountForPlay(title, year, activeItem);
      if (seasonCount > 1) {
        setDetailOpen(false);
        setSeasonPicker({
          open: true,
          tmdbId: detailData?.id ? String(detailData.id) : activeItem?.id || '',
          baseTitle: stripSeasonHint(title) || title,
          year,
          seasonCount,
          logo: detailData?.logo,
          backdrop: detailData?.backdrop || detailData?.poster,
        });
        return;
      }
    }

    setDetailOpen(false);
    router.push(
      buildTmdbPlayerPageUrl({
        tmdbId: detailData?.id ? String(detailData.id) : activeItem?.id || '',
        mediaType,
        title,
        year,
        poster: detailData?.poster || detailData?.backdrop || '',
        score: detailData?.score || '',
        season: 1,
        episode: 1,
      })
    );
  }, [activeItem, detailData, resolveSeasonCountForPlay, router]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);

      const [popularMovies, movies, tvShows] = await Promise.all([
        fetchRankedItems(POPULAR_MOVIE_CONFIG, controller.signal),
        fetchRankedItems(MOVIE_TOP_RATED_CONFIG, controller.signal),
        fetchRankedItems(TV_TOP_RATED_CONFIG, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      setPopularMovieItems(popularMovies);
      setMovieItems(movies);
      setTvItems(tvShows);
      setLoading(false);

      void hydrateItemDetails(popularMovies, 'movie', controller.signal);
      void hydrateItemDetails(movies, 'movie', controller.signal);
      void hydrateItemDetails(tvShows, 'tv', controller.signal);
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [fetchRankedItems, hydrateItemDetails, i18n.language]);

  if (
    !loading &&
    popularMovieItems.length === 0 &&
    movieItems.length === 0 &&
    tvItems.length === 0
  ) {
    return null;
  }

  return (
    <>
      <MatrixLoadingOverlay visible={showMatrixLoading} />

      <div className={`mb-2 ${className || ''}`}>
        <RankedSection
          title={t(`curated.${POPULAR_MOVIE_CONFIG.slug}`, {
            defaultValue: POPULAR_MOVIE_CONFIG.title,
          })}
          href={`/curated/${POPULAR_MOVIE_CONFIG.slug}`}
          mediaType='movie'
          items={popularMovieItems}
          loading={loading}
          onOpenDetail={handleOpenDetail}
          onNavigateWithMatrixLoading={navigateLinkWithMatrixLoading}
        />
        <RankedSection
          title={t(`curated.${MOVIE_TOP_RATED_CONFIG.slug}`, {
            defaultValue: MOVIE_TOP_RATED_CONFIG.title,
          })}
          href={`/curated/${MOVIE_TOP_RATED_CONFIG.slug}`}
          mediaType='movie'
          items={movieItems}
          loading={loading}
          onOpenDetail={handleOpenDetail}
          onNavigateWithMatrixLoading={navigateLinkWithMatrixLoading}
        />
        <RankedSection
          title={t(`curated.${TV_TOP_RATED_CONFIG.slug}`, {
            defaultValue: TV_TOP_RATED_CONFIG.title,
          })}
          href={`/curated/${TV_TOP_RATED_CONFIG.slug}`}
          mediaType='tv'
          items={tvItems}
          loading={loading}
          onOpenDetail={handleOpenDetail}
          onNavigateWithMatrixLoading={navigateLinkWithMatrixLoading}
        />
      </div>

      <TmdbDetailModal
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        titleLogo={detailData?.logo}
        onClose={handleCloseDetail}
        onPlay={handlePlayFromDetail}
        onRetry={activeItem ? handleRetryDetail : undefined}
        playLabel={t('common.playNow')}
      />
      <SeasonPickerModal
        open={seasonPicker.open}
        title={seasonPicker.baseTitle}
        logo={seasonPicker.logo}
        backdrop={seasonPicker.backdrop}
        seasonCount={seasonPicker.seasonCount}
        onClose={handleCloseSeasonPicker}
        onPickSeason={handleSeasonPick}
      />
    </>
  );
}

