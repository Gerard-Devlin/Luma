'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock3, Loader2, Play, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PlayRecord } from '@/lib/db.client';
import {
  deletePlayRecord,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  type TmdbDetailMediaType,
  fetchTmdbDetailWithClientCache,
} from '@/lib/tmdb-detail.client';
import {
  buildTmdbHistoryPlayUrl,
  filterTmdbHistoryRecords,
  parseStorageKey,
  parseTmdbStorageId,
} from '@/lib/tmdb-history';
import { useWarpRouteTransition } from '@/hooks/useWarpRouteTransition';

import {
  glassDialogCancelClass,
  glassDialogContentClass,
  glassDialogDangerActionClass,
  glassDialogDescriptionClass,
} from '@/components/dialogStyles';
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
import WarpLoadingOverlay from '@/components/WarpLoadingOverlay';

import { getCurrentTmdbLanguage } from '@/i18n/client';

interface PlayHistoryItem extends PlayRecord {
  key: string;
}

interface LocalizedHistoryDisplay {
  title?: string;
  poster?: string;
}

interface LocalizedHistoryDetail {
  title?: string | null;
  poster?: string | null;
}

const HISTORY_LIMIT = 12;
const localizedHistoryPending = new Set<string>();

function inferTmdbMediaType(record: PlayHistoryItem): TmdbDetailMediaType {
  const { id } = parseStorageKey(record.key);
  const parsed = parseTmdbStorageId(id);
  if (parsed && parsed.season !== null) return 'tv';
  return record.total_episodes && record.total_episodes > 1 ? 'tv' : 'movie';
}

function getTmdbNumericId(record: PlayHistoryItem): string {
  const { source, id } = parseStorageKey(record.key);
  if (source !== 'tmdb') return '';
  return parseTmdbStorageId(id)?.tmdbId || (/^\d+$/.test(id) ? id : '');
}

function formatRelativeTime(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return t('time.justNow');
  if (diff < 60 * 60 * 1000) {
    return t('time.minutesAgo', { count: Math.floor(diff / (60 * 1000)) });
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return t('time.hoursAgo', { count: Math.floor(diff / (60 * 60 * 1000)) });
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return t('time.daysAgo', {
      count: Math.floor(diff / (24 * 60 * 60 * 1000)),
    });
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function formatProgress(
  record: PlayHistoryItem,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const totalEpisodes = Math.max(0, Number(record.total_episodes || 0));
  const currentEpisode = Math.max(0, Number(record.index || 0));
  if (totalEpisodes > 1) {
    if (currentEpisode > 0) {
      return `${t('common.episode', {
        count: Math.min(currentEpisode, totalEpisodes),
      })} / ${totalEpisodes}`;
    }
    return t('common.episodes', { count: totalEpisodes });
  }

  const totalTime = Math.max(0, Number(record.total_time || 0));
  const playTime = Math.max(0, Number(record.play_time || 0));
  if (totalTime > 0 && playTime > 0) {
    const percent = Math.round((playTime / totalTime) * 100);
    return `${t('common.progress')} ${Math.min(100, percent)}%`;
  }

  return t('common.movie');
}

function buildPlayUrl(record: PlayHistoryItem): string {
  return buildTmdbHistoryPlayUrl(record.key, record);
}

export default function DesktopTopHistory() {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { showWarpLoading, navigateWithWarpLoading } = useWarpRouteTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlayHistoryItem | null>(
    null
  );
  const [items, setItems] = useState<PlayHistoryItem[]>([]);
  const [localizedDisplayByKey, setLocalizedDisplayByKey] = useState<
    Record<string, LocalizedHistoryDisplay>
  >({});
  const tmdbLanguage = getCurrentTmdbLanguage();

  const updateRecords = useCallback((records: Record<string, PlayRecord>) => {
    const sorted = Object.entries(filterTmdbHistoryRecords(records))
      .map(([key, record]) => ({
        ...record,
        key,
      }))
      .sort((a, b) => b.save_time - a.save_time);
    setItems(sorted);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const records = await getAllPlayRecords();
        if (!alive) return;
        updateRecords(records);
      } catch {
        if (alive) {
          setItems([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void load();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (records: Record<string, PlayRecord>) => {
        updateRecords(records);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [updateRecords]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const displayItems = items.slice(0, HISTORY_LIMIT);

  useEffect(() => {
    const targets = displayItems.filter((item) => {
      const pendingKey = `${tmdbLanguage}:${item.key}`;
      if (localizedDisplayByKey[pendingKey]) return false;
      return !localizedHistoryPending.has(pendingKey);
    });
    if (!targets.length) return;

    let cancelled = false;
    targets.forEach((item) => {
      localizedHistoryPending.add(`${tmdbLanguage}:${item.key}`);
    });

    const run = async () => {
      const settled = await Promise.allSettled(
        targets.map(async (item) => {
          try {
            const tmdbId = getTmdbNumericId(item);
            const detail =
              await fetchTmdbDetailWithClientCache<LocalizedHistoryDetail>({
                id: tmdbId || undefined,
                title: tmdbId
                  ? undefined
                  : item.search_title || item.title || undefined,
                mediaType: inferTmdbMediaType(item),
                year: item.year,
                poster: item.cover,
                tmdbLanguage,
              });
            return [
              `${tmdbLanguage}:${item.key}`,
              {
                title: (detail.title || '').trim(),
                poster: (detail.poster || '').trim(),
              },
            ] as const;
          } catch {
            return null;
          } finally {
            localizedHistoryPending.delete(`${tmdbLanguage}:${item.key}`);
          }
        })
      );

      if (cancelled) return;
      setLocalizedDisplayByKey((prev) => {
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
  }, [displayItems, i18n.language, localizedDisplayByKey, tmdbLanguage]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const { source, id } = parseStorageKey(deleteTarget.key);
    if (!source || !id) {
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      await deletePlayRecord(source, id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleNavigateWithWarpLoading = useCallback(
    (href: string) => {
      navigateWithWarpLoading(href, {
        onBeforeNavigate: () => {
          setOpen(false);
        },
      });
    },
    [navigateWithWarpLoading]
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const handlePointerEnter = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handlePointerLeave = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }, [clearCloseTimer]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  return (
    <div
      ref={rootRef}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      className='relative m-0'
    >
      <WarpLoadingOverlay visible={showWarpLoading} />

      <button
        type='button'
        onClick={() => {
          clearCloseTimer();
          setOpen((prev) => !prev);
        }}
        onFocus={handlePointerEnter}
        aria-label={t('common.watchHistory')}
        className={`ui-glass-control inline-flex h-11 w-11 items-center justify-center ${
          open ? 'ui-glass-control-active' : ''
        }`}
      >
        <Clock3 className='h-5 w-5 shrink-0' />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            key='desktop-top-history-panel'
            className='ui-glass-panel absolute right-0 z-40 mt-2 w-[min(92vw,390px)] overflow-hidden p-2'
            style={{ originX: 0.93, originY: 0 }}
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.88, y: -8, filter: 'blur(8px)' }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9, y: -6, filter: 'blur(6px)' }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 520,
                    damping: 38,
                    mass: 0.7,
                  }
            }
          >
            <div className='flex items-center justify-between border-b border-[var(--ui-glass-divider)] px-2.5 pb-2.5 pt-1.5'>
              <div className='flex items-center gap-2 text-sm font-semibold text-zinc-100'>
                <Clock3 className='h-4 w-4 text-zinc-300' />
                <span>{t('common.watchHistory')}</span>
              </div>
              <button
                type='button'
                onClick={() => handleNavigateWithWarpLoading('/my')}
                className='text-xs text-zinc-300 transition-colors hover:text-white'
              >
                {t('common.viewAll')}
              </button>
            </div>

            <div className='max-h-[440px] overflow-y-auto pt-1.5'>
              {loading ? (
                <div className='space-y-1.5 py-1'>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`desktop-top-history-skeleton-${index}`}
                      className='flex items-center gap-3 rounded-[var(--ui-radius-row)] px-2 py-2'
                    >
                      <div className='h-16 w-11 shrink-0 animate-pulse rounded-md bg-[var(--ui-glass-row-hover)]' />
                      <div className='min-w-0 flex-1 space-y-2'>
                        <div className='h-4 w-2/3 animate-pulse rounded bg-[var(--ui-glass-row-hover)]' />
                        <div className='h-3 w-1/2 animate-pulse rounded bg-[var(--ui-glass-row-hover)]' />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayItems.length > 0 ? (
                displayItems.map((item, index) => {
                  const localizedDisplay =
                    localizedDisplayByKey[`${tmdbLanguage}:${item.key}`];
                  const displayTitle =
                    localizedDisplay?.title ||
                    item.title ||
                    t('common.untitled');
                  const displayPoster = localizedDisplay?.poster || item.cover;
                  return (
                    <div
                      key={item.key}
                      className='ui-glass-row group flex items-center gap-2.5 px-2 py-2'
                    >
                      <button
                        type='button'
                        onClick={() => {
                          setOpen(false);
                          router.push(buildPlayUrl(item));
                        }}
                        className='flex min-w-0 flex-1 items-center gap-2.5 text-left'
                      >
                        <Image
                          src={displayPoster}
                          alt={displayTitle}
                          width={44}
                          height={64}
                          unoptimized
                          className='h-16 w-11 shrink-0 rounded-md object-cover ring-1 ring-[var(--ui-glass-border)]'
                          loading={index < 3 ? 'eager' : 'lazy'}
                          referrerPolicy='no-referrer'
                        />
                        <div className='min-w-0'>
                          <p className='truncate text-sm font-medium text-zinc-100'>
                            {displayTitle}
                          </p>
                          <div className='mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400'>
                            <Play className='h-3.5 w-3.5 shrink-0 text-zinc-500' />
                            <span className='truncate'>
                              {formatProgress(item, t)}
                            </span>
                            <span className='text-zinc-500'>·</span>
                            <span className='truncate'>
                              {formatRelativeTime(item.save_time, t)}
                            </span>
                          </div>
                        </div>
                      </button>

                      <button
                        type='button'
                        aria-label={t('common.deleteHistoryItem')}
                        disabled={deleting}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteTarget(item);
                        }}
                        className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-colors hover:bg-[var(--ui-glass-row-hover)] hover:text-red-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:text-zinc-600'
                      >
                        {deleting && deleteTarget?.key === item.key ? (
                          <Loader2 className='h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Trash2 className='h-3.5 w-3.5' />
                        )}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className='px-4 py-8 text-center text-sm text-zinc-400'>
                  {t('common.noHistoryYet')}
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className={glassDialogContentClass}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('home.deleteThisItem')}</AlertDialogTitle>
            <AlertDialogDescription className={glassDialogDescriptionClass}>
              {t('home.deleteWatchHistoryItem')}
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
    </div>
  );
}
