'use client';

import {
    Cloud,
    FileText,
    FolderOpen,
    Github,
    Lightbulb,
    Shield,
    Sparkles,
    Zap,
} from 'lucide-react';

interface WelcomeProps {
    onOpenProject: () => void;
}

export function Welcome({ onOpenProject }: WelcomeProps) {
    const features = [
        {
            icon: <FileText className="h-5 w-5" />,
            title: '文档管理',
            description: '支持 Markdown 和富文本编辑，轻松管理技术文档和笔记',
        },
        {
            icon: <FolderOpen className="h-5 w-5" />,
            title: '项目组织',
            description: '基于文件系统的目录结构，清晰组织您的知识体系',
        },
        {
            icon: <Lightbulb className="h-5 w-5" />,
            title: '智能助手',
            description: '集成 AI 能力，提供写作建议、代码审查和知识问答',
        },
        {
            icon: <Zap className="h-5 w-5" />,
            title: '快速检索',
            description: '全局搜索功能，快速定位您需要的信息和文件',
        },
        {
            icon: <Shield className="h-5 w-5" />,
            title: '本地优先',
            description: '数据存储在本地，保护隐私安全，支持离线工作',
        },
        {
            icon: <Cloud className="h-5 w-5" />,
            title: '云端同步',
            description: '可选云同步功能，多设备实时同步您的知识库',
        },
    ];

    return (
        <div className="flex min-h-screen w-full flex-col bg-ws-bg-primary">
            {/* Hero Section */}
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-20">
                <div className="mb-6 flex items-center gap-3">
                    <Sparkles className="h-8 w-8 text-ws-accent" />
                    <h1 className="font-semibold text-4xl text-ws-fg-primary">
                        My Knowledge Manager
                    </h1>
                </div>
                <p className="mb-10 max-w-xl text-center text-ws-fg-muted text-lg">
                    新一代知识管理工具，为您打造专属的第二大脑
                </p>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onOpenProject}
                        className="group flex items-center gap-2 rounded-lg bg-ws-accent px-6 py-3 font-medium text-ws-accent-foreground shadow-md shadow-ws-accent/20 transition-all hover:bg-ws-accent/90 hover:shadow-ws-accent/30"
                    >
                        <FolderOpen className="h-4 w-4 transition-transform group-hover:scale-105" />
                        打开项目
                    </button>
                    <a
                        href="https://github.com/your-repo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-ws-border bg-ws-bg-secondary px-6 py-3 font-medium text-ws-fg-muted transition-colors hover:bg-ws-bg-hover hover:text-ws-fg-primary"
                    >
                        <Github className="h-4 w-4" />
                        查看源码
                    </a>
                </div>
            </div>

            {/* Features Section */}
            <div className="bg-ws-bg-secondary/50 py-20">
                <div className="mx-auto max-w-6xl px-4">
                    <h2 className="mb-10 text-center font-medium text-2xl text-ws-fg-primary">
                        核心功能
                    </h2>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map(feature => (
                            <div
                                key={feature.title}
                                className="group rounded-lg border border-ws-border bg-ws-bg-primary p-5 transition-all hover:border-ws-accent/40 hover:shadow-md hover:shadow-ws-accent/5"
                            >
                                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-ws-accent/10 text-ws-accent transition-colors group-hover:bg-ws-accent/15">
                                    {feature.icon}
                                </div>
                                <h3 className="mb-1.5 font-medium text-base text-ws-fg-primary">
                                    {feature.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-ws-fg-muted">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
