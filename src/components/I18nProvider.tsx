'use client';

import { ReactNode, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n, { getInitialLanguage, persistLanguage } from '@/i18n/client';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const language = getInitialLanguage();
    void i18n.changeLanguage(language);
    persistLanguage(language);
    setReady(true);
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <div suppressHydrationWarning>{ready ? children : null}</div>
    </I18nextProvider>
  );
}
