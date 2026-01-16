# Project Documentation Skill

> 为 AI 助手提供项目知识，支持智能问答和分类浏览

## 📁 目录结构

```
skills/project-docs/
├── SKILL.md                    # 技能主文件（技能说明和使用指南）
├── README.md                   # 本文件
├── scripts/
│   └── generate-index.ts      # 索引生成脚本
└── references/
    ├── doc-index.json         # 文档索引（生成）
    ├── api-index.json         # API 索引（生成）
    └── config-index.json      # 配置索引（生成）
```

## 🚀 快速开始

### 1. 生成索引

在使用技能之前，需要先生成索引：

```bash
npm run generate-docs-index
```

这将扫描项目中的所有文档、API 端点和配置文件，生成结构化的索引。

### 2. 使用技能

在 Claude Code 中，当你询问关于项目的问题时，AI 助手会自动激活这个技能并提供相关文档信息。

**示例问题：**
- "如何实现用户认证？"
- "数据库设计中文章表有哪些字段？"
- "前端使用了哪些技术栈？"
- "缓存系统是如何设计的？"
- "显示所有 auth API 端点"

## 📊 索引内容

### 文档索引 (doc-index.json)

扫描 `docs/` 目录下的所有 Markdown 文件，包括：
- **产品规格** (spec): 需求、功能、规划、设计文档
- **技术文档** (technical): API 设计、数据库设计、前端技术栈、国际化等
- **导航文档** (readme): 文档中心索引

每个文档包含：
- 标题和摘要
- 分类和类型
- 章节标题
- 字数统计
- 最后修改时间

### API 索引 (api-index.json)

扫描 `apps/server/src/` 下的所有 NestJS 控制器，提取：
- API 路径和 HTTP 方法
- 端点描述
- 控制器名称
- 源文件位置

按控制器和 HTTP 方法分组。

### 配置索引 (config-index.json)

扫描项目配置文件，包括：
- `package.json` - 项目依赖和脚本
- `tsconfig.json` - TypeScript 配置
- `docker-compose.yml` - Docker 服务编排
- `.env.example` - 环境变量示例

## 🔄 更新索引

当以下内容发生变化时，需要重新生成索引：

```bash
npm run generate-docs-index
```

**需要更新的情况：**
- 添加了新的文档
- 修改了 API 端点
- 更新了配置文件
- 文档结构发生变化

## 🛠️ 技术实现

### 索引生成脚本

`scripts/generate-index.ts` 使用 TypeScript 编写，依赖：
- Node.js `fs` 模块 - 文件系统操作
- 正则表达式 - 提取文档元数据和 API 装饰器
- JSON - 序列化索引数据

### 技能规范

遵循 [Agent Skills 规范](https://agentskills.io/specification)：
- `SKILL.md` - 包含 YAML frontmatter 和技能说明
- `scripts/` - 可执行脚本
- `references/` - 参考数据和索引文件

## 📖 使用示例

### 示例 1: 问答模式

**用户输入：**
```
如何实现国际化功能？
```

**AI 响应：**
```markdown
根据项目文档，国际化 (i18n) 实现如下：

**技术栈:**
- next-intl (前端)
- 自定义 i18n 模块 (后端)

**支持语言:**
- 🇨🇳 简体中文 (zh-CN)
- 🇬🇧 英文 (en)

**前端使用:**
- 翻译文件: `apps/web/messages/zh-CN.json`, `apps/web/messages/en.json`
- 使用 hook: `useTranslations('yourFeature')`

**后端使用:**
- 装饰器: `@CurrentLocale()` 自动注入当前语言
- 服务: `I18nService.getErrorMessage(code, locale)`

**相关文档:**
- [国际化使用指南](docs/technical/i18n.md)
- 前端配置: `apps/web/src/i18n/`
- 后端实现: `apps/server/src/i18n/`
```

### 示例 2: API 查询

**用户输入：**
```
显示所有认证相关的 API 端点
```

**AI 响应：**
```markdown
## Auth API 端点 (8 个)

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/login | 用户登录 |
| POST | /auth/logout | 用户登出 |
| POST | /auth/refresh | 刷新 Token |
| GET | /auth/verify-email | 验证邮箱 |

### 密码管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/forgot-password | 请求密码重置 |
| POST | /auth/reset-password | 重置密码 |

### 实现
- 控制器: `apps/server/src/auth/auth.controller.ts`
- 服务: `apps/server/src/auth/auth.service.ts`
- 文档: `docs/spec/user-authentication.md`
```

## 🔧 自定义和扩展

### 添加新的文档类型

编辑 `scripts/generate-index.ts`，在 `scanMarkdownDocuments()` 函数中添加：

```typescript
else if (relativePath.includes('your-type')) type = 'your-type';
```

### 添加新的配置文件

在 `scanConfigFiles()` 函数中添加：

```typescript
{ path: 'path/to/config.json', type: 'custom' as const }
```

### 优化搜索权重

调整关键词匹配权重（title > summary > headers）以改进搜索结果。

## 📝 维护建议

1. **定期更新索引**：在添加新文档或修改 API 后运行 `npm run generate-docs-index`
2. **保持文档规范**：使用一致的标题格式和元数据
3. **编写清晰的 JSDoc**：为 API 端点添加详细注释
4. **验证索引质量**：定期检查生成的索引是否准确

## 🤝 贡献

如果发现问题或有改进建议，请：
1. 修改 `scripts/generate-index.ts` 脚本
2. 更新 `SKILL.md` 技能说明
3. 重新生成索引并测试

## 📄 许可证

MIT

---

**最后更新**: 2026-01-16
**版本**: 1.0.0
