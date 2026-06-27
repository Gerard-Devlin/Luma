/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyTurnstileToken(
  req: NextRequest,
  token: unknown
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return true;
  }

  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const remoteIp =
    req.ip ??
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    undefined;

  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (remoteIp) {
    formData.append('remoteip', remoteIp);
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (error) {
    console.error('Turnstile verification failed', error);
    return false;
  }
}

async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: 'owner' | 'admin' | 'user',
  includePassword = false
): Promise<string> {
  const authData: any = { role: role || 'user' };

  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now();
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { username, password, turnstileToken } = body ?? {};

    const turnstilePassed = await verifyTurnstileToken(req, turnstileToken);
    if (!turnstilePassed) {
      return NextResponse.json(
        { error: 'Turnstile verification failed. Please refresh and try again.' },
        { status: 400 }
      );
    }

    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      if (!envPassword) {
        const response = NextResponse.json({ ok: true });
        response.cookies.set('auth', '', {
          path: '/',
          expires: new Date(0),
          sameSite: 'lax',
          httpOnly: false,
          secure: false,
        });

        return response;
      }

      if (typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Password is required.' },
          { status: 400 }
        );
      }

      if (password !== envPassword) {
        return NextResponse.json(
          { ok: false, error: 'Incorrect password.' },
          { status: 401 }
        );
      }

      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        undefined,
        password,
        'user',
        true
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax',
        httpOnly: false,
        secure: false,
      });

      return response;
    }

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required.' },
        { status: 400 }
      );
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required.' },
        { status: 400 }
      );
    }

    if (
      username === process.env.USERNAME &&
      password === process.env.PASSWORD
    ) {
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        username,
        password,
        'owner',
        false
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax',
        httpOnly: false,
        secure: false,
      });

      return response;
    } else if (username === process.env.USERNAME) {
      return NextResponse.json(
        { error: 'Incorrect username or password.' },
        { status: 401 }
      );
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    if (user && user.banned) {
      return NextResponse.json({ error: 'User is banned.' }, { status: 401 });
    }

    try {
      const pass = await db.verifyUser(username, password);
      if (!pass) {
        return NextResponse.json(
          { error: 'Incorrect username or password.' },
          { status: 401 }
        );
      }

      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        username,
        password,
        user?.role || 'user',
        false
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax',
        httpOnly: false,
        secure: false,
      });

      return response;
    } catch (err) {
      console.error('Database verification failed', err);
      return NextResponse.json({ error: 'Database error.' }, { status: 500 });
    }
  } catch (error) {
    console.error('Login API error', error);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
