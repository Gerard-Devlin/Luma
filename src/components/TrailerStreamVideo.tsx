'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TrailerStreamVideoProps = {
  mp4Url: string | null;
  hlsUrl: string | null;
  muted: boolean;
  className?: string;
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: () => void;
};

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
  onError,
}: TrailerStreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failedMp4Url, setFailedMp4Url] = useState<string | null>(null);
  const useMp4 = Boolean(mp4Url && mp4Url !== failedMp4Url);
  const url = useMp4 ? mp4Url : hlsUrl;

  const handleSourceError = useCallback(() => {
    if (useMp4 && hlsUrl) {
      setFailedMp4Url(mp4Url);
    } else {
      onError?.();
    }
  }, [hlsUrl, mp4Url, onError, useMp4]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    let cancelled = false;
    let destroyHls: (() => void) | undefined;

    if (useMp4 || canPlayNativeHls(video)) {
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
      destroyHls?.();
      video.removeAttribute('src');
      video.load();
    };
  }, [handleSourceError, url, useMp4]);

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
