# 文件系统 URI 规范

前端文件系统抽象层通过 URI scheme 区分不同存储后端。

---

## URI 模式

```
{scheme}://{authority}/{path}
```

| 字段 | 说明 |
|------|------|
| `scheme` | 存储类型：`memory`、`idb`、`file` |
| `authority` | 授权方（`idb` 为项目 ID，其余为空） |
| `path` | 文件路径 |

---

## 支持的 Scheme

| Scheme | 格式 | 存储后端 | 说明 |
|--------|------|----------|------|
| `memory://` | `memory:///path` | `MemoryProvider` | 内存虚拟文件系统，测试用 |
| `idb://` | `idb://{projectId}/path` | `IndexedDBProvider` | 浏览器 IndexedDB 持久存储 |
| `file://` | `file:///path` | `FileSystemAccessAPIProvider` | 浏览器文件系统 API（Chromium） |

---

## URI 类

`apps/web/src/base/common/uri/uri.ts` 提供通用 URI 解析：

```ts
URI.parse('idb://abc123/notes/doc.md');
URI.file('/notes/doc.md');
URI.from({ scheme: 'memory', path: '/test.txt' });
```

---

## 路径工具函数

`apps/web/src/platform/file-system/utils/path.ts`：

| 函数 | 说明 |
|------|------|
| `parsePath(uri)` | 解析 URI 为 `{ scheme, authority, path }` |
| `normalize(path)` | 规范化路径（去重斜杠、解析 `..`） |
| `join(base, ...segments)` | 拼接路径段 |
| `dirname(path)` | 获取父目录 |
| `basename(path)` | 获取文件名 |
| `extname(path)` | 获取扩展名 |
| `isAbsolute(path)` | 是否绝对路径 |
| `isRelative(path)` | 是否相对路径 |
| `relative(from, to)` | 计算相对路径 |

---

## 服务路由

`FileSystemService`（`apps/web/src/platform/file-system/service.ts`）根据 URI scheme 分发到对应 Provider，处理前会去除 scheme 前缀。
