'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildCuratedCategoryQuery,
  CuratedCategoryConfig,
  getCuratedCategoryBySlug,
} from '@/lib/curated-categories';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface CuratedDiscoverItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: CuratedDiscoverItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

export default function CuratedPageClient() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || '';

  const config = useMemo<CuratedCategoryConfig | null>(() => {
    if (!slug) return null;
    return getCuratedCategoryBySlug(slug);
  }, [slug]);

  const [items, setItems] = useState<CuratedDiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      if (!config) return;
      const isInitial = page === 1 && !append;

      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError(null);

        let response = await fetch(
          `/api/tmdb/discover?${buildCuratedCategoryQuery(config, page, false).toString()}`
        );
        let payload = (await response.json()) as DiscoverApiResponse;

        if (
          isInitial &&
          config.fallbackQuery &&
          response.ok &&
          payload.code === 200 &&
          payload.list.length === 0
        ) {
          response = await fetch(
            `/api/tmdb/discover?${buildCuratedCategoryQuery(config, page, true).toString()}`
          );
          payload = (await response.json()) as DiscoverApiResponse;
        }

        if (!response.ok || payload.code !== 200) {
          throw new Error(payload.message || 'Failed to load');
        }

        setItems((prev) => (append ? [...prev, ...payload.list] : payload.list));
        setCurrentPage(payload.page || page);
        setHasMore((payload.page || page) < (payload.total_pages || 1));
      } catch (err) {
        if (!append) {
          setItems([]);
          setHasMore(false);
        }
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [config]
  );

  useEffect(() => {
    if (!config) return;
    void fetchPage(1, false);
  }, [config, fetchPage]);

  useEffect(() => {
    if (!config || !hasMore || loading || loadingMore) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void fetchPage(currentPage + 1, true);
      },
      { rootMargin: '0px 0px 180px 0px', threshold: 0.12 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [config, currentPage, fetchPage, hasMore, loading, loadingMore]);

  if (!config) {
    return (
      <PageLayout
        activePath='/curated'
        forceShowBackButton
        showDesktopTopSearch
      >
        <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
          <div className='px-4 pt-6 sm:px-0'>
            <div className='py-10 text-center text-zinc-500 dark:text-zinc-400'>
              {'Category not found'}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      activePath='/curated'
      forceShowBackButton
      showDesktopTopSearch
    >
      <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
        <div className='px-4 pt-3 sm:px-0 md:pt-24'>
          {loading ? (
            <div className='grid grid-cols-2 justify-start gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={`curated-loading-${index}`} className='w-full'>
                  <div className='relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-white/10'>
                    <div className='skeleton-card-surface h-full w-full animate-pulse' />
                    <div className='absolute bottom-2.5 right-2.5 h-6 w-12 rounded-md bg-black/55' />
                  </div>
                  <div className='mt-3 h-16'>
                    <div className='h-4 w-28 animate-pulse rounded bg-white/15 sm:w-36' />
                    <div className='mt-2 h-3.5 w-12 animate-pulse rounded bg-white/10' />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && error ? (
            <div className='py-10 text-center text-zinc-500 dark:text-zinc-400'>
              {error}
            </div>
          ) : null}

          {!loading && !error ? (
            <>
              <div className='grid grid-cols-2 justify-start gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                {items.map((item) => (
                  <div key={`${item.id}-${item.title}`} className='w-full'>
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={item.rate}
                      year={item.year}
                      displayVariant='poster-info'
                      type={config.mediaType}
                    />
                  </div>
                ))}
              </div>

              {hasMore ? (
                <div ref={loadMoreRef} className='mt-10 flex justify-center py-6'>
                  {loadingMore ? (
                    <div className='inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400'>
                      <span className='h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-500 dark:border-zinc-600 dark:border-t-sky-400' />
                      {'Loading...'}
                    </div>
                  ) : (
                    <span className='h-5 w-5 rounded-full border border-transparent' />
                  )}
                </div>
              ) : (
                <div className='py-8 text-center text-zinc-500 dark:text-zinc-400'>
                  {'All items loaded'}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
