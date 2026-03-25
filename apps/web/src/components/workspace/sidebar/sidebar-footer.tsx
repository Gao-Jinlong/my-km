'use client';

import { Settings, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SIDEBAR_CONSTANTS } from '@/lib/workspace/constants';
import { SettingsMenu } from './settings-menu';
import { UserMenu } from './user-menu';

export function SidebarFooter() {
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    return (
        <div
            className="border-ws-border border-t px-4"
            style={{ height: `${SIDEBAR_CONSTANTS.FOOTER_HEIGHT}px` }}
        >
            <div className="flex h-full items-center justify-between gap-2">
                {/* 设置按钮 */}
                <SettingsMenu>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-ws-fg-muted hover:text-ws-fg-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                        aria-label="设置菜单"
                        aria-haspopup="true"
                    >
                        <Settings className="h-4 w-4" />
                        <span className="text-xs">设置</span>
                    </Button>
                </SettingsMenu>

                {/* 用户按钮 */}
                <UserMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-ws-icon hover:text-ws-fg-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                        aria-label="用户菜单"
                        aria-haspopup="true"
                    >
                        <User className="h-4 w-4" />
                    </Button>
                </UserMenu>
            </div>
        </div>
    );
}
