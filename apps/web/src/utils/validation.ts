/**
 * 表单验证模式（使用 Zod）
 */
import { z } from 'zod';

// 密码强度验证：至少 8 个字符，包含大小写字母、数字
export const passwordSchema = z
    .string()
    .min(8, { message: 'validation.passwordMinLength' })
    .regex(/[a-z]/, { message: 'validation.passwordLowercase' })
    .regex(/[A-Z]/, { message: 'validation.passwordUppercase' })
    .regex(/[0-9]/, { message: 'validation.passwordNumber' });

// 登录表单验证
export const loginSchema = z.object({
    email: z.string().email('validation.email'),
    password: z.string().min(1, { message: 'validation.passwordRequired' }),
    rememberMe: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// 注册表单验证
export const registerSchema = z
    .object({
        email: z.string().email({ message: 'validation.email' }),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: 'validation.passwordMismatch',
        path: ['confirmPassword'],
    });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// 忘记密码表单验证
export const forgotPasswordSchema = z.object({
    email: z.string().email({ message: 'validation.email' }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// 重置密码表单验证
export const resetPasswordSchema = z
    .object({
        token: z.string().min(1, { message: 'validation.passwordRequired' }),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: 'validation.passwordMismatch',
        path: ['confirmPassword'],
    });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// 更新资料表单验证
export const updateProfileSchema = z.object({
    username: z
        .string()
        .min(3, { message: 'validation.usernameMinLength' })
        .max(20, { message: 'validation.usernameMaxLength' })
        .regex(/^[a-zA-Z0-9_-]*$/, { message: 'validation.usernamePattern' })
        .optional(),
    bio: z.string().max(500, { message: 'validation.bioMaxLength' }).optional(),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;

// 修改密码表单验证
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, { message: 'validation.passwordRequired' }),
        newPassword: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.newPassword === data.confirmPassword, {
        message: 'validation.passwordMismatch',
        path: ['confirmPassword'],
    });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
