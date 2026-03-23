# 文件系统使用指南

## 概述

文件系统模块提供了统一的文件操作 API，采用 Provider 模式设计，支持多种存储后端：

- **MemoryProvider**: 内存存储，用于测试和临时存储
- **IndexedDBProvider**: 浏览器 IndexedDB 持久化存储
- **FileSystemAccessAPIProvider**: 浏览器原生文件访问（仅 Chromium 系浏览器）

## 快速开始

### 1. 导入服务

```typescript
import { fileSystemService, MemoryProvider } from '@my-km/file-system';
```

### 2. 注册 Provider

```typescript
// 注册内存 Provider（用于测试）
fileSystemService.registerProvider(new MemoryProvider());

// 注册 IndexedDB Provider（用于持久化存储）
import { IndexedDBProvider } from '@my-km/file-system';
fileSystemService.registerProvider(new IndexedDBProvider());
```

### 3. 基本使用

```typescript
// 写入文件
await fileSystemService.writeFile('memory://docs/test.md', 'Hello, World!');

// 读取文件
const content = await fileSystemService.readFile('memory://docs/test.md');
console.log(content); // "Hello, World!"

// 创建目录
await fileSystemService.createDirectory('memory://docs/subdir');

// 列出目录内容
const files = await fileSystemService.listFiles('memory://docs');
console.log(files);

// 删除文件
await fileSystemService.deleteFile('memory://docs/test.md');
```

## 协议前缀

文件系统使用协议前缀来路由到不同的 Provider：

| 协议前缀 | Provider | 说明 |
|----------|----------|------|
| `memory://` | MemoryProvider | 内存存储，用于测试 |
| `idb://` | IndexedDBProvider | IndexedDB 持久化存储 |
| `file://` | FileSystemAccessAPIProvider | 原生文件访问 |

### 示例

```typescript
// 内存存储
await fileSystemService.writeFile('memory://docs/test.md', 'content');

// IndexedDB 存储
await fileSystemService.writeFile('idb://project-123/files/test.md', 'content');

// 原生文件访问（需要用户授权）
await fileSystemService.openDirectory();
await fileSystemService.writeFile('file:///Users/project/docs/test.md', 'content');
```

## 能力模型

每个 Provider 都有能力位掩码，用于控制访问权限：

```typescript
import { FileSystemCapability, hasCapability } from '@my-km/file-system';

// 能力枚举
FileSystemCapability.Read      // 1 << 0 = 1 (读取)
FileSystemCapability.Write     // 1 << 1 = 2 (写入)
FileSystemCapability.List      // 1 << 2 = 4 (列出目录)
FileSystemCapability.Metadata  // 1 << 3 = 8 (元信息)

// 预设模式
FileSystemCapabilityMode.ReadOnly    // 9 (Read + Metadata)
FileSystemCapabilityMode.ReadWrite   // 11 (Read + Write + Metadata)
FileSystemCapabilityMode.FullAccess  // 15 (全部能力)
```

## 错误处理

文件系统定义了标准错误类型：

```typescript
import {
    FileSystemError,
    ProviderNotFoundError,
    PermissionDeniedError,
    FileNotFoundError,
    DirectoryNotFoundError,
    WriteFailedError,
} from '@my-km/file-system';

try {
    await fileSystemService.readFile('memory://nonexistent.md');
} catch (error) {
    if (error instanceof FileNotFoundError) {
        console.error('文件不存在:', error.message);
    } else if (error instanceof FileSystemError) {
        console.error('文件系统错误:', error.code, error.message);
    }
}
```

## 工具函数

### 路径工具

```typescript
import {
    parsePath,
    normalize,
    join,
    dirname,
    basename,
    extname,
} from '@my-km/file-system';

// 解析路径
const parsed = parsePath('memory://docs/test.md');
// { scheme: 'memory', authority: '', path: 'docs/test.md' }

// 规范化路径
normalize('/docs//subdir///test.md'); // '/docs/subdir/test.md'

// 连接路径
join('/projects', 'my-project', 'src', 'index.ts'); // '/projects/my-project/src/index.ts'

// 获取目录名
dirname('/docs/test.md'); // '/docs'

// 获取文件名
basename('/docs/test.md'); // 'test.md'

// 获取扩展名
extname('/docs/test.md'); // '.md'
```

### 能力工具

```typescript
import {
    hasCapability,
    combineCapabilities,
    getCapabilityNames,
} from '@my-km/file-system';

// 检查能力
hasCapability(15, 1); // true - FullAccess 包含 Read

// 组合能力
combineCapabilities(1, 2); // 3 - Read | Write

// 获取能力名称
getCapabilityNames(15); // ['Read', 'Write', 'List', 'Metadata']
```

## 资源管理

文件系统服务继承了 Disposable 模式，需要正确管理资源：

```typescript
import { fileSystemService } from '@my-km/file-system';

// 使用完毕后释放资源
fileSystemService.dispose();
```

## Provider 详细说明

### MemoryProvider

适用于：
- 单元测试
- 临时文件存储
- 开发和调试

```typescript
import { MemoryProvider, fileSystemService } from '@my-km/file-system';

const provider = new MemoryProvider();
fileSystemService.registerProvider(provider);

// 所有操作都在内存中，刷新页面后数据丢失
await fileSystemService.writeFile('memory://test.md', 'content');
```

### IndexedDBProvider

适用于：
- 持久化存储
- 大量文件存储
- 跨会话数据保持

```typescript
import { IndexedDBProvider, fileSystemService } from '@my-km/file-system';

const provider = new IndexedDBProvider();
fileSystemService.registerProvider(provider);

// 存储文件句柄
await provider.storeHandle('/project/file.md', handle, 'project-123');

// 清理项目相关句柄
await provider.clearProject('project-123');

// 验证句柄有效性
const isValid = await provider.verifyHandle(handle);
```

### FileSystemAccessAPIProvider

适用于：
- 访问用户本地文件
- 需要原生文件操作的项目

```typescript
import { FileSystemAccessAPIProvider, fileSystemService } from '@my-km/file-system';

const provider = new FileSystemAccessAPIProvider();
fileSystemService.registerProvider(provider);

// 打开目录（需要用户授权）
await fileSystemService.openDirectory('file://');

// 或者从外部传入句柄
provider.setDirectoryHandle(directoryHandle);
```

**注意**: FileSystemAccessAPI 仅在 Chromium 系浏览器中可用（Chrome 86+, Edge 86+）。

## 完整示例

```typescript
import {
    fileSystemService,
    MemoryProvider,
    FileSystemCapability,
    hasCapability,
} from '@my-km/file-system';

async function setupFileSystem() {
    // 注册 Provider
    fileSystemService.registerProvider(new MemoryProvider());

    // 创建项目结构
    await fileSystemService.createDirectory('memory://project');
    await fileSystemService.createDirectory('memory://project/src');
    await fileSystemService.createDirectory('memory://project/docs');

    // 写入文件
    await fileSystemService.writeFile(
        'memory://project/src/index.ts',
        'console.log("Hello!");'
    );

    // 读取文件
    const content = await fileSystemService.readFile(
        'memory://project/src/index.ts'
    );

    // 列出目录
    const files = await fileSystemService.listFiles('memory://project/src');
    console.log(files);

    // 获取文件信息
    const stat = await fileSystemService.stat('memory://project/src/index.ts');
    console.log(stat);

    // 能力检查
    const providers = fileSystemService.getRegisteredProviders();
    for (const p of providers) {
        console.log(`${p.name}: ${getCapabilityNames(p.capabilities).join(', ')}`);
    }
}

setupFileSystem();
```

## 最佳实践

1. **选择合适的 Provider**: 根据使用场景选择内存、IndexedDB 或原生文件访问
2. **错误处理**: 始终捕获并处理文件系统错误
3. **资源管理**: 在组件卸载时调用 `dispose()` 释放资源
4. **路径规范**: 使用统一的协议前缀格式
5. **能力检查**: 在操作前检查 Provider 能力
