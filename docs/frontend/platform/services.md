# Platform 服务层

前端的核心架构是一个类似 VS Code 的服务系统，通过自定义 DI 容器管理。

---

## DI 容器

**位置**: `platform/di/container.ts`

- `ServiceContainer` - 基于 Reflect Metadata 的依赖注入容器
- 单例模式
- 循环依赖检测
- 懒加载实例化

---

## 注册的服务

**位置**: `platform/bootstrap.ts`

| 服务 | 职责 |
|------|------|
| `FileSystemService` | 文件系统抽象，支持 File System Access API / IndexedDB / Memory 三种 provider |
| `ContextMenuService` | 右键菜单管理 |
| `EditorContainer` | 编辑器容器，管理 Lexical 编辑器实例 |
| `FileOpenService` | 文件打开流程 |
| `EventBusService` | 跨服务事件总线 |
| `CommandService` | 命令注册与执行系统 |
| `MessageChannelService` | 消息通道 |
| `StorageService` | 持久化存储 (IndexedDB / LocalStorage / Memory) |
| `LoggerService` | 前端日志系统 |

---

## 基类

**位置**: `platform/base/service-base.ts`

- `ServiceBase` extends `Disposable`
- 提供统一的资源管理和生命周期

---

## Dispose 模式

基于 VSCode 的资源生命周期管理模式：

### IDisposable 接口
```typescript
interface IDisposable {
  dispose(): void;
}
```

### DisposableStore
```typescript
const store = new DisposableStore();
store.add(subscription);
store.dispose(); // 一次性清理所有
```

### 使用方式
1. **使用 DisposableStore** - 资源容器，管理多个可销毁对象
2. **继承 Disposable 类** - 提供便捷继承的基类
3. **使用 dispose 函数** - 批量销毁资源的工具函数

---

## 相关文件

- [前端架构](../frontend/architecture.md) - 前端整体架构
- [Dispose 模式规范](../../openspec/changes/archive/2026-03-06-vscode-disposable-pattern-spec/)

---

**最后更新**: 2026-03-30
