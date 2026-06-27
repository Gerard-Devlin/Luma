/* eslint-disable no-console */
'use client';

import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  deletePlayRecord,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  buildTmdbHistoryPlayUrl,
  filterTmdbHistoryRecords,
  formatTmdbHistorySubtitle,
  parseStorageKey,
} from '@/lib/tmdb-history';
import {
  glassDialogCancelClass,
  glassDialogContentClass,
  glassDialogDangerActionClass,
  glassDialogDescriptionClass,
} from '@/components/dialogStyles';
import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';
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
import WatchHistoryRailCard from '@/components/WatchHistoryRailCard';

interface ContinueWatchingProps {
  className?: string;
}

const LONG_PRESS_DURATION_MS = 420;

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const { showMatrixLoading, navigateWithMatrixLoading } =
    useMatrixRouteTransition();
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);

  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const recordsArray = Object.entries(filterTmdbHistoryRecords(allRecords)).map(
      ([key, record]) => ({
        ...record,
        key,
      })
    );

    const sortedRecords = recordsArray.sort((a, b) => b.save_time - a.save_time);
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
      <MatrixLoadingOverlay visible={showMatrixLoading} />
      <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          Continue Watching
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
                {`Delete (${selectedKeys.size})`}
              </button>
              <button
                type='button'
                className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                onClick={() => {
                  setIsBatchMode(false);
                  setSelectedKeys(new Set());
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => {
                navigateWithMatrixLoading('/my');
              }}
              className='group inline-flex items-center gap-2 text-base font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
            >
              <span>See All</span>
              <span className='text-2xl leading-none transition-transform duration-200 group-hover:translate-x-0.5'>
                ›
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
              return (
                <WatchHistoryRailCard
                  key={record.key}
                  title={record.title || record.search_title || 'Untitled'}
                  subtitle={formatTmdbHistorySubtitle(record.key, record)}
                  poster={record.cover}
                  progress={getProgress(record)}
                  selected={isSelected}
                  batchMode={isBatchMode}
                  onClick={() =>
                    navigateWithMatrixLoading(
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
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription className={glassDialogDescriptionClass}>
              {`This will delete ${selectedKeys.size} history item${
                selectedKeys.size === 1 ? '' : 's'
              }.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className={glassDialogCancelClass}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              className={glassDialogDangerActionClass}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </section>
    </>
  );
}
