import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  variant?: 'default' | 'floating';
  className?: string;
}

export function BackButton({ variant = 'default', className }: BackButtonProps) {
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
      aria-label='Back'
    >
      <ArrowLeft className='h-5 w-5 shrink-0' />
    </button>
  );
}
