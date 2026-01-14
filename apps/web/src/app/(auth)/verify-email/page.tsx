'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { authApi } from '@/api/auth';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('无效的验证链接');
            return;
        }

        const verifyEmail = async () => {
            try {
                await authApi.verifyEmail(token);
                setStatus('success');
                setMessage('邮箱已成功验证！');
            } catch (err: any) {
                setStatus('error');
                setMessage(err?.message || '验证失败，链接可能已过期');
            }
        };

        verifyEmail();
    }, [token]);

    if (status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600 dark:border-slate-800 dark:border-t-slate-400" />
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                正在验证您的邮箱...
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>验证成功！</CardTitle>
                        <CardDescription>您的邮箱已成功验证</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                            <p className="font-medium">{message}</p>
                            <p className="mt-2 text-xs">您现在可以登录并使用所有功能。</p>
                        </div>
                        <Link href="/login" className="block">
                            <Button className="w-full">前往登录</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 错误状态
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>验证失败</CardTitle>
                    <CardDescription>无法验证您的邮箱</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                        <p className="font-medium">{message}</p>
                        <p className="mt-2 text-xs">
                            验证链接可能已过期或无效。请尝试重新登录以发送新的验证邮件。
                        </p>
                    </div>
                    <div className="flex space-x-2">
                        <Link href="/login" className="flex-1">
                            <Button variant="outline" className="w-full">
                                返回登录
                            </Button>
                        </Link>
                        <Link href="/register" className="flex-1">
                            <Button variant="outline" className="w-full">
                                注册
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VerifyEmailContent />
        </Suspense>
    );
}
