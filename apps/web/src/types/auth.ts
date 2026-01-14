/**
 * 认证相关类型定义
 */

// 用户类型
export interface User {
    id: string;
    email: string;
    username?: string | null;
    avatar?: string | null;
    bio?: string | null;
    isEmailVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string | null;
}

// Token 类型
export interface Tokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

// 登录请求
export interface LoginRequest {
    email: string;
    password: string;
    rememberMe?: boolean;
}

// 登录响应
export interface LoginResponse extends Tokens {
    user: User;
}

// 注册请求
export interface RegisterRequest {
    email: string;
    password: string;
    username?: string;
}

// 注册响应
export interface RegisterResponse {
    user: User;
    message: string;
}

// 刷新令牌请求
export interface RefreshTokenRequest {
    refreshToken: string;
}

// 忘记密码请求
export interface ForgotPasswordRequest {
    email: string;
}

// 重置密码请求
export interface ResetPasswordRequest {
    token: string;
    newPassword: string;
}

// 更新资料请求
export interface UpdateProfileRequest {
    username?: string;
    bio?: string;
}

// 修改密码请求
export interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
}

// 认证状态
export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

// JWT Payload
export interface JwtPayload {
    sub: string; // 用户 ID
    email: string;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
    jti?: string;
}
