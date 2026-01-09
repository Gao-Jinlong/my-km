import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: '我的知识库',
    description: '个人知识管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-CN">
            <body className={inter.className}>
                <div className="min-h-screen bg-background">{children}</div>
            </body>
        </html>
    );
}
