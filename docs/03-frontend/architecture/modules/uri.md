# URI 模块设计

## 1. 概述

URI 模块用于解析和序列化文件系统路径，是系统内部资源定位的基础能力。

**代码目录**: `apps/web/src/base/uri/`

**设计目标**:
- 路径解析：将 `scheme://path` 格式解析为结构化对象
- 资源标识：在系统内部传递文件资源
- 可序列化：支持 JSON 序列化和反序列化
- 不可变设计：URI 对象创建后不可修改

---

## 2. API 设计

```typescript
interface UriJson {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;
}

class URI {
  // 静态方法
  static parse(value: string): URI;
  static from(components: UriJson): URI;
  static file(path: string): URI;
  static isUri(obj: unknown): obj is URI;

  // 只读属性
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  // 计算属性
  get fsPath(): string;

  // 实例方法
  toString(): string;
  toJSON(): UriJson;
  with(changes: Partial<UriJson>): URI;
  isEqual(other: URI | null | undefined): boolean;
}
```

---

## 3. 使用示例

### 3.1 路径解析

```typescript
// 解析文件系统路径
const uri = URI.parse('file:///Users/project/docs/readme.md')
// scheme: 'file', path: '/Users/project/docs/readme.md'

// 解析 IndexedDB 路径
const uri2 = URI.parse('idb://project-123/files/test.md')
// scheme: 'idb', authority: 'project-123', path: '/files/test.md'
```

### 3.2 实例化

```typescript
// 从字符串解析
const uri1 = URI.parse('file:///docs/readme.md');

// 从组件构建
const uri2 = URI.from({
  scheme: 'file',
  path: '/docs/readme.md',
  query: 'version=2'
});

// 文件系统路径
const uri3 = URI.file('/Users/project/docs/readme.md');
```

### 3.3 序列化与反序列化

```typescript
// 序列化为 JSON
const uri = URI.parse('file:///docs/readme.md?v=1#intro');
const json = uri.toJSON();
// => { scheme: 'file', path: '/docs/readme.md', query: 'v=1', fragment: 'intro' }

// JSON 反序列化
const restored = URI.from(json);

// 序列化为字符串
uri.toString(); // 'file:///docs/readme.md?v=1#intro'
```

### 3.4 不可变更新

```typescript
const uri = URI.parse('file:///docs/readme.md');

// 创建新实例，原实例不变
const newUri = uri.with({ query: 'version=2' });
// uri 保持不变
// newUri => 'file:///docs/readme.md?version=2'
```

---

## 4. 使用场景

### 4.1 文件系统资源传递

```typescript
function openFile(uri: URI): Promise<FileContent> {
  const scheme = uri.scheme;
  const path = uri.fsPath;
  // ...
}
```

### 4.2 状态持久化

```typescript
// 存储打开的文件列表
const openFiles: UriJson[] = activeFiles.map(f => f.uri.toJSON());

// 恢复时反序列化
const restored = openFiles.map(json => URI.from(json));
```

---

## 5. 实现位置

```
apps/web/src/base/common/uri/
├── index.ts       # 模块入口
├── uri.ts         # URI 类实现
└── types.ts       # 类型定义
```

---

## 6. 设计参考

- VSCode URI: [vscode-uri](https://github.com/microsoft/vscode-uri)
