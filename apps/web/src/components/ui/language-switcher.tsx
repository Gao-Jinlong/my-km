'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { localeFlags } from '@/i18n/config';
import { usePathname, useRouter } from '@/i18n/routing';

export function LanguageSwitcher() {
    const locale = useLocale();
    const pathname = usePathname();
    const router = useRouter();

    const _currentLocaleFlag = localeFlags[locale as keyof typeof localeFlags];

    const switchLocale = (newLocale: string) => {
        router.replace(pathname, { locale: newLocale });
    };

    return (
        <div className="flex gap-2">
            <Button
                variant={locale === 'zh-CN' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => switchLocale('zh-CN')}
            >
                <span className="mr-1">🇨🇳</span>
                <span className="hidden md:inline">简体中文</span>
            </Button>
            <Button
                variant={locale === 'en' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => switchLocale('en')}
            >
                <span className="mr-1">🇺🇸</span>
                <span className="hidden md:inline">English</span>
            </Button>
        </div>
    );
}
