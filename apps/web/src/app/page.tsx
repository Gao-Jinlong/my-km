export default function HomePage() {
    return (
        <main className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold mb-4">欢迎使用我的知识库</h1>
                <p className="text-muted-foreground mb-8">
                    这是一个基于 Next.js 和 NestJS 的个人知识管理系统
                </p>

                <div className="grid gap-6 md:grid-cols-2">
                    <div className="border rounded-lg p-6">
                        <h2 className="text-2xl font-semibold mb-2">文章管理</h2>
                        <p className="text-muted-foreground">创建、编辑和管理你的知识文章</p>
                    </div>

                    <div className="border rounded-lg p-6">
                        <h2 className="text-2xl font-semibold mb-2">智能搜索</h2>
                        <p className="text-muted-foreground">
                            基于向量的语义搜索，快速找到你想要的内容
                        </p>
                    </div>

                    <div className="border rounded-lg p-6">
                        <h2 className="text-2xl font-semibold mb-2">AI 问答</h2>
                        <p className="text-muted-foreground">基于文档内容的智能问答系统</p>
                    </div>

                    <div className="border rounded-lg p-6">
                        <h2 className="text-2xl font-semibold mb-2">分类标签</h2>
                        <p className="text-muted-foreground">使用分类和标签组织你的知识</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
