# 第一阶段：客户端文件读取与编辑

**状态**: 🟡 进行中
**创建日期**: 2026-03-22

## 目标

实现客户端文件读取与编辑功能：打开文件夹 → 获取文件信息 → 展示文件列表 → 打开文件编辑 → 保存文件

## 任务列表

### 阶段 1.1: 文件系统平台层

- [ ] 定义类型和枚举 (`FileSystemCapability`, `FileSystemEntry` 等)
- [ ] 定义 Provider 接口 (`IFileSystemProvider`)
- [ ] 实现 FileSystemService (路由、能力检查、方法分发)
- [ ] 实现 MemoryProvider (内存存储)
- [ ] 实现 IndexedDBProvider (持久化存储)
- [ ] 实现 FileSystemAccessAPIProvider (本地文件访问)
- [ ] 实现路径解析工具
- [ ] 错误处理定义

### 阶段 1.2: 状态管理

- [ ] 创建 `project-store.ts` (当前项目、最近项目、打开的文件)

### 阶段 1.3: UI 组件

- [ ] 实现 Files Panel 组件 (文件树展示、展开/折叠、右键菜单)
- [ ] 实现项目选择对话框 (文件夹选择器)

### 阶段 1.4: 编辑与保存

- [ ] EditorArea 集成文本编辑器
- [ ] 实现 Ctrl+S 保存快捷键
- [ ] StatusBar 显示文件路径和保存状态

## 进度

| 阶段 | 任务 | 状态 |
|------|------|------|
| 1.1 | 文件系统平台层 | 🟡 进行中 |
| 1.2 | 状态管理 | ⏳ 待开始 |
| 1.3 | UI 组件 | ⏳ 待开始 |
| 1.4 | 编辑与保存 | ⏳ 待开始 |

## 相关文档

- [文件系统架构设计](../03-frontend/file-system-architecture.md)
- [文件系统实现方案](../03-frontend/file-system-implementation.md)
