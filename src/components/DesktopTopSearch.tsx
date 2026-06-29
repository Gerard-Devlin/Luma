'use client';

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

interface SearchPayload {
  results?: SearchResult[];
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

export default function DesktopTopSearch() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const trimmedQuery = query.trim();
  const shouldShowDropdown =
    open && trimmedQuery.length > 0 && (isLoading || hasSearched);
  const isSearchActive = open || trimmedQuery.length > 0;

  const focusSearchInput = useCallback(() => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
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
  }, [i18n.language, trimmedQuery]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== 'k') return;

      event.preventDefault();
      focusSearchInput();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearchInput]);

  const goSearchPage = (keyword: string) => {
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword) return;
    router.push(`/search?q=${encodeURIComponent(normalizedKeyword)}`);
    setOpen(false);
  };

  const handleOpenDetail = useCallback(
    (result: SearchResult) => {
      const normalizedKeyword = normalizeKeyword(query);
      if (normalizedKeyword) {
        void addSearchHistory(normalizedKeyword);
      }
      setOpen(false);
      router.push(
        buildTmdbDetailPageUrl({
          title: result.title,
          mediaType: getMediaType(result),
          year: normalizeYear(result.year),
          poster: result.poster,
          score: result.score,
        })
      );
    },
    [query, router]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goSearchPage(trimmedQuery);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleClearQuery = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className='relative m-0'>
      <SearchGlassInput
        inputRef={inputRef}
        value={query}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          setOpen(true);
        }}
        onSubmit={handleSubmit}
        active={isSearchActive}
        className='w-[min(52vw,560px)] max-w-[calc(100vw-10rem)]'
        onFocus={() => setOpen(true)}
        onInputKeyDown={handleInputKeyDown}
        onClear={handleClearQuery}
        onShortcutClick={focusSearchInput}
      />

      {shouldShowDropdown ? (
        <SearchPreviewPanel
          className='absolute right-0 z-40 mt-2 w-full'
          results={results}
          loading={isLoading}
          keyword={trimmedQuery}
          onItemClick={handleOpenDetail}
          itemKeyPrefix='desktop-top-search'
        />
      ) : null}
    </div>
  );
}
