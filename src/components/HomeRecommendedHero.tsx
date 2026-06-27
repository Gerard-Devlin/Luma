'use client';

import { useEffect, useState } from 'react';

import {
  type Favorite,
  type PlayRecord,
  getAllFavorites,
  getAllPlayRecords,
} from '@/lib/db.client';

import TmdbHeroBanner, {
  type TmdbHeroRecommendationSeed,
} from '@/components/TmdbHeroBanner';

function playRecordsToRecommendationSeeds(
  records: Record<string, PlayRecord>
): TmdbHeroRecommendationSeed[] {
  return Object.values(records)
    .filter((record) => (record.title || record.search_title || '').trim())
    .map((record) => ({
      title: record.title || record.search_title || '',
      search_title: record.search_title || record.title || '',
      year: record.year || '',
      total_episodes: record.total_episodes,
      index: record.index,
      play_time: record.play_time,
      total_time: record.total_time,
      save_time: record.save_time,
      seed_type: 'play',
    }));
}

function favoritesToRecommendationSeeds(
  favorites: Record<string, Favorite>
): TmdbHeroRecommendationSeed[] {
  return Object.values(favorites)
    .filter((favorite) => (favorite.title || favorite.search_title || '').trim())
    .map((favorite) => ({
      title: favorite.title || favorite.search_title || '',
      search_title: favorite.search_title || favorite.title || '',
      year: favorite.year || '',
      total_episodes: favorite.total_episodes,
      save_time: favorite.save_time,
      seed_type: 'favorite',
    }));
}

function toRecommendationSeeds(
  records: Record<string, PlayRecord>,
  favorites: Record<string, Favorite>
): TmdbHeroRecommendationSeed[] {
  const allSeeds = [
    ...favoritesToRecommendationSeeds(favorites),
    ...playRecordsToRecommendationSeeds(records),
  ];

  return allSeeds.sort((a, b) => {
    const typeDelta =
      (b.seed_type === 'favorite' ? 1 : 0) -
      (a.seed_type === 'favorite' ? 1 : 0);
    if (typeDelta !== 0) return typeDelta;
    return (b.save_time || 0) - (a.save_time || 0);
  });
}

export default function HomeRecommendedHero() {
  const [seeds, setSeeds] = useState<TmdbHeroRecommendationSeed[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRecommendationInputs = async () => {
      try {
        const [records, favorites] = await Promise.all([
          getAllPlayRecords(),
          getAllFavorites(),
        ]);
        if (!cancelled) {
          setSeeds(toRecommendationSeeds(records, favorites));
        }
      } catch {
        if (!cancelled) {
          setSeeds([]);
        }
      }
    };

    void loadRecommendationInputs();

    return () => {
      cancelled = true;
    };
  }, []);

  return <TmdbHeroBanner personalizedSeeds={seeds} requireLogo />;
}
