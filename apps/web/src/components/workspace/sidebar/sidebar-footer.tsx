import { Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SidebarFooter() {
    return (
        <div className="border-t p-2">
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="flex-1" aria-label="Settings">
                    <Settings className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="flex-1" aria-label="User">
                    <User className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}
