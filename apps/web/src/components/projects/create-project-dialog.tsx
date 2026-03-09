'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
    createDefaultProjectConfig,
    isFileSystemAPISupported,
    openFolderPicker,
} from '@/base/broswer/api';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LoadingButton } from '@/components/ui/loading-button';
import { Textarea } from '@/components/ui/textarea';
import { addRecentProject } from '@/lib/storage/project-storage';

const formSchema = z.object({
    name: z.string().min(2, 'validation:nameMinLength').max(50, 'validation:nameMaxLength'),
    projectDescription: z.string().max(200, 'validation:descriptionMaxLength').optional(),
    folderPath: z.string().min(1, 'validation:folderRequired'),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateProjectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onProjectCreated?: () => void;
}

export function CreateProjectDialog({
    open,
    onOpenChange,
    onProjectCreated,
}: CreateProjectDialogProps) {
    const t = useTranslations('projects.create');
    const selectorT = useTranslations('projects.selector');
    const _validationT = useTranslations('projects.create.validation');

    const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
    const [_folderHandle, setFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            projectDescription: '',
            folderPath: '',
        },
    });

    const handleSubmit = async (values: FormValues) => {
        try {
            // TODO: 初始化 .my-km 文件夹和配置文件
            // 这里简化处理，实际应该创建 project.json、settings.json、ai.json

            const projectConfig = createDefaultProjectConfig(
                values.name,
                values.projectDescription,
            );

            addRecentProject({
                id: projectConfig.id,
                name: projectConfig.name,
                description: projectConfig.description,
                path: selectedFolderPath,
                lastOpened: projectConfig.lastOpenedAt,
            });

            onProjectCreated?.();
            onOpenChange(false);
            form.reset();
            setSelectedFolderPath('');
            setFolderHandle(null);
        } catch (error) {
            console.error('Failed to create project:', error);
        }
    };

    const handleSelectFolder = async () => {
        if (!isFileSystemAPISupported()) {
            alert(selectorT('unsupportedBrowser'));
            return;
        }

        const handle = await openFolderPicker();
        if (handle) {
            setFolderHandle(handle);
            const folderName = handle.name || 'Untitled';
            setSelectedFolderPath(folderName);
            form.setValue('folderPath', folderName);

            // 如果项目名称为空，使用文件夹名称
            if (!form.getValues('name') && folderName !== '.my-km') {
                form.setValue('name', folderName);
            }
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md p-6">
                <div className="mb-4">
                    <h2 className="font-bold text-2xl">{t('title')}</h2>
                    <p className="mt-1 text-muted-foreground text-sm">{t('dialogDescription')}</p>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        {/* 项目名称 */}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('name')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('namePlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* 项目描述 */}
                        <FormField
                            control={form.control}
                            name="projectDescription"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('projectDescription')}</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={t('descriptionPlaceholder')}
                                            rows={3}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* 文件夹选择 */}
                        <FormField
                            control={form.control}
                            name="folderPath"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('selectFolder')}</FormLabel>
                                    <div className="space-y-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full"
                                            onClick={handleSelectFolder}
                                        >
                                            📁 {selectedFolderPath || t('selectFolder')}
                                        </Button>
                                        {selectedFolderPath && (
                                            <p className="text-muted-foreground text-sm">
                                                {t('folderSelected', { path: selectedFolderPath })}
                                            </p>
                                        )}
                                        <input type="hidden" {...field} />
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                {t('cancel')}
                            </Button>
                            <LoadingButton type="submit" loading={form.formState.isSubmitting}>
                                {t('create')}
                            </LoadingButton>
                        </div>
                    </form>
                </Form>
            </Card>
        </div>
    );
}
