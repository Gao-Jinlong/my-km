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
import { Textarea } from '@/components/ui/textarea';

export interface TextareaFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    rows?: number;
    className?: string;
}

export function TextareaField<TFieldValues extends FieldValues = FieldValues>({
    name,
    label,
    description,
    placeholder,
    required = false,
    rows = 3,
    className,
}: TextareaFieldProps<TFieldValues>) {
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
                        <Textarea placeholder={placeholder} rows={rows} {...field} />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
