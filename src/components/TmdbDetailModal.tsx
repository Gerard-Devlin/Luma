'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CalendarDays,
  Clock3,
  Globe2,
  Bookmark,
  Info,
  Play,
  Star,
  Users,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type MouseEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { isFutureReleaseDate } from '@/lib/tmdbRelease';
export type TmdbDetailMediaType = 'movie' | 'tv';

export interface TmdbDetailModalCastItem {
  id: number;
  name: string;
  character: string;
}

export interface TmdbDetailModalData {
  id: number;
  mediaType: TmdbDetailMediaType;
  title: string;
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
  cast: TmdbDetailModalCastItem[];
  trailerUrl: string;
}

export interface TmdbDetailModalFavoriteTarget {
  source: string;
  id: string;
  title: string;
  sourceName: string;
  year?: string;
  cover?: string;
  totalEpisodes?: number;
  searchTitle?: string;
}

interface TmdbDetailModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  detail: TmdbDetailModalData | null;
  titleLogo?: string;
  favoriteTarget?: TmdbDetailModalFavoriteTarget;
  onClose: () => void;
  onPlay: () => void;
  onRetry?: () => void;
  playLabel?: string;
  showPosterTitle?: boolean;
  playButtonClassName?: string;
}

function safeImageUrl(url: string): string {
  return url;
}

function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

export default function TmdbDetailModal({
  open,
  loading,
  error,
  detail,
  titleLogo,
  favoriteTarget,
  onClose,
  onPlay,
  onRetry,
  playLabel,
  showPosterTitle = true,
  playButtonClassName = 'inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90',
}: TmdbDetailModalProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const favoriteSource = favoriteTarget?.source || '';
  const favoriteId = favoriteTarget?.id || '';
  const favoriteStorageKey =
    favoriteSource && favoriteId
      ? generateStorageKey(favoriteSource, favoriteId)
      : '';
  const canPlay = detail ? !isFutureReleaseDate(detail.releaseDate) : true;
  const smoothEase = [0.22, 1, 0.36, 1] as const;
  const resolvedPlayLabel = playLabel || t('common.playNow');

  useEffect(() => {
    if (!open || !favoriteSource || !favoriteId || !favoriteStorageKey) {
      setFavorited(false);
      return;
    }

    let cancelled = false;

    const fetchFavoriteStatus = async () => {
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

    void fetchFavoriteStatus();

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
  }, [favoriteId, favoriteSource, favoriteStorageKey, open]);

  const handleToggleFavorite = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!favoriteTarget || !favoriteSource || !favoriteId || favoritePending) {
      return;
    }

    setFavoritePending(true);
    try {
      if (favorited) {
        await deleteFavorite(favoriteSource, favoriteId);
        setFavorited(false);
        return;
      }

      const title = favoriteTarget.title || detail?.title || '';
      const sourceName = favoriteTarget.sourceName || 'TMDB';
      if (!title || !sourceName) return;

      await saveFavorite(favoriteSource, favoriteId, {
        title,
        source_name: sourceName,
        year: favoriteTarget.year || detail?.year || '',
        cover: favoriteTarget.cover || detail?.poster || detail?.backdrop || '',
        total_episodes:
          favoriteTarget.totalEpisodes ||
          detail?.episodes ||
          (detail?.mediaType === 'movie' ? 1 : 0),
        save_time: Date.now(),
        search_title: favoriteTarget.searchTitle || title,
      });
      setFavorited(true);
    } finally {
      setFavoritePending(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const overlayTransition = shouldReduceMotion
    ? { duration: 0.16 }
    : { duration: 0.26, ease: smoothEase };
  const panelTransition = shouldReduceMotion
    ? { duration: 0.16, ease: smoothEase }
    : { type: 'spring' as const, stiffness: 360, damping: 28, mass: 0.72 };
  const contentTransition = shouldReduceMotion
    ? { duration: 0.14 }
    : { duration: 0.28, ease: smoothEase, delay: 0.02 };
  const blurOverlayTransition = shouldReduceMotion
    ? { duration: 0.16 }
    : { duration: 0.32, ease: smoothEase };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key='tmdb-detail-modal'
          className='fixed inset-0 z-[850] flex items-center justify-center p-4'
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 0 }}
          onClick={onClose}
        >
          <motion.div
            className='absolute inset-0 bg-black/65'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            style={{ willChange: 'opacity' }}
          />
          <motion.div
            className='absolute inset-0 bg-black/20 backdrop-blur-[6px]'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={blurOverlayTransition}
            style={{ willChange: 'opacity' }}
          />

          <motion.div
            role='dialog'
            aria-modal='true'
            aria-label='Detail dialog'
            className='relative w-full max-w-4xl overflow-hidden rounded-[22px] border border-white/20 bg-zinc-950 text-white shadow-2xl'
            initial={
              shouldReduceMotion
                ? { opacity: 0.92, scale: 1 }
                : { opacity: 0, y: 30, scale: 0.9 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1, scale: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0, scale: 1 }
                : { opacity: 0, y: 16, scale: 0.95 }
            }
            transition={panelTransition}
            style={{ willChange: 'transform, opacity' }}
            onClick={(event) => event.stopPropagation()}
          >
            <motion.button
              type='button'
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className='absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white/80 transition-colors hover:text-white'
              aria-label='Close detail dialog'
              whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
            >
              <X size={18} />
            </motion.button>

            <motion.div
              className='absolute inset-0'
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 1.04 }}
              animate={
                shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }
              }
              transition={contentTransition}
            >
              {detail?.backdrop ? (
                <Image
                  src={safeImageUrl(detail.backdrop)}
                  alt={detail.title}
                  fill
                  className='object-cover opacity-30'
                />
              ) : null}
              <div className='absolute inset-0 bg-gradient-to-b from-black/20 via-zinc-950/85 to-zinc-950' />
            </motion.div>

            <motion.div
              className='relative max-h-[85vh] overflow-y-auto p-4 sm:p-6'
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
              transition={contentTransition}
            >
              {loading ? (
                <div className='grid animate-pulse gap-6 md:grid-cols-[220px,1fr]'>
                  <div className='mx-auto w-40 md:mx-0 md:w-full'>
                    <div className='aspect-[2/3] overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-xl' />
                    {showPosterTitle ? (
                      <div className='mx-auto mt-2 h-3 w-4/5 rounded bg-white/25' />
                    ) : null}
                  </div>

                  <div className='space-y-4'>
                    <div className='flex items-start gap-3'>
                      <div className='h-16 w-full max-w-[560px] rounded bg-white/30 sm:h-24' />
                      {favoriteTarget ? (
                        <div className='h-10 w-10 shrink-0 rounded-full border border-white/25 bg-white/10' />
                      ) : null}
                    </div>

                    <div className='flex flex-wrap items-center gap-3'>
                      <div className='h-5 w-[88px] rounded-full bg-white/20' />
                      <div className='h-5 w-[64px] rounded-full bg-white/30' />
                      <div className='h-5 w-[84px] rounded-full bg-white/30' />
                      <div className='h-5 w-[136px] rounded-full bg-white/30' />
                      <div className='h-5 w-[52px] rounded bg-white/30' />
                    </div>

                    <div className='flex flex-wrap gap-2'>
                      <div className='h-7 w-20 rounded-full bg-white/30' />
                      <div className='h-7 w-24 rounded-full bg-white/30' />
                    </div>

                    <div className='space-y-2'>
                      <div className='h-4 w-full rounded bg-white/30' />
                      <div className='h-4 w-[92%] rounded bg-white/25' />
                      <div className='h-4 w-[84%] rounded bg-white/25' />
                      <div className='h-4 w-[68%] rounded bg-white/20' />
                    </div>

                    <div className='flex flex-wrap items-center gap-4'>
                      <div className='h-4 w-[72px] rounded bg-white/25' />
                      <div className='h-4 w-[108px] rounded bg-white/25' />
                    </div>

                    <div className='space-y-2'>
                      <div className='h-4 w-[48px] rounded bg-white/25' />
                      <div className='flex flex-wrap gap-2'>
                        <div className='h-7 w-24 rounded-full bg-white/25' />
                        <div className='h-7 w-28 rounded-full bg-white/25' />
                        <div className='h-7 w-20 rounded-full bg-white/25' />
                      </div>
                    </div>

                    <div className='flex flex-wrap gap-3 pt-1'>
                      <div className='h-10 w-[120px] rounded-full bg-white/35' />
                      <div className='h-10 w-[104px] rounded-full bg-white/25' />
                    </div>
                  </div>
                </div>
              ) : null}

              {!loading && error ? (
                <div className='flex min-h-[320px] flex-col items-center justify-center gap-3 text-center'>
                  <p className='text-base font-medium text-white'>
                    {t('detail.failedToLoad')}
                  </p>
                  <p className='text-sm text-white/70'>{error}</p>
                  {onRetry ? (
                    <button
                      type='button'
                      onClick={(event) => {
                        event.stopPropagation();
                        onRetry();
                      }}
                      className='mt-2 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20'
                    >
                      {t('detail.retry')}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!loading && !error && detail ? (
                <div className='grid gap-6 md:grid-cols-[220px,1fr]'>
                  <div className='mx-auto w-40 md:mx-0 md:w-full'>
                    <div className='relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/20 shadow-xl'>
                      {detail.poster || detail.backdrop ? (
                        <Image
                          src={safeImageUrl(detail.poster || detail.backdrop)}
                          alt={detail.title}
                          fill
                          className='object-cover'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center bg-white/10 text-xs text-white/60'>
                          {t('common.noPoster')}
                        </div>
                      )}
                    </div>
                    {showPosterTitle ? (
                      <p className='mt-2 truncate text-center text-xs text-white/60'>
                        {detail.title}
                      </p>
                    ) : null}
                  </div>

                  <div className='space-y-4'>
                    <div className='flex items-start gap-3 pr-10 sm:pr-0'>
                      <div className='min-w-0 flex-1'>
                        {titleLogo ? (
                          <div className='relative h-16 w-full max-w-[560px] sm:h-24'>
                            <Image
                              src={safeImageUrl(titleLogo)}
                              alt={`${detail.title} logo`}
                              fill
                              className='object-contain object-left drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)]'
                            />
                          </div>
                        ) : (
                          <h3 className='text-2xl font-bold sm:text-3xl'>
                            {detail.title}
                          </h3>
                        )}
                      </div>

                      {favoriteTarget ? (
                        <button
                          type='button'
                          onClick={handleToggleFavorite}
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
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                            favorited
                              ? 'border-yellow-300/45 bg-yellow-400/15 text-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.24)]'
                              : 'border-white/25 bg-white/10 text-white/80 hover:border-yellow-300/60 hover:bg-yellow-400/15 hover:text-yellow-200'
                          }`}
                        >
                          <Bookmark
                            size={18}
                            fill={favorited ? 'currentColor' : 'none'}
                          />
                        </button>
                      ) : null}
                    </div>

                    <div className='flex flex-wrap items-center gap-3 text-sm text-white/90'>
                      {detail.score ? (
                        <span className='inline-flex items-center gap-1'>
                          <Star
                            size={15}
                            className='text-yellow-400'
                            fill='currentColor'
                          />
                          <span className='font-semibold'>{detail.score}</span>
                          {detail.voteCount > 0 ? (
                            <span className='text-white/65'>
                              ({detail.voteCount})
                            </span>
                          ) : null}
                        </span>
                      ) : null}

                      {detail.year ? (
                        <span className='inline-flex items-center gap-1 text-white/80'>
                          <CalendarDays size={14} />
                          {detail.year}
                        </span>
                      ) : null}

                      {detail.runtime ? (
                        <span className='inline-flex items-center gap-1 text-white/80'>
                          <Clock3 size={14} />
                          {formatRuntime(detail.runtime)}
                        </span>
                      ) : null}

                      {detail.mediaType === 'tv' &&
                      detail.seasons &&
                      detail.episodes ? (
                        <span className='inline-flex items-center gap-1 text-white/80'>
                          <Users size={14} />
                          {t('hero.tvMeta', {
                            seasons: detail.seasons,
                            episodes: detail.episodes,
                          })}
                        </span>
                      ) : null}

                      {detail.contentRating ? (
                        <span className='rounded border border-white/35 px-1.5 py-0.5 text-[11px] font-medium text-white/95'>
                          {detail.contentRating}
                        </span>
                      ) : null}
                    </div>

                    {detail.genres.length > 0 ? (
                      <div className='flex flex-wrap gap-2'>
                        {detail.genres.map((genre) => (
                          <span
                            key={genre}
                            className='rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs text-white/90'
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <p className='text-sm leading-6 text-white/85 sm:text-base'>
                      {detail.overview}
                    </p>

                    <div className='flex flex-wrap items-center gap-4 text-xs text-white/70 sm:text-sm'>
                      {detail.language ? (
                        <span className='inline-flex items-center gap-1'>
                          <Globe2 size={14} />
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

                    {detail.cast.length > 0 ? (
                      <div className='space-y-2'>
                        <p className='text-sm font-semibold text-white/90'>
                          {t('detail.cast')}
                        </p>
                        <div className='flex flex-wrap gap-2'>
                          {detail.cast.slice(0, 8).map((person) => (
                            <Link
                              key={`${person.id}-${person.name}`}
                              href={`/person/${person.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className='rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs text-white/90 transition-colors hover:bg-white/20'
                            >
                              {person.name}
                              {person.character ? ` · ${person.character}` : ''}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className='flex flex-wrap gap-3 pt-1'>
                      {canPlay ? (
                        <button
                          type='button'
                          onClick={(event) => {
                            event.stopPropagation();
                            onClose();
                            onPlay();
                          }}
                          className={playButtonClassName}
                        >
                          <Play size={14} />
                          {resolvedPlayLabel}
                        </button>
                      ) : null}

                      {detail.trailerUrl ? (
                        <a
                          href={detail.trailerUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={(event) => event.stopPropagation()}
                          className='inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20'
                        >
                          <Info size={14} />
                          {t('common.trailer')}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
