# Web 应用 (Frontend)

这是知识库系统的前端应用，使用 Next.js 14 构建。

## 技术栈

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zustand

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start
```

## 环境变量

复制 `.env.local.example` 到 `.env.local` 并配置：

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 项目结构

```
src/
├── app/              # Next.js App Router 页面
├── components/       # React 组件
├── lib/             # 工具函数和 API 客户端
├── hooks/           # 自定义 Hooks
├── styles/          # 全局样式
└── types/           # 类型定义
```
