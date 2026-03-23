# 第一阶段：客户端文件读取与编辑

**状态**: 🟡 进行中
**创建日期**: 2026-03-22

## 目标

实现客户端文件读取与编辑功能：打开文件夹 → 获取文件信息 → 展示文件列表 → 打开文件编辑 → 保存文件

## 任务列表

### 阶段 1.1: 文件系统平台层

- [x] 定义类型和枚举 (`FileSystemCapability`, `FileSystemEntry` 等)
- [x] 定义 Provider 接口 (`IFileSystemProvider`)
- [x] 实现 FileSystemService (路由、能力检查、方法分发)
- [x] 实现 MemoryProvider (内存存储)
- [x] 实现 IndexedDBProvider (持久化存储)
- [x] 实现 FileSystemAccessAPIProvider (本地文件访问)
- [x] 实现路径解析工具
- [x] 错误处理定义

### 阶段 1.2: 状态管理

- [x] 在 `workspace-store.ts` 中接入当前项目状态 (`currentProject` / `isOpen` / `loading`)
- [x] 实现 `ProjectManager` 管理项目打开/关闭生命周期
- [ ] 拆分独立 `project-store.ts` (当前项目、最近项目、打开的文件)
- [ ] 管理最近项目与打开文件列表

### 阶段 1.3: UI 组件

- [ ] 实现 Files Panel 组件 (文件树展示、展开/折叠、右键菜单)
- [x] 实现项目选择对话框 (文件夹选择器)
- [x] 在 workspace 页面接入项目选择与打开流程
- [ ] 将 Files Panel 接入真实文件系统数据

### 阶段 1.4: 编辑与保存

- [ ] EditorArea 集成文本编辑器
- [ ] 实现 Ctrl+S 保存快捷键
- [ ] StatusBar 显示文件路径和保存状态

## 进度

| 阶段 | 任务 | 状态 |
|------|------|------|
| 1.1 | 文件系统平台层 | ✅ 已完成 |
| 1.2 | 状态管理 | 🟡 部分完成 |
| 1.3 | UI 组件 | 🟡 部分完成 |
| 1.4 | 编辑与保存 | ⏳ 待开始 |

## 当前评估

- 已完成文件系统平台层，包括类型定义、Provider 接口、服务路由、3 个 Provider、路径工具和错误处理。
- 当前项目状态已接入 `workspace-store.ts`，并通过 `ProjectManager` 管理打开/关闭流程，但尚未拆分为独立 `project-store.ts`，也没有最近项目和打开文件列表。
- 项目选择对话框和 workspace 接入链路已完成，但 Files Panel 仍是占位实现，尚未展示真实文件树。
- 编辑器区域和状态栏仍是占位内容，文件打开、编辑、保存链路尚未开始。

## 相关文档

- [文件系统架构设计](../03-frontend/file-system-architecture.md)
- [文件系统实现方案](../03-frontend/file-system-implementation.md)
