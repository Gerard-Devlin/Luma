import { z } from 'zod';

export const TrailerStreamSchema = z.object({
  quality: z.string(),
  url: z.string(),
  mimeType: z.string(),
});

export type TrailerStream = z.infer<typeof TrailerStreamSchema>;

const qualityRank = (quality: string): number => {
  const upper = quality.trim().toUpperCase();
  if (upper.includes('1080')) return 0;
  if (upper.includes('720')) return 1;
  if (upper.includes('480')) return 2;
  if (upper === 'SD') return 3;
  if (upper === 'AUTO') return 4;
  return 5;
};

export const pickBestMp4TrailerStream = (
  streams: TrailerStream[]
): string | null => {
  const mp4 = streams.filter(
    (stream) =>
      stream.mimeType.trim().toUpperCase() === 'MP4' && stream.url.length > 0
  );
  if (mp4.length === 0) return null;

  let best = mp4[0];
  let bestRank = qualityRank(best.quality);
  for (let i = 1; i < mp4.length; i += 1) {
    const candidate = mp4[i];
    const rank = qualityRank(candidate.quality);
    if (rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }

  return best.url;
};

const isHlsStream = (stream: TrailerStream): boolean => {
  const mime = stream.mimeType.trim().toUpperCase();
  return (
    mime === 'M3U8' ||
    mime.includes('M3U') ||
    stream.url.toLowerCase().includes('.m3u8')
  );
};

export const pickBestHlsTrailerStream = (
  streams: TrailerStream[]
): string | null => {
  const hls = streams.filter(
    (stream) => isHlsStream(stream) && stream.url.length > 0
  );
  if (hls.length === 0) return null;

  let best = hls[0];
  let bestRank = qualityRank(best.quality);
  for (let i = 1; i < hls.length; i += 1) {
    const candidate = hls[i];
    const rank = qualityRank(candidate.quality);
    if (rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }

  return best.url;
};
