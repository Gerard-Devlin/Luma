/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: 'Admin settings are not supported with localStorage' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { SiteName, Announcement, SiteInterfaceCacheTime } = body as {
      SiteName: string;
      Announcement: string;
      SiteInterfaceCacheTime: number;
    };

    if (
      typeof SiteName !== 'string' ||
      typeof Announcement !== 'string' ||
      typeof SiteInterfaceCacheTime !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const adminConfig = await getConfig();
    const storage = getStorage();

    if (authInfo.username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (item) => item.username === authInfo.username
      );
      if (!user || user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Insufficient permission' },
          { status: 401 }
        );
      }
    }

    adminConfig.SiteConfig = {
      ...adminConfig.SiteConfig,
      SiteName,
      Announcement,
      SiteInterfaceCacheTime,
    };

    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Failed to update site settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to update site settings',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
