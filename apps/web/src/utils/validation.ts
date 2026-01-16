/**
 * 表单验证模式（使用 Zod）
 *
 * 设计说明：
 * Schema 只定义验证规则和翻译键，不负责翻译本身
 * 翻译在组件层通过 zodResolver 的 map 参数完成
 * 这样保持了 schema 的纯粹性，不依赖 React 上下文
 */
import { z } from 'zod';

// 密码强度验证：至少 8 个字符，包含大小写字母、数字
export const passwordSchema = z
    .string()
    .min(8, { message: 'passwordMinLength' })
    .regex(/[a-z]/, { message: 'passwordLowercase' })
    .regex(/[A-Z]/, { message: 'passwordUppercase' })
    .regex(/[0-9]/, { message: 'passwordNumber' });

// 登录表单验证
export const loginSchema = z.object({
    email: z.string().email({ message: 'email' }),
    password: z.string().min(1, { message: 'passwordRequired' }),
    rememberMe: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// 注册表单验证
export const registerSchema = z
    .object({
        email: z.string().email({ message: 'email' }),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: 'passwordMismatch',
        path: ['confirmPassword'],
    });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// 忘记密码表单验证
export const forgotPasswordSchema = z.object({
    email: z.string().email({ message: 'email' }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// 重置密码表单验证
export const resetPasswordSchema = z
    .object({
        token: z.string().min(1, { message: 'passwordRequired' }),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: 'passwordMismatch',
        path: ['confirmPassword'],
    });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// 更新资料表单验证
export const updateProfileSchema = z.object({
    username: z
        .string()
        .min(3, { message: 'usernameMinLength' })
        .max(20, { message: 'usernameMaxLength' })
        .regex(/^[a-zA-Z0-9_-]*$/, { message: 'usernamePattern' })
        .optional(),
    bio: z.string().max(500, { message: 'bioMaxLength' }).optional(),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;

// 修改密码表单验证
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, { message: 'passwordRequired' }),
        newPassword: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.newPassword === data.confirmPassword, {
        message: 'passwordMismatch',
        path: ['confirmPassword'],
    });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
