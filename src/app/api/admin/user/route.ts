/* eslint-disable @typescript-eslint/no-explicit-any,no-console,@typescript-eslint/no-non-null-assertion */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';
import { IStorage } from '@/lib/types';

const ACTIONS = [
  'add',
  'ban',
  'unban',
  'setAdmin',
  'cancelAdmin',
  'setAllowRegister',
  'changePassword',
  'deleteUser',
] as const;

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
    const username = authInfo.username;

    const { targetUsername, targetPassword, allowRegister, action } = body as {
      targetUsername?: string;
      targetPassword?: string;
      allowRegister?: boolean;
      action?: (typeof ACTIONS)[number];
    };

    if (!action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (action !== 'setAllowRegister' && !targetUsername) {
      return NextResponse.json(
        { error: 'Missing target user' },
        { status: 400 }
      );
    }

    if (
      action !== 'setAllowRegister' &&
      action !== 'changePassword' &&
      action !== 'deleteUser' &&
      username === targetUsername
    ) {
      return NextResponse.json(
        { error: 'You cannot perform this action on yourself' },
        { status: 400 }
      );
    }

    const adminConfig = await getConfig();
    const storage: IStorage | null = getStorage();

    let operatorRole: 'owner' | 'admin';
    if (username === process.env.USERNAME) {
      operatorRole = 'owner';
    } else {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin') {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 401 }
        );
      }
      operatorRole = 'admin';
    }

    let targetEntry = adminConfig.UserConfig.Users.find(
      (u) => u.username === targetUsername
    );

    if (
      targetEntry &&
      targetEntry.role === 'owner' &&
      action !== 'changePassword'
    ) {
      return NextResponse.json(
        { error: 'Cannot modify the site owner' },
        { status: 400 }
      );
    }

    const isTargetAdmin = targetEntry?.role === 'admin';

    if (action === 'setAllowRegister') {
      if (typeof allowRegister !== 'boolean') {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }
      adminConfig.UserConfig.AllowRegister = allowRegister;
    } else {
      switch (action) {
        case 'add': {
          if (targetEntry) {
            return NextResponse.json(
              { error: 'User already exists' },
              { status: 400 }
            );
          }
          if (!targetPassword) {
            return NextResponse.json(
              { error: 'Missing target user password' },
              { status: 400 }
            );
          }
          if (!storage || typeof storage.registerUser !== 'function') {
            return NextResponse.json(
              { error: 'User registration storage is not configured' },
              { status: 500 }
            );
          }
          await storage.registerUser(targetUsername!, targetPassword);
          adminConfig.UserConfig.Users.push({
            username: targetUsername!,
            role: 'user',
          });
          targetEntry =
            adminConfig.UserConfig.Users[
              adminConfig.UserConfig.Users.length - 1
            ];
          break;
        }
        case 'ban': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }
          if (isTargetAdmin && operatorRole !== 'owner') {
            return NextResponse.json(
              { error: 'Only the site owner can ban admins' },
              { status: 401 }
            );
          }
          targetEntry.banned = true;
          break;
        }
        case 'unban': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }
          if (isTargetAdmin && operatorRole !== 'owner') {
            return NextResponse.json(
              { error: 'Only the site owner can manage admins' },
              { status: 401 }
            );
          }
          targetEntry.banned = false;
          break;
        }
        case 'setAdmin': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }
          if (targetEntry.role === 'admin') {
            return NextResponse.json(
              { error: 'User is already an admin' },
              { status: 400 }
            );
          }
          if (operatorRole !== 'owner') {
            return NextResponse.json(
              { error: 'Only the site owner can make admins' },
              { status: 401 }
            );
          }
          targetEntry.role = 'admin';
          break;
        }
        case 'cancelAdmin': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }
          if (targetEntry.role !== 'admin') {
            return NextResponse.json(
              { error: 'Target user is not an admin' },
              { status: 400 }
            );
          }
          if (operatorRole !== 'owner') {
            return NextResponse.json(
              { error: 'Only the site owner can remove admins' },
              { status: 401 }
            );
          }
          targetEntry.role = 'user';
          break;
        }
        case 'changePassword': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }
          if (!targetPassword) {
            return NextResponse.json(
              { error: 'Missing new password' },
              { status: 400 }
            );
          }

          if (targetEntry.role === 'owner') {
            return NextResponse.json(
              { error: 'Cannot change the site owner password' },
              { status: 401 }
            );
          }

          if (
            isTargetAdmin &&
            operatorRole !== 'owner' &&
            username !== targetUsername
          ) {
            return NextResponse.json(
              { error: 'Only the site owner can change other admin passwords' },
              { status: 401 }
            );
          }

          if (!storage || typeof storage.changePassword !== 'function') {
            return NextResponse.json(
              { error: 'Password storage is not configured' },
              { status: 500 }
            );
          }

          await storage.changePassword(targetUsername!, targetPassword);
          break;
        }
        case 'deleteUser': {
          if (!targetEntry) {
            return NextResponse.json(
              { error: 'Target user does not exist' },
              { status: 404 }
            );
          }

          if (username === targetUsername) {
            return NextResponse.json(
              { error: 'You cannot delete yourself' },
              { status: 400 }
            );
          }

          if (isTargetAdmin && operatorRole !== 'owner') {
            return NextResponse.json(
              { error: 'Only the site owner can delete admins' },
              { status: 401 }
            );
          }

          if (!storage || typeof storage.deleteUser !== 'function') {
            return NextResponse.json(
              { error: 'User deletion storage is not configured' },
              { status: 500 }
            );
          }

          await storage.deleteUser(targetUsername!);

          const userIndex = adminConfig.UserConfig.Users.findIndex(
            (u) => u.username === targetUsername
          );
          if (userIndex > -1) {
            adminConfig.UserConfig.Users.splice(userIndex, 1);
          }

          break;
        }
        default:
          return NextResponse.json(
            { error: 'Unknown action' },
            { status: 400 }
          );
      }
    }

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
    console.error('User management operation failed:', error);
    return NextResponse.json(
      {
        error: 'User management operation failed',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
