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
import { LoadingButton } from '@/components/ui/loading-button';
import { Link } from '@/i18n/routing';
import { type ResetPasswordFormValues, resetPasswordSchema } from '@/utils/validation';
import { FormStatusAlert } from './form-status-alert';

export function ResetPasswordForm() {
    const t = useTranslations('auth.resetPassword');
    const _tValidation = useTranslations('validation');
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
            <Card className="w-full max-w-md transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="space-y-2">
                    <CardTitle>{t('invalidTokenTitle')}</CardTitle>
                    <CardDescription>{t('invalidTokenDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormStatusAlert type="warning" message={t('requestNewText')} />
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
            <Card className="w-full max-w-md animate-scale-in transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="space-y-2">
                    <CardTitle>{t('successTitle')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormStatusAlert type="success" message={t('resetSuccessText')} />
                </CardContent>
                <CardFooter>
                    <Link href="/login" className="w-full">
                        <LoadingButton className="w-full">{t('gotoLogin')}</LoadingButton>
                    </Link>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md transition-shadow duration-300 hover:shadow-lg">
            <CardHeader className="space-y-2">
                <CardTitle>{t('title')}</CardTitle>
                <CardDescription>{t('description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        {/* 错误提示 */}
                        {error && (
                            <FormStatusAlert
                                type="error"
                                message={error}
                                onDismiss={() => setError(null)}
                            />
                        )}

                        {/* 新密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            autoFocus
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
                        <LoadingButton
                            type="submit"
                            className="w-full"
                            loading={isLoading}
                            loadingText={t('submitting')}
                        >
                            {t('submit')}
                        </LoadingButton>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <Link
                    href="/login"
                    className="text-slate-600 text-sm transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                >
                    {t('backToLogin')}
                </Link>
            </CardFooter>
        </Card>
    );
}
