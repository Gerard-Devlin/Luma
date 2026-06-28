/* eslint-disable react-hooks/exhaustive-deps */

'use client';

import React, { useEffect, useRef, useState } from 'react';

interface CustomCategory {
  name: string;
  type: 'movie' | 'tv';
  query: string;
}

interface DiscoverCustomSelectorProps {
  customCategories: CustomCategory[];
  primarySelection?: string;
  secondarySelection?: string;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
}

const DiscoverCustomSelector: React.FC<DiscoverCustomSelectorProps> = ({
  customCategories,
  primarySelection,
  secondarySelection,
  onPrimaryChange,
  onSecondaryChange,
}) => {
  // 为不同的选择器创建独立的refs和状态
  const primaryContainerRef = useRef<HTMLDivElement>(null);
  const primaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [primaryIndicatorStyle, setPrimaryIndicatorStyle] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  }>({ left: 0, width: 0, top: 0, height: 0 });

  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const secondaryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [secondaryIndicatorStyle, setSecondaryIndicatorStyle] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  }>({ left: 0, width: 0, top: 0, height: 0 });

  // 根据 customCategories 生成一级选择器选项（按 type 分组，电影优先）
  const primaryOptions = React.useMemo(() => {
    const types = Array.from(new Set(customCategories.map((cat) => cat.type)));
    // 确保电影类型排在前面
    const sortedTypes = types.sort((a, b) => {
      if (a === 'movie' && b !== 'movie') return -1;
      if (a !== 'movie' && b === 'movie') return 1;
      return 0;
    });
    return sortedTypes.map((type) => ({
      label: type === 'movie' ? 'Movies' : 'Series',
      value: type,
    }));
  }, [customCategories]);

  // 根据选中的一级选项生成二级选择器选项
  const secondaryOptions = React.useMemo(() => {
    if (!primarySelection) return [];
    return customCategories
      .filter((cat) => cat.type === primarySelection)
      .map((cat) => ({
        label: cat.name || cat.query,
        value: cat.query,
      }));
  }, [customCategories, primarySelection]);

  // 更新指示器位置的通用函数
  const updateIndicatorPosition = (
    activeIndex: number,
    containerRef: React.RefObject<HTMLDivElement>,
    buttonRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
    setIndicatorStyle: React.Dispatch<
      React.SetStateAction<{
        left: number;
        width: number;
        top: number;
        height: number;
      }>
    >
  ) => {
    if (
      activeIndex >= 0 &&
      buttonRefs.current[activeIndex] &&
      containerRef.current
    ) {
      const timeoutId = setTimeout(() => {
        const button = buttonRefs.current[activeIndex];
        const container = containerRef.current;
        if (button && container) {
          const buttonRect = button.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          if (buttonRect.width > 0) {
            setIndicatorStyle({
              left: buttonRect.left - containerRect.left,
              width: buttonRect.width,
              top: buttonRect.top - containerRect.top,
              height: buttonRect.height,
            });
          }
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  };

  // 组件挂载时立即计算初始位置
  useEffect(() => {
    // 主选择器初始位置
    if (primaryOptions.length > 0) {
      const activeIndex = primaryOptions.findIndex(
        (opt) => opt.value === (primarySelection || primaryOptions[0].value)
      );
      updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle
      );
    }

    // 副选择器初始位置
    if (secondaryOptions.length > 0) {
      const activeIndex = secondaryOptions.findIndex(
        (opt) => opt.value === (secondarySelection || secondaryOptions[0].value)
      );
      updateIndicatorPosition(
        activeIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle
      );
    }
  }, [primaryOptions, secondaryOptions]); // 当选项变化时重新计算

  // 监听主选择器变化
  useEffect(() => {
    if (primaryOptions.length > 0) {
      const activeIndex = primaryOptions.findIndex(
        (opt) => opt.value === primarySelection
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        primaryContainerRef,
        primaryButtonRefs,
        setPrimaryIndicatorStyle
      );
      return cleanup;
    }
  }, [primarySelection, primaryOptions]);

  // 监听副选择器变化
  useEffect(() => {
    if (secondaryOptions.length > 0) {
      const activeIndex = secondaryOptions.findIndex(
        (opt) => opt.value === secondarySelection
      );
      const cleanup = updateIndicatorPosition(
        activeIndex,
        secondaryContainerRef,
        secondaryButtonRefs,
        setSecondaryIndicatorStyle
      );
      return cleanup;
    }
  }, [secondarySelection, secondaryOptions]);

  // 渲染品牌图标
  const renderBrandIcon = (label: string) => {
    const normalized = label.trim().toLowerCase();
    if (normalized === 'hbo') {
      return (
        <span className='mr-1.5 inline-flex items-center'>
          {/* HBO 黑色（亮色模式） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='block dark:hidden'
          >
            <path
              fill='#000000'
              d='M7.042 16.896H4.414v-3.754H2.708v3.754H.01L0 7.22h2.708v3.6h1.706v-3.6h2.628zm12.043.046C21.795 16.94 24 14.689 24 11.978a4.89 4.89 0 0 0-4.915-4.92c-2.707-.002-4.09 1.991-4.432 2.795c.003-1.207-1.187-2.632-2.58-2.634H7.59v9.674l4.181.001c1.686 0 2.886-1.46 2.888-2.713c.385.788 1.72 2.762 4.427 2.76zm-7.665-3.936c.387 0 .692.382.692.817c0 .435-.305.817-.692.817h-1.33v-1.634zm.005-3.633c.387 0 .692.382.692.817c0 .436-.305.818-.692.818h-1.33V9.373zm1.77 2.607c.305-.039.813-.387.992-.61c-.063.276-.068 1.074.006 1.35c-.204-.314-.688-.701-.998-.74zm3.43 0a2.462 2.462 0 1 1 4.924 0a2.462 2.462 0 0 1-4.925 0zm2.462 1.936a1.936 1.936 0 1 0 0-3.872a1.936 1.936 0 0 0 0 3.872Z'
            />
          </svg>
          {/* HBO 白色（暗色模式） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='hidden dark:block'
          >
            <path
              fill='#ffffff'
              d='M7.042 16.896H4.414v-3.754H2.708v3.754H.01L0 7.22h2.708v3.6h1.706v-3.6h2.628zm12.043.046C21.795 16.94 24 14.689 24 11.978a4.89 4.89 0 0 0-4.915-4.92c-2.707-.002-4.09 1.991-4.432 2.795c.003-1.207-1.187-2.632-2.58-2.634H7.59v9.674l4.181.001c1.686 0 2.886-1.46 2.888-2.713c.385.788 1.72 2.762 4.427 2.76zm-7.665-3.936c.387 0 .692.382.692.817c0 .435-.305.817-.692.817h-1.33v-1.634zm.005-3.633c.387 0 .692.382.692.817c0 .436-.305.818-.692.818h-1.33V9.373zm1.77 2.607c.305-.039.813-.387.992-.61c-.063.276-.068 1.074.006 1.35c-.204-.314-.688-.701-.998-.74zm3.43 0a2.462 2.462 0 1 1 4.924 0a2.462 2.462 0 0 1-4.925 0zm2.462 1.936a1.936 1.936 0 1 0 0-3.872a1.936 1.936 0 0 0 0 3.872Z'
            />
          </svg>
        </span>
      );
    }
    if (normalized === 'netflix') {
      return (
        <span className='mr-1.5 inline-flex items-center'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 512 138'
          >
            <path
              fill='#DB202C'
              d='M340.657 0v100.203c12.36.575 24.687 1.27 36.98 2.09v21.245a1822.444 1822.444 0 0 0-58.542-2.959V0h21.562ZM512 .012l-28.077 65.094l28.07 72.438l-.031.013a1789.409 1789.409 0 0 0-24.576-3.323l-15.763-40.656l-15.913 36.882a1815.88 1815.88 0 0 0-22.662-2.36l27.371-63.43L435.352.013h23.325l14.035 36.184L488.318.012H512ZM245.093 119.526V.011h60.19v21.436h-38.628v27.78h29.227v21.245h-29.227v49.05l-21.562.004ZM164.58 21.448V.01h66.69v21.437h-22.565v98.66c-7.197.19-14.386.412-21.56.683V21.448H164.58ZM90.868 126.966V.014h59.89v21.435h-38.331v29.036c8.806-.113 21.327-.24 29.117-.222V71.51c-9.751-.12-20.758.134-29.117.217v32.164a1848.195 1848.195 0 0 1 38.331-2.62v21.247a1815.638 1815.638 0 0 0-59.89 4.45ZM48.571 77.854L48.57.01h21.562v128.96c-7.882.81-15.75 1.673-23.603 2.584L21.56 59.824v74.802a1834.87 1834.87 0 0 0-21.561 2.936V.012H20.49l28.08 77.842Zm346.854 46.965V.012h21.563V126.6c-7.179-.64-14.364-1.23-21.563-1.78Z'
            />
          </svg>
        </span>
      );
    }
    if (
      normalized === 'disney+' ||
      normalized === 'disney plus' ||
      normalized === 'disney'
    ) {
      return (
        <span className='mr-1.5 inline-flex items-center'>
          {/* Disney 黑色（亮色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='block dark:hidden'
          >
            <path
              fill='#000000'
              d='M2.056 6.834C1.572 6.834 1 6.77 1 6.483c0-2.023 3.562-2.11 5.08-2.11c1.978 0 4.506.614 6.66 1.384c3.277 1.188 9.917 5.145 9.917 9.674c0 4.001-4.31 5.914-8.311 5.914a22.376 22.376 0 0 1-3.21-.33c-.066.243-.11.418-.264.924a4.324 4.324 0 0 1-.77.087l-.505-.043c-.33-.396-.44-1.033-.572-1.715c-2-1.165-3.298-2.155-3.891-2.836c-.506-.528-1.078-1.232-1.078-1.913c0-.351.22-.66.726-1.01c1.034-.77 2.352-1.188 4.507-1.563l.044-.9c.022-.22.242-2.573.748-3.013c.813.66.901 1.341.967 2.353c.022.44.044.901.11 1.385h.308c1.539 0 6.244.395 6.244 2.616c0 .528-.77 1.517-1.518 1.517a1.9 1.9 0 0 1-.966-.285c.329-.375.813-.704.945-.99c-.44-.528-2.814-1.143-4.551-1.143a4.043 4.043 0 0 0-.572.022l.022 4.815c.703.44 1.561.483 2.11.483c2.42 0 7.431-.417 7.431-4.331c0-3.87-4.946-6.86-8.64-8.266a21.394 21.394 0 0 0-7.937-1.496a7.22 7.22 0 0 0-1.803.198c-.373.088-.505.176-.505.264c0 .153.747.242.836.286a.221.221 0 0 1 .11.175a.26.26 0 0 1-.088.176c-.089 0-.286.022-.528.022M9.2 14.551c-2.176.177-4.595.397-4.595 1.166c0 .594 1.012 1.32 1.627 1.781a7.052 7.052 0 0 0 2.77 1.319zm11.155-9.85c-.02.428-.042.942-.042 1.723c0 .3 0 .642.01 1.027c-.042.193-.32.214-.46.278a1.148 1.148 0 0 1-.256-.192V4.83c0-.29.01-.588.01-1.038c0-.225 0-.482-.01-.792c0-.192.032-.374.15-.802a.342.342 0 0 1 .3-.224c.245.064.491.17.577.374c-.257.76-.235 1.594-.279 2.353m-.384-.085c.428.021.941.042 1.722.042c.3 0 .643 0 1.027-.01c.193.041.215.32.279.459c-.052.094-.116.18-.193.257H20.1c-.289 0-.589-.01-1.037-.01c-.225 0-.482 0-.792.01c-.193.002-.375-.03-.803-.149a.346.346 0 0 1-.225-.299c.064-.246.172-.492.374-.578c.76.257 1.595.235 2.355.278z'
            />
          </svg>
          {/* Disney 白色（暗色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='hidden dark:block'
          >
            <path
              fill='#ffffff'
              d='M2.056 6.834C1.572 6.834 1 6.77 1 6.483c0-2.023 3.562-2.11 5.08-2.11c1.978 0 4.506.614 6.66 1.384c3.277 1.188 9.917 5.145 9.917 9.674c0 4.001-4.31 5.914-8.311 5.914a22.376 22.376 0 0 1-3.21-.33c-.066.243-.11.418-.264.924a4.324 4.324 0 0 1-.77.087l-.505-.043c-.33-.396-.44-1.033-.572-1.715c-2-1.165-3.298-2.155-3.891-2.836c-.506-.528-1.078-1.232-1.078-1.913c0-.351.22-.66.726-1.01c1.034-.77 2.352-1.188 4.507-1.563l.044-.9c.022-.22.242-2.573.748-3.013c.813.66.901 1.341.967 2.353c.022.44.044.901.11 1.385h.308c1.539 0 6.244.395 6.244 2.616c0 .528-.77 1.517-1.518 1.517a1.9 1.9 0 0 1-.966-.285c.329-.375.813-.704.945-.99c-.44-.528-2.814-1.143-4.551-1.143a4.043 4.043 0 0 0-.572.022l.022 4.815c.703.44 1.561.483 2.11.483c2.42 0 7.431-.417 7.431-4.331c0-3.87-4.946-6.86-8.64-8.266a21.394 21.394 0 0 0-7.937-1.496a7.22 7.22 0 0 0-1.803.198c-.373.088-.505.176-.505.264c0 .153.747.242.836.286a.221.221 0 0 1 .11.175a.26.26 0 0 1-.088.176c-.089 0-.286.022-.528.022M9.2 14.551c-2.176.177-4.595.397-4.595 1.166c0 .594 1.012 1.32 1.627 1.781a7.052 7.052 0 0 0 2.77 1.319zm11.155-9.85c-.02.428-.042.942-.042 1.723c0 .3 0 .642.01 1.027c-.042.193-.32.214-.46.278a1.148 1.148 0 0 1-.256-.192V4.83c0-.29.01-.588.01-1.038c0-.225 0-.482-.01-.792c0-.192.032-.374.15-.802a.342.342 0 0 1 .3-.224c.245.064.491.17.577.374c-.257.76-.235 1.594-.279 2.353m-.384-.085c.428.021.941.042 1.722.042c.3 0 .643 0 1.027-.01c.193.041.215.32.279.459c-.052.094-.116.18-.193.257H20.1c-.289 0-.589-.01-1.037-.01c-.225 0-.482 0-.792.01c-.193.002-.375-.03-.803-.149a.346.346 0 0 1-.225-.299c.064-.246.172-.492.374-.578c.76.257 1.595.235 2.355.278z'
            />
          </svg>
        </span>
      );
    }
    if (normalized === 'bbc') {
      return (
        <span className='mr-1.5 inline-flex items-center'>
          {/* BBC 黑色（亮色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='block dark:hidden'
          >
            <path
              fill='#000000'
              d='M13.004 13c0 .744-.925.7-.925.7h-.925v-1.343h.925c.952-.007.925.644.925.644m-1.85-2.693h.704c.732.04.705.584.705.584c0 .677-.81.688-.81.688h-.6zm1.679 1.536s.633-.27.627-.985c0 0 .096-1.173-1.458-1.316h-1.724v4.917h1.977s1.65.004 1.65-1.388c0 0 .04-.947-1.072-1.228M8.37 8.58h7.258v6.84H8.371zM4.633 13c0 .744-.925.7-.925.7h-.925v-1.343h.925c.952-.007.925.644.925.644m-1.85-2.693h.705c.732.04.704.584.704.584c0 .677-.81.688-.81.688h-.599zm1.679 1.536s.633-.27.627-.985c0 0 .097-1.173-1.457-1.316H1.908v4.917h1.976s1.651.004 1.651-1.388c0 0 .04-.947-1.073-1.228M0 8.58h7.259v6.84H0zm22.52 1.316v.908s-.887-.545-1.867-.556c0 0-1.828-.036-1.91 1.752c0 0-.066 1.645 1.888 1.738c0 0 .82.099 1.932-.61v.94s-1.492.887-3.22.204c0 0-1.454-.53-1.509-2.272c0 0-.06-1.79 1.878-2.385c0 0 .517-.198 1.447-.11c0 0 .556.055 1.36.39m-5.778 5.525H24V8.58h-7.259Z'
            />
          </svg>
          {/* BBC 白色（暗色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 24 24'
            className='hidden dark:block'
          >
            <path
              fill='#ffffff'
              d='M13.004 13c0 .744-.925.7-.925.7h-.925v-1.343h.925c.952-.007.925.644.925.644m-1.85-2.693h.704c.732.04.705.584.705.584c0 .677-.81.688-.81.688h-.6zm1.679 1.536s.633-.27.627-.985c0 0 .096-1.173-1.458-1.316h-1.724v4.917h1.977s1.65.004 1.65-1.388c0 0 .04-.947-1.072-1.228M8.37 8.58h7.258v6.84H8.371zM4.633 13c0 .744-.925.7-.925.7h-.925v-1.343h.925c.952-.007.925.644.925.644m-1.85-2.693h.705c.732.04.704.584.704.584c0 .677-.81.688-.81.688h-.599zm1.679 1.536s.633-.27.627-.985c0 0 .097-1.173-1.457-1.316H1.908v4.917h1.976s1.651.004 1.651-1.388c0 0 .04-.947-1.073-1.228M0 8.58h7.259v6.84H0zm22.52 1.316v.908s-.887-.545-1.867-.556c0 0-1.828-.036-1.91 1.752c0 0-.066 1.645 1.888 1.738c0 0 .82.099 1.932-.61v.94s-1.492.887-3.22.204c0 0-1.454-.53-1.509-2.272c0 0-.06-1.79 1.878-2.385c0 0 .517-.198 1.447-.11c0 0 .556.055 1.36.39m-5.778 5.525H24V8.58h-7.259Z'
            />
          </svg>
        </span>
      );
    }
    if (normalized === 'a24') {
      return (
        <span className='mr-1.5 inline-flex items-center'>
          {/* A24 黑色（亮色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 380 156'
            className='block dark:hidden'
          >
            <path d='M379.85,111.86h-.1v-.04h-10.9V.2l-105.9,117.6h-81.3c-3.5,0-6.3-1.28-6.3-4.78,0-2.4,1.3-4.4,3.2-5.5.1-.05.1-.07.2-.1,8.2-4.2,16.1-6.4,20.6-7.7l1.4-.4c2.7-.8,6.1-1.5,9.6-2.3,1.2-.3,2.5-.6,3.8-.8,21.5-4.9,50.6-14.82,50.6-49.12,0-7.6-1.9-15.3-6.3-22.2-7-11-20.2-19.9-41.8-22.5-4.2-.5-8.8-.8-13.7-.8-33.5,0-56.1,17.6-56.9,44v1.4c0,14.6,11.8,26.4,26.4,26.4s26.4-11.9,26.4-26.4-11.8-26.4-26.4-26.4c-.8,0-1.6,0-2.4.1h-.1c-5.4.5-6.16.81-10.12,2.36,2.79-3.66,3.49-4.13,8.22-7.57.1,0,.1-.1.2-.1,9-5.8,21-9,35.1-9,1.5,0,3,0,4.4.1h.9c3.1.4,5.2,2.35,5.2,5.55v72.95c0,3.4-2.4,6.3-5.5,7.1-.2,0-.3.1-.5.1-3,.6-5.7,1.3-8.1,2l-1.3.4c-6.5,1.8-20,5.6-31.9,14.7-4.2,3.2-7.8,6.7-10.9,10.6-7.8,9.9-11.7,22-11.7,36.1h84.9l34.3-38.1h62.3v38.1h43.5v-38.07h10.8v-.03h.1v-6.04.01h0ZM325.35,111.8l-48.19-.06,48.19-54.62v54.68ZM57.85,32.4c-5.4,11.3-16.6,12.5-16.6,12.5l5.4,11.5v.1L.15,155.9h6.58l15.62-33.3h55.23l15.5,33.3h47.96L70.75,4.9l-12.9,27.5ZM25.27,116.5l24.75-52.86,24.69,52.86H25.27Z'></path>
          </svg>
          {/* A24 白色（暗色） */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 380 156'
            className='hidden dark:block'
          >
            <path
              d='M379.85,111.86h-.1v-.04h-10.9V.2l-105.9,117.6h-81.3c-3.5,0-6.3-1.28-6.3-4.78,0-2.4,1.3-4.4,3.2-5.5.1-.05.1-.07.2-.1,8.2-4.2,16.1-6.4,20.6-7.7l1.4-.4c2.7-.8,6.1-1.5,9.6-2.3,1.2-.3,2.5-.6,3.8-.8,21.5-4.9,50.6-14.82,50.6-49.12,0-7.6-1.9-15.3-6.3-22.2-7-11-20.2-19.9-41.8-22.5-4.2-.5-8.8-.8-13.7-.8-33.5,0-56.1,17.6-56.9,44v1.4c0,14.6,11.8,26.4,26.4,26.4s26.4-11.9,26.4-26.4-11.8-26.4-26.4-26.4c-.8,0-1.6,0-2.4.1h-.1c-5.4.5-6.16.81-10.12,2.36,2.79-3.66,3.49-4.13,8.22-7.57.1,0,.1-.1.2-.1,9-5.8,21-9,35.1-9,1.5,0,3,0,4.4.1h.9c3.1.4,5.2,2.35,5.2,5.55v72.95c0,3.4-2.4,6.3-5.5,7.1-.2,0-.3.1-.5.1-3,.6-5.7,1.3-8.1,2l-1.3.4c-6.5,1.8-20,5.6-31.9,14.7-4.2,3.2-7.8,6.7-10.9,10.6-7.8,9.9-11.7,22-11.7,36.1h84.9l34.3-38.1h62.3v38.1h43.5v-38.07h10.8v-.03h.1v-6.04.01h0ZM325.35,111.8l-48.19-.06,48.19-54.62v54.68ZM57.85,32.4c-5.4,11.3-16.6,12.5-16.6,12.5l5.4,11.5v.1L.15,155.9h6.58l15.62-33.3h55.23l15.5,33.3h47.96L70.75,4.9l-12.9,27.5ZM25.27,116.5l24.75-52.86,24.69,52.86H25.27Z'
              fill='white'
            ></path>
          </svg>
        </span>
      );
    }
    return null;
  };

  // 渲染胶囊式选择器
  const renderCapsuleSelector = (
    options: { label: string; value: string }[],
    activeValue: string | undefined,
    onChange: (value: string) => void,
    isPrimary = false
  ) => {
    const containerRef = isPrimary
      ? primaryContainerRef
      : secondaryContainerRef;
    const buttonRefs = isPrimary ? primaryButtonRefs : secondaryButtonRefs;
    const indicatorStyle = isPrimary
      ? primaryIndicatorStyle
      : secondaryIndicatorStyle;

    return (
      <div
        ref={containerRef}
        className={`relative ${
          isPrimary
            ? 'inline-flex bg-gray-200 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
            : 'flex flex-wrap gap-1 sm:gap-2'
        }`}
      >
        {/* 滑动的白色背景指示器 */}
        {indicatorStyle.width > 0 &&
          (isPrimary ? (
            <div
              className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
              }}
            />
          ) : (
            <div
              className='absolute bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
                top: `${indicatorStyle.top}px`,
                height: `${indicatorStyle.height}px`,
              }}
            />
          ))}

        {options.map((option, index) => {
          const isActive = activeValue === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              onClick={() => onChange(option.value)}
              className={`relative z-10 px-3 py-1 sm:px-4 sm:py-2 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap inline-flex items-center ${
                isPrimary
                  ? ''
                  : 'border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-600/50'
              } ${
                isActive
                  ? 'text-gray-900 dark:text-gray-100 cursor-default ring-1 ring-gray-300 dark:ring-0'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
              }`}
            >
              {renderBrandIcon(option.label)}
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  // 如果没有自定义分类，则不渲染任何内容
  if (!customCategories || customCategories.length === 0) {
    return null;
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* 两级选择器包装 */}
      <div className='space-y-3 sm:space-y-4'>
        {/* 一级选择器 */}
        <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
          <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
            Type
          </span>
          <div className='overflow-x-auto'>
            {renderCapsuleSelector(
              primaryOptions,
              primarySelection || primaryOptions[0]?.value,
              onPrimaryChange,
              true
            )}
          </div>
        </div>

        {/* 二级选择器 */}
        {secondaryOptions.length > 0 && (
          <div className='flex flex-col sm:flex-row sm:items-baseline gap-2'>
            <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
              Collections
            </span>
            {renderCapsuleSelector(
              secondaryOptions,
              secondarySelection || secondaryOptions[0]?.value,
              onSecondaryChange,
              false
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverCustomSelector;
