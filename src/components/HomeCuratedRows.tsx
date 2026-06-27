'use client';

import Link from 'next/link';
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  buildCuratedCategoryQuery,
  CuratedCategoryConfig,
  HOME_CURATED_CATEGORY_CONFIGS,
} from '@/lib/curated-categories';
import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';
import ScrollableRow from '@/components/ScrollableRow';
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
}

const LOAD_BATCH_SIZE = 2;
const HOME_CURATED_ROWS = HOME_CURATED_CATEGORY_CONFIGS.filter(
  (row) => row.slug !== 'popular-movies'
);

interface CuratedRowSectionProps {
  row: CuratedCategoryConfig;
  onNavigateWithMatrixLoading: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string
  ) => void;
}

function CuratedRowSection({
  row,
  onNavigateWithMatrixLoading,
}: CuratedRowSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CuratedDiscoverItem[]>([]);
  const [isInView, setIsInView] = useState(false);
  const [hasRevealedItems, setHasRevealedItems] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/tmdb/discover?${buildCuratedCategoryQuery(row, 1).toString()}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as DiscoverApiResponse;
        if (!response.ok || payload.code !== 200) {
          throw new Error(payload.message || 'Failed to fetch curated row');
        }
        setItems(payload.list.slice(0, 12));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [row]);

  useEffect(() => {
    if (isInView) return;

    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setIsInView(true);
        observer.disconnect();
      },
      {
        rootMargin: '0px 0px -14% 0px',
        threshold: 0.12,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView]);

  useEffect(() => {
    if (!isInView || loading || items.length === 0 || hasRevealedItems) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setHasRevealedItems(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hasRevealedItems, isInView, items.length, loading]);

  const shouldHide = !loading && items.length === 0;
  if (shouldHide) {
    return null;
  }

  return (
    <section ref={sectionRef} className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-900 dark:text-zinc-100'>
          {row.title}
        </h2>
        <Link
          href={`/curated/${row.slug}`}
          onClick={(event) =>
            onNavigateWithMatrixLoading(event, `/curated/${row.slug}`)
          }
          className='group inline-flex items-center gap-2 text-base font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
        >
          <span>See All</span>
          <span className='text-2xl leading-none transition-transform duration-200 group-hover:translate-x-0.5'>
            ›
          </span>
        </Link>
      </div>

      <ScrollableRow>
        {loading
          ? Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`${row.slug}-skeleton-${index}`}
                className='min-w-[160px] w-40 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-white/10'>
                  <div className='skeleton-card-surface h-full w-full animate-pulse' />
                  <div className='absolute bottom-2.5 right-2.5 h-6 w-12 rounded-md bg-black/55' />
                </div>
                <div className='mt-3 h-16'>
                  <div className='h-4 w-28 animate-pulse rounded bg-white/15 sm:w-36' />
                  <div className='mt-2 h-3.5 w-12 animate-pulse rounded bg-white/10' />
                </div>
              </div>
            ))
          : items.map((item, index) => (
              <div
                key={`${row.slug}-${item.id}`}
                className={`min-w-[160px] w-40 transform-gpu transition-all duration-500 ease-out will-change-transform motion-reduce:transform-none motion-reduce:transition-none motion-reduce:opacity-100 sm:min-w-[180px] sm:w-44 ${
                  hasRevealedItems ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{
                  transitionDelay: hasRevealedItems ? `${Math.min(index, 11) * 55}ms` : '0ms',
                }}
              >
                <VideoCard
                  from='douban'
                  title={item.title}
                  poster={item.poster}
                  douban_id={item.id}
                  rate={item.rate}
                  year={item.year}
                  displayVariant='poster-info'
                  type={row.mediaType}
                />
              </div>
            ))}
      </ScrollableRow>
    </section>
  );
}

export default function HomeCuratedRows() {
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH_SIZE);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const { showMatrixLoading, navigateLinkWithMatrixLoading } =
    useMatrixRouteTransition();

  useEffect(() => {
    if (
      loadingMoreRows ||
      visibleCount >= HOME_CURATED_ROWS.length
    ) {
      return;
    }

    const node = loadMoreTriggerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setLoadingMoreRows(true);
        observer.disconnect();
      },
      {
        rootMargin: '0px 0px 220px 0px',
        threshold: 0,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadingMoreRows, visibleCount]);

  useEffect(() => {
    if (!loadingMoreRows) return;
    const timer = setTimeout(() => {
      setVisibleCount((prev) =>
        Math.min(prev + LOAD_BATCH_SIZE, HOME_CURATED_ROWS.length)
      );
      setLoadingMoreRows(false);
    }, 420);

    return () => clearTimeout(timer);
  }, [loadingMoreRows]);

  const hasMoreRows = visibleCount < HOME_CURATED_ROWS.length;

  return (
    <>
      <MatrixLoadingOverlay visible={showMatrixLoading} />

      <div className='mb-4'>
        {HOME_CURATED_ROWS.slice(0, visibleCount).map((row) => (
          <CuratedRowSection
            key={row.slug}
            row={row}
            onNavigateWithMatrixLoading={navigateLinkWithMatrixLoading}
          />
        ))}

        {hasMoreRows ? (
          <div
            ref={loadMoreTriggerRef}
            className='flex h-16 items-center justify-center'
          >
            {loadingMoreRows ? (
              <div className='inline-flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400'>
                <span className='h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-sky-500 dark:border-zinc-600 dark:border-t-sky-400' />
                {'Loading...'}
              </div>
            ) : (
              <span className='h-5 w-5 rounded-full border border-transparent' />
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
