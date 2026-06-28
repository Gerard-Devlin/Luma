'use client';

import { Star } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SearchResult } from '@/lib/types';
import { cn } from '@/lib/utils';

const TV_LABEL = 'Series';
const MOVIE_LABEL = 'Movie';
const UNKNOWN_LABEL = 'Unknown';
const EMPTY_RESULTS_TEXT = 'No matches found';
const META_SEPARATOR = '\u00b7';

interface SearchPreviewPanelProps {
  results: SearchResult[];
  loading: boolean;
  keyword: string;
  onItemClick: (item: SearchResult) => void;
  className?: string;
  contentClassName?: string;
  maxHeightClassName?: string;
  emptyText?: string;
  itemKeyPrefix?: string;
}

function getMediaLabel(item: SearchResult): string {
  if ((item.type_name || '').trim().toLowerCase() === 'tv') return TV_LABEL;
  return MOVIE_LABEL;
}

function renderHighlightedText(text: string, keyword: string): ReactNode {
  const target = text || '';
  const query = keyword.trim();
  if (!query) return target;

  const lowerTarget = target.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const firstMatch = lowerTarget.indexOf(lowerQuery);
  if (firstMatch < 0) return target;

  const before = target.slice(0, firstMatch);
  const hit = target.slice(firstMatch, firstMatch + query.length);
  const after = target.slice(firstMatch + query.length);

  return (
    <>
      {before}
      <mark className='rounded-[4px] bg-[var(--ui-glass-row-hover)] px-0.5 text-zinc-50 ring-1 ring-[var(--ui-glass-border)]'>
        {hit}
      </mark>
      {after}
    </>
  );
}

export default function SearchPreviewPanel({
  results,
  loading,
  keyword,
  onItemClick,
  className,
  contentClassName,
  maxHeightClassName = 'max-h-[420px]',
  emptyText = EMPTY_RESULTS_TEXT,
  itemKeyPrefix = 'search-preview',
}: SearchPreviewPanelProps) {
  return (
    <div className={cn('ui-glass-panel overflow-hidden p-2', className)}>
      <div
        className={cn(maxHeightClassName, 'overflow-y-auto', contentClassName)}
      >
        {loading ? (
          <div className='space-y-1.5 py-1'>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`${itemKeyPrefix}-skeleton-${index}`}
                className='flex items-center gap-2.5 rounded-[var(--ui-radius-row)] px-2 py-2'
              >
                <div className='h-16 w-11 shrink-0 animate-pulse rounded-md bg-[var(--ui-glass-row-hover)]' />
                <div className='min-w-0 flex-1 space-y-2'>
                  <div className='h-4 w-2/3 animate-pulse rounded bg-[var(--ui-glass-row-hover)]' />
                  <div className='h-3 w-1/2 animate-pulse rounded bg-[var(--ui-glass-row-hover)]' />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          results.map((item, index) => {
            const year =
              item.year && item.year !== 'unknown' ? item.year : UNKNOWN_LABEL;
            const score =
              item.score && item.score.trim() ? item.score.trim() : '--';

            return (
              <button
                key={`${itemKeyPrefix}-${item.source}-${item.id}-${index}`}
                type='button'
                onClick={() => onItemClick(item)}
                className='ui-glass-row group flex w-full items-center gap-2.5 px-2 py-2 text-left'
              >
                <img
                  src={item.poster}
                  alt={item.title}
                  className='h-16 w-11 shrink-0 rounded-md object-cover ring-1 ring-[var(--ui-glass-border)]'
                  loading='lazy'
                  decoding='async'
                  referrerPolicy='no-referrer'
                />
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium text-zinc-100'>
                    {renderHighlightedText(item.title, keyword)}
                  </p>
                  <div className='mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400'>
                    <span className='truncate'>{getMediaLabel(item)}</span>
                    <span className='text-zinc-500'>{META_SEPARATOR}</span>
                    <Star
                      className='h-3.5 w-3.5 shrink-0 text-yellow-400'
                      fill='currentColor'
                    />
                    <span className='truncate'>{score}</span>
                    <span className='text-zinc-500'>{META_SEPARATOR}</span>
                    <span className='truncate'>{year}</span>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className='px-4 py-6 text-center text-sm text-zinc-400'>
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
