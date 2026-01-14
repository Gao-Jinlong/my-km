import type {
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
} from '@/types/auth';
/**
 * 认证 API 方法
 */
import { apiClient, publicApiClient } from './client';

/**
 * 用户登录
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
    return publicApiClient.post('auth/login', { json: data }).json();
}

/**
 * 用户注册
 */
export async function register(data: RegisterRequest): Promise<RegisterResponse> {
    return publicApiClient.post('users/register', { json: data }).json();
}

/**
 * 用户登出
 */
export async function logout(refreshToken: string): Promise<{ message: string }> {
    return apiClient.post('auth/logout', { json: { refreshToken } }).json();
}

/**
 * 刷新令牌
 */
export async function refreshTokens(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}> {
    return publicApiClient.post('auth/refresh', { json: { refreshToken } }).json();
}

/**
 * 验证邮箱
 */
export async function verifyEmail(token: string): Promise<{ message: string }> {
    return publicApiClient.get(`auth/verify-email?token=${token}`).json();
}

/**
 * 重发验证邮件
 */
export async function resendVerificationEmail(): Promise<{ message: string }> {
    return apiClient.post('auth/resend-verification').json();
}

/**
 * 请求密码重置
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<{
    message: string;
}> {
    return publicApiClient.post('auth/forgot-password', { json: data }).json();
}

/**
 * 重置密码
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<{
    message: string;
}> {
    return publicApiClient.post('auth/reset-password', { json: data }).json();
}

// 导出所有 API 方法为一个对象
export const authApi = {
    login,
    register,
    logout,
    refreshTokens,
    verifyEmail,
    resendVerificationEmail,
    forgotPassword,
    resetPassword,
};
