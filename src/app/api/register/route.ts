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

async function generateAuthCookie(username: string): Promise<string> {
  const authData: any = {
    role: 'user',
    username,
    timestamp: Date.now(),
  };

  const signingKey = process.env.PASSWORD || '';
  const signature = await generateSignature(username, signingKey);
  authData.signature = signature;

  return encodeURIComponent(JSON.stringify(authData));
}

export async function POST(req: NextRequest) {
  try {
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { error: 'Registration is not supported in the current mode.' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    if (!config.UserConfig.AllowRegister) {
      return NextResponse.json(
        { error: 'Registration is currently disabled.' },
        { status: 400 }
      );
    }

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

    if (username === process.env.USERNAME) {
      return NextResponse.json(
        { error: 'User already exists.' },
        { status: 400 }
      );
    }

    try {
      const exist = await db.checkUserExist(username);
      if (exist) {
        return NextResponse.json(
          { error: 'User already exists.' },
          { status: 400 }
        );
      }

      await db.registerUser(username, password);

      config.UserConfig.Users.push({
        username,
        role: 'user',
      });
      await db.saveAdminConfig(config);

      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(username);
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
      console.error('Database registration failed', err);
      return NextResponse.json({ error: 'Database error.' }, { status: 500 });
    }
  } catch (error) {
    console.error('Registration API error', error);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
