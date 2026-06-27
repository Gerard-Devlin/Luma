'use client';

import { useEffect, useState } from 'react';

export type ImdbTrailerStreamStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ImdbTrailerStreamResult {
  mp4Url: string | null;
  hlsUrl: string | null;
  status: ImdbTrailerStreamStatus;
}

const parseTrailerStreamBody = (
  body: unknown
): { mp4Url: string | null; hlsUrl: string | null } => {
  if (!body || typeof body !== 'object') {
    return { mp4Url: null, hlsUrl: null };
  }

  const value = body as { url?: unknown; hlsUrl?: unknown };
  return {
    mp4Url:
      typeof value.url === 'string' && value.url.length > 0 ? value.url : null,
    hlsUrl:
      typeof value.hlsUrl === 'string' && value.hlsUrl.length > 0
        ? value.hlsUrl
        : null,
  };
};

export function useImdbTrailerStream(
  imdbId: string | undefined,
  enabled: boolean
): ImdbTrailerStreamResult {
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ImdbTrailerStreamStatus>('idle');

  useEffect(() => {
    if (!enabled || !imdbId?.startsWith('tt')) {
      setMp4Url(null);
      setHlsUrl(null);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    setMp4Url(null);
    setHlsUrl(null);
    setStatus('loading');

    async function run() {
      try {
        const response = await fetch(
          `/api/trailers/imdb?imdbId=${encodeURIComponent(imdbId as string)}`,
          { signal: controller.signal }
        );
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setStatus('error');
          return;
        }

        const parsed = parseTrailerStreamBody(body);
        if (!parsed.mp4Url && !parsed.hlsUrl) {
          setStatus('error');
          return;
        }

        setMp4Url(parsed.mp4Url);
        setHlsUrl(parsed.hlsUrl);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStatus('error');
      }
    }

    void run();

    return () => {
      controller.abort();
    };
  }, [enabled, imdbId]);

  return { mp4Url, hlsUrl, status };
}
