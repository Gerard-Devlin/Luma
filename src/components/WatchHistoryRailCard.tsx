'use client';

import { Check } from 'lucide-react';
import Image from 'next/image';
import { MouseEventHandler, PointerEventHandler } from 'react';
import { useTranslation } from 'react-i18next';

interface WatchHistoryRailCardProps {
  title: string;
  subtitle: string;
  poster?: string;
  progress?: number;
  selected?: boolean;
  batchMode?: boolean;
  onClick?: () => void;
  onToggleSelection?: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
  onClickCapture?: MouseEventHandler<HTMLButtonElement>;
}

export default function WatchHistoryRailCard({
  title,
  subtitle,
  poster,
  progress = 0,
  selected = false,
  batchMode = false,
  onClick,
  onToggleSelection,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onClickCapture,
}: WatchHistoryRailCardProps) {
  const { t } = useTranslation();
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const visibleProgress =
    clampedProgress > 0 ? Math.max(clampedProgress, 14) : 0;
  const showProgress = clampedProgress > 0;
  const rootClick = batchMode ? onToggleSelection : onClick;

  return (
    <button
      type='button'
      onClick={rootClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
      aria-pressed={batchMode ? selected : undefined}
      className='group flex w-[clamp(280px,24vw,520px)] shrink-0 flex-col text-left'
    >
      <div className='relative overflow-hidden rounded-[var(--ui-radius-card)] border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] shadow-[var(--ui-shadow-control)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--ui-glass-border-hover)] group-hover:bg-[var(--ui-glass-control-bg-hover)]'>
        <div className='relative aspect-[16/9] w-full'>
          {poster ? (
            <Image
              src={poster}
              alt={title}
              fill
              unoptimized
              className='object-cover transition-transform duration-500 group-hover:scale-[1.03]'
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center bg-zinc-900 text-sm text-zinc-500'>
              {t('common.noImage')}
            </div>
          )}
          <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/18 to-transparent' />
          {showProgress ? (
            <div className='absolute bottom-3 left-1/2 h-1.5 w-[82%] -translate-x-1/2 overflow-hidden rounded-full bg-black/35 backdrop-blur-md'>
              <div
                className='h-full rounded-full bg-zinc-100/95'
                style={{ width: `${visibleProgress}%` }}
              />
            </div>
          ) : null}
          {batchMode ? (
            <div className='absolute inset-0 flex items-start justify-start p-2'>
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                  selected
                    ? 'border-[var(--ui-glass-border-hover)] bg-[var(--ui-glass-row-active)] text-white'
                    : 'border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] text-transparent'
                }`}
              >
                <Check className='h-3.5 w-3.5' />
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className='mt-2 space-y-0.5 px-0.5'>
        <p className='line-clamp-1 text-base font-semibold leading-6 text-zinc-100'>
          {title}
        </p>
        <p className='line-clamp-1 text-sm leading-5 text-zinc-400'>
          {subtitle}
        </p>
      </div>
    </button>
  );
}
