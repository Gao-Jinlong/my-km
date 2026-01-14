'use client';

import { type FieldPath, type FieldValues, useFormContext } from 'react-hook-form';
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface TextFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel';
    autoComplete?: string;
    className?: string;
}

export function TextField<TFieldValues extends FieldValues = FieldValues>({
    name,
    label,
    description,
    placeholder,
    required = false,
    type = 'text',
    autoComplete,
    className,
}: TextFieldProps<TFieldValues>) {
    const form = useFormContext<TFieldValues>();

    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className={className}>
                    {label && (
                        <FormLabel>
                            {label}
                            {required && <span className="text-red-500 ml-1">*</span>}
                        </FormLabel>
                    )}
                    <FormControl>
                        <Input
                            placeholder={placeholder}
                            type={type}
                            autoComplete={autoComplete}
                            {...field}
                        />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
