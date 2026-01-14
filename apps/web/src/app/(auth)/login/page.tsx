'use client';

import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

function LoginFormWithSuspense() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
            <div className="w-full max-w-md">
                <LoginForm />
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <LoginFormWithSuspense />
        </Suspense>
    );
}
