'use client';

import dynamic from 'next/dynamic';

/**
 * LogPanel 包装器 - 解决 Next.js 16.1.1 ssr: false 限制
 *
 * 将 dynamic() 调用移到 Client Component 中，
 * 避免在 Server Component (layout.tsx) 中直接使用 ssr: false
 */
export const LogPanel = dynamic(
    () => import('@/components/debug/log-panel').then(m => ({ default: m.LogPanel })),
    { ssr: false },
);
