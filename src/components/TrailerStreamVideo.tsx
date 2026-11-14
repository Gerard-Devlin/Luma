'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TrailerStreamVideoProps = {
  mp4Url: string | null;
  hlsUrl: string | null;
  muted: boolean;
  className?: string;
  onPlaying?: () => void;
  onEnded?: () => void;
  onSourceChange?: () => void;
  onError?: () => void;
};

const DIRECT_STARTUP_TIMEOUT_MS = 8000;
const FALLBACK_STARTUP_TIMEOUT_MS = 20000;

const canPlayNativeHls = (video: HTMLVideoElement): boolean =>
  video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
  video.canPlayType('application/x-mpegURL') !== '';

export default function TrailerStreamVideo({
  mp4Url,
  hlsUrl,
  muted,
  className,
  onPlaying,
  onEnded,
  onSourceChange,
  onError,
}: TrailerStreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = [
    ...(mp4Url ? [{ url: mp4Url, hls: false }] : []),
    ...(hlsUrl ? [{ url: hlsUrl, hls: true }] : []),
    ...(mp4Url?.startsWith('https://imdb-video.media-imdb.com/')
      ? [
          {
            url: `/api/trailers/imdb/media?url=${encodeURIComponent(mp4Url)}`,
            hls: false,
          },
        ]
      : []),
  ];
  const { url, hls: useHls } = sources[sourceIndex] ?? {};
  const hasNextSource = sourceIndex + 1 < sources.length;

  const handleSourceError = useCallback(() => {
    if (hasNextSource) {
      onSourceChange?.();
      setSourceIndex(sourceIndex + 1);
    } else {
      onError?.();
    }
  }, [hasNextSource, onError, onSourceChange, sourceIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    let cancelled = false;
    let destroyHls: (() => void) | undefined;
    const startupTimeout = window.setTimeout(
      handleSourceError,
      sourceIndex === 0 && !useHls
        ? DIRECT_STARTUP_TIMEOUT_MS
        : FALLBACK_STARTUP_TIMEOUT_MS,
    );
    const clearStartupTimeout = () => window.clearTimeout(startupTimeout);
    video.addEventListener('playing', clearStartupTimeout, { once: true });

    if (!useHls || canPlayNativeHls(video)) {
      video.src = url;
    } else {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            handleSourceError();
            return;
          }

          const hls = new Hls();
          destroyHls = () => hls.destroy();
          hls.on(Hls.Events.ERROR, (_, error) => {
            if (!cancelled && error.fatal) handleSourceError();
          });
          hls.loadSource(url);
          hls.attachMedia(video);
        })
        .catch(() => {
          if (!cancelled) handleSourceError();
        });
    }

    return () => {
      cancelled = true;
      clearStartupTimeout();
      video.removeEventListener('playing', clearStartupTimeout);
      destroyHls?.();
      video.removeAttribute('src');
      video.load();
    };
  }, [handleSourceError, sourceIndex, url, useHls]);

  return (
    <video
      key={url}
      ref={videoRef}
      className={className}
      controls={false}
      muted={muted}
      playsInline
      autoPlay
      preload='auto'
      disablePictureInPicture
      controlsList='nodownload nofullscreen noplaybackrate noremoteplayback'
      tabIndex={-1}
      aria-hidden='true'
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onCanPlay={(event) => {
        const video = event.currentTarget;
        if (video.paused) {
          void video.play().catch(() => {
            // Leave the backdrop visible if the browser blocks autoplay.
          });
        }
      }}
      onPlaying={onPlaying}
      onEnded={onEnded}
      onError={handleSourceError}
    />
  );
}
