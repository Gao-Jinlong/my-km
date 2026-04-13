'use client';

import { LogOut, User, UserCircle } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getContainer } from '@/platform/bootstrap';
import { MonitorService } from '@/platform/monitor/service';

/**
 * 惰性获取 logger，避免模块级循环依赖
 */
function getLogger() {
    return getContainer().get(MonitorService).getLogger('sidebar');
}

export function UserMenu({
    children,
    open,
    onOpenChange,
}: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const handleProfile = () => {
        getLogger().debug('打开个人资料');
        onOpenChange(false);
    };

    const handlePreferences = () => {
        getLogger().debug('打开偏好设置');
        onOpenChange(false);
    };

    const handleLogout = () => {
        getLogger().debug('退出登录');
        onOpenChange(false);
    };

    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="font-medium text-sm">用户名</p>
                        <p className="text-muted-foreground text-xs">user@example.com</p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleProfile}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePreferences}>
                    <User className="mr-2 h-4 w-4" />
                    偏好设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
