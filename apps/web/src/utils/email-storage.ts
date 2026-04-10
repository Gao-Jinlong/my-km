/**
 * Email Storage Utility
 * Manages localStorage persistence for the last used email address
 */

import { container } from '@/platform/bootstrap';
import { LoggerService } from '@/platform/logger/service';

const STORAGE_KEY = 'auth-last-email';
const logger = container.get(LoggerService).getLogger('email-storage');

/**
 * Save the last used email address to localStorage
 * @param email - Email address to save
 */
export function saveLastEmail(email: string): void {
    if (typeof window !== 'undefined' && email) {
        try {
            localStorage.setItem(STORAGE_KEY, email);
        } catch (error) {
            // Silently fail if localStorage is not available
            logger.warn('Failed to save last email:', error);
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
            logger.warn('Failed to retrieve last email:', error);
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
            logger.warn('Failed to clear last email:', error);
        }
    }
}
