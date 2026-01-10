export default function HomePage() {
    return (
        <main className="container mx-auto px-4 py-8">
            <div className="mx-auto max-w-4xl">
                <h1 className="mb-4 font-bold text-4xl">欢迎使用我的知识库</h1>
                <p className="mb-8 text-muted-foreground">
                    这是一个基于 Next.js 和 NestJS 的个人知识管理系统
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border p-6">
                        <h2 className="mb-2 font-semibold text-2xl">文章管理</h2>
                        <p className="text-muted-foreground">创建、编辑和管理你的知识文章</p>
                    </div>

                    <div className="rounded-lg border p-6">
                        <h2 className="mb-2 font-semibold text-2xl">智能搜索</h2>
                        <p className="text-muted-foreground">
                            基于向量的语义搜索，快速找到你想要的内容
                        </p>
                    </div>

                    <div className="rounded-lg border p-6">
                        <h2 className="mb-2 font-semibold text-2xl">AI 问答</h2>
                        <p className="text-muted-foreground">基于文档内容的智能问答系统</p>
                    </div>

                    <div className="rounded-lg border p-6">
                        <h2 className="mb-2 font-semibold text-2xl">分类标签</h2>
                        <p className="text-muted-foreground">使用分类和标签组织你的知识</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
