'use client';

// @ts-expect-error Next.js bundles this ESM client dependency; Node16 module checking expects require().
import * as Vidstack from '@vidstack/react';
// @ts-expect-error Next.js bundles this ESM client dependency; Node16 module checking expects require().
import * as VidstackLayout from '@vidstack/react/player/layouts/default';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

const { MediaPlayer, MediaProvider } = Vidstack;
const { DefaultVideoLayout, defaultLayoutIcons } = VidstackLayout;

function DirectPlayer() {
  const params = useSearchParams();
  const { t } = useTranslation();
  const player = useRef<Vidstack.MediaPlayerInstance>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [title, setTitle] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resumeValue = Number(params.get('t'));
  const resume = Number.isFinite(resumeValue) ? Math.max(0, resumeValue) : 0;
  const query = new URLSearchParams({
    tmdbId: params.get('tmdbId') || '',
    type: params.get('type') || 'movie',
    season: params.get('season') || '1',
    episode: params.get('episode') || '1',
  }).toString();

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setStreamUrl('');
    void fetch(`/api/player/bingr?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          streamUrl: string;
          title?: string;
          code?: string;
        };
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.error(
            '[Bingr] Source unavailable:',
            data.code || response.status,
          );
          throw new Error('Unavailable source');
        }
        if (!controller.signal.aborted) {
          setTitle(data.title || '');
          setStreamUrl(data.streamUrl);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          // eslint-disable-next-line no-console
          console.error(
            '[Bingr] Playback request failed:',
            error instanceof Error ? error.message : 'Unknown error',
          );
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [query, attempt]);

  useEffect(() => {
    const seek = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin
      )
        return;
      if (
        event.data?.type === 'seek' &&
        Number.isFinite(event.data.time) &&
        event.data.time >= 0 &&
        player.current
      ) {
        player.current.currentTime = event.data.time;
      }
    };
    window.addEventListener('message', seek);
    return () => window.removeEventListener('message', seek);
  }, []);

  const send = (event: string) => {
    if (!player.current) return;
    window.parent.postMessage(
      {
        type: 'PLAYER_EVENT',
        data: {
          event,
          currentTime: player.current.state.currentTime,
          duration: player.current.state.duration,
        },
      },
      window.location.origin,
    );
  };

  return (
    <main
      style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff' }}
    >
      {streamUrl && !failed ? (
        <MediaPlayer
          ref={player}
          title={title}
          src={{ src: streamUrl, type: 'application/x-mpegurl' }}
          autoPlay
          playsInline
          currentTime={resume}
          preload='auto'
          style={{ width: '100%', height: '100%' }}
          onTimeUpdate={() => send('timeupdate')}
          onPlay={() => send('play')}
          onPause={() => send('pause')}
          onSeeked={() => send('seeked')}
          onEnded={() => send('ended')}
          onError={() => setFailed(true)}
        >
          <MediaProvider />
          <DefaultVideoLayout icons={defaultLayoutIcons} />
        </MediaPlayer>
      ) : (
        <div className='flex h-full flex-col items-center justify-center gap-4 p-6 text-center'>
          <p role='status'>
            {t(failed ? 'play.playerLoadFailed' : 'common.loading')}
          </p>
          {failed ? (
            <button
              className='ui-glass-control px-4 py-2'
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('play.retry')}
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default function DirectPlayerPage() {
  return (
    <Suspense>
      <DirectPlayer />
    </Suspense>
  );
}
