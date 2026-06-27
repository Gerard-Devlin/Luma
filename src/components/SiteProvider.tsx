'use client';

import { createContext, ReactNode, useContext } from 'react';

import { DEFAULT_ANNOUNCEMENT } from '@/lib/legal';

const SiteContext = createContext<{ siteName: string; announcement?: string }>({
  // 默认值
  siteName: 'Luma',
  announcement: DEFAULT_ANNOUNCEMENT,
});

export const useSite = () => useContext(SiteContext);

export function SiteProvider({
  children,
  siteName,
  announcement,
}: {
  children: ReactNode;
  siteName: string;
  announcement?: string;
}) {
  return (
    <SiteContext.Provider value={{ siteName, announcement }}>
      {children}
    </SiteContext.Provider>
  );
}
