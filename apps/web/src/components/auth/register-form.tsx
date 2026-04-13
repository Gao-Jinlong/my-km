'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { EmailField, PasswordField } from '@/components/form-fields';
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
import { Link as IntlLink } from '@/i18n/routing';
import { getContainer } from '@/platform/bootstrap';
import { MonitorService } from '@/platform/monitor/service';
import { getLastEmail, saveLastEmail } from '@/utils/email-storage';
import { type RegisterFormValues, registerSchema } from '@/utils/validation';
import { FormStatusAlert } from './form-status-alert';

/**
 * 惰性获取 logger，避免模块级循环依赖
 */
function getLogger() {
    return getContainer().get(MonitorService).getLogger('auth');
}

export function RegisterForm() {
    const t = useTranslations('auth.register');
    const tValidation = useTranslations('validation');
    const tErrors = useTranslations('errors');
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

    // Load last used email on mount
    useEffect(() => {
        const lastEmail = getLastEmail();
        if (lastEmail) {
            form.setValue('email', lastEmail);
        }
    }, [form]);

    const onSubmit = async (data: RegisterFormValues) => {
        getLogger().info('Form submitted with data:', data);
        setError(null);
        try {
            const { confirmPassword, ...registerData } = data;
            getLogger().info('Sending registration request:', registerData);
            await register(registerData);

            // Save email on successful registration
            saveLastEmail(data.email);

            setSuccess(true);
            // 注册成功后，显示验证邮件提示
        } catch (err) {
            // 处理错误
            getLogger().error('Registration error:', err);
            const errorMessage = (err as Error)?.message || tErrors('generic');
            setError(errorMessage);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-md animate-scale-in transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="space-y-2">
                    <CardTitle>{t('successTitle')}</CardTitle>
                    <CardDescription>{t('successDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormStatusAlert
                        type="success"
                        message={t.raw('emailSent').replace('{{email}}', form.getValues().email)}
                    />
                </CardContent>
                <CardFooter>
                    <IntlLink href="/login" className="w-full">
                        <LoadingButton variant="outline" className="w-full">
                            {t('goToLogin')}
                        </LoadingButton>
                    </IntlLink>
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

                        {/* 密码字段 */}
                        <PasswordField
                            name="password"
                            label={t('password')}
                            placeholder={tValidation('passwordMinLength')}
                            autoComplete="new-password"
                        />

                        {/* 确认密码字段 */}
                        <PasswordField
                            name="confirmPassword"
                            label={t('confirmPassword')}
                            placeholder={t('confirmPassword')}
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
