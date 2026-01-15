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
                        <Link href="/login">Login</Link>
                    </Button>
                </div>

                {/* Features Preview */}
                <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">📝</div>
                        <h3 className="mb-2 font-semibold text-lg">智能笔记</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            使用 Markdown 支持捕捉和整理您的想法
                        </p>
                    </div>
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">🔍</div>
                        <h3 className="mb-2 font-semibold text-lg">知识图谱</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            连接想法并可视化您的知识网络
                        </p>
                    </div>
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <div className="mb-4 text-4xl">🤖</div>
                        <h3 className="mb-2 font-semibold text-lg">AI 驱动</h3>
                        <p className="text-gray-600 text-sm dark:text-gray-400">
                            从您的知识库中获得智能洞察
                        </p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="mt-20 text-center text-gray-600 text-sm dark:text-gray-400">
                <p>© 2026 My-KM. Built with Next.js 16 and TypeScript.</p>
            </footer>
        </div>
    );
}
