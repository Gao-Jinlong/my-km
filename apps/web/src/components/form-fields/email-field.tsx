import type { FieldValues } from 'react-hook-form';
import { TextField, type TextFieldProps } from './text-field';

export function EmailField<TFieldValues extends FieldValues = FieldValues>(
    props: Omit<TextFieldProps<TFieldValues>, 'type'>,
) {
    return <TextField {...props} type="email" autoComplete="email" />;
}
