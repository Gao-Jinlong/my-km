/**
 * 重置密码表单组件
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { Link } from '@/i18n/routing';
import { type ResetPasswordFormValues, resetPasswordSchema } from '@/utils/validation';

export function ResetPasswordForm() {
    const t = useTranslations('auth.resetPassword');
    const tErrors = useTranslations('errors');
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
        } catch (err) {
            const errorMessage = (err as Error)?.message || tErrors('generic');
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
                    <CardTitle>{t('invalidTokenTitle')}</CardTitle>
                    <CardDescription>{t('invalidTokenDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-600 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
                        <p className="font-medium">{t('requestNewText')}</p>
                        <p className="mt-2 text-xs">{t('invalidTokenDescription')}</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Link href="/forgot-password" className="w-full">
                        <Button variant="outline" className="w-full">
                            {t('requestNewLink')}
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
                    <CardTitle>{t('successTitle')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-600 text-sm dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">{t('resetSuccess')}</p>
                        <p className="mt-2 text-xs">{t('resetSuccessText')}</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Link href="/login" className="w-full">
                        <Button className="w-full">{t('gotoLogin')}</Button>
                    </Link>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>{t('title')}</CardTitle>
                <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* 错误提示 */}
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-600 text-sm dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {/* 新密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            description={t('passwordDescription')}
                        />

                        {/* 确认密码字段 */}
                        <PasswordField
                            name="confirmPassword"
                            label={t('confirmPassword')}
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />

                        {/* 提交按钮 */}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? t('submitting') : t('submit')}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <Link
                    href="/login"
                    className="text-slate-600 text-sm hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                >
                    {t('backToLogin')}
                </Link>
            </CardFooter>
        </Card>
    );
}
