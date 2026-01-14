'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { useUser } from '@/stores/auth-store';

export default function DashboardPage() {
    const user = useUser();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <header className="border-b bg-white dark:bg-gray-800">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            My-KM 仪表盘
                        </h1>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {user?.email}
                            </span>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/dashboard/profile">个人资料</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-12">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                        欢迎回来，{user?.username || user?.email}！
                    </h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        今天您的知识库有什么动态。
                    </p>
                </div>

                {/* Dashboard Content Grid */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Quick Stats Card */}
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                            快速统计
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">文章总数</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    0
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">分类数量</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    0
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">标签数量</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    0
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Card */}
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                            快捷操作
                        </h3>
                        <div className="space-y-2">
                            <Button className="w-full" asChild>
                                <Link href="/knowledge/new">创建新文章</Link>
                            </Button>
                            <Button className="w-full" variant="outline" asChild>
                                <Link href="/knowledge">浏览知识库</Link>
                            </Button>
                        </div>
                    </div>

                    {/* Recent Activity Card */}
                    <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                            最近活动
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            暂无最近活动显示。
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
