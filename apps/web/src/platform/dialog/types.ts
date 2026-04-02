export interface DialogRequest {
    id: string;
    type: 'input' | 'confirm' | 'alert';
    title: string;
    message?: string;
    defaultValue?: string;
    resolve: (value: string | boolean | null | undefined) => void;
}
