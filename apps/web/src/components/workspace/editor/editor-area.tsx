import { EditorTabs } from './editor-tabs';

export function EditorArea() {
    return (
        <div className="flex h-full flex-col bg-ws-bg-secondary">
            {/* Tabs */}
            <EditorTabs />

            {/* Editor Content */}
            <div className="flex-1 p-4">
                <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                        <h2 className="font-semibold text-lg text-ws-fg-primary">Editor Area</h2>
                        <p className="text-sm text-ws-fg-muted">
                            Document content will be displayed here
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
