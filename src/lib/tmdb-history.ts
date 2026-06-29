import { buildTmdbPlayerPageUrl } from '@/lib/tmdb-player-sources';

interface WatchRecordLike {
  title?: string;
  search_title?: string;
  year?: string;
  cover?: string;
  index?: number;
  total_episodes?: number;
  source_name?: string;
}

export function parseStorageKey(key: string): { source: string; id: string } {
  const splitIndex = key.indexOf('+');
  if (splitIndex < 0) {
    return { source: '', id: key };
  }
  return {
    source: key.slice(0, splitIndex),
    id: key.slice(splitIndex + 1),
  };
}

export function parseTmdbStorageId(
  id: string
): { tmdbId: string; season: number | null } | null {
  const match = (id || '').trim().match(/^(\d+)(?::s(\d+))?$/i);
  if (!match) return null;
  return {
    tmdbId: match[1],
    season: match[2] ? Math.max(1, Number(match[2])) : null,
  };
}

export function isTmdbHistoryKey(key: string): boolean {
  const { source, id } = parseStorageKey(key);
  return source === 'tmdb' && parseTmdbStorageId(id) !== null;
}

export function filterTmdbHistoryRecords<T>(
  records: Record<string, T>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(records).filter(([key]) => isTmdbHistoryKey(key))
  );
}

export function buildTmdbHistoryPlayUrl(
  key: string,
  record: WatchRecordLike
): string {
  const { id } = parseStorageKey(key);
  const parsed = parseTmdbStorageId(id);
  if (!parsed) return '/play';

  const totalEpisodes = Math.max(0, Number(record.total_episodes || 0));
  const episode = Math.max(1, Number(record.index || 1));
  const sourceName = (record.source_name || '').toLowerCase();
  const isTv =
    parsed.season !== null ||
    totalEpisodes > 1 ||
    episode > 1 ||
    sourceName.includes('series') ||
    sourceName.includes('tv');
  const title = (record.title || record.search_title || '').trim();

  return buildTmdbPlayerPageUrl({
    tmdbId: parsed.tmdbId,
    mediaType: isTv ? 'tv' : 'movie',
    title,
    year: record.year || '',
    poster: record.cover || '',
    season: parsed.season || 1,
    episode,
  });
}

export function formatTmdbHistorySubtitle(
  key: string,
  record: WatchRecordLike,
  t?: (key: string, options?: Record<string, unknown>) => string
): string {
  const { source, id } = parseStorageKey(key);
  const parsed = source === 'tmdb' ? parseTmdbStorageId(id) : null;
  const totalEpisodes = Math.max(0, Number(record.total_episodes || 0));
  const currentEpisode = Math.max(0, Number(record.index || 0));

  if (parsed && parsed.season !== null) {
    if (totalEpisodes > 1) {
      if (currentEpisode >= totalEpisodes) {
        return t
          ? t('history.nextSeason', { season: parsed.season + 1 })
          : `Next Season • S${parsed.season + 1}`;
      }
      if (currentEpisode > 0) {
        return t
          ? t('history.nextEpisodeInSeason', {
              season: parsed.season,
              episode: currentEpisode + 1,
            })
          : `Next • S${parsed.season}, E${currentEpisode + 1}`;
      }
    }
    return t
      ? t('history.season', { season: parsed.season })
      : `Season ${parsed.season}`;
  }

  if (totalEpisodes > 1) {
    if (currentEpisode > 0) {
      const episode = Math.min(currentEpisode + 1, totalEpisodes);
      return t
        ? t('history.episodeProgress', { episode, total: totalEpisodes })
        : `Episode ${episode} / ${totalEpisodes}`;
    }
    return t
      ? t('common.episodes', { count: totalEpisodes })
      : `${totalEpisodes} episodes`;
  }

  return t ? t('history.continue') : 'Continue';
}
