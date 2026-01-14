'use client';

import type { FieldValues } from 'react-hook-form';
import { TextField, type TextFieldProps } from './text-field';

export function PasswordField<TFieldValues extends FieldValues = FieldValues>(
    props: Omit<TextFieldProps<TFieldValues>, 'type'> & {
        autoComplete?: 'current-password' | 'new-password';
    },
) {
    const { autoComplete = 'current-password', ...rest } = props;

    return <TextField {...rest} type="password" autoComplete={autoComplete} />;
}
