'use client';

import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { verifyEmail } from '@/api/auth';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Link } from '@/i18n/routing';
import { FormStatusAlert } from './form-status-alert';

type VerificationStatus = 'idle' | 'verifying' | 'success' | 'error';

export function VerifyEmail() {
    const t = useTranslations('auth.verifyEmail');
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<VerificationStatus>('verifying');
    const [error, setError] = useState<string | null>(null);
    const [_isResending, _setIsResending] = useState(false);

    useEffect(() => {
        const token = searchParams.get('token');

        if (!token) {
            setStatus('error');
            setError(t('invalidToken'));
            return;
        }

        // 调用验证 API
        verifyEmail(token)
            .then(() => {
                setStatus('success');
            })
            .catch(err => {
                setStatus('error');
                const errorMessage = err?.message || t('invalidToken');
                setError(errorMessage);
            });
    }, [searchParams, t]);

    // 验证中状态
    if (status === 'verifying') {
        return (
            <div className="flex min-h-screen animate-fade-in items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
                <Card className="w-full max-w-md transition-shadow duration-300 hover:shadow-lg">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 animate-scale-in items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                        </div>
                        <CardTitle className="text-2xl">{t('verifying')}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-slate-600 text-sm dark:text-slate-400">
                            {t('verifyingDescription')}
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 成功状态
    if (status === 'success') {
        return (
            <div className="flex min-h-screen animate-fade-in items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
                <Card className="w-full max-w-md animate-scale-in transition-shadow duration-300 hover:shadow-lg">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                        <CardTitle className="text-2xl">{t('success')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormStatusAlert type="success" message={t('successDescription')} />
                        <Link href="/login">
                            <Button className="w-full" size="lg">
                                {t('gotoLogin')}
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 错误状态
    if (status === 'error') {
        const isExpired = error === t('tokenExpired');

        return (
            <div className="flex min-h-screen animate-fade-in items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
                <Card className="w-full max-w-md transition-shadow duration-300 hover:shadow-lg">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                        </div>
                        <CardTitle className="text-2xl">
                            {isExpired ? t('tokenExpired') : t('invalidToken')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormStatusAlert type="error" message={error || ''} />

                        {isExpired && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center text-blue-600 text-sm dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                                <Mail className="mx-auto mb-2 h-5 w-5" />
                                <p className="font-medium">{t('resendTitle')}</p>
                                <p className="mt-1 text-xs">{t('resendHint')}</p>
                            </div>
                        )}

                        <Link href="/login">
                            <Button variant="outline" className="w-full" size="lg">
                                {t('gotoLogin')}
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return null;
}
