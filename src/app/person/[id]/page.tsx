'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { processImageUrl } from '@/lib/utils';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';


interface PersonCredit {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;
  role: string;
  department?: string;
  score: string;
  overview: string;
  popularity: number;
}

interface PersonDetail {
  id: number;
  name: string;
  profile: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownForDepartment: string;
  biography: string;
  popularity: number;
  homepage: string;
  imdbId: string;
  credits: PersonCredit[];
}

interface CreditRailSection {
  key: string;
  title: string;
  items: PersonCredit[];
  showAllHref?: string;
}

const PRODUCER_ROLE_RE =
  /\b(executive producer|co-producer|associate producer|line producer|producer)\b|制片|监制|出品/i;
const DIRECTOR_ROLE_RE = /\b(series director|director)\b|导演/i;
const DIRECTOR_EXCLUDE_RE =
  /\b(art|photography|assistant|casting|music|voice|visual|stunt|production|unit)\s+director\b/i;

function normalizeRole(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function toCreditTimestamp(releaseDate?: string, year?: string): number {
  const normalizedDate = (releaseDate || '').trim();
  if (normalizedDate) {
    const timestamp = Date.parse(normalizedDate);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const normalizedYear = (year || '').trim();
  if (/^\d{4}$/.test(normalizedYear)) {
    return Date.UTC(Number(normalizedYear), 0, 1);
  }

  return 0;
}

function sortCredits(items: PersonCredit[]): PersonCredit[] {
  return [...items].sort((a, b) => {
    const dateDiff =
      toCreditTimestamp(b.releaseDate, b.year) -
      toCreditTimestamp(a.releaseDate, a.year);
    if (dateDiff !== 0) return dateDiff;
    const popularityDiff = b.popularity - a.popularity;
    if (popularityDiff !== 0) return popularityDiff;
    return b.id - a.id;
  });
}

function dedupeCreditsByMedia(items: PersonCredit[]): PersonCredit[] {
  const deduped = new Map<string, PersonCredit>();

  for (const item of items) {
    const key = `${item.mediaType}-${item.id}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const itemDate = toCreditTimestamp(item.releaseDate, item.year);
    const existingDate = toCreditTimestamp(existing.releaseDate, existing.year);
    if (itemDate > existingDate) {
      deduped.set(key, item);
      continue;
    }
    if (itemDate === existingDate && item.popularity > existing.popularity) {
      deduped.set(key, item);
    }
  }

  return sortCredits(Array.from(deduped.values()));
}

function isProducerCredit(item: PersonCredit): boolean {
  const role = normalizeRole(item.role);
  const department = normalizeRole(item.department);
  return PRODUCER_ROLE_RE.test(role) || /production|制片|制作/.test(department);
}

function isDirectorCredit(item: PersonCredit): boolean {
  const role = normalizeRole(item.role);
  const department = normalizeRole(item.department);

  if (role.includes('导演')) return true;
  if (DIRECTOR_EXCLUDE_RE.test(role)) return false;
  if (DIRECTOR_ROLE_RE.test(role)) return true;

  return /directing|导演/.test(department);
}

function CreditRail({ title, items, showAllHref }: CreditRailSection) {
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [desktopHovered, setDesktopHovered] = useState(false);

  const checkDesktopScroll = useCallback(() => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const { scrollWidth, clientWidth, scrollLeft } = node;
    const threshold = 1;
    setShowRightScroll(scrollWidth - (scrollLeft + clientWidth) > threshold);
    setShowLeftScroll(scrollLeft > threshold);
  }, []);

  useEffect(() => {
    checkDesktopScroll();
    window.addEventListener('resize', checkDesktopScroll);
    return () => {
      window.removeEventListener('resize', checkDesktopScroll);
    };
  }, [checkDesktopScroll, items]);

  const scrollDesktopBy = useCallback((direction: 'left' | 'right') => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const amount = Math.max(node.clientWidth * 0.9, 380);
    node.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  }, []);

  return (
    <section className='mb-11 sm:mb-14'>
      <div className='mb-3 flex items-center justify-between gap-4'>
        <h2 className='text-[1.05rem] font-semibold leading-none tracking-tight text-white sm:text-[1.2rem]'>
          {title}
        </h2>
        {showAllHref ? (
          <Link
            href={showAllHref}
            className='group inline-flex items-center gap-2 text-base font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
            aria-label={`View all ${title}`}
          >
            <span>See All</span>
            <span className='text-2xl leading-none transition-transform duration-200 group-hover:translate-x-0.5'>
              ›
            </span>
          </Link>
        ) : null}
      </div>

      <div
        className='relative hidden md:block'
        onMouseEnter={() => {
          setDesktopHovered(true);
          checkDesktopScroll();
        }}
        onMouseLeave={() => setDesktopHovered(false)}
      >
        <div
          ref={desktopScrollRef}
          className='-mx-1 overflow-x-auto pt-2 pb-2 scrollbar-hide'
          onScroll={checkDesktopScroll}
        >
          <div className='flex min-w-max gap-[18px] px-1'>
            {items.map((item, index) => (
              <div
                key={`${title}-${item.mediaType}-${item.id}-${item.role || 'role'}-${index}`}
                className='w-40 flex-shrink-0 sm:w-44'
              >
                <VideoCard
                  id={String(item.id)}
                  title={item.title}
                  poster={item.poster}
                  year={item.year}
                  rate={item.score}
                  from='douban'
                  displayVariant='poster-info'
                  type={item.mediaType}
                />
              </div>
            ))}
          </div>
        </div>

        {showLeftScroll ? (
          <div
            className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
              desktopHovered ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: 'transparent', pointerEvents: 'none' }}
          >
            <div
              className='absolute inset-0 flex items-center justify-center'
              style={{
                top: '40%',
                bottom: '60%',
                left: '-4.5rem',
                pointerEvents: 'auto',
              }}
            >
              <button
                type='button'
                onClick={() => scrollDesktopBy('left')}
                className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                aria-label='Scroll left'
              >
                <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
              </button>
            </div>
          </div>
        ) : null}

        {showRightScroll ? (
          <div
            className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
              desktopHovered ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: 'transparent', pointerEvents: 'none' }}
          >
            <div
              className='absolute inset-0 flex items-center justify-center'
              style={{
                top: '40%',
                bottom: '60%',
                right: '-4.5rem',
                pointerEvents: 'auto',
              }}
            >
              <button
                type='button'
                onClick={() => scrollDesktopBy('right')}
                className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                aria-label='Scroll right'
              >
                <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className='overflow-x-auto pt-2 pb-2 scrollbar-hide md:hidden'>
        <div className='flex min-w-max gap-[18px]'>
          {items.map((item, index) => (
            <div
              key={`${title}-mobile-${item.mediaType}-${item.id}-${item.role || 'role'}-${index}`}
              className='w-40 flex-shrink-0 sm:w-44'
            >
              <VideoCard
                id={String(item.id)}
                title={item.title}
                poster={item.poster}
                year={item.year}
                rate={item.score}
                from='douban'
                displayVariant='poster-info'
                type={item.mediaType}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PersonHeaderSkeleton() {
  return (
    <header className='mb-8 sm:mb-10'>
      <div className='flex items-center justify-center gap-2'>
        <span className='inline-flex h-8 w-8 animate-pulse rounded-full bg-zinc-700/80 sm:h-9 sm:w-9' />
        <span className='h-5 w-28 animate-pulse rounded bg-zinc-700/70 sm:h-6 sm:w-36' />
      </div>
    </header>
  );
}

function CreditCardSkeleton() {
  return (
    <div className='w-40 flex-shrink-0 sm:w-44'>
      <div className='animate-pulse'>
        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-white/10'>
          <div className='h-full w-full bg-zinc-800/80' />
          <div className='absolute bottom-2.5 right-2.5 h-6 w-12 rounded-md bg-black/55' />
        </div>
        <div className='mt-3 h-16'>
          <div className='h-4 w-28 rounded bg-white/15 sm:w-36' />
          <div className='mt-2 h-3.5 w-12 rounded bg-white/10' />
        </div>
      </div>
    </div>
  );
}

function RailSkeleton({
  title,
  showSeeAll = false,
}: {
  title: string;
  showSeeAll?: boolean;
}) {
  return (
    <section className='mb-11 sm:mb-14'>
      <div className='mb-3 flex items-center justify-between gap-4'>
        <h2 className='text-[1.05rem] font-semibold leading-none tracking-tight text-zinc-500 sm:text-[1.2rem]'>
          {title}
        </h2>
        {showSeeAll ? (
          <span className='inline-flex items-center gap-2 text-base font-semibold text-zinc-500 dark:text-zinc-300'>
            <span>See All</span>
            <span className='text-2xl leading-none'>›</span>
          </span>
        ) : null}
      </div>

      <div className='relative hidden md:block'>
        <div className='-mx-1 overflow-x-auto pt-2 pb-2 scrollbar-hide'>
          <div className='flex min-w-max gap-[18px] px-1'>
            {Array.from({ length: 12 }).map((_, index) => (
              <CreditCardSkeleton key={`${title}-desktop-skeleton-${index}`} />
            ))}
          </div>
        </div>
      </div>

      <div className='overflow-x-auto pt-2 pb-2 scrollbar-hide md:hidden'>
        <div className='flex min-w-max gap-[18px]'>
          {Array.from({ length: 6 }).map((_, index) => (
            <CreditCardSkeleton key={`${title}-mobile-skeleton-${index}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionGridSkeleton({ title }: { title: string }) {
  return (
    <section>
      <div className='mb-5 flex items-center gap-2'>
        <span className='h-4 w-8 animate-pulse rounded bg-zinc-700/70' />
        <span className='text-zinc-600'>/</span>
        <span className='h-6 w-20 animate-pulse rounded bg-zinc-700/70' />
        <span className='h-4 w-16 animate-pulse rounded bg-zinc-700/60' />
      </div>

      <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={`${title}-grid-skeleton-${index}`} className='w-full'>
            <div className='w-full animate-pulse'>
              <div className='relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-white/10'>
                <div className='h-full w-full bg-zinc-800/80' />
                <div className='absolute bottom-2.5 right-2.5 h-6 w-12 rounded-md bg-black/55' />
              </div>
              <div className='mt-3 h-16'>
                <div className='h-4 w-28 rounded bg-white/15 sm:w-36' />
                <div className='mt-2 h-3.5 w-12 rounded bg-white/10' />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    const idNum = Number(personId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setError('Invalid person id');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/tmdb/person/${idNum}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as PersonDetail & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load person detail');
        }

        setDetail(payload);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError((err as Error).message || 'Failed to load person detail');
      } finally {
        setLoading(false);
      }
    };

    void run();

    return () => controller.abort();
  }, [personId]);

  const movieCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(
      detail.credits.filter((item) => item.mediaType === 'movie')
    );
  }, [detail]);

  const showCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(
      detail.credits.filter((item) => item.mediaType === 'tv')
    );
  }, [detail]);

  const producerCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(detail.credits.filter(isProducerCredit));
  }, [detail]);

  const directorCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(detail.credits.filter(isDirectorCredit));
  }, [detail]);

  const selectedSection = useMemo(() => {
    const section = (searchParams.get('section') || '').trim().toLowerCase();
    if (section === 'movie' || section === 'tv') return section;
    return '';
  }, [searchParams]);

  const rails = useMemo<CreditRailSection[]>(() => {
    const list: CreditRailSection[] = [];
    if (movieCredits.length > 0) {
      list.push({
        key: 'movies',
        title: 'Movies',
        items: movieCredits,
        showAllHref: detail ? `/person/${detail.id}?section=movie` : undefined,
      });
    }
    if (showCredits.length > 0) {
      list.push({
        key: 'shows',
        title: 'Series',
        items: showCredits,
        showAllHref: detail ? `/person/${detail.id}?section=tv` : undefined,
      });
    }
    if (producerCredits.length > 0) {
      list.push({ key: 'producer', title: 'Producer', items: producerCredits });
    }
    if (directorCredits.length > 0) {
      list.push({ key: 'director', title: 'Director', items: directorCredits });
    }

    if (!list.length && detail?.credits?.length) {
      list.push({
        key: 'works',
        title: 'Works',
        items: dedupeCreditsByMedia(detail.credits),
      });
    }

    return list;
  }, [detail, directorCredits, movieCredits, producerCredits, showCredits]);

  const selectedSectionData = useMemo(() => {
    if (selectedSection === 'movie') {
      return {
        title: 'Movies',
        items: movieCredits,
      };
    }
    if (selectedSection === 'tv') {
      return {
        title: 'Series',
        items: showCredits,
      };
    }
    return null;
  }, [movieCredits, selectedSection, showCredits]);

  return (
    <PageLayout activePath='/search' forceShowBackButton>
      <div className='min-h-screen w-full bg-black text-white'>
        <div className='mx-auto w-full max-w-[1900px] px-4 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-6 md:px-10 md:pt-8'>
          {loading ? (
            <div className='space-y-2'>
              <PersonHeaderSkeleton />
              {selectedSection ? (
                <SectionGridSkeleton
                  title={selectedSection === 'movie' ? 'Movies' : 'Series'}
                />
              ) : (
                <>
                  <RailSkeleton title='Movies' showSeeAll />
                  <RailSkeleton title='Series' showSeeAll />
                  <RailSkeleton title='Producer' />
                </>
              )}
            </div>
          ) : error ? (
            <div className='rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-100'>
              {error}
            </div>
          ) : detail ? (
            <>
              <header className='mb-8 sm:mb-10'>
                <div className='flex items-center justify-center gap-2'>
                  <span className='relative inline-flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-zinc-800 text-xs font-medium text-zinc-200 sm:h-9 sm:w-9 sm:text-sm'>
                    {detail.profile ? (
                      <Image
                        src={processImageUrl(detail.profile)}
                        alt={detail.name}
                        fill
                        className='object-cover'
                        sizes='36px'
                        unoptimized
                      />
                    ) : (
                      detail.name.trim().slice(0, 1).toUpperCase() || '?'
                    )}
                  </span>
                  <h1 className='text-center text-[1rem] font-normal leading-none tracking-tight text-white sm:text-[1.12rem]'>
                    {detail.name}
                  </h1>
                </div>
              </header>

              {selectedSectionData ? (
                <section>
                  <div className='mb-5 flex items-center gap-2'>
                    <Link
                      href={`/person/${detail.id}`}
                      className='text-sm text-zinc-400 transition-colors hover:text-white'
                    >
                      Back
                    </Link>
                    <span className='text-zinc-600'>/</span>
                    <h2 className='text-[1.05rem] font-semibold text-white sm:text-[1.2rem]'>
                      All {selectedSectionData.title}
                    </h2>
                    <span className='text-xs text-zinc-400'>
                      {selectedSectionData.items.length} titles
                    </span>
                  </div>

                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {selectedSectionData.items.map((item, index) => (
                      <div
                        key={`${selectedSectionData.title}-all-${item.mediaType}-${item.id}-${index}`}
                      >
                        <VideoCard
                          id={String(item.id)}
                          title={item.title}
                          poster={item.poster}
                          year={item.year}
                          rate={item.score}
                          from='douban'
                          displayVariant='poster-info'
                          type={item.mediaType}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : rails.length > 0 ? (
                rails.map((section) => (
                  <CreditRail
                    key={section.key}
                    title={section.title}
                    items={section.items}
                    showAllHref={section.showAllHref}
                  />
                ))
              ) : (
                <div className='rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-zinc-300'>
                  No work information available.
                </div>
              )}
            </>
          ) : (
            <div className='rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-zinc-300'>
              This person was not found.
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
