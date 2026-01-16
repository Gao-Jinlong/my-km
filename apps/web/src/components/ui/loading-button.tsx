'use client';

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './button';

interface LoadingButtonProps extends ButtonProps {
    loading?: boolean;
    loadingText?: string;
    children: ReactNode;
}

/**
 * LoadingButton Component
 *
 * An enhanced button component that integrates loading state with spinner icon.
 * Prevents double-submission and maintains button width during loading.
 */
export function LoadingButton({
    loading = false,
    loadingText,
    children,
    disabled,
    className = '',
    ...props
}: LoadingButtonProps) {
    return (
        <Button
            disabled={loading || disabled}
            className={`${className} transition-all duration-200`}
            {...props}
        >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading && loadingText ? loadingText : children}
        </Button>
    );
}
