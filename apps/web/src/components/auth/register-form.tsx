'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { EmailField, PasswordField } from '@/components/form-fields';
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
import { Link as IntlLink } from '@/i18n/routing';
import { type RegisterFormValues, registerSchema } from '@/utils/validation';

export function RegisterForm() {
    const t = useTranslations('auth.register');
    const tErrors = useTranslations('errors');
    const _tValidation = useTranslations('validation');
    const { register, isLoading } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            email: '',
            password: '',
            confirmPassword: '',
        },
    });

    const onSubmit = async (data: RegisterFormValues) => {
        console.log('Form submitted with data:', data);
        setError(null);
        try {
            const { confirmPassword, ...registerData } = data;
            console.log('Sending registration request:', registerData);
            await register(registerData);

            setSuccess(true);
            // 注册成功后，显示验证邮件提示
        } catch (err) {
            // 处理错误
            console.error('Registration error:', err);
            const errorMessage = (err as Error)?.message || tErrors('generic');
            setError(errorMessage);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{t('successTitle')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-600 text-sm dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">{t('checkEmail')}</p>
                        <p className="mt-2 text-xs">
                            {t.raw('emailSent').replace('{{email}}', form.getValues().email)}
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <IntlLink href="/login">
                        <Button variant="outline" className="w-full">
                            {t('goToLogin')}
                        </Button>
                    </IntlLink>
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

                        {/* 密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder="At least 8 characters, uppercase, lowercase, and numbers"
                            autoComplete="new-password"
                        />

                        {/* 确认密码字段 */}
                        <PasswordField
                            name="confirmPassword"
                            label={t('confirmPassword')}
                            placeholder="Enter password again"
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
                <p className="text-slate-600 text-sm dark:text-slate-400">
                    {t('hasAccount')}{' '}
                    <IntlLink
                        href="/login"
                        className="font-medium text-slate-900 hover:underline dark:text-slate-50"
                    >
                        {t('login')}
                    </IntlLink>
                </p>
            </CardFooter>
        </Card>
    );
}
