'use client';

import { Github, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  GITHUB_REPOSITORY_API_URL,
  GITHUB_REPOSITORY_URL,
} from '@/lib/project';
import { cn } from '@/lib/utils';

interface GitHubRepositoryResponse {
  stargazers_count?: number;
}

interface GitHubStarButtonProps {
  className?: string;
  fullWidth?: boolean;
  onClick?: () => void;
}

let cachedStarCount: number | null = null;
let starCountPromise: Promise<number | null> | null = null;

function formatStarCount(count: number) {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: count < 10_000 ? 1 : 0,
    notation: 'compact',
  }).format(count);

  return formatted.replace('K', 'k').replace('M', 'm');
}

async function fetchStarCount() {
  if (cachedStarCount !== null) return cachedStarCount;

  starCountPromise ??= fetch(GITHUB_REPOSITORY_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })
    .then(async (response) => {
      if (!response.ok) return null;

      const data = (await response.json()) as GitHubRepositoryResponse;
      if (typeof data.stargazers_count !== 'number') return null;

      cachedStarCount = data.stargazers_count;
      return cachedStarCount;
    })
    .catch(() => null)
    .finally(() => {
      starCountPromise = null;
    });

  return starCountPromise;
}

export default function GitHubStarButton({
  className,
  fullWidth = false,
  onClick,
}: GitHubStarButtonProps) {
  const { t } = useTranslation();
  const [starCount, setStarCount] = useState<number | null>(cachedStarCount);

  useEffect(() => {
    if (starCount !== null) return;

    let cancelled = false;
    void fetchStarCount().then((count) => {
      if (!cancelled && count !== null) {
        setStarCount(count);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [starCount]);

  return (
    <a
      href={GITHUB_REPOSITORY_URL}
      target='_blank'
      rel='noreferrer'
      aria-label={t('common.githubStar')}
      title={t('common.githubStar')}
      onClick={onClick}
      className={cn(
        'group flex h-9 w-fit min-w-[104px] items-center justify-center gap-2 rounded-[var(--ui-radius-row)] border border-zinc-200/80 bg-white px-3 text-zinc-950 shadow-[0_10px_30px_rgba(15,23,42,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-[0_14px_36px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:translate-y-0',
        fullWidth && 'w-auto self-stretch',
        className
      )}
    >
      <Github className='h-[18px] w-[18px] shrink-0 stroke-[2.2]' />
      <span className='min-w-8 text-center text-[15px] font-semibold leading-none tabular-nums tracking-normal'>
        {starCount === null ? 'Star' : formatStarCount(starCount)}
      </span>
      <Star className='h-[17px] w-[17px] shrink-0 stroke-[2.1] transition-transform duration-200 group-hover:scale-110 group-hover:fill-yellow-300 group-hover:text-yellow-500' />
    </a>
  );
}
