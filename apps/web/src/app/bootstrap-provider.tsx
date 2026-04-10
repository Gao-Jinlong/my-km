/**
 * BootstrapProvider - 应用初始化提供者
 *
 * 在应用启动时初始化所有服务
 */

'use client';

import { useEffect, useRef } from 'react';
import { bootstrap, container } from '@/platform/bootstrap';
import { LoggerService } from '@/platform/logger/service';

const logger = container.get(LoggerService).getLogger('bootstrap');

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) {
            return;
        }
        initialized.current = true;

        logger.info('[BootstrapProvider] Starting bootstrap...');
        bootstrap();
        logger.info('[BootstrapProvider] Bootstrap completed');
    }, []);

    return <>{children}</>;
}
