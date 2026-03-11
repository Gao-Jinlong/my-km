# 文件系统服务使用文档

## 概述

文件系统服务提供基于浏览器 File System Access API 的完整文件管理能力，支持：

- 文件句柄的 IndexedDB 持久化缓存
- 统一的文件服务 API（打开、读取、写入）
- Disposable 模式资源生命周期管理
- 按项目隔离的文件资源管理

## 快速开始

### 1. 打开项目

```typescript
import { FileSystemService } from '@/base/services/file-system';

const fileSystem = new FileSystemService();

try {
    const project = await fileSystem.openProject();
    console.log(`已打开项目：${project.name}`);
} catch (error) {
    console.error('打开项目失败:', error);
}
```

### 2. 读取文件

```typescript
// 读取文本文件
const result = await fileSystem.readFile('src/index.ts');
console.log('文件内容:', result.content);
console.log('文件信息:', result.fileInfo);

// 读取二进制文件
const binaryResult = await fileSystem.readFile('assets/logo.png');
const arrayBuffer = binaryResult.content as ArrayBuffer;
```

### 3. 写入文件

```typescript
// 写入文本内容
await fileSystem.writeFile('notes/todo.md', '# Todo List\n\n- [ ] 任务 1');

// 写入二进制内容
await fileSystem.writeFile('data/backup.bin', binaryData);
```

### 4. 列出目录

```typescript
// 列出根目录
const entries = await fileSystem.listDirectory();
for (const entry of entries) {
    console.log(`${entry.kind}: ${entry.name}`);
}

// 列出子目录
const srcEntries = await fileSystem.listDirectory('src');
```

### 5. 获取文件信息

```typescript
const info = await fileSystem.getFileInfo('package.json');
console.log(`文件名：${info.name}`);
console.log(`大小：${info.size} bytes`);
console.log(`最后修改：${info.lastModified}`);
```

### 6. 关闭项目

```typescript
// 关闭项目并清理资源
await fileSystem.closeProject();

// 或者直接释放服务
fileSystem.dispose();
```

## 资源管理

### 使用 FileResourceManager

```typescript
import { FileResourceManager } from '@/base/services/file-system';

const manager = FileResourceManager.getInstance();

// 注册资源
manager.register({
    id: 'file-1',
    path: 'src/index.ts',
    handle: fileHandle,
    isActive: true,
});

// 获取活动文件列表
const activeFiles = manager.getActiveFiles();

// 注销资源
manager.unregister('file-1');

// 释放资源
manager.releaseResource('file-1');
```

## 错误处理

```typescript
import {
    FileNotFoundError,
    PermissionDeniedError,
    ProjectNotOpenError,
    HandleExpiredError,
} from '@/base/services/file-system';

try {
    await fileSystem.readFile('non-existent-file.txt');
} catch (error) {
    if (error instanceof FileNotFoundError) {
        console.error('文件不存在');
    } else if (error instanceof PermissionDeniedError) {
        console.error('权限被拒绝');
    } else if (error instanceof ProjectNotOpenError) {
        console.error('请先打开项目');
    } else if (error instanceof HandleExpiredError) {
        console.error('文件句柄已过期，请重新打开文件');
    }
}
```

## 直接使用缓存

```typescript
import { FileHandleCache } from '@/base/services/file-system';

const cache = new FileHandleCache();

// 存储句柄
await cache.storeHandle('my-key', fileHandle);

// 获取句柄
const handle = await cache.getHandle('my-key');

// 验证句柄
const isValid = await cache.verifyHandle(handle);

// 删除句柄
await cache.deleteHandle('my-key');

// 清空项目缓存
await cache.clearProject('project-id');
```

## 注意事项

### 浏览器兼容性

- File System Access API 仅支持 Chromium 系浏览器（Chrome、Edge 等）
- Firefox 和 Safari 暂不支持

### 存储限制

- IndexedDB 存储配额通常为磁盘空间的 10-60%
- 本模块仅存储句柄引用，不存储文件内容

### 权限说明

- 首次访问文件需要用户授权
- 用户可随时撤销权限
- 建议在关键操作前验证句柄有效性

## API 参考

### FileSystemService

| 方法 | 描述 |
|------|------|
| `openProject()` | 打开项目目录 |
| `closeProject()` | 关闭项目并清理资源 |
| `openFile(path)` | 打开项目内文件 |
| `readFile(path)` | 读取文件内容 |
| `writeFile(path, content)` | 写入文件内容 |
| `listDirectory(path?)` | 列出目录内容 |
| `getFileInfo(path)` | 获取文件信息 |

### FileResourceManager

| 方法 | 描述 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `register(resource)` | 注册活动文件资源 |
| `unregister(id)` | 注销文件资源 |
| `getActiveFiles()` | 获取活动文件列表 |
| `releaseResource(id)` | 释放指定资源 |
| `dispose()` | 释放所有资源 |

### FileHandleCache

| 方法 | 描述 |
|------|------|
| `storeHandle(key, handle)` | 存储文件句柄 |
| `getHandle(key)` | 检索文件句柄 |
| `deleteHandle(key)` | 删除文件句柄 |
| `clearProject(projectId)` | 清空项目缓存 |
| `verifyHandle(handle)` | 验证句柄有效性 |
| `hasHandle(key)` | 检查句柄是否存在 |
