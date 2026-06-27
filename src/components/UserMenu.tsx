/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { KeyRound, LogOut, Shield, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { checkForUpdates, UpdateStatus } from '@/lib/version';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

const MENU_PANEL_GAP = 8;
const MENU_PANEL_MIN_TOP = 68;
const AVATAR_SHADER_DEFAULT_SIZE = 44;
const AVATAR_SHADER_COMPACT_SIZE = 28;
const AVATAR_SHADER_WIDTH = 1280;
const AVATAR_SHADER_HEIGHT = 720;

const MeshGradient = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.MeshGradient),
  { ssr: false }
);

type UserAvatarSize = 'default' | 'compact';

interface UserMenuProps {
  triggerClassName?: string;
  avatarSize?: UserAvatarSize;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;

  const hueToRgb = (p: number, q: number, t: number) => {
    let normalizedT = t;
    if (normalizedT < 0) normalizedT += 1;
    if (normalizedT > 1) normalizedT -= 1;
    if (normalizedT < 1 / 6) return p + (q - p) * 6 * normalizedT;
    if (normalizedT < 1 / 2) return q;
    if (normalizedT < 2 / 3) {
      return p + (q - p) * (2 / 3 - normalizedT) * 6;
    }
    return p;
  };

  const q =
    normalizedLightness < 0.5
      ? normalizedLightness * (1 + normalizedSaturation)
      : normalizedLightness +
        normalizedSaturation -
        normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;
  const red = hueToRgb(p, q, normalizedHue + 1 / 3) * 255;
  const green = hueToRgb(p, q, normalizedHue) * 255;
  const blue = hueToRgb(p, q, normalizedHue - 1 / 3) * 255;

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function getUserMeshColors(username?: string): string[] {
  const seed = hashString((username || 'default').trim().toLowerCase());
  const baseHue = seed % 360;
  const hueOffsets = [0, 28, 112, 216];

  return hueOffsets.map((offset, index) => {
    const hueJitter = ((seed >>> (index * 5 + 7)) % 28) - 14;
    const saturation = 72 + ((seed >>> (index * 3 + 4)) % 18);
    const lightness = [82, 52, 56, 66][index] + ((seed >>> index) % 8);
    return hslToHex(baseHue + offset + hueJitter, saturation, lightness);
  });
}

function getUserMeshFallbackStyle(colors: string[]): CSSProperties {
  return {
    background: `
      radial-gradient(circle at 26% 24%, ${colors[0]} 0%, transparent 34%),
      radial-gradient(circle at 72% 28%, ${colors[1]} 0%, transparent 38%),
      radial-gradient(circle at 36% 78%, ${colors[2]} 0%, transparent 42%),
      radial-gradient(circle at 78% 72%, ${colors[3]} 0%, transparent 36%),
      linear-gradient(135deg, ${colors[0]}, ${colors[1]} 46%, ${colors[3]})
    `,
  };
}

function UserShaderAvatar({
  username,
  size = 'default',
}: {
  username?: string;
  size?: UserAvatarSize;
}) {
  const colors = useMemo(() => getUserMeshColors(username), [username]);
  const visualSize =
    size === 'compact' ? AVATAR_SHADER_COMPACT_SIZE : AVATAR_SHADER_DEFAULT_SIZE;
  const shaderScale = visualSize / AVATAR_SHADER_HEIGHT;
  const fallbackStyle = useMemo(
    () => ({
      ...getUserMeshFallbackStyle(colors),
      height: visualSize,
      width: visualSize,
    }),
    [colors, visualSize]
  );

  return (
    <span
      className='relative flex shrink-0 items-center justify-center overflow-hidden rounded-full [clip-path:circle(50%_at_50%_50%)]'
      style={fallbackStyle}
    >
      <MeshGradient
        className='absolute left-1/2 top-1/2 max-w-none'
        width={AVATAR_SHADER_WIDTH}
        height={AVATAR_SHADER_HEIGHT}
        style={{
          transform: `translate(-50%, -50%) scale(${shaderScale})`,
          transformOrigin: 'center',
        }}
        colors={colors}
        distortion={0.8}
        swirl={0.35}
        grainMixer={1}
        grainOverlay={0.4}
        speed={0.52}
        maxPixelCount={AVATAR_SHADER_WIDTH * AVATAR_SHADER_HEIGHT}
      />
    </span>
  );
}

export const UserMenu: React.FC<UserMenuProps> = ({
  triggerClassName,
  avatarSize = 'default',
}) => {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFocusRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType, setStorageType] = useState<string>('localstorage');
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 58,
    right: 12,
  });

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取认证信息和存储类型
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);

      const type =
        (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
      setStorageType(type);
    }
  }, []);

  // 版本检查
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        console.warn('Version check failed:', error);
      }
    };

    checkUpdate();
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;

    setMenuPosition({
      top: Math.max(MENU_PANEL_MIN_TOP, rect.bottom + MENU_PANEL_GAP),
      right: Math.max(MENU_PANEL_GAP, window.innerWidth - rect.right),
    });
  }, []);

  const canUseHoverMenu = useCallback(() => {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  const handleOpenMenu = useCallback(() => {
    clearCloseTimer();
    updateMenuPosition();
    setIsOpen(true);
  }, [clearCloseTimer, updateMenuPosition]);

  const handleHoverOpenMenu = useCallback(() => {
    if (!canUseHoverMenu()) return;
    handleOpenMenu();
  }, [canUseHoverMenu, handleOpenMenu]);

  const handleCloseMenu = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
  }, [clearCloseTimer]);

  const handleMenuClick = () => {
    pointerFocusRef.current = false;
    clearCloseTimer();
    updateMenuPosition();
    setIsOpen((prev) => !prev);
  };

  const handleMenuPointerDown = () => {
    pointerFocusRef.current = true;
  };

  const handleMenuFocus = () => {
    if (pointerFocusRef.current) return;
    handleOpenMenu();
  };

  const scheduleCloseMenu = useCallback(() => {
    if (!canUseHoverMenu()) return;

    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }, [canUseHoverMenu, clearCloseTimer]);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      handleCloseMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [handleCloseMenu, isOpen, updateMenuPosition]);

  useEffect(() => {
    return clearCloseTimer;
  }, [clearCloseTimer]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
    window.location.href = '/';
  };

  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleAdminPanel = () => {
    setIsOpen(false);
    router.push('/admin');
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');

    // 验证密码
    if (!newPassword) {
      setPasswordError('New password cannot be empty.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords do not match.');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || 'Failed to change password.');
        return;
      }

      // 修改成功，关闭弹窗并登出
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('Network error. Please try again later.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 检查是否显示管理面板按钮
  const showAdminPanel =
    authInfo?.role === 'owner' || authInfo?.role === 'admin';

  // 检查是否显示修改密码按钮
  const showChangePassword =
    authInfo?.role !== 'owner' && storageType !== 'localstorage';

  // 角色中文映射
  const getRoleText = (role?: string) => {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'user':
        return 'User';
      default:
        return '';
    }
  };

  // 菜单面板内容
  const menuPanel = (
    <>
      {/* 背景遮罩 - 普通菜单无需模糊 */}
      {/* 菜单面板 */}
      <motion.div
        ref={panelRef}
        onMouseEnter={handleHoverOpenMenu}
        onMouseLeave={scheduleCloseMenu}
        className='ui-glass-panel fixed z-[1001] w-[min(74vw,192px)] overflow-hidden px-1.5 pb-1 pt-1.5 select-none sm:w-[200px]'
        style={{
          top: menuPosition.top,
          right: menuPosition.right,
          originX: 0.93,
          originY: 0,
        }}
        initial={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.88, y: -8, filter: 'blur(8px)' }
        }
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
        }
        exit={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.9, y: -6, filter: 'blur(6px)' }
        }
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                type: 'spring',
                stiffness: 520,
                damping: 38,
                mass: 0.7,
              }
        }
      >
        {/* 用户信息区域 */}
        <div className='border-b border-[var(--ui-glass-divider)] px-1.5 pb-2 pt-0.5'>
          <div className='space-y-0.5'>
            <div className='flex items-center justify-between gap-2'>
              <span className='text-[10px] font-medium uppercase tracking-wider text-zinc-400'>
                Current User
              </span>
              <span
                className={`inline-flex items-center rounded-[calc(var(--ui-radius-row)-4px)] px-1.5 py-0.5 text-[10px] font-medium ${
                  (authInfo?.role || 'user') === 'owner'
                    ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-300/30'
                    : (authInfo?.role || 'user') === 'admin'
                    ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/30'
                    : 'bg-zinc-600/40 text-zinc-200 ring-1 ring-zinc-500/40'
                }`}
              >
                {getRoleText(authInfo?.role || 'user')}
              </span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              <div className='truncate text-[13px] font-medium text-zinc-100'>
                {authInfo?.username || 'default'}
              </div>
              <div className='shrink-0 text-[10px] text-zinc-500'>
                Storage:
                {storageType === 'localstorage' ? 'Local' : storageType}
              </div>
            </div>
          </div>
        </div>

        {/* 菜单项 */}
        <div className='pt-1'>
          {/* 管理面板按钮 */}
          {showAdminPanel && (
            <button
              onClick={handleAdminPanel}
              className='ui-glass-row flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-zinc-200 hover:text-white'
            >
              <Shield className='h-3.5 w-3.5 text-zinc-400' />
              <span className='font-medium'>Admin Panel</span>
            </button>
          )}

          {/* 修改密码按钮 */}
          {showChangePassword && (
            <button
              onClick={handleChangePassword}
              className='ui-glass-row flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-zinc-200 hover:text-white'
            >
              <KeyRound className='h-3.5 w-3.5 text-zinc-400' />
              <span className='font-medium'>Change Password</span>
            </button>
          )}

          {/* 登出按钮 */}
          <button
            onClick={handleLogout}
            className='flex w-full items-center gap-2 rounded-[var(--ui-radius-row)] px-2.5 py-2 text-left text-[13px] text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200'
          >
            <LogOut className='h-3.5 w-3.5' />
            <span className='font-medium'>Sign Out</span>
          </button>
        </div>
      </motion.div>
    </>
  );
  const changePasswordPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 z-[1000] bg-[var(--ui-glass-overlay-bg)] backdrop-blur-sm'
        onClick={handleCloseChangePassword}
      />

      {/* 修改密码面板 */}
      <div className='ui-glass-dialog fixed top-1/2 left-1/2 z-[1001] w-[calc(100%-1rem)] sm:w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between mb-6'>
          <h3 className='text-lg font-semibold text-zinc-100'>
            Change Password
          </h3>
          <button
            onClick={handleCloseChangePassword}
            className='flex h-8 w-8 items-center justify-center rounded-full p-1 text-zinc-400 transition-colors hover:bg-[var(--ui-glass-row-hover)]'
            aria-label='Close'
          >
            <X className='w-full h-full' />
          </button>
        </div>

        {/* 表单 */}
        <div className='space-y-4'>
          {/* 新密码输入 */}
          <div>
            <label className='mb-2 block text-sm font-medium text-zinc-200'>
              New Password
            </label>
            <input
              type='password'
              className='ui-glass-input w-full px-3 py-2 text-sm placeholder-zinc-500'
              placeholder='Enter a new password'
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </div>

          {/* 确认密码输入 */}
          <div>
            <label className='mb-2 block text-sm font-medium text-zinc-200'>
              Confirm Password
            </label>
            <input
              type='password'
              className='ui-glass-input w-full px-3 py-2 text-sm placeholder-zinc-500'
              placeholder='Enter the new password again'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordLoading}
            />
          </div>

          {/* 错误信息 */}
          {passwordError && (
            <div className='rounded-xl border border-rose-400/30 bg-rose-500/15 p-3 text-sm text-rose-300'>
              {passwordError}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className='mt-3 flex gap-3'>
          <button
            onClick={handleCloseChangePassword}
            className='flex-1 rounded-xl bg-[var(--ui-glass-row-hover)] px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-[var(--ui-glass-row-active)] disabled:cursor-not-allowed disabled:opacity-50'
            disabled={passwordLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitChangePassword}
            className='flex-1 rounded-xl bg-blue-600/90 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
            disabled={passwordLoading || !newPassword || !confirmPassword}
          >
            {passwordLoading ? 'Changing...' : 'Confirm'}
          </button>
        </div>

        {/* 底部说明 */}
        <div className='mt-4 border-t border-[var(--ui-glass-divider)] pt-4'>
          <p className='text-xs text-zinc-500 text-center'>
            You will need to sign in again after changing your password.
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleHoverOpenMenu}
        onMouseLeave={scheduleCloseMenu}
        className={`relative m-0 flex items-center justify-center ${
          avatarSize === 'compact' ? 'h-full w-11' : ''
        }`}
      >
        <button
          onClick={handleMenuClick}
          onFocus={handleMenuFocus}
          onPointerDown={handleMenuPointerDown}
          className={`${
            triggerClassName ||
            `border border-white/15 bg-transparent transition-transform duration-160 hover:scale-105 focus-visible:ring-2 focus-visible:ring-white/30 ${
              isOpen ? 'scale-105 border-white/25' : ''
            }`
          } m-0 inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full p-0 shadow-none outline-none focus-visible:outline-none`}
          aria-label='User Menu'
        >
          <UserShaderAvatar username={authInfo?.username} size={avatarSize} />
        </button>
        {updateStatus === UpdateStatus.HAS_UPDATE && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {mounted &&
        createPortal(
          <AnimatePresence>{isOpen ? menuPanel : null}</AnimatePresence>,
          document.body
        )}

      {/* 使用 Portal 将修改密码面板渲染到 document.body */}
      {isChangePasswordOpen &&
        mounted &&
        createPortal(changePasswordPanel, document.body)}
    </>
  );
};
