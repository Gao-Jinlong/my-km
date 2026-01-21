'use client';

import { Settings, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SIDEBAR_CONSTANTS } from '@/lib/workspace/constants';
import { SettingsMenu } from './settings-menu';
import { UserMenu } from './user-menu';

export function SidebarFooter() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    return (
        <div className="border-t p-2" style={{ height: `${SIDEBAR_CONSTANTS.FOOTER_HEIGHT}px` }}>
            <div className="flex h-full items-center gap-1">
                {/* 设置按钮 */}
                <SettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="flex-1"
                        aria-label="设置菜单"
                        aria-haspopup="true"
                        aria-expanded={settingsOpen}
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </SettingsMenu>

                {/* 用户按钮 */}
                <UserMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="flex-1"
                        aria-label="用户菜单"
                        aria-haspopup="true"
                        aria-expanded={userMenuOpen}
                    >
                        <User className="h-5 w-5" />
                    </Button>
                </UserMenu>
            </div>
        </div>
    );
}
