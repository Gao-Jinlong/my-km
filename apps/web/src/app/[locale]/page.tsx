import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { Link } from '@/i18n/routing';

export default function Home() {
    const t = useTranslations('home');

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
            <main className="flex max-w-4xl flex-col items-center px-6 py-24 text-center">
                {/* Logo/Brand */}
                <div className="mb-8">
                    <h1 className="font-bold text-5xl text-gray-900 tracking-tight sm:text-6xl dark:text-white">
                        My-KM
                    </h1>
                    <p className="mt-4 text-gray-600 text-xl dark:text-gray-300">{t('subtitle')}</p>
                </div>

                {/* Value Proposition */}
                <div className="mb-12 space-y-4">
                    <p className="text-gray-700 text-lg dark:text-gray-300">{t('description')}</p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col gap-4 sm:flex-row">
                    <Button size="lg">
                        <Link href="/register">{t('getStarted')}</Link>
                    </Button>
                    <Button variant="outline" size="lg">
                        <Link href="/login">{t('login')}</Link>
                    </Button>
                </div>

                {/* Features Preview */}
                <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">📝</div>
                        <h3 className="mb-2 font-semibold text-lg">{t('feature1Title')}</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            {t('feature1Description')}
                        </p>
                    </div>
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">🔍</div>
                        <h3 className="mb-2 font-semibold text-lg">{t('feature2Title')}</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            {t('feature2Description')}
                        </p>
                    </div>
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">🤖</div>
                        <h3 className="mb-2 font-semibold text-lg">{t('feature3Title')}</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            {t('feature3Description')}
                        </p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="mt-20 text-center text-gray-600 text-sm dark:text-gray-400">
                <p>{t('footer')}</p>
            </footer>
        </div>
    );
}
