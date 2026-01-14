'use client';

import { type FieldPath, type FieldValues, useFormContext } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { cn } from '@/lib/utils';

export interface CheckboxFieldProps<TFieldValues extends FieldValues = FieldValues> {
    name: FieldPath<TFieldValues>;
    label: string;
    className?: string;
}

export function CheckboxField<TFieldValues extends FieldValues = FieldValues>({
    name,
    label,
    className,
}: CheckboxFieldProps<TFieldValues>) {
    const form = useFormContext<TFieldValues>();

    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem
                    className={cn('flex flex-row items-center space-x-2 space-y-0', className)}
                >
                    <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="mt-0">{label}</FormLabel>
                </FormItem>
            )}
        />
    );
}
