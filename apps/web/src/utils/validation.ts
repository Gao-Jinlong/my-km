/**
 * 表单验证模式（使用 Zod）
 */
import { z } from 'zod';

// 密码强度验证：至少 8 个字符，包含大小写字母、数字
export const passwordSchema = z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[0-9]/, '密码必须包含数字');

// 登录表单验证
export const loginSchema = z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(1, '请输入密码'),
    rememberMe: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// 注册表单验证
export const registerSchema = z
    .object({
        email: z.string().email('请输入有效的邮箱地址'),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword'],
    });

export type RegisterFormValues = z.infer<typeof registerSchema>;

// 忘记密码表单验证
export const forgotPasswordSchema = z.object({
    email: z.string().email('请输入有效的邮箱地址'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

// 重置密码表单验证
export const resetPasswordSchema = z
    .object({
        token: z.string().min(1, '无效的重置链接'),
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword'],
    });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// 更新资料表单验证
export const updateProfileSchema = z.object({
    username: z
        .string()
        .min(3, '用户名至少需要 3 个字符')
        .max(20, '用户名最多 20 个字符')
        .regex(/^[a-zA-Z0-9_-]*$/, '用户名只能包含字母、数字、下划线和连字符')
        .optional(),
    bio: z.string().max(500, '简介最多 500 个字符').optional(),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;

// 修改密码表单验证
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, '请输入当前密码'),
        newPassword: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(data => data.newPassword === data.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword'],
    });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
