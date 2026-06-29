import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import 'sweetalert2/dist/sweetalert2.min.css';

import { getConfig } from '@/lib/config';
import { DEFAULT_ANNOUNCEMENT } from '@/lib/legal';

import { GlobalErrorIndicator } from '../components/GlobalErrorIndicator';
import { I18nProvider } from '../components/I18nProvider';
import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

// Generate metadata from the active site configuration.
export async function generateMetadata(): Promise<Metadata> {
  let siteName = process.env.SITE_NAME || 'Luma';
  if (
    process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1' &&
    process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'upstash'
  ) {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
  }

  return {
    title: siteName,
    description: 'Movie and TV discovery',
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/icon-192x192.png', sizes: '192x192' }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let siteName = process.env.SITE_NAME || 'Luma';
  let announcement =
    process.env.ANNOUNCEMENT || DEFAULT_ANNOUNCEMENT;
  let enableRegister = process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
  if (
    process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'd1' &&
    process.env.NEXT_PUBLIC_STORAGE_TYPE !== 'upstash'
  ) {
    const config = await getConfig();
    siteName = config.SiteConfig.SiteName;
    announcement = config.SiteConfig.Announcement;
    enableRegister = config.UserConfig.AllowRegister;
  }

  // Expose runtime flags on window.RUNTIME_CONFIG for client components.
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    ENABLE_REGISTER: enableRegister,
  };

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1.0, viewport-fit=cover'
        />
        {/* Serialize runtime flags directly into the initial document. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig)};`,
          }}
        />
      </head>
      <body
        className={`${inter.className} min-h-screen bg-black text-gray-200`}
      >
        <ThemeProvider
          attribute='class'
          defaultTheme='dark'
          enableSystem={false}
          forcedTheme='dark'
          disableTransitionOnChange
        >
          <I18nProvider>
            <SiteProvider siteName={siteName} announcement={announcement}>
              {children}
              <GlobalErrorIndicator />
            </SiteProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
