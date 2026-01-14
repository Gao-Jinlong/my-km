/**
 * 重置密码表单组件
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { authApi } from '@/api/auth';
import { PasswordField } from '@/components/form-fields';
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
import { type ResetPasswordFormValues, resetPasswordSchema } from '@/utils/validation';

export function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            token: token || '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (data: ResetPasswordFormValues) => {
        setError(null);
        setIsLoading(true);
        try {
            const { confirmPassword, ...resetData } = data;
            await authApi.resetPassword({ ...resetData, newPassword: data.password });
            setSuccess(true);
            // 3 秒后跳转到登录页面
            setTimeout(() => {
                router.push('/login?reset=true');
            }, 3000);
        } catch (err: any) {
            const errorMessage = err?.message || '重置失败，请稍后再试';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // 如果没有 token，显示错误
    if (!token) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>无效的链接</CardTitle>
                    <CardDescription>重置密码链接无效或已过期</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-600 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
                        <p className="font-medium">请重新请求密码重置</p>
                        <p className="mt-2 text-xs">
                            您的重置链接无效或已过期。请重新请求密码重置。
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Link href="/forgot-password" className="w-full">
                        <Button variant="outline" className="w-full">
                            请求新的重置链接
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        );
    }

    if (success) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>密码已重置！</CardTitle>
                    <CardDescription>您现在可以使用新密码登录</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-600 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">重置成功</p>
                        <p className="mt-2 text-xs">您的密码已成功重置。正在跳转到登录页面...</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Link href="/login" className="w-full">
                        <Button className="w-full">前往登录</Button>
                    </Link>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>重置密码</CardTitle>
                <CardDescription>输入您的新密码</CardDescription>
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

                        {/* 新密码字段 */}
                        <PasswordField
                            name="password"
                            label="新密码"
                            placeholder="••••••••"
                            autoComplete="new-password"
                            description="至少 8 个字符，包含大小写字母和数字"
                        />

                        {/* 确认密码字段 */}
                        <PasswordField
                            name="confirmPassword"
                            label="确认新密码"
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />

                        {/* 提交按钮 */}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? '重置中...' : '重置密码'}
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
