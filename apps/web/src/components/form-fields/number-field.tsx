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

export interface NumberFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
}

export function NumberField<TFieldValues extends FieldValues = FieldValues>({
    name,
    label,
    description,
    placeholder,
    required = false,
    min,
    max,
    step,
    className,
}: NumberFieldProps<TFieldValues>) {
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
                            type="number"
                            placeholder={placeholder}
                            min={min}
                            max={max}
                            step={step}
                            {...field}
                            onChange={e => {
                                const value = e.target.value;
                                field.onChange(value === '' ? '' : Number.parseFloat(value));
                            }}
                        />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
