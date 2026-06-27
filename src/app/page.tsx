/* eslint-disable react-hooks/exhaustive-deps, no-console */

'use client';

import { ShieldAlert } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';

import ContinueWatching from '@/components/ContinueWatching';
import HomeCuratedRows from '@/components/HomeCuratedRows';
import HomeRecommendedHero from '@/components/HomeRecommendedHero';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import TopRatedRankedRows from '@/components/TopRatedRankedRows';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function splitAnnouncementParagraphs(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];

  if (normalized.includes('\n')) {
    return normalized
      .split(/\n{2,}|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const sentences =
    normalized.match(/[^\u3002\uff01\uff1f.!?]+[\u3002\uff01\uff1f.!?]?/g) ||
    [normalized];
  if (sentences.length <= 2) return [normalized];

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(''));
  }
  return paragraphs;
}

function HomeClient() {
  const { announcement } = useSite();
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  const handleCloseAnnouncement = (value: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', value);
  };

  return (
    <PageLayout showDesktopTopSearch disableMobileTopPadding>
      <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
        <div className='px-2 sm:px-0'>
          <HomeRecommendedHero />
        </div>

        <div className='mt-8 px-4 sm:px-0'>
          <ContinueWatching />
          <TopRatedRankedRows />
          <HomeCuratedRows />
        </div>
      </div>

      {announcement && (
        <AlertDialog
          open={showAnnouncement}
          onOpenChange={(open) => {
            if (!open) handleCloseAnnouncement(announcement);
          }}
        >
          <AlertDialogContent className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'>
            <AlertDialogHeader className='space-y-3'>
              <div className='flex items-center gap-3'>
                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-500'>
                  <ShieldAlert className='h-5 w-5' />
                </span>
                <AlertDialogTitle className='text-xl text-zinc-900 dark:text-zinc-100'>
                  {'Disclaimer'}
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className='max-h-[46vh] space-y-3 overflow-y-auto pr-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300'>
                {splitAnnouncementParagraphs(announcement).map(
                  (paragraph, index) => (
                    <p key={`announcement-${index}`}>{paragraph}</p>
                  )
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className='mt-2'>
              <AlertDialogAction
                onClick={() => handleCloseAnnouncement(announcement)}
                className='w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
              >
                {'I understand'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
