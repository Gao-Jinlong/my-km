import type { ChangePasswordRequest, UpdateProfileRequest, User } from '@/types/auth';
/**
 * 用户 API 方法
 */
import { apiClient } from './client';

/**
 * 获取当前用户信息
 */
export async function getMe(): Promise<User> {
    return apiClient.get('users/me').json();
}

/**
 * 更新用户资料
 */
export async function updateProfile(data: UpdateProfileRequest): Promise<User> {
    return apiClient.patch('users/me', { json: data }).json();
}

/**
 * 修改密码
 */
export async function changePassword(data: ChangePasswordRequest): Promise<{
    message: string;
}> {
    return apiClient.patch('users/me/password', { json: data }).json();
}

/**
 * 删除账户
 */
export async function deleteAccount(): Promise<{ message: string }> {
    return apiClient.delete('users/me').json();
}
