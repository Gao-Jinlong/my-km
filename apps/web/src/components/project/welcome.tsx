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
            icon: <FileText className="h-6 w-6" />,
            title: '文档管理',
            description: '支持 Markdown 和富文本编辑，轻松管理技术文档和笔记',
        },
        {
            icon: <FolderOpen className="h-6 w-6" />,
            title: '项目组织',
            description: '基于文件系统的目录结构，清晰组织您的知识体系',
        },
        {
            icon: <Lightbulb className="h-6 w-6" />,
            title: '智能助手',
            description: '集成 AI 能力，提供写作建议、代码审查和知识问答',
        },
        {
            icon: <Zap className="h-6 w-6" />,
            title: '快速检索',
            description: '全局搜索功能，快速定位您需要的信息和文件',
        },
        {
            icon: <Shield className="h-6 w-6" />,
            title: '本地优先',
            description: '数据存储在本地，保护隐私安全，支持离线工作',
        },
        {
            icon: <Cloud className="h-6 w-6" />,
            title: '云端同步',
            description: '可选云同步功能，多设备实时同步您的知识库',
        },
    ];

    return (
        <div className="flex min-h-screen w-full flex-col bg-ws-bg-primary">
            {/* Hero Section */}
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
                <div className="mb-8 flex items-center gap-3">
                    <Sparkles className="h-10 w-10 text-ws-accent" />
                    <h1 className="bg-gradient-to-r from-ws-accent to-ws-accent/70 bg-clip-text font-bold text-5xl text-transparent">
                        My Knowledge Manager
                    </h1>
                </div>
                <p className="mb-12 max-w-2xl text-center text-ws-text-muted text-xl">
                    新一代知识管理工具，为您打造专属的第二大脑
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                    <button
                        type="button"
                        onClick={onOpenProject}
                        className="group flex items-center gap-2 rounded-lg bg-ws-accent px-8 py-4 font-medium text-ws-accent-foreground shadow-lg shadow-ws-accent/25 transition-all hover:bg-ws-accent/90 hover:shadow-ws-accent/30 hover:shadow-xl"
                    >
                        <FolderOpen className="h-5 w-5 transition-transform group-hover:scale-110" />
                        打开项目
                    </button>
                    <a
                        href="https://github.com/your-repo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-ws-border bg-ws-bg-secondary px-8 py-4 font-medium text-ws-fg-secondary transition-colors hover:bg-ws-bg-hover"
                    >
                        <Github className="h-5 w-5" />
                        查看源码
                    </a>
                </div>
            </div>

            {/* Features Section */}
            <div className="border-ws-border border-t bg-ws-bg-secondary/30 py-16">
                <div className="mx-auto max-w-6xl px-4">
                    <h2 className="mb-12 text-center font-semibold text-3xl text-ws-fg-primary">
                        核心功能
                    </h2>
                    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map(feature => (
                            <div
                                key={feature.title}
                                className="group rounded-xl border border-ws-border bg-ws-bg-primary p-6 shadow-sm transition-all hover:border-ws-accent/50 hover:shadow-lg hover:shadow-ws-accent/10"
                            >
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-ws-accent/10 text-ws-accent transition-colors group-hover:bg-ws-accent/20">
                                    {feature.icon}
                                </div>
                                <h3 className="mb-2 font-medium text-lg text-ws-fg-primary">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-ws-fg-muted">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CTA Section */}
            <div className="border-ws-border border-t bg-ws-bg-secondary/30 py-12">
                <div className="mx-auto max-w-4xl px-4 text-center">
                    <h3 className="mb-4 font-semibold text-2xl text-ws-fg-primary">
                        准备好开始了吗？
                    </h3>
                    <p className="mb-8 text-ws-fg-muted">打开一个项目，开始构建您的知识库</p>
                    <button
                        type="button"
                        onClick={onOpenProject}
                        className="rounded-lg bg-ws-accent px-8 py-3 font-medium text-ws-accent-foreground transition-colors hover:bg-ws-accent/90"
                    >
                        立即开始
                    </button>
                </div>
            </div>
        </div>
    );
}
