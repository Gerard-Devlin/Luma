'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentTmdbLanguage } from '@/i18n/client';
import { addSearchHistory } from '@/lib/db.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import type { SearchResult } from '@/lib/types';

import SearchGlassInput from '@/components/SearchGlassInput';
import SearchPreviewPanel from '@/components/SearchPreviewPanel';

const SEARCH_DEBOUNCE_MS = 220;
const CLOSE_SEARCH_LABEL = 'Close search';
const SEARCH_PLACEHOLDER = 'Search ...';
const NO_RESULTS_TEXT = 'No matches found';

interface SearchPayload {
  results?: SearchResult[];
}

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

function getMediaType(item: SearchResult): 'movie' | 'tv' {
  if (item.type_name === 'tv') return 'tv';
  return 'movie';
}

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export default function MobileSearchOverlay({
  open,
  onClose,
}: MobileSearchOverlayProps) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const trimmedQuery = query.trim();
  const shouldShowResults =
    trimmedQuery.length > 0 && (isLoading || hasSearched);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    if (!trimmedQuery) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const response = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(
            trimmedQuery
          )}&tmdbLanguage=${encodeURIComponent(getCurrentTmdbLanguage())}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setResults([]);
          return;
        }
        const payload = (await response.json()) as SearchPayload;
        setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [i18n.language, open, trimmedQuery]);

  const handleClearQuery = useCallback(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  }, []);

  const goSearchPage = useCallback(
    (keyword: string) => {
      const normalizedKeyword = normalizeKeyword(keyword);
      if (!normalizedKeyword) return;
      void addSearchHistory(normalizedKeyword);
      onClose();
      router.push(`/search?q=${encodeURIComponent(normalizedKeyword)}`);
    },
    [onClose, router]
  );

  const handleOpenDetail = useCallback(
    (result: SearchResult) => {
      const normalizedKeyword = normalizeKeyword(query);
      if (normalizedKeyword) {
        void addSearchHistory(normalizedKeyword);
      }
      onClose();
      router.push(
        buildTmdbDetailPageUrl({
          id: result.source === 'tmdb' ? result.id : undefined,
          title: result.title,
          mediaType: getMediaType(result),
          year: normalizeYear(result.year),
          poster: result.poster,
          score: result.score,
        })
      );
    },
    [onClose, query, router]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goSearchPage(trimmedQuery);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key='mobile-search-backdrop'
            type='button'
            aria-label={CLOSE_SEARCH_LABEL}
            onClick={onClose}
            className='md:hidden fixed inset-0 z-[790] bg-[var(--ui-glass-overlay-bg)] backdrop-blur-md'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
          />

          <motion.div
            key='mobile-search-panel'
            className='md:hidden fixed left-3 right-3 z-[800]'
            style={{
              top: 'calc(env(safe-area-inset-top) + 6.75rem)',
              originX: 0.5,
              originY: 0,
            }}
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.94, y: -10, filter: 'blur(8px)' }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: -8, filter: 'blur(6px)' }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 480,
                    damping: 36,
                    mass: 0.72,
                  }
            }
          >
            <SearchGlassInput
              inputRef={inputRef}
              value={query}
              onValueChange={setQuery}
              onSubmit={handleSubmit}
              active
              variant='mobile'
              placeholder={SEARCH_PLACEHOLDER}
              onInputKeyDown={handleInputKeyDown}
              onClear={handleClearQuery}
              onShortcutClick={() => inputRef.current?.focus()}
            />

            {shouldShowResults ? (
              <SearchPreviewPanel
                className='mt-2 max-h-[min(58dvh,430px)]'
                maxHeightClassName='max-h-[min(58dvh,430px)]'
                results={results}
                loading={isLoading}
                keyword={trimmedQuery}
                onItemClick={handleOpenDetail}
                emptyText={NO_RESULTS_TEXT}
                itemKeyPrefix='mobile-search'
              />
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
