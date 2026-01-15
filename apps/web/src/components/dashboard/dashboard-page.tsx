import { useTranslations } from 'next-intl';

export function DashboardPage() {
    const t = useTranslations('dashboard');

    return (
        <div className="min-h-screen">
            <h1 className="font-bold text-2xl">{t('title')}</h1>
            <p className="mt-4">{t('welcome')}</p>
        </div>
    );
}
