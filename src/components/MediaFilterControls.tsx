import type { ReactNode } from 'react';

export const MEDIA_RANGE_INPUT_CLASS =
  'pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#8C97A8] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#8C97A8]';

export function MediaFilterRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4'>
      <div className='flex items-center gap-1 text-base font-semibold text-gray-700 dark:text-gray-200 sm:w-40 sm:flex-shrink-0 sm:pt-1'>
        {icon}
        {label}
      </div>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
        {children}
      </div>
    </div>
  );
}

export function MediaFilterChip({
  active,
  danger = false,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? danger
            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-900/20 dark:text-rose-300'
            : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600/60 dark:bg-blue-900/20 dark:text-blue-300'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

export function MediaDualRange({
  min,
  max,
  step = 1,
  low,
  high,
  midpoint,
  onLowChange,
  onHighChange,
}: {
  min: number;
  max: number;
  step?: number;
  low: number;
  high: number;
  midpoint?: number;
  onLowChange: (value: number) => void;
  onHighChange: (value: number) => void;
}) {
  const span = Math.max(1, max - min);
  const left = ((low - min) / span) * 100;
  const right = 100 - ((high - min) / span) * 100;
  return (
    <div className='w-full'>
      <div className='mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300'>
        <span>{low}</span>
        <span>{high}</span>
      </div>
      <div className='relative h-8'>
        <div className='absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700' />
        <div
          className='absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#8C97A8]'
          style={{ left: `${left}%`, right: `${right}%` }}
        />
        <input
          aria-label='Minimum'
          type='range'
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(event) =>
            onLowChange(Math.min(Number(event.target.value), high))
          }
          className={`${MEDIA_RANGE_INPUT_CLASS} z-20`}
        />
        <input
          aria-label='Maximum'
          type='range'
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(event) =>
            onHighChange(Math.max(Number(event.target.value), low))
          }
          className={`${MEDIA_RANGE_INPUT_CLASS} z-30`}
        />
      </div>
      <div className='mt-1 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400'>
        <span>{min}</span>
        <span>{midpoint ?? (min + max) / 2}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
