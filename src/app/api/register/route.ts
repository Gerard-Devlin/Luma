/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  createRegistrationVerifyUrl,
  generateRegistrationToken,
  isValidEmail,
  normalizeEmail,
  sendRegistrationEmail,
  sha256Hex,
} from '@/lib/email-registration';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

const REGISTRATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;

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

    const rawUsername = body?.username;
    const rawEmail = body?.email;
    const rawPassword = body?.password;
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const email =
      typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';

    const turnstilePassed = await verifyTurnstileToken(
      req,
      body?.turnstileToken
    );
    if (!turnstilePassed) {
      return NextResponse.json(
        { error: 'Turnstile verification failed. Please refresh and try again.' },
        { status: 400 }
      );
    }

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required.' },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required.' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    if (!password) {
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
      const [userExists, emailExists] = await Promise.all([
        db.checkUserExist(username),
        db.checkEmailExist(email),
      ]);

      if (userExists) {
        return NextResponse.json(
          { error: 'User already exists.' },
          { status: 400 }
        );
      }

      if (emailExists) {
        return NextResponse.json(
          { error: 'Email is already registered.' },
          { status: 400 }
        );
      }

      const token = generateRegistrationToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt =
        Math.floor(Date.now() / 1000) + REGISTRATION_TOKEN_TTL_SECONDS;

      await db.createEmailRegistration(
        username,
        email,
        password,
        tokenHash,
        expiresAt
      );

      try {
        await sendRegistrationEmail({
          email,
          username,
          verifyUrl: createRegistrationVerifyUrl(req, token),
        });
      } catch (emailError) {
        await db.deleteEmailRegistration(email).catch((deleteError) => {
          console.error('Failed to clean pending registration:', deleteError);
        });
        console.error('Registration email failed', emailError);
        return NextResponse.json(
          {
            error:
              'Confirmation email could not be sent. Please contact the site owner.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        pendingEmailVerification: true,
        email,
      });
    } catch (err) {
      console.error('Database registration failed', err);
      return NextResponse.json({ error: 'Database error.' }, { status: 500 });
    }
  } catch (error) {
    console.error('Registration API error', error);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
