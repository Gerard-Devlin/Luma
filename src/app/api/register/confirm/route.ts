/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { sha256Hex } from '@/lib/email-registration';

function redirectToLogin(req: NextRequest, params: Record<string, string>) {
  const url = new URL('/login', req.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';

  if (!token) {
    return redirectToLogin(req, {
      verified: '0',
      reason: 'invalid',
    });
  }

  try {
    const tokenHash = await sha256Hex(token);
    const pending = await db.getEmailRegistrationByTokenHash(tokenHash);

    if (!pending) {
      return redirectToLogin(req, {
        verified: '0',
        reason: 'expired',
      });
    }

    const [userExists, emailExists] = await Promise.all([
      db.checkUserExist(pending.username),
      db.checkEmailExist(pending.email),
    ]);

    if (userExists || emailExists) {
      await db.deleteEmailRegistration(pending.email);
      return redirectToLogin(req, {
        verified: '0',
        reason: 'exists',
      });
    }

    await db.registerUser(pending.username, pending.password, pending.email);

    const config = await getConfig();
    const hasUser = config.UserConfig.Users.some(
      (user) => user.username === pending.username
    );

    if (!hasUser) {
      config.UserConfig.Users.push({
        username: pending.username,
        role: 'user',
      });
      await db.saveAdminConfig(config);
    }

    await db.deleteEmailRegistration(pending.email);

    return redirectToLogin(req, {
      verified: '1',
      username: pending.username,
    });
  } catch (error) {
    console.error('Email registration confirmation failed', error);
    return redirectToLogin(req, {
      verified: '0',
      reason: 'server',
    });
  }
}
