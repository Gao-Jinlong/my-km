/**
 * Email Storage Utility
 * Manages localStorage persistence for the last used email address
 *
 * 注意：本文件是底层工具，不依赖上层服务
 */

const STORAGE_KEY = 'auth-last-email';

/**
 * Save the last used email address to localStorage
 * @param email - Email address to save
 */
export function saveLastEmail(email: string): void {
    if (typeof window !== 'undefined' && email) {
        try {
            localStorage.setItem(STORAGE_KEY, email);
        } catch (error) {
            console.warn('[email-storage] Failed to save last email:', error);
        }
    }
}

/**
 * Retrieve the last used email address from localStorage
 * @returns The last used email or null if not found
 */
export function getLastEmail(): string | null {
    if (typeof window !== 'undefined') {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            console.warn('[email-storage] Failed to retrieve last email:', error);
            return null;
        }
    }
    return null;
}

/**
 * Clear the last used email address from localStorage
 */
export function clearLastEmail(): void {
    if (typeof window !== 'undefined') {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('[email-storage] Failed to clear last email:', error);
        }
    }
}
