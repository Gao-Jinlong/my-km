import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AuthProvider } from '@/components/auth/auth-provider';
import type { Locale } from '@/i18n/routing';
import { routing } from '@/i18n/routing';
import { ThemeInitializer } from '@/stores/theme-store';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'My-KM - 知识管理系统',
    description: '您的个人知识管理系统',
};

/**
 * 生成静态参数
 * 为所有支持的语言生成静态路径
 */
export function generateStaticParams() {
    return routing.locales.map(locale => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params,
}: Readonly<{
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}>) {
    const { locale } = await params;

    // 确保传入的 locale 是有效的
    const isValidLocale = routing.locales.includes(locale as Locale);
    const messages = await getMessages();

    return (
        <html lang={isValidLocale ? locale : routing.defaultLocale}>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <ThemeInitializer />
                <NextIntlClientProvider messages={messages}>
                    <AuthProvider>{children}</AuthProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
