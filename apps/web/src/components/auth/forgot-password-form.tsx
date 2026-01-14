/**
 * 忘记密码表单组件
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { authApi } from '@/api/auth';
import { EmailField } from '@/components/form-fields';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Form,
} from '@/components/ui';
import { type ForgotPasswordFormValues, forgotPasswordSchema } from '@/utils/validation';

export function ForgotPasswordForm() {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<ForgotPasswordFormValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: '',
        },
    });

    const onSubmit = async (data: ForgotPasswordFormValues) => {
        setError(null);
        setIsLoading(true);
        try {
            await authApi.forgotPassword(data);
            setSuccess(true);
        } catch (err: any) {
            const errorMessage = err?.message || '发送失败，请稍后再试';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>检查您的邮箱</CardTitle>
                    <CardDescription>如果该邮箱已注册，您将收到密码重置邮件</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">邮件已发送</p>
                        <p className="mt-2 text-xs">
                            我们已向 <span className="font-medium">{form.getValues().email}</span>{' '}
                            发送了密码重置链接。该链接将在 1 小时后过期。
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <Link href="/login" className="w-full">
                        <Button variant="outline" className="w-full">
                            返回登录
                        </Button>
                    </Link>
                    <Button
                        variant="link"
                        className="text-sm text-slate-600 dark:text-slate-400"
                        onClick={() => {
                            setSuccess(false);
                            form.reset();
                        }}
                    >
                        重新发送邮件
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>忘记密码</CardTitle>
                <CardDescription>输入您的邮箱地址，我们将发送密码重置链接</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* 错误提示 */}
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {/* 邮箱字段 */}
                        <EmailField name="email" label="邮箱" placeholder="your@email.com" />

                        {/* 提交按钮 */}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? '发送中...' : '发送重置链接'}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <Link
                    href="/login"
                    className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                >
                    返回登录
                </Link>
            </CardFooter>
        </Card>
    );
}
