/* eslint-disable @next/next/no-img-element */

import { Star } from 'lucide-react';

interface PosterInfoCardProps {
  title: string;
  poster?: string;
  year?: string;
  subtitle?: string;
  rating?: string;
  overlay?: React.ReactNode;
  variant?: 'detail' | 'listing';
  onImageLoaded?: () => void;
  className?: string;
}

export default function PosterInfoCard({
  title,
  poster,
  year,
  subtitle,
  rating,
  overlay,
  variant = 'detail',
  onImageLoaded,
  className = '',
}: PosterInfoCardProps) {
  const isListing = variant === 'listing';
  const ratingClassName = isListing
    ? 'absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-amber-300 backdrop-blur'
    : 'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur';
  const starClassName = isListing ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';
  const titleClassName = isListing
    ? 'line-clamp-2 text-base font-semibold leading-5 text-white'
    : 'line-clamp-2 text-xs font-medium leading-4 text-white';
  const yearClassName = isListing
    ? 'mt-1 text-sm leading-5 text-white/50'
    : 'mt-0.5 text-[11px] leading-4 text-white/50';

  return (
    <div className={`w-full ${className}`}>
      <div className='relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/10'>
        {poster ? (
          <img
            src={poster}
            alt={title}
            className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
            referrerPolicy='no-referrer'
            onLoad={onImageLoaded}
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center px-2 text-center text-[11px] text-white/50'>
            No poster
          </div>
        )}
        {rating ? (
          <div className={ratingClassName}>
            <Star className={starClassName} fill='currentColor' />
            {rating}
          </div>
        ) : null}
        {overlay}
      </div>

      <div className={isListing ? 'mt-3 h-16' : 'mt-2 h-14'}>
        <p className={titleClassName}>{title}</p>
        <p className={yearClassName}>{subtitle || year || 'Unknown year'}</p>
      </div>
    </div>
  );
}
