import React, { useCallback, useEffect, useRef, useState } from 'react';

interface CapsuleSwitchProps {
  options: { label: string; value: string }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

const CapsuleSwitch: React.FC<CapsuleSwitchProps> = ({
  options,
  active,
  onChange,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const activeIndex = options.findIndex((opt) => opt.value === active);

  // 更新指示器位置
  const updateIndicatorPosition = useCallback(() => {
    if (activeIndex < 0) {
      setIndicatorStyle({ left: 0, width: 0 });
      return;
    }

    const button = buttonRefs.current[activeIndex];
    if (!button || button.offsetWidth <= 0) return;

    setIndicatorStyle({
      left: button.offsetLeft,
      width: button.offsetWidth,
    });
  }, [activeIndex]);

  // 组件挂载时立即计算初始位置
  useEffect(() => {
    const timeoutId = setTimeout(updateIndicatorPosition, 0);
    return () => clearTimeout(timeoutId);
  }, [updateIndicatorPosition]);

  // 监听选中项变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => updateIndicatorPosition());
    observer.observe(container);
    buttonRefs.current.forEach((button) => {
      if (button) observer.observe(button);
    });

    return () => observer.disconnect();
  }, [options.length, updateIndicatorPosition]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex rounded-full border border-white/5 bg-[#1f2125] p-0.5 ${
        className || ''
      }`}
    >
      {/* 滑动的白色背景指示器 */}
      {indicatorStyle.width > 0 && (
        <div
          className='absolute bottom-0.5 top-0.5 rounded-full border border-white/5 bg-[#2d3035] shadow-sm transition-all duration-300 ease-out'
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}

      {options.map((opt, index) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all duration-200 cursor-pointer ${
              isActive ? 'text-zinc-100' : 'text-zinc-300 hover:text-zinc-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default CapsuleSwitch;
