'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  saveDanmakuFilterConfig,
} from '@/lib/danmaku/filter-config';
import type { DanmakuFilterConfig } from '@/lib/danmaku/types';

interface DanmakuFilterSettingsProps {
  isOpen: boolean;
  config: DanmakuFilterConfig;
  onChange: (config: DanmakuFilterConfig) => void;
  onClose: () => void;
}

export default function DanmakuFilterSettings({
  isOpen,
  config,
  onChange,
  onClose,
}: DanmakuFilterSettingsProps) {
  const [draft, setDraft] = useState<DanmakuFilterConfig>({ rules: [] });
  const [keyword, setKeyword] = useState('');
  const [ruleType, setRuleType] = useState<'normal' | 'regex'>('normal');

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
    }
  }, [config, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const addRule = () => {
    const text = keyword.trim();
    if (!text) return;

    setDraft((prev) => ({
      rules: [
        ...prev.rules,
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          keyword: text,
          type: ruleType,
          enabled: true,
        },
      ],
    }));

    setKeyword('');
  };

  const save = () => {
    saveDanmakuFilterConfig(draft);
    onChange(draft);
    onClose();
  };

  return (
    <div className='fixed inset-0 z-[1600] flex items-end justify-center bg-black/55 p-4 md:items-center'>
      <div className='w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl dark:bg-gray-900'>
        <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700'>
          <div className='text-sm font-semibold text-gray-900 dark:text-gray-100'>Danmaku Filter Settings</div>
          <button
            onClick={onClose}
            className='rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300'
          >
            <X size={16} />
          </button>
        </div>

        <div className='space-y-3 p-4'>
          <div className='flex gap-2'>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRule();
              }}
              placeholder='Keyword or regex to block'
              className='flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
            />
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as 'normal' | 'regex')}
              className='rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
            >
              <option value='normal'>Keyword</option>
              <option value='regex'>Regex</option>
            </select>
            <button
              onClick={addRule}
              className='rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700'
            >
              <Plus size={16} />
            </button>
          </div>

          <div className='max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700'>
            {draft.rules.length === 0 ? (
              <div className='p-4 text-center text-xs text-gray-500'>No rules yet</div>
            ) : (
              draft.rules.map((rule) => (
                <div
                  key={rule.id}
                  className='flex items-center gap-2 rounded-md bg-gray-100 px-2 py-2 text-xs dark:bg-gray-800'
                >
                  <button
                    onClick={() => {
                      setDraft((prev) => ({
                        rules: prev.rules.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                enabled: !item.enabled,
                              }
                            : item
                        ),
                      }));
                    }}
                    className={`rounded px-1.5 py-0.5 ${
                      rule.enabled
                        ? 'bg-green-500/20 text-green-700 dark:text-green-300'
                        : 'bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>

                  <span className='rounded bg-gray-300/60 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-700 dark:text-gray-300'>
                    {rule.type === 'regex' ? 'Regex' : 'Keyword'}
                  </span>

                  <span className='flex-1 truncate text-gray-800 dark:text-gray-200'>
                    {rule.keyword}
                  </span>

                  <button
                    onClick={() => {
                      setDraft((prev) => ({
                        rules: prev.rules.filter((item) => item.id !== rule.id),
                      }));
                    }}
                    className='rounded p-1 text-red-500 transition-colors hover:bg-red-500/10'
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className='text-[11px] text-gray-500'>
            Rules are saved in this browser with localStorage.
          </div>
        </div>

        <div className='flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700'>
          <button
            onClick={onClose}
            className='rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
          >
            Cancel
          </button>
          <button
            onClick={save}
            className='rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-700'
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
