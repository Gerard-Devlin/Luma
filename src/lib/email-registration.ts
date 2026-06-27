import * as React from 'react';
import { render } from 'react-email';

import { ConfirmEmail } from '@/emails/confirm-email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegistrationEmailInput = {
  email: string;
  username: string;
  verifyUrl: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function getPublicSiteUrl(req: Request): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL;

  if (configuredUrl) {
    const url = configuredUrl.startsWith('http')
      ? configuredUrl
      : `https://${configuredUrl}`;
    return trimTrailingSlash(url);
  }

  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = forwardedHost || req.headers.get('host');

  if (host) {
    return trimTrailingSlash(`${forwardedProto || 'https'}://${host}`);
  }

  return new URL(req.url).origin;
}

export function createRegistrationVerifyUrl(req: Request, token: string): string {
  const url = new URL('/api/register/confirm', getPublicSiteUrl(req));
  url.searchParams.set('token', token);
  return url.toString();
}

export function generateRegistrationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createRegistrationEmailText({
  siteName,
  username,
  verifyUrl,
}: {
  siteName: string;
  username: string;
  verifyUrl: string;
}): string {
  return [
    `Confirm your ${siteName} account`,
    '',
    `Hi ${username},`,
    '',
    `Click this link to finish creating your ${siteName} account:`,
    verifyUrl,
    '',
    'This link expires in 24 hours and can only be used once.',
    '',
    `If you did not create a ${siteName} account, you can safely ignore this email.`,
  ].join('\n');
}

async function createRegistrationEmailHtml({
  siteName,
  username,
  verifyUrl,
}: {
  siteName: string;
  username: string;
  verifyUrl: string;
}): Promise<string> {
  const logoUrl = new URL('/logo.png', verifyUrl).toString();
  const siteUrl = new URL('/', verifyUrl).toString();

  return render(
    React.createElement(ConfirmEmail, {
      companyName: siteName,
      logoUrl,
      siteUrl,
      url: verifyUrl,
      username,
    })
  );
}

export async function sendRegistrationEmail({
  email,
  username,
  verifyUrl,
}: RegistrationEmailInput): Promise<void> {
  const resendKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY;

  if (!resendKey) {
    throw new Error('Email service is not configured');
  }

  const siteName = process.env.SITE_NAME || 'Luma';
  const from =
    process.env.RESEND_FROM_EMAIL || `${siteName} <onboarding@resend.dev>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Confirm your ${siteName} account`,
      text: createRegistrationEmailText({ siteName, username, verifyUrl }),
      html: await createRegistrationEmailHtml({
        siteName,
        username,
        verifyUrl,
      }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Resend email failed:', response.status, errorText);
    throw new Error('Failed to send confirmation email');
  }
}
