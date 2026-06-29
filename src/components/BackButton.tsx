import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BackButtonProps {
  variant?: 'default' | 'floating';
  className?: string;
}

export function BackButton({ variant = 'default', className }: BackButtonProps) {
  const { t } = useTranslation();
  const buttonClassName = className
    ? className
    : variant === 'floating'
    ? 'ui-glass-control flex h-11 w-11 items-center justify-center p-2.5'
    : 'ui-glass-control flex h-10 w-10 items-center justify-center p-2 text-zinc-200 hover:text-white';

  return (
    <button
      type='button'
      onClick={() => window.history.back()}
      className={buttonClassName}
      aria-label={t('common.back')}
    >
      <ArrowLeft className='h-5 w-5 shrink-0' />
    </button>
  );
}
