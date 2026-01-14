'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
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
import { type RegisterFormValues, registerSchema } from '@/utils/validation';

export function RegisterForm() {
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
        } catch (err: any) {
            // 处理错误
            console.error('Registration error:', err);
            const errorMessage = err?.message || '注册失败，请稍后再试';
            setError(errorMessage);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>注册成功！</CardTitle>
                    <CardDescription>我们已向您的邮箱发送了验证邮件</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-600 text-sm dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                        <p className="font-medium">请检查您的邮箱</p>
                        <p className="mt-2 text-xs">
                            我们已发送一封验证邮件到{' '}
                            <span className="font-medium">{form.getValues().email}</span>
                            。请点击邮件中的链接来验证您的账户。
                        </p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Link href="/login">
                        <Button variant="outline" className="w-full">
                            前往登录
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>注册</CardTitle>
                <CardDescription>创建一个新账户来开始使用 My-KM</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* 错误提示 */}
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        {/* 邮箱字段 */}
                        <EmailField name="email" label="邮箱" placeholder="your@email.com" />

                        {/* 密码字段 */}
                        <PasswordField
                            name="password"
                            label="密码"
                            placeholder="至少 8 个字符，包含大小写字母和数字"
                            autoComplete="new-password"
                        />

                        {/* 确认密码字段 */}
                        <PasswordField
                            name="confirmPassword"
                            label="确认密码"
                            placeholder="再次输入密码"
                            autoComplete="new-password"
                        />

                        {/* 提交按钮 */}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? '注册中...' : '注册'}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    已有账户？{' '}
                    <Link
                        href="/login"
                        className="font-medium text-slate-900 hover:underline dark:text-slate-50"
                    >
                        登录
                    </Link>
                </p>
            </CardFooter>
        </Card>
    );
}
