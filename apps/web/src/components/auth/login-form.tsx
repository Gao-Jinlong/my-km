'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxField, EmailField, PasswordField } from '@/components/form-fields';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Form,
} from '@/components/ui';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAuth } from '@/hooks/use-auth';
import { Link } from '@/i18n/routing';
import { getLastEmail, saveLastEmail } from '@/utils/email-storage';
import { type LoginFormValues, loginSchema } from '@/utils/validation';
import { FormStatusAlert } from './form-status-alert';

export function LoginForm() {
    const t = useTranslations('auth.login');
    const _tValidation = useTranslations('validation');
    const tErrors = useTranslations('errors');
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = useLocale();
    const { login, isLoading } = useAuth();
    const [error, setError] = useState<string | null>(null);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
            rememberMe: false,
        },
    });

    // Load last used email on mount
    useEffect(() => {
        const lastEmail = getLastEmail();
        if (lastEmail) {
            form.setValue('email', lastEmail);
        }
    }, [form]);

    const onSubmit = async (data: LoginFormValues) => {
        setError(null);
        try {
            await login(data);

            // Save email on successful login
            saveLastEmail(data.email);

            // 检查是否有重定向参数
            const redirectTo = searchParams.get('redirectTo');
            router.push(redirectTo || `/${locale}/projects`);
        } catch (err) {
            // 处理错误
            const errorMessage = (err as Error)?.message || tErrors('invalidCredentials');
            setError(errorMessage);
        }
    };

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

                        {/* 密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder={t('password')}
                        />

                        {/* 记住我 */}
                        <CheckboxField name="rememberMe" label={t('rememberMe')} />

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
            <CardFooter className="flex flex-col space-y-2">
                <div className="flex justify-between text-slate-600 text-sm dark:text-slate-400">
                    <Link
                        href="/forgot-password"
                        className="transition-colors hover:text-slate-900 dark:hover:text-slate-50"
                    >
                        {t('forgotPassword')}
                    </Link>
                    <Link
                        href="/register"
                        className="transition-colors hover:text-slate-900 dark:hover:text-slate-50"
                    >
                        {t('noAccount')} {t('register')}
                    </Link>
                </div>
            </CardFooter>
        </Card>
    );
}
