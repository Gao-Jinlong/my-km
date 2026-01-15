'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxField, EmailField, PasswordField } from '@/components/form-fields';
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
import { useAuth } from '@/hooks/use-auth';
import { Link } from '@/i18n/routing';
import { type LoginFormValues, loginSchema } from '@/utils/validation';

export function LoginForm() {
    const t = useTranslations('auth.login');
    const tErrors = useTranslations('errors');
    const router = useRouter();
    const searchParams = useSearchParams();
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

    const onSubmit = async (data: LoginFormValues) => {
        setError(null);
        try {
            await login(data);

            // 检查是否有重定向参数
            const redirectTo = searchParams.get('redirectTo');
            router.push(redirectTo || '/dashboard');
        } catch (err) {
            // 处理错误
            const errorMessage = (err as Error)?.message || tErrors('invalidCredentials');
            setError(errorMessage);
        }
    };

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

                        {/* 密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder="••••••••"
                        />

                        {/* 记住我 */}
                        <CheckboxField name="rememberMe" label={t('rememberMe')} />

                        {/* 提交按钮 */}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? t('submitting') : t('submit')}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
                <div className="flex justify-between text-slate-600 text-sm dark:text-slate-400">
                    <Link
                        href="/forgot-password"
                        className="hover:text-slate-900 dark:hover:text-slate-50"
                    >
                        {t('forgotPassword')}
                    </Link>
                    <Link
                        href="/register"
                        className="hover:text-slate-900 dark:hover:text-slate-50"
                    >
                        {t('noAccount')} {t('register')}
                    </Link>
                </div>
            </CardFooter>
        </Card>
    );
}
