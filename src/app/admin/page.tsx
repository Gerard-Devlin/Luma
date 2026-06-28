/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { ChevronDown, ChevronUp, Settings, Users } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import PageLayout from '@/components/PageLayout';

// 缁熶竴寮圭獥鏂规硶锛堝繀椤诲湪棣栨浣跨敤鍓嶅畾涔夛級
const showError = (message: string) =>
  Swal.fire({ icon: 'error', title: 'Error', text: message });

const showSuccess = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: 'Success',
    text: message,
    timer: 2000,
    showConfirmButton: false,
  });

// 鏂板绔欑偣閰嶇疆绫诲瀷
interface SiteConfig {
  SiteName: string;
  Announcement: string;
  SiteInterfaceCacheTime: number;
}


// 鍙姌鍙犳爣绛剧粍浠?
interface CollapsibleTabProps {
  title: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleTab = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: CollapsibleTabProps) => {
  return (
    <div className='rounded-xl shadow-sm mb-4 overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700'>
      <button
        onClick={onToggle}
        className='w-full px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors'
      >
        <div className='flex items-center gap-3'>
          {icon}
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            {title}
          </h3>
        </div>
        <div className='text-gray-500 dark:text-gray-400'>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpanded && <div className='px-6 py-4'>{children}</div>}
    </div>
  );
};

// 鐢ㄦ埛閰嶇疆缁勪欢
interface UserConfigProps {
  config: AdminConfig | null;
  role: 'owner' | 'admin' | null;
  refreshConfig: () => Promise<void>;
}

const UserConfig = ({ config, role, refreshConfig }: UserConfigProps) => {
  const [userSettings, setUserSettings] = useState({
    enableRegistration: false,
  });
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
  });
  const [changePasswordUser, setChangePasswordUser] = useState({
    username: '',
    password: '',
  });

  // 褰撳墠鐧诲綍鐢ㄦ埛鍚?
  const currentUsername = getAuthInfoFromBrowserCookie()?.username || null;

  // 妫€娴嬪瓨鍌ㄧ被鍨嬫槸鍚︿负 d1
  const isD1Storage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'd1';
  const isUpstashStorage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'upstash';

  useEffect(() => {
    if (config?.UserConfig) {
      setUserSettings({
        enableRegistration: config.UserConfig.AllowRegister,
      });
    }
  }, [config]);

  // 鍒囨崲鍏佽娉ㄥ唽璁剧疆
  const toggleAllowRegister = async (value: boolean) => {
    try {
      // 鍏堟洿鏂版湰鍦?UI
      setUserSettings((prev) => ({ ...prev, enableRegistration: value }));

      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAllowRegister',
          allowRegister: value,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Operation failed: ${res.status}`);
      }

      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Operation failed');
      // revert toggle UI
      setUserSettings((prev) => ({ ...prev, enableRegistration: !value }));
    }
  };

  const handleBanUser = async (uname: string) => {
    await handleUserAction('ban', uname);
  };

  const handleUnbanUser = async (uname: string) => {
    await handleUserAction('unban', uname);
  };

  const handleSetAdmin = async (uname: string) => {
    await handleUserAction('setAdmin', uname);
  };

  const handleRemoveAdmin = async (uname: string) => {
    await handleUserAction('cancelAdmin', uname);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return;
    await handleUserAction('add', newUser.username, newUser.password);
    setNewUser({ username: '', password: '' });
    setShowAddUserForm(false);
  };

  const handleChangePassword = async () => {
    if (!changePasswordUser.username || !changePasswordUser.password) return;
    await handleUserAction(
      'changePassword',
      changePasswordUser.username,
      changePasswordUser.password
    );
    setChangePasswordUser({ username: '', password: '' });
    setShowChangePasswordForm(false);
  };

  const handleShowChangePasswordForm = (username: string) => {
    setChangePasswordUser({ username, password: '' });
    setShowChangePasswordForm(true);
    setShowAddUserForm(false); // 鍏抽棴娣诲姞鐢ㄦ埛琛ㄥ崟
  };

  const handleDeleteUser = async (username: string) => {
    const { isConfirmed } = await Swal.fire({
      title: 'Delete user?',
      text: `Deleting ${username} will also delete their search history, watch history, and favorites. This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!isConfirmed) return;

    await handleUserAction('deleteUser', username);
  };

  // 閫氱敤璇锋眰鍑芥暟
  const handleUserAction = async (
    action:
      | 'add'
      | 'ban'
      | 'unban'
      | 'setAdmin'
      | 'cancelAdmin'
      | 'changePassword'
      | 'deleteUser',
    targetUsername: string,
    targetPassword?: string
  ) => {
    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername,
          ...(targetPassword ? { targetPassword } : {}),
          action,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Operation failed: ${res.status}`);
      }

      // 鎴愬姛鍚庡埛鏂伴厤缃紙鏃犻渶鏁撮〉鍒锋柊锛?
      await refreshConfig();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        Loading...
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 鐢ㄦ埛缁熻 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          User Stats
        </h4>
        <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
          <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
            {config.UserConfig.Users.length}
          </div>
          <div className='text-sm text-blue-600 dark:text-blue-400'>
            Total users
          </div>
        </div>
      </div>

      {/* 娉ㄥ唽璁剧疆 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          Registration
        </h4>
        <div className='flex items-center justify-between'>
          <label
            className={`text-gray-700 dark:text-gray-300 ${
              isD1Storage || isUpstashStorage ? 'opacity-50' : ''
            }`}
          >
            Allow new user registration
            {isD1Storage && (
              <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
                (Change this with environment variables in D1 mode)
              </span>
            )}
            {isUpstashStorage && (
              <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
                (Change this with environment variables in Upstash mode)
              </span>
            )}
          </label>
          <button
            onClick={() =>
              !isD1Storage &&
              !isUpstashStorage &&
              toggleAllowRegister(!userSettings.enableRegistration)
            }
            disabled={isD1Storage || isUpstashStorage}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              userSettings.enableRegistration
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-700'
            } ${
              isD1Storage || isUpstashStorage
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                userSettings.enableRegistration
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 鐢ㄦ埛鍒楄〃 */}
      <div>
        <div className='flex items-center justify-between mb-3'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            Users
          </h4>
          <button
            onClick={() => {
              setShowAddUserForm(!showAddUserForm);
              if (showChangePasswordForm) {
                setShowChangePasswordForm(false);
                setChangePasswordUser({ username: '', password: '' });
              }
            }}
            className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors'
          >
            {showAddUserForm ? 'Cancel' : 'Add User'}
          </button>
        </div>

        {/* 娣诲姞鐢ㄦ埛琛ㄥ崟 */}
        {showAddUserForm && (
          <div className='mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='flex flex-col sm:flex-row gap-4 sm:gap-3'>
              <input
                type='text'
                placeholder='Username'
                value={newUser.username}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, username: e.target.value }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
              <input
                type='password'
                placeholder='Password'
                value={newUser.password}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, password: e.target.value }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
              <button
                onClick={handleAddUser}
                disabled={!newUser.username || !newUser.password}
                className='w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* 淇敼瀵嗙爜琛ㄥ崟 */}
        {showChangePasswordForm && (
          <div className='mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
            <h5 className='text-sm font-medium text-blue-800 dark:text-blue-300 mb-3'>
              Change User Password
            </h5>
            <div className='flex flex-col sm:flex-row gap-4 sm:gap-3'>
              <input
                type='text'
                placeholder='Username'
                value={changePasswordUser.username}
                disabled
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed'
              />
              <input
                type='password'
                placeholder='New password'
                value={changePasswordUser.password}
                onChange={(e) =>
                  setChangePasswordUser((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
              <button
                onClick={handleChangePassword}
                disabled={!changePasswordUser.password}
                className='w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
              >
                Change Password
              </button>
              <button
                onClick={() => {
                  setShowChangePasswordForm(false);
                  setChangePasswordUser({ username: '', password: '' });
                }}
                className='w-full sm:w-auto px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors'
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 鐢ㄦ埛鍒楄〃 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-gray-900'>
              <tr>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  Username
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  Role
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  Status
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  Actions
                </th>
              </tr>
            </thead>
            {/* 鎸夎鍒欐帓搴忕敤鎴凤細鑷繁 -> 绔欓暱(鑻ラ潪鑷繁) -> 绠＄悊鍛?-> 鍏朵粬 */}
            {(() => {
              const sortedUsers = [...config.UserConfig.Users].sort((a, b) => {
                type UserInfo = (typeof config.UserConfig.Users)[number];
                const priority = (u: UserInfo) => {
                  if (u.username === currentUsername) return 0;
                  if (u.role === 'owner') return 1;
                  if (u.role === 'admin') return 2;
                  return 3;
                };
                return priority(a) - priority(b);
              });
              return (
                <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
                  {sortedUsers.map((user) => {
                    // 淇敼瀵嗙爜鏉冮檺锛氱珯闀垮彲淇敼绠＄悊鍛樺拰鏅€氱敤鎴峰瘑鐮侊紝绠＄悊鍛樺彲淇敼鏅€氱敤鎴峰拰鑷繁鐨勫瘑鐮侊紝浣嗕换浣曚汉閮戒笉鑳戒慨鏀圭珯闀垮瘑鐮?
                    const canChangePassword =
                      user.role !== 'owner' && // 涓嶈兘淇敼绔欓暱瀵嗙爜
                      (role === 'owner' || // 绔欓暱鍙互淇敼绠＄悊鍛樺拰鏅€氱敤鎴峰瘑鐮?
                        (role === 'admin' &&
                          (user.role === 'user' ||
                            user.username === currentUsername))); // 绠＄悊鍛樺彲浠ヤ慨鏀规櫘閫氱敤鎴峰拰鑷繁鐨勫瘑鐮?

                    // 鍒犻櫎鐢ㄦ埛鏉冮檺锛氱珯闀垮彲鍒犻櫎闄よ嚜宸卞鐨勬墍鏈夌敤鎴凤紝绠＄悊鍛樹粎鍙垹闄ゆ櫘閫氱敤鎴?
                    const canDeleteUser =
                      user.username !== currentUsername &&
                      (role === 'owner' || // 绔欓暱鍙互鍒犻櫎闄よ嚜宸卞鐨勬墍鏈夌敤鎴?
                        (role === 'admin' && user.role === 'user')); // 绠＄悊鍛樹粎鍙垹闄ゆ櫘閫氱敤鎴?

                    // 鍏朵粬鎿嶄綔鏉冮檺锛氫笉鑳芥搷浣滆嚜宸憋紝绔欓暱鍙搷浣滄墍鏈夌敤鎴凤紝绠＄悊鍛樺彲鎿嶄綔鏅€氱敤鎴?
                    const canOperate =
                      user.username !== currentUsername &&
                      (role === 'owner' ||
                        (role === 'admin' && user.role === 'user'));
                    return (
                      <tr
                        key={user.username}
                        className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
                      >
                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                          {user.username}
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'owner'
                                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                                : user.role === 'admin'
                                ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {user.role === 'owner'
                              ? 'Owner'
                              : user.role === 'admin'
                              ? 'Admin'
                              : 'User'}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              !user.banned
                                ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {!user.banned ? 'Active' : 'Banned'}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
                          {/* 淇敼瀵嗙爜鎸夐挳 */}
                          {canChangePassword && (
                            <button
                              onClick={() =>
                                handleShowChangePasswordForm(user.username)
                              }
                              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-200 transition-colors'
                            >
                              Change Password
                            </button>
                          )}
                          {canOperate && (
                            <>
                              {/* 鍏朵粬鎿嶄綔鎸夐挳 */}
                              {user.role === 'user' && (
                                <button
                                  onClick={() => handleSetAdmin(user.username)}
                                  className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 dark:text-purple-200 transition-colors'
                                >
                                  Make Admin
                                </button>
                              )}
                              {user.role === 'admin' && (
                                <button
                                  onClick={() =>
                                    handleRemoveAdmin(user.username)
                                  }
                                  className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/40 dark:hover:bg-gray-700/60 dark:text-gray-200 transition-colors'
                                >
                                  Remove Admin
                                </button>
                              )}
                              {user.role !== 'owner' &&
                                (!user.banned ? (
                                  <button
                                    onClick={() => handleBanUser(user.username)}
                                    className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-300 transition-colors'
                                  >
                                    Ban
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleUnbanUser(user.username)
                                    }
                                    className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-300 transition-colors'
                                  >
                                    Unban
                                  </button>
                                ))}
                            </>
                          )}
                          {/* 鍒犻櫎鐢ㄦ埛鎸夐挳 - 鏀惧湪鏈€鍚庯紝浣跨敤鏇存槑鏄剧殑绾㈣壊鏍峰紡 */}
                          {canDeleteUser && (
                            <button
                              onClick={() => handleDeleteUser(user.username)}
                              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 transition-colors'
                            >
                              Delete User
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
};

// 瑙嗛婧愰厤缃粍浠?
const SiteConfigComponent = ({ config }: { config: AdminConfig | null }) => {
  const [siteSettings, setSiteSettings] = useState<SiteConfig>({
    SiteName: '',
    Announcement: '',
    SiteInterfaceCacheTime: 7200,
  });
  // 淇濆瓨鐘舵€?
  const [saving, setSaving] = useState(false);

  // 妫€娴嬪瓨鍌ㄧ被鍨嬫槸鍚︿负 d1 鎴?upstash
  const isD1Storage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'd1';
  const isUpstashStorage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'upstash';

  useEffect(() => {
    if (config?.SiteConfig) {
      setSiteSettings({
        ...config.SiteConfig,
      });
    }
  }, [config]);

  // 淇濆瓨绔欑偣閰嶇疆
  const handleSave = async () => {
    try {
      setSaving(true);
      const resp = await fetch('/api/admin/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...siteSettings }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${resp.status}`);
      }

      showSuccess('Saved. Please refresh the page.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        Loading...
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 绔欑偣鍚嶇О */}
      <div>
        <label
          className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${
            isD1Storage || isUpstashStorage ? 'opacity-50' : ''
          }`}
        >
          Site Name
          {isD1Storage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              (Change this with environment variables in D1 mode)
            </span>
          )}
          {isUpstashStorage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              (Change this with environment variables in Upstash mode)
            </span>
          )}
        </label>
        <input
          type='text'
          value={siteSettings.SiteName}
          onChange={(e) =>
            !isD1Storage &&
            !isUpstashStorage &&
            setSiteSettings((prev) => ({ ...prev, SiteName: e.target.value }))
          }
          disabled={isD1Storage || isUpstashStorage}
          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isD1Storage || isUpstashStorage
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
        />
      </div>

      {/* 绔欑偣鍏憡 */}
      <div>
        <label
          className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${
            isD1Storage || isUpstashStorage ? 'opacity-50' : ''
          }`}
        >
          Site Announcement
          {isD1Storage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              (Change this with environment variables in D1 mode)
            </span>
          )}
          {isUpstashStorage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              (Change this with environment variables in Upstash mode)
            </span>
          )}
        </label>
        <textarea
          value={siteSettings.Announcement}
          onChange={(e) =>
            !isD1Storage &&
            !isUpstashStorage &&
            setSiteSettings((prev) => ({
              ...prev,
              Announcement: e.target.value,
            }))
          }
          disabled={isD1Storage || isUpstashStorage}
          rows={3}
          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            isD1Storage || isUpstashStorage
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
        />
      </div>

      {/* 鎼滅储鎺ュ彛鍙媺鍙栨渶澶ч〉鏁?*/}
      {/* 绔欑偣鎺ュ彛缂撳瓨鏃堕棿 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          Site API Cache Time (seconds)
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SiteInterfaceCacheTime}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SiteInterfaceCacheTime: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
        />
      </div>

      {/* 鎿嶄綔鎸夐挳 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 ${
            saving
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white rounded-lg transition-colors`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

function AdminPageClient() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | null>(null);
  const [expandedTabs, setExpandedTabs] = useState<{ [key: string]: boolean }>({
    userConfig: false,
    siteConfig: false,
  });

  // 鑾峰彇绠＄悊鍛橀厤缃?
  // showLoading 鐢ㄤ簬鎺у埗鏄惁鍦ㄨ姹傛湡闂存樉绀烘暣浣撳姞杞介鏋躲€?
  const fetchConfig = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch(`/api/admin/config`);

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(`Failed to load config: ${data.error}`);
      }

      const data = (await response.json()) as AdminConfigResult;
      setConfig(data.Config);
      setRole(data.Role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load config';
      showError(msg);
      setError(msg);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // 棣栨鍔犺浇鏃舵樉绀洪鏋?
    fetchConfig(true);
  }, [fetchConfig]);

  // 鍒囨崲鏍囩灞曞紑鐘舵€?
  const toggleTab = (tabKey: string) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabKey]: !prev[tabKey],
    }));
  };

  // 鏂板: 閲嶇疆閰嶇疆澶勭悊鍑芥暟
  const handleResetConfig = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'Reset configuration?',
      text: 'This will reset user bans, admin settings, custom categories, and site settings to their defaults. Continue?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Reset',
      cancelButtonText: 'Cancel',
    });
    if (!isConfirmed) return;

    try {
      const response = await fetch(`/api/admin/reset`);
      if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`);
      }
      showSuccess('Reset complete. Please refresh the page.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  if (loading) {
    return (
      <PageLayout activePath='/admin'>
        <div className='px-2 sm:px-10 py-4 sm:py-8'>
          <div className='max-w-[95%] mx-auto'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8'>
              Admin Settings
            </h1>
            <div className='space-y-4'>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className='h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse'
                />
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    // 閿欒宸查€氳繃 SweetAlert2 灞曠ず锛屾澶勭洿鎺ヨ繑鍥炵┖
    return null;
  }

  return (
    <PageLayout activePath='/admin'>
      <div className='px-2 sm:px-10 py-4 sm:py-8'>
        <div className='max-w-[95%] mx-auto'>
          {/* 鏍囬 + 閲嶇疆閰嶇疆鎸夐挳 */}
          <div className='flex items-center gap-2 mb-8'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              Admin Settings
            </h1>
            {config && role === 'owner' && (
              <button
                onClick={handleResetConfig}
                className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md transition-colors'
              >
                Reset Config
              </button>
            )}
          </div>

          {/* 绔欑偣閰嶇疆鏍囩 */}
          <CollapsibleTab
            title='Site Settings'
            icon={
              <Settings
                size={20}
                className='text-gray-600 dark:text-gray-400'
              />
            }
            isExpanded={expandedTabs.siteConfig}
            onToggle={() => toggleTab('siteConfig')}
          >
            <SiteConfigComponent config={config} />
          </CollapsibleTab>

          <div className='space-y-4'>
            {/* 鐢ㄦ埛閰嶇疆鏍囩 */}
            <CollapsibleTab
              title='User Settings'
              icon={
                <Users size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.userConfig}
              onToggle={() => toggleTab('userConfig')}
            >
              <UserConfig
                config={config}
                role={role}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageClient />
    </Suspense>
  );
}
