import { createLangGraphRuntimeClient } from '@/features/ai/sdk/runtime-http-client';
import { FrontendToolExecutor } from '@/features/ai/tools/frontend-tool-executor';
import { DocEditHandler } from '@/features/ai/tools/handlers/doc-edit';
import { DocReadHandler } from '@/features/ai/tools/handlers/doc-read';
import { FileOpsHandler } from '@/features/ai/tools/handlers/file-ops';
import { SearchHandler } from '@/features/ai/tools/handlers/search';
import { EditorContainer } from '@/features/editor';
import { getContainer } from '@/platform/bootstrap';
import { DocumentStore } from '@/platform/document-store';
import { FileSystemService } from '@/platform/file-system';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { LangGraphChatRuntime } from './chat-runtime';

export function createDefaultLangGraphChatRuntime(): LangGraphChatRuntime {
    return new LangGraphChatRuntime({
        client: createLangGraphRuntimeClient(),
        toolExecutor: createDefaultToolExecutor(),
    });
}

function createDefaultToolExecutor(): FrontendToolExecutor {
    const services = getContainer();
    const documentStore = services.get(DocumentStore);
    const editorContainer = services.get(EditorContainer);
    const fileSystemService = services.get(FileSystemService);

    const getProjectRoot = () => {
        const project = useWorkspaceStore.getState().project.currentProject;
        if (!project) return null;
        return 'file://';
    };

    const executor = new FrontendToolExecutor('confirm-write');
    executor.register(new FileOpsHandler(fileSystemService, getProjectRoot));
    executor.register(new DocReadHandler(documentStore, editorContainer, fileSystemService));
    executor.register(new DocEditHandler(documentStore, editorContainer, fileSystemService));
    executor.register(
        new SearchHandler(documentStore, editorContainer, fileSystemService, getProjectRoot),
    );

    return executor;
}
