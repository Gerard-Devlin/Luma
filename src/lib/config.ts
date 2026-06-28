/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';
import { DEFAULT_ANNOUNCEMENT } from './legal';
import runtimeConfig from './runtime';

interface ConfigFileStruct {
  cache_time?: number;
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
}

let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

function getDefaultSiteConfig(): AdminConfig['SiteConfig'] {
  return {
    SiteName: process.env.SITE_NAME || 'Luma',
    Announcement: process.env.ANNOUNCEMENT || DEFAULT_ANNOUNCEMENT,
    SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
  };
}

function getDefaultUserConfig(
  users: AdminConfig['UserConfig']['Users'] = []
): AdminConfig['UserConfig'] {
  return {
    AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
    Users: users,
  };
}

function getFileCustomCategories(): AdminConfig['CustomCategories'] {
  return (fileConfig.custom_category || []).map((category) => ({
    name: category.name,
    type: category.type,
    query: category.query,
    from: 'config',
    disabled: false,
  }));
}

function applyEnvironmentOverrides(adminConfig: AdminConfig): AdminConfig {
  adminConfig.SiteConfig.SiteName = process.env.SITE_NAME || 'Luma';
  adminConfig.SiteConfig.Announcement =
    process.env.ANNOUNCEMENT || DEFAULT_ANNOUNCEMENT;
  adminConfig.SiteConfig.SiteInterfaceCacheTime =
    adminConfig.SiteConfig.SiteInterfaceCacheTime ||
    fileConfig.cache_time ||
    7200;
  adminConfig.UserConfig.AllowRegister =
    process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
  return adminConfig;
}

function syncOwnerUser(adminConfig: AdminConfig): void {
  const ownerUser = process.env.USERNAME || '';
  if (!ownerUser) return;

  let hasOwner = false;
  adminConfig.UserConfig.Users.forEach((user) => {
    if (user.username !== ownerUser && user.role === 'owner') {
      user.role = 'user';
    }
    if (user.username === ownerUser) {
      hasOwner = true;
      user.role = 'owner';
    }
  });

  if (!hasOwner) {
    adminConfig.UserConfig.Users.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }
}

function mergeUsersFromStorage(
  adminConfig: AdminConfig,
  userNames: string[]
): void {
  const existedUsers = new Set(
    (adminConfig.UserConfig.Users || []).map((user) => user.username)
  );

  userNames.forEach((username) => {
    if (!existedUsers.has(username)) {
      adminConfig.UserConfig.Users.push({
        username,
        role: 'user',
      });
    }
  });

  syncOwnerUser(adminConfig);
}

function mergeCustomCategories(
  adminConfig: AdminConfig,
  keepCustomCategories = true
): void {
  const fileCategories = getFileCustomCategories();
  if (!keepCustomCategories) {
    adminConfig.CustomCategories = fileCategories;
    return;
  }

  const categoryMap = new Map(
    (adminConfig.CustomCategories || []).map((category) => [
      `${category.query}-${category.type}`,
      category,
    ])
  );

  fileCategories.forEach((category) => {
    categoryMap.set(`${category.query}-${category.type}`, category);
  });

  const fileCategoryKeys = new Set(
    fileCategories.map((category) => `${category.query}-${category.type}`)
  );
  categoryMap.forEach((category, key) => {
    if (!fileCategoryKeys.has(key)) {
      category.from = 'custom';
    }
  });

  adminConfig.CustomCategories = Array.from(categoryMap.values());
}

function createAdminConfig(
  users: AdminConfig['UserConfig']['Users'] = []
): AdminConfig {
  return {
    SiteConfig: getDefaultSiteConfig(),
    UserConfig: getDefaultUserConfig(users),
    CustomCategories: getFileCustomCategories(),
  };
}

async function loadFileConfig(): Promise<void> {
  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('Loaded dynamic config');
  } else {
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }
}

async function getStorageUserNames(
  storage: ReturnType<typeof getStorage> | null
): Promise<string[]> {
  if (!storage || typeof (storage as any).getAllUsers !== 'function') {
    return [];
  }

  try {
    return await (storage as any).getAllUsers();
  } catch (error) {
    console.error('Failed to load user list:', error);
    return [];
  }
}

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  await loadFileConfig();

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    let storage: ReturnType<typeof getStorage> | null = null;
    try {
      storage = getStorage();
    } catch (error) {
      console.warn(
        'Storage initialization failed, fallback to file-based admin config:',
        error
      );
    }

    try {
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      const userNames = await getStorageUserNames(storage);

      if (adminConfig) {
        adminConfig.SiteConfig = {
          ...getDefaultSiteConfig(),
          ...adminConfig.SiteConfig,
        };
        adminConfig.UserConfig = {
          ...getDefaultUserConfig(),
          ...adminConfig.UserConfig,
          Users: adminConfig.UserConfig.Users || [],
        };
        adminConfig.CustomCategories = adminConfig.CustomCategories || [];
        mergeCustomCategories(adminConfig);
        mergeUsersFromStorage(adminConfig, userNames);
        applyEnvironmentOverrides(adminConfig);
      } else {
        const allUsers = userNames.map((username) => ({
          username,
          role: 'user' as const,
        }));
        adminConfig = createAdminConfig(allUsers);
        syncOwnerUser(adminConfig);
      }

      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }

      cachedConfig = adminConfig;
    } catch (err) {
      console.error('Failed to load admin config:', err);
      cachedConfig = createAdminConfig();
    }
  } else {
    cachedConfig = createAdminConfig();
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }

  await loadFileConfig();

  const storage = getStorage();
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }

  if (adminConfig) {
    adminConfig.SiteConfig = {
      ...getDefaultSiteConfig(),
      ...adminConfig.SiteConfig,
    };
    adminConfig.UserConfig = {
      ...getDefaultUserConfig(),
      ...adminConfig.UserConfig,
      Users: adminConfig.UserConfig.Users || [],
    };
    adminConfig.CustomCategories = getFileCustomCategories();
    applyEnvironmentOverrides(adminConfig);
    syncOwnerUser(adminConfig);
    cachedConfig = adminConfig;
  } else {
    await initConfig();
  }

  return cachedConfig;
}

export async function resetConfig() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const storage = getStorage();
  const userNames = await getStorageUserNames(storage);

  await loadFileConfig();

  const allUsers = userNames.map((username) => ({
    username,
    role: 'user' as const,
  }));
  const adminConfig = createAdminConfig(allUsers);
  syncOwnerUser(adminConfig);

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }

  if (cachedConfig == null) {
    cachedConfig = adminConfig;
  }

  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.CustomCategories =
    storageType === 'redis' ? adminConfig.CustomCategories : [];
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}
