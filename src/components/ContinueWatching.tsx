/* eslint-disable no-console */
'use client';

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  formatTmdbHistorySubtitle,
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
import WatchHistoryRailCard from '@/components/WatchHistoryRailCard';

import { getCurrentTmdbLanguage } from '@/i18n/client';

interface ContinueWatchingProps {
  className?: string;
}

const LONG_PRESS_DURATION_MS = 420;
const HISTORY_BACKDROP_RESOLVE_CONCURRENCY = 3;

interface HistoryImageEntry {
  cacheKey: string;
  image: string;
  title: string;
}

interface HistoryTmdbDetail {
  backdrop?: string | null;
  title?: string | null;
}

const historyBackdropCache = new Map<string, HistoryImageEntry>();
const historyBackdropPending = new Map<string, Promise<HistoryImageEntry>>();

function inferTmdbMediaType(
  record: PlayRecord & { key: string }
): TmdbDetailMediaType {
  const { id } = parseStorageKey(record.key);
  const parsed = parseTmdbStorageId(id);
  if (parsed && parsed.season !== null) return 'tv';
  return record.total_episodes && record.total_episodes > 1 ? 'tv' : 'movie';
}

function getOppositeMediaType(
  mediaType: TmdbDetailMediaType
): TmdbDetailMediaType {
  return mediaType === 'movie' ? 'tv' : 'movie';
}

function buildHistoryBackdropCacheKey(
  record: PlayRecord & { key: string },
  tmdbLanguage: string
) {
  return [
    tmdbLanguage,
    record.key,
    record.title || '',
    record.search_title || '',
    record.year || '',
    record.total_episodes || 0,
    record.cover || '',
  ].join('|');
}

async function fetchHistoryBackdropByRequest(input: {
  id?: string;
  title?: string;
  mediaType: TmdbDetailMediaType;
  year?: string;
  poster?: string;
  tmdbLanguage: string;
}): Promise<HistoryImageEntry | null> {
  const detail = await fetchTmdbDetailWithClientCache<HistoryTmdbDetail>({
    id: input.id,
    title: input.title,
    mediaType: input.mediaType,
    year: input.year,
    poster: input.poster,
    tmdbLanguage: input.tmdbLanguage,
  });
  const image = (detail.backdrop || '').trim();
  const title = (detail.title || '').trim();
  return image || title ? { cacheKey: '', image, title } : null;
}

async function fetchHistoryBackdrop(
  record: PlayRecord & { key: string },
  tmdbLanguage: string
): Promise<HistoryImageEntry> {
  const fallbackImage = (record.cover || '').trim();
  const fallbackTitle = (record.title || record.search_title || '').trim();
  const title = (record.search_title || record.title || '').trim();
  const year = (record.year || '').trim();
  const mediaType = inferTmdbMediaType(record);
  const { source, id } = parseStorageKey(record.key);
  const parsedTmdbId = source === 'tmdb' ? parseTmdbStorageId(id)?.tmdbId : '';
  const numericTmdbId =
    parsedTmdbId || (source === 'tmdb' && /^\d+$/.test(id) ? id : '');
  const mediaTypes: TmdbDetailMediaType[] = [
    mediaType,
    getOppositeMediaType(mediaType),
  ];

  if (numericTmdbId) {
    for (const candidateType of mediaTypes) {
      try {
        const backdrop = await fetchHistoryBackdropByRequest({
          id: numericTmdbId,
          mediaType: candidateType,
          poster: fallbackImage,
          tmdbLanguage,
        });
        if (backdrop?.image || backdrop?.title) {
          return {
            cacheKey: '',
            image: backdrop.image || fallbackImage,
            title: backdrop.title || fallbackTitle,
          };
        }
      } catch {
        // Fall through to the next candidate.
      }
    }
  }

  if (title) {
    for (const candidateType of mediaTypes) {
      try {
        const backdrop = await fetchHistoryBackdropByRequest({
          title,
          mediaType: candidateType,
          year,
          poster: fallbackImage,
          tmdbLanguage,
        });
        if (backdrop?.image || backdrop?.title) {
          return {
            cacheKey: '',
            image: backdrop.image || fallbackImage,
            title: backdrop.title || fallbackTitle,
          };
        }
      } catch {
        // Keep the history rail resilient for unusual records.
      }
    }
  }

  return { cacheKey: '', image: fallbackImage, title: fallbackTitle };
}

function resolveHistoryBackdrop(
  record: PlayRecord & { key: string },
  tmdbLanguage: string
) {
  const cacheKey = buildHistoryBackdropCacheKey(record, tmdbLanguage);
  const cached = historyBackdropCache.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = historyBackdropPending.get(cacheKey);
  if (pending) return pending;

  const request = fetchHistoryBackdrop(record, tmdbLanguage)
    .then((entry) => {
      const nextEntry = { ...entry, cacheKey };
      historyBackdropCache.set(cacheKey, nextEntry);
      return nextEntry;
    })
    .catch(() => {
      const fallbackImage = (record.cover || '').trim();
      const fallbackTitle = (record.title || record.search_title || '').trim();
      const fallbackEntry = {
        cacheKey,
        image: fallbackImage,
        title: fallbackTitle,
      };
      historyBackdropCache.set(cacheKey, fallbackEntry);
      return fallbackEntry;
    })
    .finally(() => {
      historyBackdropPending.delete(cacheKey);
    });

  historyBackdropPending.set(cacheKey, request);
  return request;
}

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const { i18n, t } = useTranslation();
  const { showWarpLoading, navigateWithWarpLoading } = useWarpRouteTransition();
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [historyImageByKey, setHistoryImageByKey] = useState<
    Record<string, HistoryImageEntry>
  >({});
  const tmdbLanguage = getCurrentTmdbLanguage();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);

  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const recordsArray = Object.entries(
      filterTmdbHistoryRecords(allRecords)
    ).map(([key, record]) => ({
      ...record,
      key,
    }));

    const sortedRecords = recordsArray.sort(
      (a, b) => b.save_time - a.save_time
    );
    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('Failed to fetch play records:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchPlayRecords();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setSelectedKeys((prev) => {
      const validKeys = new Set(playRecords.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [playRecords]);

  useEffect(() => {
    let cancelled = false;
    const unresolvedRecords: (PlayRecord & { key: string })[] = [];
    const cachedEntries: Record<string, HistoryImageEntry> = {};

    for (const record of playRecords) {
      const cacheKey = buildHistoryBackdropCacheKey(record, tmdbLanguage);
      if (historyImageByKey[record.key]?.cacheKey === cacheKey) continue;

      const cachedEntry = historyBackdropCache.get(cacheKey);
      if (cachedEntry !== undefined) {
        cachedEntries[record.key] = cachedEntry;
        continue;
      }

      unresolvedRecords.push(record);
    }

    if (Object.keys(cachedEntries).length) {
      setHistoryImageByKey((prev) => ({ ...prev, ...cachedEntries }));
    }

    if (!unresolvedRecords.length) return;

    let nextIndex = 0;
    const workerCount = Math.min(
      HISTORY_BACKDROP_RESOLVE_CONCURRENCY,
      unresolvedRecords.length
    );

    const runWorker = async () => {
      while (!cancelled) {
        const record = unresolvedRecords[nextIndex];
        nextIndex += 1;
        if (!record) return;

        const cacheKey = buildHistoryBackdropCacheKey(record, tmdbLanguage);
        const entry = await resolveHistoryBackdrop(record, tmdbLanguage);
        if (cancelled) return;

        setHistoryImageByKey((prev) => {
          if (prev[record.key]?.cacheKey === cacheKey) return prev;
          return {
            ...prev,
            [record.key]: {
              cacheKey,
              image: entry.image,
              title: entry.title,
            },
          };
        });
      }
    };

    Array.from({ length: workerCount }).forEach(() => {
      void runWorker();
    });

    return () => {
      cancelled = true;
    };
  }, [historyImageByKey, i18n.language, playRecords, tmdbLanguage]);

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

  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsBatchMode(true);
        setSelectedKeys(new Set([key]));
        suppressCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isBatchMode]
  );

  const handleLongPressEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleCardClickCapture = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!suppressCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressCardClickRef.current = false;
    },
    []
  );

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const targets = playRecords.filter((item) => selectedKeys.has(item.key));
      await Promise.all(
        targets.map((item) => {
          const { source, id } = parseStorageKey(item.key);
          return deletePlayRecord(source, id);
        })
      );
      setPlayRecords((prev) =>
        prev.filter((item) => !selectedKeys.has(item.key))
      );
      setSelectedKeys(new Set());
      setIsBatchMode(false);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (!loading && playRecords.length === 0) {
    return null;
  }

  return (
    <>
      <WarpLoadingOverlay visible={showWarpLoading} />
      <section className={`mb-8 ${className || ''}`}>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
            {t('common.continueWatching')}
          </h2>
          {!loading && playRecords.length > 0 ? (
            isBatchMode ? (
              <div className='flex items-center gap-3'>
                <button
                  type='button'
                  className='text-sm text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-400'
                  disabled={selectedKeys.size === 0}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  {`${t('common.delete')} (${selectedKeys.size})`}
                </button>
                <button
                  type='button'
                  className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  onClick={() => {
                    setIsBatchMode(false);
                    setSelectedKeys(new Set());
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => {
                  navigateWithWarpLoading('/my');
                }}
                className='group inline-flex items-center gap-2 text-base font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
              >
                <span>{t('common.seeAll')}</span>
                <span className='text-2xl leading-none transition-transform duration-200 group-hover:translate-x-0.5'>
                  ?
                </span>
              </button>
            )
          ) : null}
        </div>
        <div className='-mx-1 overflow-x-auto pb-4 pt-1 scrollbar-hide'>
          <div className='flex min-w-max gap-5 px-1'>
            {loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className='w-[clamp(280px,24vw,520px)] shrink-0'
                  >
                    <div className='skeleton-card-surface relative aspect-[16/9] w-full overflow-hidden animate-pulse'></div>
                    <div className='skeleton-surface mt-2 h-4 rounded animate-pulse'></div>
                    <div className='skeleton-surface mt-1 h-3 rounded animate-pulse'></div>
                  </div>
                ))
              : playRecords.map((record) => {
                  const isSelected = selectedKeys.has(record.key);
                  const cacheKey = buildHistoryBackdropCacheKey(
                    record,
                    tmdbLanguage
                  );
                  const resolvedImage = historyImageByKey[record.key];
                  const title =
                    resolvedImage?.cacheKey === cacheKey && resolvedImage.title
                      ? resolvedImage.title
                      : record.title ||
                        record.search_title ||
                        t('common.untitled');
                  return (
                    <WatchHistoryRailCard
                      key={record.key}
                      title={title}
                      subtitle={formatTmdbHistorySubtitle(
                        record.key,
                        record,
                        t
                      )}
                      poster={
                        resolvedImage?.cacheKey === cacheKey
                          ? resolvedImage.image
                          : undefined
                      }
                      progress={getProgress(record)}
                      selected={isSelected}
                      batchMode={isBatchMode}
                      onClick={() =>
                        navigateWithWarpLoading(
                          buildTmdbHistoryPlayUrl(record.key, record)
                        )
                      }
                      onToggleSelection={() => toggleSelection(record.key)}
                      onPointerDown={(event) =>
                        handleLongPressStart(record.key, event.pointerType)
                      }
                      onPointerUp={handleLongPressEnd}
                      onPointerLeave={handleLongPressEnd}
                      onPointerCancel={handleLongPressEnd}
                      onClickCapture={handleCardClickCapture}
                    />
                  );
                })}
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className={glassDialogContentClass}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('common.deleteSelectedItems')}
              </AlertDialogTitle>
              <AlertDialogDescription className={glassDialogDescriptionClass}>
                {t('home.deleteHistoryDescription', {
                  count: selectedKeys.size,
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
      </section>
    </>
  );
}
