'use client';

import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface SeasonPickerModalProps {
  open: boolean;
  title: string;
  logo?: string;
  backdrop?: string;
  seasonCount: number;
  onClose: () => void;
  onPickSeason: (season: number) => void;
}

function safeImageUrl(url?: string): string {
  const value = (url || '').trim();
  return value;
}

export default function SeasonPickerModal({
  open,
  title,
  logo,
  backdrop,
  seasonCount,
  onClose,
  onPickSeason,
}: SeasonPickerModalProps) {
  const normalizedTitle = (title || '').trim();
  const normalizedBackdrop = useMemo(() => safeImageUrl(backdrop), [backdrop]);
  const normalizedLogo = useMemo(() => safeImageUrl(logo), [logo]);
  const count = Math.max(1, Number.isFinite(seasonCount) ? Math.floor(seasonCount) : 1);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className='fixed inset-0 z-[900] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm'
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div
        role='dialog'
        aria-modal='false'
        aria-label='Choose a season to play'
        className='pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-black text-white shadow-2xl'
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className='absolute inset-0'>
          {normalizedBackdrop ? (
            <img
              src={normalizedBackdrop}
              alt={normalizedTitle}
              className='h-full w-full object-cover brightness-[0.36]'
            />
          ) : null}
          <div className='absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25 md:from-black/75 md:via-black/30 md:to-black/10' />
          <div className='absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/15 md:from-black/55 md:to-black/10' />
        </div>

        <div className='relative p-6'>
          <button
            type='button'
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className='absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-zinc-200 transition-colors hover:bg-black/70 hover:text-white'
            aria-label='Close season picker'
          >
            <X className='h-4 w-4' />
          </button>

          <div className='text-center sm:text-left'>
            <h3 className='text-lg font-semibold sm:pr-10'>Choose a season to play</h3>
            {normalizedLogo ? (
              <div className='relative mx-auto mt-2 h-14 w-full max-w-[360px] sm:mx-0 sm:h-16'>
                <img
                  src={normalizedLogo}
                  alt={`${normalizedTitle} logo`}
                  className='h-full w-full object-contain object-center drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)] sm:object-left'
                />
              </div>
            ) : (
              <p className='mt-2 text-sm text-zinc-300/90'>{normalizedTitle}</p>
            )}
          </div>

          <div className='mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto py-1 sm:grid-cols-4'>
            {Array.from({ length: count }, (_, idx) => idx + 1).map((season) => (
              <button
                key={`season-pick-${season}`}
                type='button'
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPickSeason(season);
                }}
                className='rounded-xl border border-zinc-200/30 bg-white/10 px-2 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/20'
              >
                {`Season ${season}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
