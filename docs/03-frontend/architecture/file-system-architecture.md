# 文件系统架构设计

## 1. 概述

文件系统位于前端系统的**平台层**，采用 Provider 模式设计：

- **应用层**: UI 组件（Projects Page, Files Panel, Editor Area）
- **平台层**: FileSystemService + IFileSystemProvider 接口 + 多个 Provider 实现
- **基础设施层**: Lifecycle（Disposable 模式）、Event、工具函数

**代码目录**: `apps/web/src/platform/file-system/`

详细的前端分层设计请参考 [前端系统架构](./frontend-architecture.md)。

---

## 2. 整体架构

### 2.1 架构图

```mermaid
graph TB
    subgraph App[应用层]
        P1[Projects Page]
        FP[Files Panel]
        EA[Editor Area]
    end

    subgraph FSS[服务层 - FileSystemService]
        Router[路径路由]
        Checker[能力检查]
        Dispatcher[方法分发]
        ErrorHandler[错误处理]
    end

    subgraph Adapter[适配层]
        IFace[IFileSystemProvider<br/>抽象接口]
    end

    subgraph Providers[Provider 实现]
        MP[MemoryProvider]
        IDBP[IndexedDB Provider]
        FSAP[FS Access Provider]
    end

    P1 & FP & EA --> FSS
    FSS --> Router --> Checker --> Dispatcher --> IFace
    IFace --> MP & IDBP & FSAP
```

### 2.2 代码目录结构

```
apps/web/src/platform/file-system/
├── index.ts           # 模块入口，统一导出
├── types.ts           # 类型定义
├── errors.ts          # 错误定义
├── provider/          # Provider 实现
├── service/           # 服务主逻辑
└── utils/             # 工具函数
```

---

## 3. 核心设计

### 3.1 Provider 模式

每个存储后端实现统一的 `IFileSystemProvider` 接口：

```mermaid
classDiagram
    class IFileSystemProvider {
        <<interface>>
        +name: string
        +scheme: string
        +rootPath: string
        +capabilities: FileSystemCapability
        +canHandle(path): boolean
        +openDirectory(path): Promise
        +listFiles(path): Promise
        +createDirectory(path): Promise
        +deleteDirectory(path): Promise
        +readFile(path): Promise
        +writeFile(path, content): Promise
        +deleteFile(path): Promise
        +getFileHandle(path, mode): Promise
        +stat(path): Promise
    }

    class MemoryProvider
    class IndexedDBProvider
    class FileSystemAccessAPIProvider

    IFileSystemProvider <|.. MemoryProvider
    IFileSystemProvider <|.. IndexedDBProvider
    IFileSystemProvider <|.. FileSystemAccessAPIProvider
```

### 3.2 协议路由

路径格式：`{scheme}://{path}`

| 协议前缀 | Provider | 说明 |
|----------|----------|------|
| `memory://` | MemoryProvider | 内存存储，用于测试 |
| `idb://` | IndexedDBProvider | 浏览器 IndexedDB 持久化 |
| `file://` | FileSystemAccessAPIProvider | 浏览器原生文件访问 |

示例：
- `memory://docs/readme.md` → 路由到 MemoryProvider
- `idb://projects/my-project/files/test.md` → 路由到 IndexedDBProvider
- `file:///Users/project/src/index.ts` → 路由到 FileSystemAccessAPIProvider

---

## 4. 能力模型

### 4.1 能力枚举

```mermaid
graph LR
    subgraph Capabilities[FileSystemCapability - 位运算]
        R[Read<br/>1 << 0]
        W[Write<br/>1 << 1]
        L[List<br/>1 << 2]
        M[Metadata<br/>1 << 3]
    end

    subgraph Modes[预设模式]
        RO[ReadOnly<br/>R + M]
        RW[ReadWrite<br/>R + W + M]
        FA[FullAccess<br/>R + W + L + M]
    end

    Capabilities --> Modes
```

| 能力 | 值 | 说明 |
|------|-----|------|
| None | `0` | 无能力 |
| Read | `1 << 0` | 读取文件内容 |
| Write | `1 << 1` | 写入/创建/删除文件 |
| List | `1 << 2` | 列出目录内容 |
| Metadata | `1 << 3` | 读取文件元信息 |

### 4.2 能力检查流程

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant FSS as FileSystemService
    participant Provider as Provider

    UI->>FSS: readFile(path)
    FSS->>FSS: 1. 解析路径 (scheme)
    FSS->>FSS: 2. 路由到 Provider
    FSS->>FSS: 3. 能力检查 (Read)
    alt 能力不足
        FSS-->>UI: throw PermissionDenied
    else 能力充足
        FSS->>Provider: readFile(cleanPath)
        Provider-->>FSS: FileContent
        FSS-->>UI: FileContent
    end
```

---

## 5. 模块交互流程

### 5.1 文件读取流程

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant FSS as FileSystemService
    participant Provider as Provider
    participant Storage as Storage Backend

    UI->>FSS: readFile(path)
    FSS->>FSS: parsePath()
    FSS->>FSS: getProvider(scheme)
    FSS->>FSS: checkCapability(Read)
    FSS->>Provider: readFile(cleanPath)
    Provider->>Storage: read()
    Storage-->>Provider: content
    Provider-->>FSS: FileContent
    FSS-->>UI: FileContent
```

### 5.2 文件写入流程

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant FSS as FileSystemService
    participant Provider as Provider
    participant Storage as Storage Backend

    UI->>FSS: writeFile(path, content)
    FSS->>FSS: parsePath()
    FSS->>FSS: getProvider(scheme)
    FSS->>FSS: checkCapability(Write)
    FSS->>Provider: writeFile(cleanPath, content)
    Provider->>Storage: write(content)
    Storage-->>Provider: void
    Provider-->>FSS: void
    FSS-->>UI: success
```

---

## 6. 错误处理

### 6.1 错误码

| 错误码 | 说明 |
|--------|------|
| ProviderNotFound | 未找到对应 scheme 的 Provider |
| PermissionDenied | Provider 不具备所需能力 |
| FileNotFound | 文件不存在 |
| DirectoryNotFound | 目录不存在 |
| FileAlreadyExists | 文件已存在 |
| InvalidPath | 路径无效 |
| ReadFailed | 读取失败 |
| WriteFailed | 写入失败 |
| UserDeniedPermission | 用户拒绝授权 |

### 6.2 错误类

```typescript
class FileSystemError extends Error {
  code: FileSystemErrorCode;
  cause?: Error;
}
```

---

## 7. Provider 能力对比

| Provider | Read | Write | List | Metadata | 说明 |
|----------|------|-------|------|----------|------|
| MemoryProvider | ✅ | ✅ | ✅ | ✅ | 内存存储 |
| IndexedDBProvider | ✅ | ✅ | ✅ | ✅ | 持久化存储 |
| FileSystemAccessAPIProvider | ✅ | ✅ | ✅ | ✅ | 原生文件访问 |

---

## 8. 浏览器兼容性

| Provider | Chrome | Edge | Firefox | Safari |
|----------|--------|------|---------|--------|
| MemoryProvider | ✅ | ✅ | ✅ | ✅ |
| IndexedDBProvider | ✅ | ✅ | ✅ | ✅ |
| FileSystemAccessAPIProvider | ✅ 86+ | ✅ 86+ | ❌ | ❌ |

> 注意：FileSystemAccessAPI 仅在 Chromium 浏览器中可用。Fallback 方案可使用 IndexedDBProvider 存储用户上传的文件。
