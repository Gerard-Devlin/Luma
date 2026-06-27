import styles from './loading.module.css';

const PATTERN_COUNT = 5;
const COLUMN_COUNT = 40;

export default function Loading() {
  return (
    <div className={styles['matrix-container']}>
      {Array.from({ length: PATTERN_COUNT }).map((_, patternIndex) => (
        <div key={patternIndex} className={styles['matrix-pattern']}>
          {Array.from({ length: COLUMN_COUNT }).map((__, columnIndex) => (
            <div key={columnIndex} className={styles['matrix-column']} />
          ))}
        </div>
      ))}
    </div>
  );
}
