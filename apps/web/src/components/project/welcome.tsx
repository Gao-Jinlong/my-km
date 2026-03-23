'use client';

interface WelcomeProps {
    onOpenProject: () => void;
}

export function Welcome({ onOpenProject }: WelcomeProps) {
    return (
        <div className="flex h-full w-full items-center justify-center bg-ws-bg-primary">
            <div className="text-center">
                <h1 className="mb-4 font-bold text-4xl text-ws-foreground">My Knowledge Manager</h1>
                <p className="mb-8 text-ws-text-muted">开始管理您的知识库</p>
                <button
                    type="button"
                    onClick={onOpenProject}
                    className="rounded-lg bg-ws-accent px-6 py-3 font-medium text-ws-accent-foreground transition-colors hover:bg-ws-accent/90"
                >
                    打开项目
                </button>
            </div>
        </div>
    );
}
