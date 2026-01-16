'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type FieldPath, type FieldValues, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export interface PasswordFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    autoComplete?: 'current-password' | 'new-password';
    className?: string;
    autoFocus?: boolean;
}

export function PasswordField<TFieldValues extends FieldValues = FieldValues>({
    name,
    label,
    description,
    placeholder,
    required = false,
    autoComplete = 'current-password',
    className,
    autoFocus = false,
}: PasswordFieldProps<TFieldValues>) {
    const tShared = useTranslations('auth.shared');
    const form = useFormContext<TFieldValues>();
    const [showPassword, setShowPassword] = useState(false);

    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className={className}>
                    {label && (
                        <FormLabel>
                            {label}
                            {required && <span className="ml-1 text-red-500">*</span>}
                        </FormLabel>
                    )}
                    <FormControl>
                        <div className="relative">
                            <Input
                                placeholder={placeholder}
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={autoComplete}
                                autoFocus={autoFocus}
                                className="pr-10"
                                {...field}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={
                                    showPassword ? tShared('hidePassword') : tShared('showPassword')
                                }
                            >
                                {showPassword ? (
                                    <EyeOff className="h-4 w-4 text-slate-400" />
                                ) : (
                                    <Eye className="h-4 w-4 text-slate-400" />
                                )}
                            </Button>
                        </div>
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
