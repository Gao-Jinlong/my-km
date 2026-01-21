export default async function WorkspaceLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    await params;
    // Layout 只提供路由级别的包装,页面内容由 page.tsx 渲染
    return <div className="h-screen w-full">{children}</div>;
}
