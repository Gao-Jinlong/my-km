import { EditorTabs } from './editor-tabs';

export function EditorArea() {
    return (
        <div className="flex h-full flex-col bg-background">
            {/* Tabs */}
            <EditorTabs />

            {/* Editor Content */}
            <div className="flex-1 p-8">
                <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                        <h2 className="font-semibold text-lg">Editor Area</h2>
                        <p className="text-muted-foreground text-sm">
                            Document content will be displayed here
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
