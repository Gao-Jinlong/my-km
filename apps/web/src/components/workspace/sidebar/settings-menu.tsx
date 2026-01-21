'use client';

import { Keyboard, Settings } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function SettingsMenu({
    children,
    open,
    onOpenChange,
}: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const handleProjectSettings = () => {
        console.log('打开项目设置');
        onOpenChange(false);
    };

    const handleGlobalSettings = () => {
        console.log('打开全局设置');
        onOpenChange(false);
    };

    const handleKeyboardShortcuts = () => {
        console.log('打开键盘快捷键');
        onOpenChange(false);
    };

    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onClick={handleProjectSettings}>
                    <Settings className="mr-2 h-4 w-4" />
                    项目设置
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGlobalSettings}>
                    <Settings className="mr-2 h-4 w-4" />
                    全局设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleKeyboardShortcuts}>
                    <Keyboard className="mr-2 h-4 w-4" />
                    键盘快捷键
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
