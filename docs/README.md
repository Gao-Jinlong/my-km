# 个人知识库系统 - 文档中心

欢迎来到个人知识库系统的文档中心！本文档按**读者角色**组织，帮助您快速找到需要的文档。

---

## 📚 按角色导航

### 👔 产品经理

如果您关注产品需求、功能和规划，请查看：

- **[产品设计文档](./product/README.md)** - 产品文档总览
  - [需求文档](./product/requirements.md) - 用户需求、功能需求、非功能性需求
  - [功能说明](./product/features.md) - 核心功能模块、用户故事
  - [产品规划](./product/roadmap.md) - 版本规划、路线图、开发阶段

---

### 💻 开发者

如果您关注技术实现、API 和数据库设计，请查看：

- **[技术规格文档](./technical/technical-specification.md)** - 技术栈、项目结构、开发指南
- **[API 设计规范](./technical/api-design.md)** - RESTful API 端点、数据格式、错误处理
- **[数据库设计文档](./technical/database-design.md)** - 数据库表结构、关系、索引设计

---

## 🚀 快速开始

### 产品经理
1. 阅读 [产品规划](./product/roadmap.md) 了解整体方向
2. 查看 [需求文档](./product/requirements.md) 理解用户需求
3. 参考 [功能说明](./product/features.md) 了解具体功能

### 开发者
1. 阅读 [技术规格文档](./technical/technical-specification.md) 了解技术栈
2. 查看 [数据库设计文档](./technical/database-design.md) 理解数据模型
3. 参考 [API 设计规范](./technical/api-design.md) 开始开发

---

## 📂 文档结构

```
docs/
├── README.md                    # 本文档（文档中心）
├── product/                     # 产品设计文档
│   ├── README.md                # 产品文档索引
│   ├── requirements.md          # 需求文档
│   ├── features.md              # 功能说明
│   └── roadmap.md               # 产品规划
└── technical/                   # 技术文档
    ├── technical-specification.md  # 技术规格
    ├── api-design.md               # API 设计
    └── database-design.md          # 数据库设计
```

---

## 🎯 项目概述

**个人知识库系统**是一个智能的知识管理工具，帮助用户：

- 📝 管理文章和笔记
- 🗂️ 分类和标签组织
- 🔍 智能搜索（关键词 + 语义）
- 🤖 AI 问答（RAG）
- ✨ AI 辅助编辑

### 核心技术
- **前端**: Next.js 14 + shadcn/ui
- **后端**: NestJS 10 + Prisma
- **数据库**: PostgreSQL + pgvector
- **AI**: 智谱AI / 阿里云百炼

---

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- **GitHub Issues**: [项目 Issues 页面]
- **项目仓库**: [my-km](../)

---

**文档版本**: 1.0.0
**最后更新**: 2026-01-09
**当前版本**: v1.0 (MVP 开发中)
