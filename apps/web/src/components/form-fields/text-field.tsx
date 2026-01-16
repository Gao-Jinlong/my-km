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

export interface TextFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel';
    autoComplete?: string;
    className?: string;
    autoFocus?: boolean;
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
    autoFocus = false,
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
                            {required && <span className="ml-1 text-red-500">*</span>}
                        </FormLabel>
                    )}
                    <FormControl>
                        <Input
                            placeholder={placeholder}
                            type={type}
                            autoComplete={autoComplete}
                            autoFocus={autoFocus}
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
