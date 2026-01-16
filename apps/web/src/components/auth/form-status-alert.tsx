'use client';

import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface FormStatusAlertProps {
    type: AlertType;
    message: string;
    onDismiss?: () => void;
    className?: string;
}

const alertStyles = {
    success:
        'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-950 dark:text-green-400',
    error: 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
    warning:
        'border-yellow-200 bg-yellow-50 text-yellow-600 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400',
    info: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400',
};

const alertIcons: Record<AlertType, ReactNode> = {
    success: <CheckCircle className="h-4 w-4" />,
    error: <AlertCircle className="h-4 w-4" />,
    warning: <AlertCircle className="h-4 w-4" />,
    info: <Info className="h-4 w-4" />,
};

const alertRoles: Record<AlertType, string> = {
    success: 'status',
    error: 'alert',
    warning: 'alert',
    info: 'status',
};

/**
 * FormStatusAlert Component
 *
 * A reusable alert component for displaying form status messages
 * with icons, animations, and accessibility features.
 */
export function FormStatusAlert({
    type,
    message,
    onDismiss,
    className = '',
}: FormStatusAlertProps) {
    return (
        <div
            role={alertRoles[type] as 'alert' | 'status'}
            aria-live="polite"
            className={`slide-in-from-top-2 fade-in animate-in rounded-lg border p-3 text-sm duration-300 ${alertStyles[type]} ${className}`}
        >
            <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {alertIcons[type]}
                </span>
                <p className="flex-1">{message}</p>
                {onDismiss && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
