import { WorkspaceLayout } from '@/components/workspace/workspace-layout';

export default async function WorkspaceRoute({
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string; projectId: string }>;
}) {
    await params;
    return <WorkspaceLayout />;
}
