'use client';

import { useEffect, useRef } from 'react';

type TrailerStreamVideoProps = {
  mp4Url: string | null;
  hlsUrl: string | null;
  muted: boolean;
  className?: string;
  onCanPlay?: () => void;
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
  onCanPlay,
  onPlaying,
  onEnded,
  onError,
}: TrailerStreamVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const clearSource = () => {
      video.removeAttribute('src');
      video.load();
    };

    if (mp4Url) {
      video.src = mp4Url;
      return () => {
        clearSource();
      };
    }

    if (hlsUrl) {
      if (canPlayNativeHls(video)) {
        video.src = hlsUrl;
        return () => {
          clearSource();
        };
      }
    }

    return undefined;
  }, [hlsUrl, mp4Url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = muted;
    const tryPlay = () => {
      video.muted = muted;
      void video.play().catch(() => {
        // A play() rejection is often transient while the src/HLS attachment is
        // settling. Native media errors still flow through the video onError.
      });
    };

    tryPlay();
    video.addEventListener('loadeddata', tryPlay);
    video.addEventListener('canplay', tryPlay);
    return () => {
      video.removeEventListener('loadeddata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
    };
  }, [hlsUrl, mp4Url, muted]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls={false}
      muted={muted}
      loop
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
      onCanPlay={onCanPlay}
      onPlaying={onPlaying}
      onEnded={onEnded}
      onError={onError}
    />
  );
}
