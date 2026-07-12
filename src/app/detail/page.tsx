/* eslint-disable @next/next/no-img-element */

'use client';

import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Info,
  Play,
  Star,
  Users,
  Volume2,
  VolumeX,
  Youtube,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useImdbTrailerStream } from '@/hooks/use-imdb-trailer-stream';
import { getCurrentTmdbLanguage } from '@/i18n/client';
import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  fetchTmdbDetailWithClientCache,
  type TmdbLogoLanguagePreference,
} from '@/lib/tmdb-detail.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';
import { isFutureReleaseDate } from '@/lib/tmdbRelease';
import PageLayout from '@/components/PageLayout';
import PosterInfoCard from '@/components/PosterInfoCard';
import ReleaseYearBadge from '@/components/ReleaseYearBadge';
import SeasonPickerModal from '@/components/SeasonPickerModal';
import TrailerStreamVideo from '@/components/TrailerStreamVideo';

type TmdbMediaType = 'movie' | 'tv';

interface TmdbDetailCastItem {
  id: number;
  name: string;
  character: string;
  profile?: string;
}

interface TmdbDetailDirectorItem {
  id: number;
  name: string;
  profile?: string;
}

interface TmdbDetailRecommendation {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  poster: string;
  backdrop: string;
  year: string;
  score: string;
  voteCount: number;
}

interface TmdbDetailCollection {
  id: number;
  name: string;
  overview: string;
  poster: string;
  backdrop: string;
  parts: TmdbDetailRecommendation[];
}

interface TmdbDetailPageData {
  id: number;
  mediaType: TmdbMediaType;
  imdbId?: string;
  title: string;
  logo?: string;
  logoAspectRatio?: number;
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
  directors: TmdbDetailDirectorItem[];
  cast: TmdbDetailCastItem[];
  collection?: TmdbDetailCollection;
  recommendations?: TmdbDetailRecommendation[];
  trailerUrl: string;
}

interface SeasonPickerState {
  open: boolean;
  baseTitle: string;
  year: string;
  seasonCount: number;
  logo?: string;
  backdrop?: string;
}

const DETAIL_HERO_STACK_CLASS =
  'flex max-w-3xl flex-col gap-4 md:max-w-[35rem]';
const DETAIL_HERO_LOGO_CLASS =
  'relative h-28 w-auto max-w-[min(90vw,560px)] sm:h-36 md:h-[clamp(5.5rem,14dvh,10.5rem)] md:max-w-[min(40rem,58vw)]';
const DETAIL_HERO_ICON_BUTTON_CLASS =
  'ui-glass-control inline-flex h-9 w-9 items-center justify-center';

function safeImageUrl(url?: string): string {
  return url || '';
}

function normalizeMediaType(value?: string | null): TmdbMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

function normalizeYear(value?: string | null): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
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

function buildDetailPlayUrl(
  detail: {
    id: number;
    title: string;
    mediaType: TmdbMediaType;
    year?: string;
    poster?: string;
    score?: string;
  },
  season = 1
): string {
  return buildTmdbPlayerPageUrl({
    tmdbId: detail.id,
    mediaType: detail.mediaType,
    title: detail.title,
    year: detail.year,
    poster: detail.poster,
    score: detail.score,
    season,
    episode: 1,
  });
}

function DetailSkeleton() {
  return (
    <PageLayout
      activePath='/detail'
      forceShowBackButton
      showDesktopTopSearch
      disableMobileTopPadding
    >
      <div className='min-h-screen bg-black text-white'>
        <section className='relative min-h-screen overflow-hidden bg-black'>
          <div className='absolute inset-0 animate-pulse bg-white/10' />
          <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10 md:from-black/50 md:via-black/15 md:to-transparent' />
          <div className='absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/5 md:from-black/30 md:to-transparent' />
          <div className='absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent md:hidden' />
          <div className='relative z-10 flex min-h-screen items-end px-5 pb-[calc(env(safe-area-inset-bottom)+clamp(1.5rem,4dvh,2.5rem))] pt-24 md:px-[clamp(2rem,3vw,4rem)] md:pb-[clamp(2.5rem,5dvh,3.5rem)]'>
            <div className='w-full'>
              <div className={`${DETAIL_HERO_STACK_CLASS} animate-pulse`}>
                <div
                  className={`${DETAIL_HERO_LOGO_CLASS} w-full rounded-xl bg-white/20`}
                />
                <div className='space-y-4'>
                  <div className='flex flex-wrap gap-3'>
                    <div className='h-6 w-24 rounded-full bg-white/20' />
                    <div className='h-6 w-20 rounded-full bg-white/15' />
                    <div className='h-6 w-16 rounded-full bg-white/15' />
                    <div className='h-6 w-20 rounded-full bg-white/15' />
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <div className='h-8 w-16 rounded-full bg-white/15' />
                    <div className='h-8 w-16 rounded-full bg-white/15' />
                    <div className='h-8 w-16 rounded-full bg-white/15' />
                    <div className='h-8 w-16 rounded-full bg-white/15' />
                  </div>
                  <div className='space-y-2'>
                    <div className='h-4 w-full max-w-2xl rounded bg-white/20' />
                    <div className='h-4 w-11/12 max-w-xl rounded bg-white/15' />
                    <div className='h-4 w-4/5 max-w-lg rounded bg-white/10' />
                  </div>
                  <div className='flex gap-4'>
                    <div className='h-4 w-16 rounded bg-white/15' />
                    <div className='h-4 w-28 rounded bg-white/10' />
                  </div>
                </div>
                <div className='flex flex-wrap gap-3'>
                  <div className='h-9 w-[120px] rounded-full bg-white/30' />
                  <div className='h-9 w-9 rounded-full border border-white/35 bg-white/15' />
                  <div className='h-9 w-[108px] rounded-full border border-white/35 bg-white/15' />
                  <div className='h-9 w-9 rounded-full border border-white/35 bg-white/15' />
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className='relative z-10 space-y-6 px-5 pb-12 pt-4 sm:px-10 lg:px-14'>
          <section className='space-y-3'>
            <div className='h-5 w-14 animate-pulse rounded bg-white/15' />
            <div className='flex gap-3 overflow-hidden'>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`detail-cast-skeleton-${index}`}
                  className='flex w-[88px] flex-shrink-0 animate-pulse flex-col items-center gap-2 sm:w-[104px]'
                >
                  <div className='h-[82px] w-[82px] rounded-full bg-white/15 sm:h-24 sm:w-24' />
                  <div className='h-3 w-16 rounded bg-white/15' />
                  <div className='h-3 w-12 rounded bg-white/10' />
                </div>
              ))}
            </div>
          </section>
          {['collection', 'recommendation'].map((section) => (
            <section key={`detail-${section}-skeleton`} className='space-y-3'>
              <div className='space-y-2'>
                <div className='h-5 w-20 animate-pulse rounded bg-white/15' />
                {section === 'collection' ? (
                  <div className='h-3 w-40 animate-pulse rounded bg-white/10' />
                ) : null}
              </div>
              <div className='flex gap-3 overflow-hidden'>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`detail-${section}-card-skeleton-${index}`}
                    className='flex w-[132px] flex-shrink-0 animate-pulse flex-col'
                  >
                    <div className='aspect-[2/3] rounded-xl border border-white/10 bg-white/10' />
                    <div className='mt-2 h-14 space-y-2'>
                      <div className='h-3 w-full rounded bg-white/15' />
                      <div className='h-3 w-16 rounded bg-white/10' />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

function DetailPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { i18n, t } = useTranslation();
  const castRailRef = useRef<HTMLDivElement | null>(null);
  const collectionRailRef = useRef<HTMLDivElement | null>(null);
  const recommendationRailRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<TmdbDetailPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [streamTrailerVisible, setStreamTrailerVisible] = useState(false);
  const [streamTrailerCompleted, setStreamTrailerCompleted] = useState(false);
  const [streamTrailerUnavailable, setStreamTrailerUnavailable] =
    useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [seasonPicker, setSeasonPicker] = useState<SeasonPickerState>({
    open: false,
    baseTitle: '',
    year: '',
    seasonCount: 0,
  });
  const [canScrollCastLeft, setCanScrollCastLeft] = useState(false);
  const [canScrollCastRight, setCanScrollCastRight] = useState(false);
  const [canScrollCollectionLeft, setCanScrollCollectionLeft] = useState(false);
  const [canScrollCollectionRight, setCanScrollCollectionRight] =
    useState(false);
  const [canScrollRecommendationLeft, setCanScrollRecommendationLeft] =
    useState(false);
  const [canScrollRecommendationRight, setCanScrollRecommendationRight] =
    useState(false);
  const [castRailHovered, setCastRailHovered] = useState(false);
  const [collectionRailHovered, setCollectionRailHovered] = useState(false);
  const [recommendationRailHovered, setRecommendationRailHovered] =
    useState(false);

  const requestInput = useMemo(() => {
    const logoLang = searchParams.get('logoLang');
    const logoLanguagePreference: TmdbLogoLanguagePreference | undefined =
      logoLang === 'en' || logoLang === 'zh' ? logoLang : undefined;
    return {
      id: searchParams.get('id'),
      title: searchParams.get('title'),
      mediaType: normalizeMediaType(searchParams.get('type')),
      year: normalizeYear(searchParams.get('year')),
      poster: searchParams.get('poster'),
      score: searchParams.get('score'),
      logoLanguagePreference,
      tmdbLanguage: getCurrentTmdbLanguage(),
    };
  }, [i18n.language, searchParams]);
  const {
    mp4Url: streamTrailerMp4Url,
    hlsUrl: streamTrailerHlsUrl,
    status: streamTrailerStatus,
  } = useImdbTrailerStream(detail?.imdbId, Boolean(detail?.imdbId));
  const hasStreamTrailerSource = Boolean(
    streamTrailerMp4Url || streamTrailerHlsUrl
  );
  const shouldRenderStreamTrailer = Boolean(
    hasStreamTrailerSource &&
      streamTrailerStatus === 'ready' &&
      !streamTrailerCompleted &&
      !streamTrailerUnavailable
  );
  const favoriteSource = 'tmdb';
  const favoriteId = detail?.id ? String(detail.id) : '';
  const favoriteStorageKey = favoriteId
    ? generateStorageKey(favoriteSource, favoriteId)
    : '';

  const updateRailScrollState = useCallback(
    (
      ref: RefObject<HTMLDivElement>,
      setCanLeft: (value: boolean) => void,
      setCanRight: (value: boolean) => void
    ) => {
      const el = ref.current;
      if (!el) {
        setCanLeft(false);
        setCanRight(false);
        return;
      }

      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft < maxScrollLeft - 4);
    },
    []
  );

  const updateCastScrollState = useCallback(() => {
    updateRailScrollState(
      castRailRef,
      setCanScrollCastLeft,
      setCanScrollCastRight
    );
  }, [updateRailScrollState]);

  const updateRecommendationScrollState = useCallback(() => {
    updateRailScrollState(
      recommendationRailRef,
      setCanScrollRecommendationLeft,
      setCanScrollRecommendationRight
    );
  }, [updateRailScrollState]);

  const updateCollectionScrollState = useCallback(() => {
    updateRailScrollState(
      collectionRailRef,
      setCanScrollCollectionLeft,
      setCanScrollCollectionRight
    );
  }, [updateRailScrollState]);

  const scrollRail = useCallback(
    (ref: RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
      const el = ref.current;
      if (!el) return;
      const amount = Math.max(260, Math.floor(el.clientWidth * 0.78));
      el.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    },
    []
  );

  const toggleTrailerSound = useCallback(() => {
    const nextMuted = !trailerMuted;
    setTrailerMuted(nextMuted);
  }, [trailerMuted]);

  useEffect(() => {
    if (!favoriteId || !favoriteStorageKey) {
      setFavorited(false);
      return;
    }

    let cancelled = false;

    const loadFavoriteStatus = async () => {
      try {
        const nextFavorited = await isFavorited(favoriteSource, favoriteId);
        if (!cancelled) {
          setFavorited(nextFavorited);
        }
      } catch {
        if (!cancelled) {
          setFavorited(false);
        }
      }
    };

    void loadFavoriteStatus();

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, unknown>) => {
        setFavorited(Boolean(favorites[favoriteStorageKey]));
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [favoriteId, favoriteStorageKey]);

  const handleToggleFavorite = useCallback(async () => {
    if (!detail || !favoriteId || favoritePending) return;

    setFavoritePending(true);
    try {
      if (favorited) {
        await deleteFavorite(favoriteSource, favoriteId);
        setFavorited(false);
        return;
      }

      await saveFavorite(favoriteSource, favoriteId, {
        title: detail.title,
        source_name: 'TMDB',
        year: detail.year || '',
        cover: detail.poster || detail.backdrop || '',
        total_episodes:
          detail.episodes || (detail.mediaType === 'movie' ? 1 : 0),
        save_time: Date.now(),
        search_title: detail.title,
      });
      setFavorited(true);
    } finally {
      setFavoritePending(false);
    }
  }, [detail, favoriteId, favoritePending, favorited]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadDetail = async () => {
      if (!requestInput.id && !requestInput.title) {
        setError('Missing detail parameters');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setTrailerMuted(true);
      setStreamTrailerVisible(false);
      setStreamTrailerCompleted(false);
      setStreamTrailerUnavailable(false);

      try {
        const payload =
          await fetchTmdbDetailWithClientCache<TmdbDetailPageData>({
            ...requestInput,
            signal: controller.signal,
          });
        if (cancelled) return;
        setDetail(payload);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message || 'Failed to load details');
        setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [requestInput]);

  useEffect(() => {
    setTrailerMuted(true);
    setStreamTrailerVisible(false);
    setStreamTrailerCompleted(false);
    setStreamTrailerUnavailable(false);
  }, [detail?.imdbId, detail?.trailerUrl]);

  useEffect(() => {
    updateCastScrollState();
    updateCollectionScrollState();
    updateRecommendationScrollState();
    window.addEventListener('resize', updateCastScrollState);
    window.addEventListener('resize', updateCollectionScrollState);
    window.addEventListener('resize', updateRecommendationScrollState);
    return () => {
      window.removeEventListener('resize', updateCastScrollState);
      window.removeEventListener('resize', updateCollectionScrollState);
      window.removeEventListener('resize', updateRecommendationScrollState);
    };
  }, [
    detail,
    updateCastScrollState,
    updateCollectionScrollState,
    updateRecommendationScrollState,
  ]);

  const handlePlay = useCallback(async () => {
    if (!detail?.title) return;
    if (isFutureReleaseDate(detail.releaseDate)) return;

    const title = detail.title.trim();
    const year = detail.year || '';

    if (
      detail.mediaType === 'tv' &&
      !hasSeasonHint(title) &&
      typeof detail.seasons === 'number' &&
      detail.seasons > 1
    ) {
      setSeasonPicker({
        open: true,
        baseTitle: stripSeasonHint(title) || title,
        year,
        seasonCount: Math.floor(detail.seasons),
        logo: detail.logo,
        backdrop: detail.backdrop || detail.poster,
      });
      return;
    }

    router.push(buildDetailPlayUrl(detail));
  }, [detail, router]);

  const handleSeasonPick = useCallback(
    (season: number) => {
      if (!detail) return;
      setSeasonPicker({
        open: false,
        baseTitle: '',
        year: '',
        seasonCount: 0,
      });
      router.push(buildDetailPlayUrl(detail, season));
      /*
      router.push(
        legacyTitleRoute(
          `${baseTitle} 第${season}季`,
          'tv',
          seasonPicker.year
        )
      );
      */
    },
    [detail, router]
  );

  const closeSeasonPicker = useCallback(() => {
    setSeasonPicker({
      open: false,
      baseTitle: '',
      year: '',
      seasonCount: 0,
    });
  }, []);

  if (loading) return <DetailSkeleton />;

  if (error || !detail) {
    return (
      <PageLayout activePath='/detail' forceShowBackButton showDesktopTopSearch>
        <div className='flex min-h-screen items-center justify-center px-5 py-20 text-center'>
          <div className='max-w-md space-y-4'>
            <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500'>
              <Info className='h-5 w-5' />
            </div>
            <h1 className='text-xl font-semibold text-zinc-900 dark:text-zinc-100'>
              {t('detail.failedToLoad')}
            </h1>
            <p className='text-sm leading-6 text-zinc-600 dark:text-zinc-400'>
              {error || t('detail.noDetailsFound')}
            </p>
            <button
              type='button'
              onClick={() => router.back()}
              className='ui-glass-control inline-flex items-center gap-2 px-4 py-2 text-sm font-medium'
            >
              <ArrowLeft className='h-4 w-4' />
              {t('common.back')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const heroImage = detail.backdrop || detail.poster;
  const collection = detail.collection;
  const recommendations = detail.recommendations || [];
  const showStreamTrailerBackground =
    shouldRenderStreamTrailer && streamTrailerVisible;
  const canPlay = !isFutureReleaseDate(detail.releaseDate);

  return (
    <PageLayout
      activePath='/detail'
      forceShowBackButton
      showDesktopTopSearch
      disableMobileTopPadding
    >
      <div className='min-h-screen bg-black text-white'>
        <section className='relative min-h-screen overflow-hidden bg-black'>
          {heroImage ? (
            <Image
              src={safeImageUrl(heroImage)}
              alt={detail.title}
              fill
              priority
              className='object-cover object-center brightness-[0.56]'
              sizes='100vw'
            />
          ) : (
            <div className='absolute inset-0 bg-zinc-900' />
          )}

          {shouldRenderStreamTrailer ? (
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                showStreamTrailerBackground ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden='true'
            >
              <TrailerStreamVideo
                key={`${streamTrailerMp4Url || ''}|${
                  streamTrailerHlsUrl || ''
                }`}
                mp4Url={streamTrailerMp4Url}
                hlsUrl={streamTrailerHlsUrl}
                muted={trailerMuted}
                className='h-full w-full scale-[1.08] object-cover object-center brightness-[0.56]'
                onCanPlay={() => {
                  setStreamTrailerUnavailable(false);
                }}
                onPlaying={() => {
                  setStreamTrailerVisible(true);
                  setStreamTrailerUnavailable(false);
                }}
                onEnded={() => {
                  setStreamTrailerVisible(false);
                  setStreamTrailerCompleted(true);
                }}
                onError={() => {
                  setStreamTrailerVisible(false);
                  setStreamTrailerUnavailable(true);
                }}
              />
            </div>
          ) : null}

          {shouldRenderStreamTrailer ? (
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                showStreamTrailerBackground ? 'opacity-0' : 'opacity-100'
              }`}
              aria-hidden='true'
            >
              {heroImage ? (
                <Image
                  src={safeImageUrl(heroImage)}
                  alt=''
                  fill
                  className='object-cover object-center brightness-[0.56]'
                  sizes='100vw'
                />
              ) : (
                <div className='absolute inset-0 bg-zinc-900' />
              )}
            </div>
          ) : null}

          <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10 md:from-black/50 md:via-black/15 md:to-transparent' />
          <div className='absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/5 md:from-black/30 md:to-transparent' />
          <div className='absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent md:hidden' />

          <div className='relative z-10 flex min-h-screen items-end px-5 pb-[calc(env(safe-area-inset-bottom)+clamp(1.5rem,4dvh,2.5rem))] pt-24 md:px-[clamp(2rem,3vw,4rem)] md:pb-[clamp(2.5rem,5dvh,3.5rem)]'>
            <div className='w-full'>
              <div className={`group ${DETAIL_HERO_STACK_CLASS}`}>
                {detail.logo ? (
                  <div
                    className={DETAIL_HERO_LOGO_CLASS}
                    style={
                      detail.logoAspectRatio
                        ? { aspectRatio: detail.logoAspectRatio }
                        : { width: '100%' }
                    }
                  >
                    <Image
                      src={safeImageUrl(detail.logo)}
                      alt={`${detail.title} logo`}
                      fill
                      className='object-contain object-left drop-shadow-[0_12px_30px_rgba(0,0,0,0.75)]'
                    />
                  </div>
                ) : (
                  <h1 className='max-w-3xl text-4xl font-black leading-tight text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.75)] sm:text-5xl md:text-[clamp(2rem,5dvh,3.75rem)]'>
                    {detail.title}
                  </h1>
                )}

                <div className='order-last flex flex-wrap items-center gap-3'>
                  {canPlay ? (
                    <button
                      type='button'
                      onClick={() => {
                        void handlePlay();
                      }}
                      className='inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black shadow-[0_10px_24px_rgba(0,0,0,0.32)] transition-all duration-200 hover:bg-white/90 hover:shadow-xl'
                    >
                      <Play className='h-4 w-4' fill='currentColor' />
                      {t('common.playNow')}
                    </button>
                  ) : null}
                  <button
                    type='button'
                    onClick={() => {
                      void handleToggleFavorite();
                    }}
                    disabled={favoritePending}
                    aria-label={
                      favorited
                        ? t('common.removeFromFavorites')
                        : t('common.addToFavorites')
                    }
                    title={
                      favorited
                        ? t('common.removeFromFavorites')
                        : t('common.addToFavorites')
                    }
                    className={`${DETAIL_HERO_ICON_BUTTON_CLASS} disabled:pointer-events-none disabled:opacity-60 ${
                      favorited
                        ? 'border-yellow-300/45 bg-yellow-400/15 text-yellow-300 hover:bg-yellow-400/20'
                        : ''
                    }`}
                  >
                    <Bookmark
                      className='h-4 w-4 transition-transform duration-200'
                      fill={favorited ? 'currentColor' : 'none'}
                    />
                  </button>
                  {detail.trailerUrl ? (
                    <a
                      href={detail.trailerUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='ui-glass-control inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold'
                    >
                      <Youtube className='h-4 w-4' />
                      {t('common.trailer')}
                    </a>
                  ) : null}
                  {showStreamTrailerBackground ? (
                    <button
                      type='button'
                      onClick={toggleTrailerSound}
                      aria-label={
                        trailerMuted
                          ? t('detail.turnTrailerSoundOn')
                          : t('detail.turnTrailerSoundOff')
                      }
                      className={DETAIL_HERO_ICON_BUTTON_CLASS}
                    >
                      {trailerMuted ? (
                        <VolumeX className='h-4 w-4' />
                      ) : (
                        <Volume2 className='h-4 w-4' />
                      )}
                    </button>
                  ) : null}
                </div>

                <div className='grid grid-rows-[1fr] transition-[grid-template-rows,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:grid-rows-[0fr] md:translate-y-4 md:opacity-0 md:group-hover:grid-rows-[1fr] md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:grid-rows-[1fr] md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100'>
                  <div className='min-h-0 overflow-hidden'>
                    <div className='space-y-4'>
                      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-white/90'>
                        {detail.score ? (
                          <span className='inline-flex items-center gap-1 text-white'>
                            <Star
                              className='h-4 w-4 text-yellow-400'
                              fill='currentColor'
                            />
                            <span className='font-semibold'>
                              {detail.score}
                            </span>
                            {detail.voteCount > 0 ? (
                              <span className='text-white/60'>
                                ({detail.voteCount})
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <ReleaseYearBadge
                          year={detail.year}
                          releaseDate={detail.releaseDate}
                          iconSize={16}
                          tooltipPlacement='bottom'
                        />
                        <span className='rounded border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/95 backdrop-blur-md'>
                          {detail.mediaType === 'movie'
                            ? t('common.movie')
                            : t('common.series')}
                        </span>
                        {detail.runtime ? (
                          <span className='inline-flex items-center gap-1'>
                            <Clock3 className='h-4 w-4' />
                            {formatRuntime(detail.runtime)}
                          </span>
                        ) : null}
                        {detail.mediaType === 'tv' &&
                        detail.seasons &&
                        detail.episodes ? (
                          <span className='inline-flex items-center gap-1'>
                            <Users className='h-4 w-4' />
                            {t('hero.tvMetaShort', {
                              seasons: detail.seasons,
                              episodes: detail.episodes,
                            })}
                          </span>
                        ) : null}
                        {detail.contentRating ? (
                          <span className='rounded border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-white/95 backdrop-blur-md'>
                            {detail.contentRating}
                          </span>
                        ) : null}
                      </div>

                      {detail.genres.length > 0 ? (
                        <div className='flex flex-wrap gap-2'>
                          {detail.genres.map((genre) => (
                            <span
                              key={genre}
                              className='rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-xl'
                            >
                              {genre}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <p className='max-w-2xl overflow-hidden text-[13px] leading-5 text-white/80 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] sm:text-sm sm:leading-6 md:[-webkit-line-clamp:6]'>
                        {detail.overview}
                      </p>

                      <div className='!mt-3 flex flex-wrap items-center gap-4 text-xs text-white/60 sm:text-sm'>
                        {detail.language ? (
                          <span className='inline-flex items-center gap-1'>
                            <Globe2 className='h-4 w-4' />
                            {detail.language}
                          </span>
                        ) : null}
                        {typeof detail.popularity === 'number' ? (
                          <span>
                            {t('detail.popularity', {
                              value: detail.popularity,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className='relative z-10 space-y-6 px-5 pb-12 pt-4 sm:px-10 lg:px-14'>
          {detail.directors.length > 0 ? (
            <section className='space-y-3'>
              <h2 className='text-base font-semibold text-white/92'>
                {t('detail.director')}
              </h2>
              <div className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide'>
                {detail.directors.map((person) => (
                  <button
                    type='button'
                    key={`detail-director-${person.id}-${person.name}`}
                    onClick={() => router.push(`/person/${person.id}`)}
                    className='group flex w-[88px] flex-shrink-0 flex-col items-center text-center sm:w-[104px]'
                  >
                    <div className='relative h-[82px] w-[82px] overflow-hidden rounded-full border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] shadow-[var(--ui-shadow-control)] sm:h-24 sm:w-24'>
                      {person.profile ? (
                        <img
                          src={safeImageUrl(person.profile)}
                          alt={person.name}
                          className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center text-white/50'>
                          <Users className='h-5 w-5' />
                        </div>
                      )}
                    </div>
                    <p className='mt-2 w-full truncate text-xs font-semibold leading-4 text-white sm:text-[13px]'>
                      {person.name}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {detail.cast.length > 0 ? (
            <section className='space-y-3'>
              <h2 className='text-base font-semibold text-white/92'>
                {t('detail.cast')}
              </h2>
              <div
                className='relative'
                onMouseEnter={() => {
                  setCastRailHovered(true);
                  updateCastScrollState();
                }}
                onMouseLeave={() => setCastRailHovered(false)}
              >
                <div
                  ref={castRailRef}
                  onScroll={updateCastScrollState}
                  className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'
                >
                  {detail.cast.slice(0, 24).map((person) => (
                    <button
                      type='button'
                      key={`detail-cast-${person.id}-${person.name}`}
                      onClick={() => router.push(`/person/${person.id}`)}
                      className='group flex w-[88px] flex-shrink-0 flex-col items-center text-center sm:w-[104px]'
                    >
                      <div className='relative h-[82px] w-[82px] overflow-hidden rounded-full border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] shadow-[var(--ui-shadow-control)] sm:h-24 sm:w-24'>
                        {person.profile ? (
                          <img
                            src={safeImageUrl(person.profile)}
                            alt={person.name}
                            className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                          />
                        ) : (
                          <div className='flex h-full w-full items-center justify-center text-white/50'>
                            <Users className='h-5 w-5' />
                          </div>
                        )}
                      </div>
                      <div className='mt-2 w-full'>
                        <p className='truncate text-xs font-semibold leading-4 text-white sm:text-[13px]'>
                          {person.name}
                        </p>
                        <p className='mt-0.5 line-clamp-1 text-[11px] leading-4 text-white/50'>
                          {person.character || t('detail.unknownRole')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {canScrollCastLeft ? (
                  <RailButton
                    direction='left'
                    visible={castRailHovered}
                    align='avatar'
                    label={t('detail.showPreviousCast')}
                    onClick={() => scrollRail(castRailRef, 'left')}
                  />
                ) : null}
                {canScrollCastRight ? (
                  <RailButton
                    direction='right'
                    visible={castRailHovered}
                    align='avatar'
                    label={t('detail.showMoreCast')}
                    onClick={() => scrollRail(castRailRef, 'right')}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {collection && collection.parts.length > 0 ? (
            <section className='space-y-3'>
              <div>
                <div>
                  <h2 className='text-base font-semibold text-white/92'>
                    {t('detail.collection')}
                  </h2>
                  <div className='mt-1 flex max-w-full items-center gap-2'>
                    <p className='min-w-0 truncate text-xs text-white/50'>
                      {collection.name}
                    </p>
                    <span className='inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] px-1.5 text-[10px] font-medium leading-none text-white/55'>
                      {collection.parts.length}
                    </span>
                  </div>
                </div>
              </div>
              <div
                className='relative'
                onMouseEnter={() => {
                  setCollectionRailHovered(true);
                  updateCollectionScrollState();
                }}
                onMouseLeave={() => setCollectionRailHovered(false)}
              >
                <div
                  ref={collectionRailRef}
                  onScroll={updateCollectionScrollState}
                  className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'
                >
                  {collection.parts.map((item) => (
                    <button
                      type='button'
                      key={`detail-collection-${item.id}`}
                      onClick={() =>
                        router.push(
                          buildTmdbDetailPageUrl({
                            id: item.id,
                            title: item.title,
                            mediaType: 'movie',
                            year: item.year,
                            poster: item.poster,
                            score: item.score,
                          })
                        )
                      }
                      className='group flex w-[132px] flex-shrink-0 flex-col text-left'
                    >
                      <PosterInfoCard
                        title={item.title}
                        poster={item.poster}
                        year={item.year}
                        rating={item.score}
                      />
                    </button>
                  ))}
                </div>

                {canScrollCollectionLeft ? (
                  <RailButton
                    direction='left'
                    visible={collectionRailHovered}
                    align='poster'
                    label={t('detail.showPreviousCollection')}
                    onClick={() => scrollRail(collectionRailRef, 'left')}
                  />
                ) : null}
                {canScrollCollectionRight ? (
                  <RailButton
                    direction='right'
                    visible={collectionRailHovered}
                    align='poster'
                    label={t('detail.showMoreCollection')}
                    onClick={() => scrollRail(collectionRailRef, 'right')}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {recommendations.length > 0 ? (
            <section className='!mt-4 space-y-3'>
              <h2 className='text-base font-semibold text-white/92'>
                {t('detail.moreLikeThis')}
              </h2>
              <div
                className='relative'
                onMouseEnter={() => {
                  setRecommendationRailHovered(true);
                  updateRecommendationScrollState();
                }}
                onMouseLeave={() => setRecommendationRailHovered(false)}
              >
                <div
                  ref={recommendationRailRef}
                  onScroll={updateRecommendationScrollState}
                  className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'
                >
                  {recommendations.slice(0, 24).map((item) => (
                    <button
                      type='button'
                      key={`detail-recommend-${item.mediaType}-${item.id}`}
                      onClick={() =>
                        router.push(
                          buildTmdbDetailPageUrl({
                            id: item.id,
                            title: item.title,
                            mediaType: item.mediaType,
                            year: item.year,
                            poster: item.poster,
                            score: item.score,
                          })
                        )
                      }
                      className='group flex w-[132px] flex-shrink-0 flex-col text-left'
                    >
                      <PosterInfoCard
                        title={item.title}
                        poster={item.poster}
                        year={item.year}
                        rating={item.score}
                      />
                    </button>
                  ))}
                </div>

                {canScrollRecommendationLeft ? (
                  <RailButton
                    direction='left'
                    visible={recommendationRailHovered}
                    align='poster'
                    label={t('detail.showPreviousRecommendations')}
                    onClick={() => scrollRail(recommendationRailRef, 'left')}
                  />
                ) : null}
                {canScrollRecommendationRight ? (
                  <RailButton
                    direction='right'
                    visible={recommendationRailHovered}
                    align='poster'
                    label={t('detail.showMoreRecommendations')}
                    onClick={() => scrollRail(recommendationRailRef, 'right')}
                  />
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <SeasonPickerModal
        open={seasonPicker.open}
        title={seasonPicker.baseTitle}
        logo={seasonPicker.logo}
        backdrop={seasonPicker.backdrop}
        seasonCount={seasonPicker.seasonCount}
        onClose={closeSeasonPicker}
        onPickSeason={handleSeasonPick}
      />
    </PageLayout>
  );
}

function RailButton({
  direction,
  visible,
  align = 'rail',
  label,
  onClick,
}: {
  direction: 'left' | 'right';
  visible: boolean;
  align?: 'avatar' | 'poster' | 'rail';
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <div
      className={`absolute z-[20] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
        direction === 'left' ? 'left-0' : 'right-0'
      } ${
        align === 'poster'
          ? 'top-[99px] -translate-y-1/2'
          : align === 'avatar'
          ? 'top-12 -translate-y-1/2'
          : 'bottom-0 top-0'
      } ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ pointerEvents: 'none' }}
    >
      <button
        type='button'
        onClick={onClick}
        className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
        style={{ pointerEvents: 'auto' }}
        aria-label={label}
      >
        <Icon className='h-6 w-6' />
      </button>
    </div>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailPageClient />
    </Suspense>
  );
}
