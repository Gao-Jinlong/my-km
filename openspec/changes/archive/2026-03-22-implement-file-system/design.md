## 1. 类型和错误定义

- [ ] 1.1 创建类型定义文件 `apps/web/src/platform/file-system/types.ts`
  - [ ] FileSystemCapability 位运算枚举（Read, Write, List, Metadata）
  - [ ] FileStat 接口（文件元信息：大小、创建时间、修改时间、类型）
  - [ ] FileContent 类型（string | Uint8Array）
  - [ ] FileSystemProviderCapabilities 接口
- [ ] 1.2 创建错误定义文件 `apps/web/src/platform/file-system/errors.ts`
  - [ ] FileSystemErrorCode 枚举
  - [ ] FileSystemError 类
  - [ ] 具体错误类：ProviderNotFound, PermissionDenied, FileNotFound 等

## 2. Provider 接口定义

- [ ] 2.1 创建 Provider 接口文件 `apps/web/src/platform/file-system/provider.ts`
  - [ ] IFileSystemProvider 接口定义
  - [ ] canHandle, capabilities 检查方法
  - [ ] 核心方法：readFile, writeFile, listFiles, createDirectory, deleteFile, stat 等

## 3. Provider 实现

- [ ] 3.1 实现 MemoryProvider `apps/web/src/platform/file-system/providers/memory-provider.ts`
  - [ ] 使用 Map 存储内存数据
  - [ ] 实现完整的 IFileSystemProvider 接口
  - [ ] 支持路径解析和虚拟目录结构
- [ ] 3.2 实现 IndexedDBProvider `apps/web/src/platform/file-system/providers/indexed-db-provider.ts`
  - [ ] 封装 IndexedDB API
  - [ ] 实现文件句柄存储和检索
  - [ ] 支持项目维度的数据隔离
- [ ] 3.3 实现 FileSystemAccessAPIProvider `apps/web/src/platform/file-system/providers/fs-access-provider.ts`
  - [ ] 使用 File System Access API
  - [ ] 处理用户授权流程
  - [ ] 实现目录句柄缓存

## 4. FileSystemService 实现

- [ ] 4.1 创建服务主文件 `apps/web/src/platform/file-system/service.ts`
  - [ ] FileSystemService 类，继承 Disposable
  - [ ] Provider 注册和管理机制
  - [ ] 路径解析和路由逻辑
- [ ] 4.2 实现能力检查方法
  - [ ] checkCapability(scheme, requiredCapability)
  - [ ] getProvider(scheme) 路由方法
- [ ] 4.3 实现公共 API 方法
  - [ ] openDirectory(path): Promise<void>
  - [ ] listFiles(path): Promise<FileStat[]>
  - [ ] readFile(path): Promise<FileContent>
  - [ ] writeFile(path, content): Promise<void>
  - [ ] createDirectory(path): Promise<void>
  - [ ] deleteFile(path): Promise<void>
  - [ ] deleteDirectory(path): Promise<void>
  - [ ] stat(path): Promise<FileStat>

## 5. 工具函数

- [ ] 5.1 创建工具文件 `apps/web/src/platform/file-system/utils/path.ts`
  - [ ] parsePath(uri): { scheme, path }
  - [ ] normalize(path): string
  - [ ] join(base, ...segments): string
  - [ ] dirname(path): string
  - [ ] basename(path): string
  - [ ] extname(path): string
- [ ] 5.2 创建工具文件 `apps/web/src/platform/file-system/utils/capability.ts`
  - [ ] hasCapability(capabilities, required): boolean
  - [ ] combineCapabilities(...caps): number

## 6. 模块导出

- [ ] 6.1 创建模块入口 `apps/web/src/platform/file-system/index.ts`
  - [ ] 导出所有公共类型
  - [ ] 导出 FileSystemService 单例
  - [ ] 导出工具函数

## 7. 集成和测试

- [ ] 7.1 集成到应用层
  - [ ] 在 platform 层注册 FileSystemService
  - [ ] 与 workspace-store 集成
- [ ] 7.2 编写单元测试
  - [ ] MemoryProvider 测试
  - [ ] 路径工具函数测试
  - [ ] 能力检查逻辑测试
- [ ] 7.3 编写集成测试
  - [ ] FileSystemService 路由测试
  - [ ] 错误处理测试
