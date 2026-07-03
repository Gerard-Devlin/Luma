'use client';

import type { CSSProperties } from 'react';
import styled from 'styled-components';

import { cn } from '@/lib/utils';

interface WarpLoadingOverlayProps {
  visible?: boolean;
  className?: string;
}

type MatrixColumnStyle = CSSProperties & {
  '--matrix-delay': string;
  '--matrix-duration': string;
  '--matrix-left': string;
};

const MATRIX_PATTERNS = Array.from({ length: 5 }, (_, index) => index);

const MATRIX_STREAMS = {
  base: '\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D2\u30D5\u30D8\u30DB\u30DE\u30DF\u30E0\u30E1\u30E2\u30E4\u30E6\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EF\u30F2\u30F3ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  even: '\u30AB\u30AF\u30B0\u30B1\u30B4\u30B6\u30B8\u30BA\u30BC\u30BE\u30C0\u30C2\u30C5\u30C7\u30C9\u30D0\u30D3\u30D6\u30D9\u30DC\u30D1\u30D4\u30D7\u30DA\u30DDABCDEFGHIJKLMNOPQRSTUVWXYZ',
  fifth:
    '\u30AB\u30B6\u30C0\u30D0\u30D1\u30AC\u30B8\u30C2\u30D3\u30D4\u30AE\u30BA\u30C5\u30D6\u30D7\u30B0\u30BC\u30C7\u30D9\u30DA\u30B2\u30BE\u30C9\u30DC\u30DD!@#$%^&*()_+-=[]{}|;:,.<>?',
  fourth:
    '\u30F3\u30F2\u30ED\u30E8\u30E2\u30DB\u30CE\u30C8\u30BD\u30B3\u30AA\u30EF\u30EC\u30E4\u30E1\u30D8\u30CD\u30C6\u30BB\u30B1\u30A8\u30F3\u30EB\u30E6\u30DF\u30D5\u30CC\u30C4\u30B9\u30AF\u30A6',
  odd: '\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8\u30CA\u30CB\u30CC\u30CD\u30CE123456789',
  third:
    '\u30A2\u30AB\u30B5\u30BF\u30CA\u30CF\u30DE\u30E4\u30E9\u30EF\u30A4\u30AD\u30B7\u30C1\u30CB\u30D2\u30DF\u30EA\u30F2\u30A6\u30AF\u30B9\u30C4\u30CC\u30D5\u30E0\u30E6\u30EB0987654321',
};

const MATRIX_COLUMN_STYLES: MatrixColumnStyle[] = [
  {
    '--matrix-left': '0px',
    '--matrix-delay': '-2.5s',
    '--matrix-duration': '3s',
  },
  {
    '--matrix-left': '25px',
    '--matrix-delay': '-3.2s',
    '--matrix-duration': '4s',
  },
  {
    '--matrix-left': '50px',
    '--matrix-delay': '-1.8s',
    '--matrix-duration': '2.5s',
  },
  {
    '--matrix-left': '75px',
    '--matrix-delay': '-2.9s',
    '--matrix-duration': '3.5s',
  },
  {
    '--matrix-left': '100px',
    '--matrix-delay': '-1.5s',
    '--matrix-duration': '3s',
  },
  {
    '--matrix-left': '125px',
    '--matrix-delay': '-3.8s',
    '--matrix-duration': '4.5s',
  },
  {
    '--matrix-left': '150px',
    '--matrix-delay': '-2.1s',
    '--matrix-duration': '2.8s',
  },
  {
    '--matrix-left': '175px',
    '--matrix-delay': '-2.7s',
    '--matrix-duration': '3.2s',
  },
  {
    '--matrix-left': '200px',
    '--matrix-delay': '-3.4s',
    '--matrix-duration': '3.8s',
  },
  {
    '--matrix-left': '225px',
    '--matrix-delay': '-1.9s',
    '--matrix-duration': '2.7s',
  },
  {
    '--matrix-left': '250px',
    '--matrix-delay': '-3.6s',
    '--matrix-duration': '4.2s',
  },
  {
    '--matrix-left': '275px',
    '--matrix-delay': '-2.3s',
    '--matrix-duration': '3.1s',
  },
  {
    '--matrix-left': '300px',
    '--matrix-delay': '-3.1s',
    '--matrix-duration': '3.6s',
  },
  {
    '--matrix-left': '325px',
    '--matrix-delay': '-2.6s',
    '--matrix-duration': '2.9s',
  },
  {
    '--matrix-left': '350px',
    '--matrix-delay': '-3.7s',
    '--matrix-duration': '4.1s',
  },
  {
    '--matrix-left': '375px',
    '--matrix-delay': '-2.8s',
    '--matrix-duration': '3.3s',
  },
  {
    '--matrix-left': '400px',
    '--matrix-delay': '-3.3s',
    '--matrix-duration': '3.7s',
  },
  {
    '--matrix-left': '425px',
    '--matrix-delay': '-2.2s',
    '--matrix-duration': '2.6s',
  },
  {
    '--matrix-left': '450px',
    '--matrix-delay': '-3.9s',
    '--matrix-duration': '4.3s',
  },
  {
    '--matrix-left': '475px',
    '--matrix-delay': '-2.4s',
    '--matrix-duration': '3.4s',
  },
  {
    '--matrix-left': '500px',
    '--matrix-delay': '-1.7s',
    '--matrix-duration': '2.4s',
  },
  {
    '--matrix-left': '525px',
    '--matrix-delay': '-3.5s',
    '--matrix-duration': '3.9s',
  },
  {
    '--matrix-left': '550px',
    '--matrix-delay': '-2s',
    '--matrix-duration': '3s',
  },
  {
    '--matrix-left': '575px',
    '--matrix-delay': '-4s',
    '--matrix-duration': '4.4s',
  },
  {
    '--matrix-left': '600px',
    '--matrix-delay': '-1.6s',
    '--matrix-duration': '2.3s',
  },
  {
    '--matrix-left': '625px',
    '--matrix-delay': '-3s',
    '--matrix-duration': '3.5s',
  },
  {
    '--matrix-left': '650px',
    '--matrix-delay': '-3.8s',
    '--matrix-duration': '4s',
  },
  {
    '--matrix-left': '675px',
    '--matrix-delay': '-2.5s',
    '--matrix-duration': '2.8s',
  },
  {
    '--matrix-left': '700px',
    '--matrix-delay': '-3.2s',
    '--matrix-duration': '3.6s',
  },
  {
    '--matrix-left': '725px',
    '--matrix-delay': '-2.7s',
    '--matrix-duration': '3.2s',
  },
  {
    '--matrix-left': '750px',
    '--matrix-delay': '-1.8s',
    '--matrix-duration': '2.7s',
  },
  {
    '--matrix-left': '775px',
    '--matrix-delay': '-3.6s',
    '--matrix-duration': '4.1s',
  },
  {
    '--matrix-left': '800px',
    '--matrix-delay': '-2.1s',
    '--matrix-duration': '3.1s',
  },
  {
    '--matrix-left': '825px',
    '--matrix-delay': '-3.4s',
    '--matrix-duration': '3.7s',
  },
  {
    '--matrix-left': '850px',
    '--matrix-delay': '-2.8s',
    '--matrix-duration': '2.9s',
  },
  {
    '--matrix-left': '875px',
    '--matrix-delay': '-3.7s',
    '--matrix-duration': '4.2s',
  },
  {
    '--matrix-left': '900px',
    '--matrix-delay': '-2.3s',
    '--matrix-duration': '3.3s',
  },
  {
    '--matrix-left': '925px',
    '--matrix-delay': '-1.9s',
    '--matrix-duration': '2.5s',
  },
  {
    '--matrix-left': '950px',
    '--matrix-delay': '-3.5s',
    '--matrix-duration': '3.8s',
  },
  {
    '--matrix-left': '975px',
    '--matrix-delay': '-2.6s',
    '--matrix-duration': '3.4s',
  },
];

function getMatrixStream(columnNumber: number) {
  if (columnNumber % 5 === 0) return MATRIX_STREAMS.fifth;
  if (columnNumber % 4 === 0) return MATRIX_STREAMS.fourth;
  if (columnNumber % 3 === 0) return MATRIX_STREAMS.third;
  if (columnNumber % 2 === 0) return MATRIX_STREAMS.even;
  return MATRIX_STREAMS.odd;
}

const MATRIX_COLUMNS = MATRIX_COLUMN_STYLES.map((style, index) => ({
  id: index,
  stream: getMatrixStream(index + 1) || MATRIX_STREAMS.base,
  style,
}));

export default function WarpLoadingOverlay({
  visible = true,
  className,
}: WarpLoadingOverlayProps) {
  if (!visible) return null;

  return (
    <StyledWrapper
      className={cn(
        'fixed inset-0 z-[2000] overflow-hidden bg-black',
        className
      )}
    >
      <div aria-hidden='true' className='matrix-container'>
        {MATRIX_PATTERNS.map((pattern) => (
          <div className='matrix-pattern' key={pattern}>
            {MATRIX_COLUMNS.map((column) => (
              <div
                className='matrix-column'
                data-stream={column.stream}
                key={column.id}
                style={column.style}
              />
            ))}
          </div>
        ))}
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  height: 100%;
  width: 100%;

  .matrix-container {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    background: #000;
  }

  .matrix-pattern {
    position: relative;
    width: 1000px;
    height: 100%;
    flex-shrink: 0;
  }

  .matrix-column {
    position: absolute;
    top: -100%;
    left: var(--matrix-left);
    width: 20px;
    height: 100%;
    font-size: 16px;
    line-height: 18px;
    font-weight: bold;
    animation: fall var(--matrix-duration) linear var(--matrix-delay) infinite;
    white-space: nowrap;
  }

  .matrix-column::before {
    content: attr(data-stream);
    position: absolute;
    top: 0;
    left: 0;
    background: linear-gradient(
      to bottom,
      #ffffff 0%,
      #ffffff 5%,
      #00ff41 10%,
      #00ff41 20%,
      #00dd33 30%,
      #00bb22 40%,
      #009911 50%,
      #007700 60%,
      #005500 70%,
      #003300 80%,
      rgba(0, 255, 65, 0.5) 90%,
      transparent 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    writing-mode: vertical-lr;
    letter-spacing: 0;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @keyframes fall {
    0% {
      transform: translateY(-10%);
      opacity: 1;
    }

    100% {
      transform: translateY(200%);
      opacity: 0;
    }
  }

  @media (max-width: 768px) {
    .matrix-column {
      width: 18px;
      font-size: 14px;
      line-height: 16px;
    }
  }

  @media (max-width: 480px) {
    .matrix-column {
      width: 15px;
      font-size: 12px;
      line-height: 14px;
    }
  }
`;
