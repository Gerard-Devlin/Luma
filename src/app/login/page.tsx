'use client';

import {
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Turnstile from 'react-turnstile';

import { checkForUpdates, CURRENT_VERSION, UpdateStatus } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';

type RuntimeConfig = {
  STORAGE_TYPE?: string;
  ENABLE_REGISTER?: boolean;
};

const GrainGradient = dynamic(
  () =>
    import('@paper-design/shaders-react').then((mod) => mod.GrainGradient),
  { ssr: false }
);

function VersionDisplay() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        // ignore fetch errors
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  return (
    <button
      onClick={() => window.open('https://github.com/Gerard-Devlin/Luma', '_blank')}
      className='ui-glass-control fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:text-white'
    >
      <span className='font-mono'>v{CURRENT_VERSION}</span>
      {!isChecking && updateStatus !== UpdateStatus.FETCH_FAILED && (
        <div
          className={`flex items-center gap-1.5 ${
            updateStatus === UpdateStatus.HAS_UPDATE
              ? 'text-yellow-300'
              : updateStatus === UpdateStatus.NO_UPDATE
              ? 'text-blue-300'
              : ''
          }`}
        >
          {updateStatus === UpdateStatus.HAS_UPDATE && (
            <>
              <AlertCircle className='h-3.5 w-3.5' />
              <span className='text-xs font-semibold'>Update available</span>
            </>
          )}
          {updateStatus === UpdateStatus.NO_UPDATE && (
            <>
              <CheckCircle className='h-3.5 w-3.5' />
              <span className='text-xs font-semibold'>Up to date</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}

function GrainGradientBackdrop() {
  const [size, setSize] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: Math.ceil(window.innerWidth),
        height: Math.ceil(window.innerHeight),
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return (
    <div className='pointer-events-none absolute inset-0 overflow-hidden bg-black'>
      <GrainGradient
        width={size.width}
        height={size.height}
        colors={['#7300ff', '#eba8ff', '#00bfff', '#2b00ff']}
        colorBack='#000000'
        softness={0.5}
        intensity={0.5}
        noise={0.25}
        shape='corners'
        speed={1}
        className='absolute inset-0 h-full w-full'
      />
    </div>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);
  const [enableRegister, setEnableRegister] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const isTurnstileEnabled = Boolean(turnstileSiteKey);
  const { siteName } = useSite();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const runtimeConfig = (
        window as typeof window & {
          RUNTIME_CONFIG?: RuntimeConfig;
        }
      ).RUNTIME_CONFIG;
      const storageType = runtimeConfig?.STORAGE_TYPE;
      setShouldAskUsername(
        storageType !== undefined && storageType !== 'localstorage'
      );
      setEnableRegister(Boolean(runtimeConfig?.ENABLE_REGISTER));
    }
  }, []);

  const resetTurnstile = useCallback(() => {
    if (!isTurnstileEnabled) return;
    setTurnstileToken(null);
    setTurnstileKey((prev) => prev + 1);
  }, [isTurnstileEnabled]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;
    if (isTurnstileEnabled && !turnstileToken) {
      setError('Please complete the verification challenge.');
      return;
    }

    try {
      setLoading(true);
      const payload: Record<string, unknown> = {
        password,
        ...(shouldAskUsername ? { username } : {}),
      };
      if (isTurnstileEnabled) {
        payload.turnstileToken = turnstileToken;
      }

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        setError('Incorrect password.');
        resetTurnstile();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Server error.');
        resetTurnstile();
      }
    } catch (error) {
      setError('Network error. Please try again later.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    if (!password || !username) return;
    if (isTurnstileEnabled && !turnstileToken) {
      setError('Please complete the verification challenge.');
      return;
    }

    try {
      setLoading(true);
      const payload: Record<string, unknown> = {
        username,
        password,
      };
      if (isTurnstileEnabled) {
        payload.turnstileToken = turnstileToken;
      }

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Server error.');
        resetTurnstile();
      }
    } catch (error) {
      setError('Network error. Please try again later.');
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className='relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-16 text-white'>
      <GrainGradientBackdrop />

      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 p-10 shadow-2xl backdrop-blur-xl dark:border dark:border-zinc-800 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40'>
        <img
          src='/logo.png'
          alt={siteName}
          className='mx-auto mb-8 h-16 w-auto drop-shadow-sm'
        />
        <form onSubmit={handleSubmit} className='space-y-8'>
          {shouldAskUsername && (
            <div>
              <label htmlFor='username' className='sr-only'>
                Username
              </label>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full rounded-lg border-0 bg-white/60 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-white/60 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800/60 dark:text-gray-100 dark:placeholder:text-gray-400 dark:ring-white/20'
                placeholder='Enter username'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor='password' className='sr-only'>
              Password
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              className='block w-full rounded-lg border-0 bg-white/60 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-white/60 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-800/60 dark:text-gray-100 dark:placeholder:text-gray-400 dark:ring-white/20'
              placeholder='Enter access password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isTurnstileEnabled && (
            <div className='flex justify-center'>
              <Turnstile
                key={turnstileKey}
                sitekey={turnstileSiteKey}
                theme='auto'
                onVerify={(token) => {
                  setTurnstileToken(token);
                  setError(null);
                }}
                onExpire={() => resetTurnstile()}
                onError={() => resetTurnstile()}
              />
            </div>
          )}

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          {shouldAskUsername && enableRegister ? (
            <div className='flex gap-4'>
              <button
                type='button'
                onClick={handleRegister}
                disabled={
                  !password ||
                  !username ||
                  loading ||
                  (isTurnstileEnabled && !turnstileToken)
                }
                className='inline-flex flex-1 justify-center rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
              <button
                type='submit'
                disabled={
                  !password ||
                  loading ||
                  (shouldAskUsername && !username) ||
                  (isTurnstileEnabled && !turnstileToken)
                }
                className='inline-flex flex-1 justify-center rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          ) : (
            <button
              type='submit'
              disabled={
                !password ||
                loading ||
                (shouldAskUsername && !username) ||
                (isTurnstileEnabled && !turnstileToken)
              }
              className='inline-flex w-full justify-center rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          )}
        </form>
      </div>

      <VersionDisplay />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
