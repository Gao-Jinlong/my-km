## 1. 基础工具类实现

- [x] 1.1 创建 IndexedDB 工具类 `apps/web/src/base/services/file-system/db/idb.ts`
- [x] 1.2 实现 Promise 封装的 IndexedDB 操作方法（get, set, delete, clear）
- [x] 1.3 创建数据库版本管理和初始化逻辑

## 2. FileHandleCache 实现

- [x] 2.1 创建 `FileHandleCache` 类，继承自 `Disposable`
- [x] 2.2 实现 `storeHandle(key, handle)` 方法存储文件句柄
- [x] 2.3 实现 `getHandle(key)` 方法检索文件句柄
- [x] 2.4 实现 `deleteHandle(key)` 方法删除句柄
- [x] 2.5 实现 `clearProject(projectId)` 方法批量删除项目相关句柄
- [x] 2.6 实现 `verifyHandle(handle)` 方法验证句柄有效性

## 3. FileSystemService 实现

- [x] 3.1 创建 `FileSystemService` 类，使用 `DisposableStore` 管理依赖
- [x] 3.2 实现 `openProject()` 方法打开项目目录
- [x] 3.3 实现 `openFile(relativePath)` 方法打开项目内文件
- [x] 3.4 实现 `readFile(relativePath)` 方法读取文件内容
- [x] 3.5 实现 `writeFile(relativePath, content)` 方法写入文件
- [x] 3.6 实现 `listDirectory(relativePath)` 方法列出目录内容
- [x] 3.7 实现 `getFileInfo(relativePath)` 方法获取文件信息
- [x] 3.8 实现 `closeProject()` 方法关闭项目并清理资源

## 4. FileResourceManager 实现

- [x] 4.1 创建 `FileResourceManager` 类，实现单例模式
- [x] 4.2 实现 `register(resource)` 方法注册活动文件资源
- [x] 4.3 实现 `unregister(resource)` 方法注销文件资源
- [x] 4.4 实现 `getActiveFiles()` 方法获取活动文件列表
- [x] 4.5 实现 `dispose()` 方法释放所有资源

## 5. 模块导出和集成

- [x] 5.1 创建模块入口文件 `apps/web/src/base/services/file-system/index.ts`
- [x] 5.2 导出统一的 API 和类型定义
- [x] 5.3 编写使用文档和示例代码

## 6. 类型定义和错误处理

- [x] 6.1 创建类型定义文件 `types.ts`
- [x] 6.2 定义自定义错误类型（FileNotFoundError, PermissionDeniedError 等）
- [x] 6.3 添加完整的 TypeScript 类型注解

## 7. 测试和验证

- [x] 7.1 编写 FileHandleCache 单元测试
- [x] 7.2 编写 FileSystemService 集成测试
- [x] 7.3 验证 Disposable 模式正确释放资源
