'use client';

import { Search, X } from 'lucide-react';
import type {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface SearchGlassInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  inputRef?: RefObject<HTMLInputElement>;
  inputId?: string;
  placeholder?: string;
  active?: boolean;
  variant?: 'desktop' | 'mobile';
  className?: string;
  onFocus?: () => void;
  onInputKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onClear: () => void;
  onShortcutClick: () => void;
  clearLabel?: string;
  shortcutLabel?: string;
}

export default function SearchGlassInput({
  value,
  onValueChange,
  onSubmit,
  inputRef,
  inputId,
  placeholder,
  active = false,
  variant = 'desktop',
  className,
  onFocus,
  onInputKeyDown,
  onClear,
  onShortcutClick,
  clearLabel,
  shortcutLabel,
}: SearchGlassInputProps) {
  const { t } = useTranslation();
  const isMobile = variant === 'mobile';
  const inputPlaceholder = placeholder || t('common.searchPlaceholder');
  const inputClearLabel = clearLabel || t('common.clearSearch');
  const inputShortcutLabel = shortcutLabel || t('common.focusSearch');

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'ui-glass-pill m-0 flex items-center px-3 text-sm text-gray-200 focus-within:border-[var(--ui-glass-border-strong)] focus-within:bg-[var(--ui-glass-panel-bg)] focus-within:shadow-[var(--ui-shadow-panel)]',
        active && 'ui-glass-control-active shadow-[var(--ui-shadow-panel)]',
        isMobile ? 'h-12 px-3.5' : 'h-11',
        className
      )}
    >
      <Search
        className={cn(
          'shrink-0 text-gray-400',
          isMobile ? 'h-[18px] w-[18px] text-gray-300' : 'h-4 w-4'
        )}
      />
      <input
        id={inputId}
        ref={inputRef}
        type='text'
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onKeyDown={onInputKeyDown}
        placeholder={inputPlaceholder}
        className={cn(
          'h-full w-full appearance-none border-0 bg-transparent text-gray-100 placeholder:text-gray-400 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
          isMobile ? 'px-2.5 text-[15px]' : 'px-2 text-sm'
        )}
      />
      {value.trim() ? (
        <button
          type='button'
          onClick={onClear}
          aria-label={inputClearLabel}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[var(--ui-glass-row-hover)] hover:text-gray-200',
            isMobile ? 'h-7 w-7' : 'h-6 w-6'
          )}
        >
          <X className='h-4 w-4' />
        </button>
      ) : (
        <button
          type='button'
          onClick={onShortcutClick}
          aria-label={inputShortcutLabel}
          className='ui-glass-shortcut inline-flex h-6 shrink-0 items-center gap-0.5 px-1.5 text-[10px] font-medium'
        >
          <span className='text-[9px] leading-none'>&#8984;</span>
          <span className='leading-none'>K</span>
        </button>
      )}
    </form>
  );
}
