/**
 * 注册页面
 */
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
            <RegisterForm />
        </div>
    );
}
