# 文件资源管理器架构设计

## 📋 文档信息

- **服务名称**: File Resource Manager (文件资源管理器)
- **版本**: 1.0.0
- **创建日期**: 2026-03-09
- **状态**: ✅ 已实现
- **作者**: My-KM Team

---

## 🎯 概述

### 核心用途

`FileResourceManager` 是一个**全局单例服务**，负责跟踪和管理应用中所有打开的文件资源。它是文件编辑器状态管理的核心，为编辑器标签栏、活动文件列表、文件生命周期管理提供统一的数据源。

### 核心职责

1. **资源注册表**: 维护全局文件资源注册表
2. **生命周期管理**: 管理文件的打开、关闭、释放
3. **状态查询**: 提供活动文件列表、资源状态查询
4. **资源清理**: 确保文件相关的监听器、订阅器正确释放

### 设计原则

| 原则 | 说明 |
|------|------|
| **单例模式** | 全局唯一实例，确保状态一致 |
| **资源隔离** | 每个资源有独立的清理句柄 |
| **数据与行为分离** | 资源是纯数据，管理器负责行为 |
| **层级式清理** | 支持单资源释放和全局释放 |

---

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    FileResourceManager                           │
│                         (Singleton)                              │
├─────────────────────────────────────────────────────────────────┤
│  _resources: Map<id, FileResource>                               │
│  _resourceDisposables: Map<id, DisposableStore>                  │
├─────────────────────────────────────────────────────────────────┤
│  + register(resource)                                            │
│  + unregister(id)                                                │
│  + getActiveFiles(): FileResource[]                              │
│  + isResourceActive(id): boolean                                 │
│  + releaseResource(id)                                           │
│  + releaseProjectResources(projectId)                            │
│  + dispose()                                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   File A        │ │   File B        │ │   File C        │
│   index.ts      │ │   utils.ts      │ │   config.ts     │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ isActive: true  │ │ isActive: true  │ │ isActive: false │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 核心数据结构

#### 1. FileResource 接口（纯数据）

```typescript
// types.ts
export interface FileResource {
    id: string;
    path: string;
    isActive: boolean;
}
```

**设计意图**：
- `FileResource` 是 `interface`，不是 `class`
- 只存储数据，不包含任何行为
- 可被序列化、传递、复用
- 符合"哑数据"（Dumb Data）原则

#### 2. 双 Map 注册表

```typescript
// manager.ts
private readonly _resources: Map<string, FileResource> = new Map();
private readonly _resourceDisposables: Map<string, DisposableStore> = new Map();
```

**设计意图**：
- `_resources`: 存储资源元数据（路径、ID、活动状态）
- `_resourceDisposables`: 存储每个资源的清理句柄
- 通过 `resource.id` 关联两者

---

## 📐 设计模式详解

### 1. 单例模式 (Singleton Pattern)

```typescript
export class FileResourceManager extends Disposable {
    private static _instance: FileResourceManager | null = null;

    static getInstance(): FileResourceManager {
        if (!FileResourceManager._instance) {
            FileResourceManager._instance = new FileResourceManager();
        }
        return FileResourceManager._instance;
    }

    static resetInstance(): void {
        if (FileResourceManager._instance) {
            FileResourceManager._instance.dispose();
            FileResourceManager._instance = null;
        }
    }

    private constructor() {
        super();
    }
}
```

**为什么使用单例？**
- 确保全局只有一个资源注册表，避免状态分散
- 任何组件都能通过 `getInstance()` 访问同一状态源
- 提供 `resetInstance()` 用于测试

**典型使用场景**：
```typescript
// 任何地方获取单例
const manager = FileResourceManager.getInstance();
manager.register(resource);
```

---

### 2. 资源隔离设计：为什么每个 Resource 需要独立的 DisposableStore？

#### ❌ 反模式：统一 DisposableStore

```typescript
// 错误设计示例
private readonly _store = new DisposableStore();

register(resource: FileResource): void {
    const watcher = watchFile(resource.path);
    const editor = createEditor(resource);
    const subscription = eventBus.subscribe(`file:${resource.id}`, handler);

    // 全部注册到同一个 store - 无法单独释放！
    this._store.add(watcher);
    this._store.add(editor);
    this._store.add(subscription);
}
```

**问题分析**：
1. **无法单独释放** - 调用 `dispose()` 会清理所有资源
2. **资源泄漏** - 关闭单个文件时无法清理其关联项
3. **责任不清晰** - 所有资源生命周期耦合

#### ✅ 正确模式：独立 DisposableStore

```typescript
register(resource: FileResource): void {
    // 为这个资源创建专属的 disposable store
    const disposableStore = new DisposableStore();

    // 注册资源相关的清理项
    const watcher = watchFile(resource.path);
    const editor = createEditor(resource);
    const subscription = eventBus.subscribe(`file:${resource.id}`, handler);

    disposableStore.add(watcher);
    disposableStore.add(editor);
    disposableStore.add(subscription);

    // 存储专属 store
    this._resourceDisposables.set(resource.id, disposableStore);

    // 同时注册到父级 store，确保全局清理时能释放
    this._store.add(disposableStore);
}

releaseResource(resourceId: string): void {
    // 精准释放单个资源的所有关联项
    const disposableStore = this._resourceDisposables.get(resourceId);
    if (disposableStore) {
        disposableStore.dispose();  // 清理这个文件的所有 watcher/editor/subscription
        this._resourceDisposables.delete(resourceId);
    }
    this._resources.delete(resourceId);
}
```

**实际场景举例**：

```
假设 3 个打开的文件：

文件 A → DisposableStore_A
  ├─ FileSystemWatcher_A (监听文件变化)
  ├─ EditorInstance_A (编辑器实例)
  └─ EventBusSubscription_A (事件订阅)

文件 B → DisposableStore_B
  ├─ FileSystemWatcher_B
  ├─ EditorInstance_B
  └─ EventBusSubscription_B

文件 C → DisposableStore_C
  ├─ FileSystemWatcher_C
  ├─ EditorInstance_C
  └─ EventBusSubscription_C

用户关闭文件 B 时：
manager.releaseResource('file-B')
→ 只调用 DisposableStore_B.dispose()
→ 文件 A 和 C 不受影响
```

**层级式清理**：
```typescript
// 全局清理时（应用退出）
manager.dispose();
// → this._store.dispose() 自动调用所有子 store 的 dispose()
// → 无需手动遍历 _resourceDisposables
```

---

### 3. 为什么 DisposableStore 由 Manager 持有而非资源实例？

#### 核心原因：`FileResource` 是接口，不是类

```typescript
// types.ts:45-50
export interface FileResource {
    id: string;
    path: string;
    isActive: boolean;
}
```

**关键观察**：
1. `FileResource` 是 `interface`，编译后不存在
2. 接口不能持有状态或方法
3. 资源数据需要跨组件共享，不能被实例"拥有"

#### 设计对比

| 维度 | 资源实例持有 Store | Manager 持有 Store |
|------|-------------------|-------------------|
| **数据纯净性** | ❌ 数据与行为耦合 | ✅ 数据是纯数据 |
| **可序列化** | ❌ 无法序列化 | ✅ 可序列化传递 |
| **责任清晰** | ❌ 资源自己管理生命周期 | ✅ Manager 统一管理 |
| **复用性** | ❌ 资源与实例绑定 | ✅ 资源可跨 manager |

#### ECS (Entity-Component-System) 思想

```
Entity (FileResource) = 纯数据 { id, path, isActive }
     ↓ tracked by
System (Manager) = 行为 + 状态管理
     ↓ owns
Component (DisposableStore) = 生命周期句柄
```

---

## 🔧 核心 API 详解

### 1. 注册资源

```typescript
/**
 * 注册活动文件资源
 * @param resource - 要注册的文件资源
 */
register(resource: FileResource): void {
    if (this._resources.has(resource.id)) {
        // 资源已存在，更新状态
        const existingResource = this._resources.get(resource.id)!;
        existingResource.isActive = true;
        return;
    }

    // 创建新的资源记录
    const newResource: FileResource = {
        ...resource,
        isActive: true,
    };

    this._resources.set(resource.id, newResource);

    // 创建资源专属的 disposable store
    const disposableStore = new DisposableStore();
    this._resourceDisposables.set(resource.id, disposableStore);
    this._store.add(disposableStore);
}
```

**使用场景**：
```typescript
// 用户在编辑器中打开一个文件
const resource: FileResource = {
    id: 'file-123',
    path: 'project-1/src/index.ts',
    name: 'index.ts',
    type: 'code',
};

FileResourceManager.getInstance().register(resource);
```

---

### 2. 注销资源

```typescript
/**
 * 注销文件资源
 * @param resourceOrId - 文件资源或资源 ID
 */
unregister(resourceOrId: FileResource | string): void {
    const resourceId = typeof resourceOrId === 'string' ? resourceOrId : resourceOrId.id;

    const resource = this._resources.get(resourceId);
    if (!resource) {
        return;
    }

    // 标记为非活动（不立即删除）
    resource.isActive = false;
}
```

**设计意图**：
- `unregister` 只标记 `isActive = false`
- 资源仍保留在 Map 中
- 可用于历史记录或快速重新激活

---

### 3. 获取活动文件列表

```typescript
/**
 * 获取活动文件列表
 * @returns 所有活动文件资源
 */
getActiveFiles(): FileResource[] {
    const activeFiles: FileResource[] = [];

    for (const resource of this._resources.values()) {
        if (resource.isActive) {
            activeFiles.push({ ...resource });
        }
    }

    return activeFiles;
}
```

**使用场景**：
```typescript
// 渲染"打开的文件"侧边栏
const activeFiles = FileResourceManager.getInstance().getActiveFiles();

// React 组件中使用
const activeFiles = useFileResourceManager().getActiveFiles();
return (
    <ul>
        {activeFiles.map(file => (
            <li key={file.id}>{file.path}</li>
        ))}
    </ul>
);
```

---

### 4. 释放资源

```typescript
/**
 * 释放指定资源
 * @param resourceId - 资源 ID
 */
releaseResource(resourceId: string): void {
    const disposableStore = this._resourceDisposables.get(resourceId);
    if (disposableStore) {
        disposableStore.dispose();
        this._resourceDisposables.delete(resourceId);
    }
    this._resources.delete(resourceId);
}
```

**使用场景**：
```typescript
// 用户关闭文件标签，且需要彻底清理
FileResourceManager.getInstance().releaseResource('file-123');
```

---

### 5. 释放项目相关资源

```typescript
/**
 * 释放项目相关的所有资源
 * @param projectId - 项目 ID
 */
releaseProjectResources(projectId: string): void {
    const resourcesToRelease: string[] = [];

    for (const [id, resource] of this._resources.entries()) {
        if (resource.path.startsWith(`${projectId}/`)) {
            resourcesToRelease.push(id);
        }
    }

    for (const resourceId of resourcesToRelease) {
        this.releaseResource(resourceId);
    }
}
```

**使用场景**：
```typescript
// 用户关闭整个项目
FileResourceManager.getInstance().releaseProjectResources('project-1');
```

---

## 📊 状态流转图

```
                    ┌─────────────┐
                    │   初始状态   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
            register() │  已注册     │
                    │ (isActive)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       unregister()  releaseResource()  dispose()
    (标记非活动)      (释放单个)         (全局释放)
              │            │            │
              ▼            ▼            ▼
       ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
       │   非活动     │ │   已释放     │ │   已释放     │
       │ (可重新激活) │ │ (从 Map 删除) │ │ (全部清理)  │
       └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 🔍 与其他模块的集成

### 与 FileHandleCache 的关系

```
┌───────────────────────┐         ┌───────────────────────┐
│  FileHandleCache      │         │  FileResourceManager  │
│  - 文件句柄缓存       │         │  - 活动资源跟踪        │
│  - 句柄过期管理       │         │  - 生命周期管理        │
└───────────────────────┘         └───────────────────────┘
              │                              │
              └──────────────┬───────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │   FileSystemAdapter │
                  │   - 文件读写操作     │
                  └─────────────────────┘
```

### 在应用中的位置

```
┌─────────────────────────────────────────────────────────┐
│                      UI 层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 编辑器标签栏  │  │ 活动文件列表  │  │ 文件树        │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                   FileResourceManager                    │
│  - 唯一数据源 (Single Source of Truth)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 使用示例

### 示例 1：在 React 组件中使用

```typescript
// active-files-sidebar.tsx
import { FileResourceManager } from './manager/file-resource-manager';
import { useEffect, useState } from 'react';

export function ActiveFilesSidebar() {
    const [activeFiles, setActiveFiles] = useState(
        FileResourceManager.getInstance().getActiveFiles()
    );

    useEffect(() => {
        // 定期刷新（实际项目中应该用事件驱动）
        const interval = setInterval(() => {
            setActiveFiles(FileResourceManager.getInstance().getActiveFiles());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="sidebar">
            <h3>打开的文件</h3>
            <ul>
                {activeFiles.map(file => (
                    <li key={file.id}>
                        <span>{file.path}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
```

---

### 示例 2：在文件服务中使用

```typescript
// file-system-service.ts
import { FileResourceManager } from './manager/file-resource-manager';

export class FileSystemService {
    private resourceManager = FileResourceManager.getInstance();

    async openFile(path: string): Promise<void> {
        // 1. 读取文件内容
        const content = await this.readFile(path);

        // 2. 创建资源
        const resource: FileResource = {
            id: this.generateId(path),
            path,
            isActive: false,
        };

        // 3. 注册资源
        this.resourceManager.register(resource);

        // 4. 在编辑器中打开
        this.editorService.open(resource.id, content);
    }

    closeFile(resourceId: string): void {
        // 1. 从编辑器关闭
        this.editorService.close(resourceId);

        // 2. 注销资源（标记为非活动）
        this.resourceManager.unregister(resourceId);

        // 3. 释放资源（彻底清理）
        this.resourceManager.releaseResource(resourceId);
    }
}
```

---

### 示例 3：在应用退出时清理

```typescript
// app.tsx
import { FileResourceManager } from './services/file-system/manager/file-resource-manager';

export class Application {
    private resourceManager = FileResourceManager.getInstance();

    async shutdown(): Promise<void> {
        // 保存所有未保存的文件
        await this.saveAllDirtyFiles();

        // 释放所有资源
        this.resourceManager.dispose();

        // 其他清理工作...
    }
}
```

---

## 🎓 设计启示

### 1. 资源与生命周期分离

**问题**：为什么不让 `FileResource` 自己管理生命周期？

**答案**：
- `FileResource` 是纯数据接口，不应包含行为
- 生命周期管理是"横切关注点"，应由专门的服务负责
- 分离后数据可被序列化、传递、复用

### 2. 细粒度的资源隔离

**问题**：为什么不用一个统一的 DisposableStore？

**答案**：
- 统一的 Store 无法单独释放单个资源
- 会导致资源泄漏（关闭文件时无法清理监听器）
- 独立的 Store 支持精准清理和层级式清理

### 3. 层级式清理设计

```
FileResourceManager (this._store)
    ├─ DisposableStore_A (文件 A 的所有清理项)
    ├─ DisposableStore_B (文件 B 的所有清理项)
    └─ DisposableStore_C (文件 C 的所有清理项)
```

**优势**：
- 单资源释放：`disposableStore.dispose()`
- 全局释放：`this._store.dispose()` 自动递归清理

---

## 🔗 相关文件

| 文件 | 说明 |
|------|------|
| [file-resource-manager.ts](../../../apps/web/src/base/services/file-system/manager/file-resource-manager.ts) | 管理器实现 |
| [types.ts](../../../apps/web/src/base/services/file-system/types.ts) | FileResource 类型定义 |
| [file-handle-cache.ts](../../../apps/web/src/base/services/file-system/manager/file-handle-cache.ts) | 文件句柄缓存 |

---

## 📚 参考资料

- [VSCode Disposable 模式](https://code.visualstudio.com/api/references/vscode-api#Disposable)
- [TypeScript 接口与类](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#interfaces)
- [设计模式：单例模式](https://refactoringguru.cn/design-patterns/singleton)
- [ECS 架构模式](https://gameprogrammingpatterns.com/component.html)
