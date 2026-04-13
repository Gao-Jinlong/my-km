/**
 * BootstrapProvider - 应用初始化提供者
 *
 * 在应用启动时初始化所有服务
 */

'use client';

import { useEffect, useRef } from 'react';
import { bootstrap, getContainer } from '@/platform/bootstrap';
import { MonitorService } from '@/platform/monitor/service';

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) {
            return;
        }
        initialized.current = true;

        // 惰性获取 logger，避免模块级循环依赖
        const logger = getContainer().get(MonitorService).getLogger('bootstrap');
        logger.info('[BootstrapProvider] Starting bootstrap...');
        bootstrap();
        logger.info('[BootstrapProvider] Bootstrap completed');
    }, []);

    return <>{children}</>;
}
