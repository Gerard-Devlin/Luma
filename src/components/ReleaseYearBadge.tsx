'use client';

import { CalendarDays } from 'lucide-react';

import { normalizeReleaseDate } from '@/lib/tmdbRelease';

interface ReleaseYearBadgeProps {
  year: string;
  releaseDate?: string | null;
  iconSize?: number;
  className?: string;
  iconClassName?: string;
  tooltipPlacement?: 'top' | 'bottom';
}

export default function ReleaseYearBadge({
  year,
  releaseDate,
  iconSize = 14,
  className = '',
  iconClassName = '',
  tooltipPlacement = 'top',
}: ReleaseYearBadgeProps) {
  if (!year) return null;

  const fullDate = normalizeReleaseDate(releaseDate);
  const tooltipClassName =
    tooltipPlacement === 'bottom'
      ? 'top-full mt-2'
      : 'bottom-full mb-2';
  const arrowClassName =
    tooltipPlacement === 'bottom'
      ? 'bottom-full border-b-4 border-b-gray-800'
      : 'top-full border-t-4 border-t-gray-800';

  return (
    <span
      className={`relative inline-flex items-center gap-1 ${className}`}
      title={fullDate || year}
    >
      <CalendarDays size={iconSize} className={iconClassName} />
      <span className='peer'>{year}</span>
      {fullDate ? (
        <span
          className={`pointer-events-none invisible absolute left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-3 py-1 text-xs text-white opacity-0 shadow-lg transition-all delay-100 duration-200 ease-out peer-hover:visible peer-hover:opacity-100 ${tooltipClassName}`}
        >
          {fullDate}
          <span
            className={`absolute left-1/2 h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-transparent ${arrowClassName}`}
          />
        </span>
      ) : null}
    </span>
  );
}
