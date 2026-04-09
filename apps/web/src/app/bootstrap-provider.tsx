/**
 * BootstrapProvider - 应用初始化提供者
 *
 * 在应用启动时初始化所有服务
 */

'use client';

import { useEffect, useRef } from 'react';
import { bootstrap } from '@/platform/bootstrap';

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) {
            return;
        }
        initialized.current = true;

        console.log('[BootstrapProvider] Starting bootstrap...');
        bootstrap();
        console.log('[BootstrapProvider] Bootstrap completed');
    }, []);

    return <>{children}</>;
}
