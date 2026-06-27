'use client';

import matrixStyles from '@/app/loading.module.css';
import { cn } from '@/lib/utils';

interface MatrixLoadingOverlayProps {
  visible: boolean;
  className?: string;
}

const MATRIX_PATTERN_COUNT = 5;
const MATRIX_COLUMN_COUNT = 40;

export default function MatrixLoadingOverlay({
  visible,
  className,
}: MatrixLoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div className={cn('fixed inset-0 z-[2000]', className)}>
      <div className={matrixStyles['matrix-container']}>
        {Array.from({ length: MATRIX_PATTERN_COUNT }).map((_, patternIndex) => (
          <div key={patternIndex} className={matrixStyles['matrix-pattern']}>
            {Array.from({ length: MATRIX_COLUMN_COUNT }).map(
              (__unused, columnIndex) => (
                <div key={columnIndex} className={matrixStyles['matrix-column']} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

