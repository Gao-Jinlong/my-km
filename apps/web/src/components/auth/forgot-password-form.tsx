/**
 * 忘记密码表单组件
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
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
import { Link } from '@/i18n/routing';
import { type ForgotPasswordFormValues, forgotPasswordSchema } from '@/utils/validation';

export function ForgotPasswordForm() {
    const t = useTranslations('auth.forgotPassword');
    const tErrors = useTranslations('errors');
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
        } catch (err) {
            const errorMessage = (err as Error)?.message || tErrors('generic');
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{t('checkEmail')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-600 text-sm dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">{t('successTitle')}</p>
                        <p className="mt-2 text-xs">
                            {t('checkEmail')}{' '}
                            <span className="font-medium">{form.getValues().email}</span>
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <Link href="/login" className="w-full">
                        <Button variant="outline" className="w-full">
                            {t('backToLogin')}
                        </Button>
                    </Link>
                    <Button
                        variant="link"
                        className="text-slate-600 text-sm dark:text-slate-400"
                        onClick={() => {
                            setSuccess(false);
                            form.reset();
                        }}
                    >
                        {t('submitting')}
                    </Button>
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

                        {/* 邮箱字段 */}
                        <EmailField name="email" label={t('email')} placeholder="your@email.com" />

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
