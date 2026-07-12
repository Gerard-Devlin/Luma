'use client';

import { Languages } from 'lucide-react';
import Image from 'next/image';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { persistLanguage } from '@/i18n/client';
import type { AppLanguage } from '@/i18n/resources';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'control' | 'menuItem';
}

function LanguageFlag({ language }: { language: AppLanguage }) {
  return (
    <Image
      src={
        language === 'zh'
          ? '/icons/flag-china.webp'
          : '/icons/flag-united-states.webp'
      }
      alt=''
      width={24}
      height={24}
      aria-hidden='true'
      className='h-6 w-6 object-contain'
    />
  );
}

export default function LanguageSwitcher({
  className = '',
  variant = 'control',
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const currentLanguage: AppLanguage = i18n.language?.startsWith('zh')
    ? 'zh'
    : 'en';

  const nextLanguage: AppLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
  const label =
    currentLanguage === 'zh' ? t('language.english') : t('language.zh');
  const accessibleLabel = `${t('language.switcherLabel')}: ${label}`;

  const changeLanguage = useCallback(() => {
    void i18n.changeLanguage(nextLanguage);
    persistLanguage(nextLanguage);
  }, [i18n, nextLanguage]);

  if (variant === 'menuItem') {
    return (
      <button
        type='button'
        aria-label={accessibleLabel}
        title={accessibleLabel}
        onClick={changeLanguage}
        className={`ui-glass-row flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[13px] text-zinc-200 hover:text-white ${className}`}
      >
        <span className='inline-flex min-w-0 items-center gap-2'>
          <Languages className='h-3.5 w-3.5 shrink-0 text-zinc-400' />
          <span className='font-medium'>{t('common.language')}</span>
        </span>
        <span className='shrink-0'>
          <LanguageFlag language={nextLanguage} />
        </span>
      </button>
    );
  }

  return (
    <button
      type='button'
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onClick={changeLanguage}
      className={`ui-glass-control inline-flex h-11 w-11 items-center justify-center px-0 ${className}`}
    >
      <LanguageFlag language={nextLanguage} />
    </button>
  );
}
