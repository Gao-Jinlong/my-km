import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth/auth-provider';
import { LogPanel } from '@/components/debug/log-panel-wrapper';
import { ShortcutProvider } from '@/components/workspace/shortcut-provider';
import { ContextMenuProvider } from '@/platform/context-menu';
import { BootstrapProvider } from './bootstrap-provider';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'My-KM - 个人知识管理系统',
    description: '您的个人知识管理系统',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <BootstrapProvider>
                    <AuthProvider>
                        <ShortcutProvider>
                            <ContextMenuProvider>{children}</ContextMenuProvider>
                            {process.env.NODE_ENV === 'development' && <LogPanel />}
                        </ShortcutProvider>
                    </AuthProvider>
                </BootstrapProvider>
            </body>
        </html>
    );
}
