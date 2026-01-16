/**
 * 忘记密码表单组件
 */
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
import { LoadingButton } from '@/components/ui/loading-button';
import { Link } from '@/i18n/routing';
import { getLastEmail } from '@/utils/email-storage';
import { type ForgotPasswordFormValues, forgotPasswordSchema } from '@/utils/validation';
import { FormStatusAlert } from './form-status-alert';

export function ForgotPasswordForm() {
    const t = useTranslations('auth.forgotPassword');
    const _tValidation = useTranslations('validation');
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

    // Load last used email on mount
    useEffect(() => {
        const lastEmail = getLastEmail();
        if (lastEmail) {
            form.setValue('email', lastEmail);
        }
    }, [form]);

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
            <Card className="w-full max-w-md animate-scale-in transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="space-y-2">
                    <CardTitle>{t('checkEmail')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormStatusAlert
                        type="success"
                        message={`${t('checkEmail')} ${form.getValues().email}`}
                    />
                </CardContent>
                <CardFooter className="flex flex-col space-y-2">
                    <Link href="/login" className="w-full">
                        <LoadingButton variant="outline" className="w-full">
                            {t('backToLogin')}
                        </LoadingButton>
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

                        {/* 邮箱字段 */}
                        <EmailField
                            name="email"
                            label={t('email')}
                            placeholder="your@email.com"
                            autoFocus
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
