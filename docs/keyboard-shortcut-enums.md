# 快捷键和条件枚举类型使用指南

本文档说明如何使用规范化后的快捷键和条件枚举类型。

## 概述

已将快捷键和条件相关的字面量规范为枚举类型，以提高代码的可维护性和类型安全性。

## 条件枚举类型

### `ConditionId` - 条件 ID 枚举

```typescript
enum ConditionId {
    IS_FILE_PANEL_ACTIVE = 'isFilePanelActive',      // 文件面板处于激活且展开状态
    IS_SEARCH_PANEL_ACTIVE = 'isSearchPanelActive',  // 搜索面板处于激活且展开状态
    IS_EDITOR_ACTIVE = 'isEditorActive',             // 编辑器有激活的文档
    IS_IN_INPUT = 'isInInput',                       // 焦点在输入元素中
}
```

### 使用示例

```typescript
import { ConditionId } from '@/platform/conditional';

// 注册条件
conditionalService.register({
    id: ConditionId.IS_FILE_PANEL_ACTIVE,
    description: '文件面板处于激活且展开状态',
    evaluate: () => panelService.isVisible('files-panel'),
});

// 评估条件
if (conditionalService.evaluate(ConditionId.IS_FILE_PANEL_ACTIVE)) {
    // 执行文件面板相关的操作
}

// 在快捷键中使用
shortcutService.register(KeyBinding.CTRL_F, {
    handle: () => focusSearch(),
    condition: ConditionId.IS_FILE_PANEL_ACTIVE,
}, ShortcutScope.FILE_TREE);
```

## 快捷键枚举类型

### `ModifierKey` - 修饰键枚举

```typescript
enum ModifierKey {
    CTRL = 'ctrl',
    SHIFT = 'shift',
    ALT = 'alt',
    META = 'meta',
}
```

### `Key` - 普通键枚举

```typescript
enum Key {
    // 字母键
    A = 'a', B = 'b', C = 'c', ... Z = 'z',
    // 数字键
    N0 = '0', N1 = '1', ... N9 = '9',
    // 功能键
    F1 = 'f1', F2 = 'f2', ... F12 = 'f12',
    // 特殊键
    SPACE = 'space',
    ESCAPE = 'escape',
    BACKSPACE = 'backspace',
    DELETE = 'delete',
    TAB = 'tab',
    ENTER = 'enter',
    // 方向键
    UP = 'up', DOWN = 'down', LEFT = 'left', RIGHT = 'right',
}
```

### `ShortcutScope` - 作用域枚举

```typescript
enum ShortcutScope {
    GLOBAL = 'global',      // 全局作用域
    EDITOR = 'editor',      // 编辑器作用域
    FILE_TREE = 'file-tree', // 文件树作用域
}
```

### `KeyBinding` - 预定义快捷键枚举

```typescript
enum KeyBinding {
    // 文件操作
    CTRL_S = 'ctrl+s',
    CTRL_SHIFT_S = 'ctrl+shift+s',
    CTRL_W = 'ctrl+w',
    CTRL_P = 'ctrl+p',
    CTRL_SHIFT_P = 'ctrl+shift+p',
    // 标签页切换
    CTRL_TAB = 'ctrl+tab',
    CTRL_SHIFT_TAB = 'ctrl+shift+tab',
    // 搜索
    CTRL_F = 'ctrl+f',
    // 通用快捷键
    CTRL_Z = 'ctrl+z',
    CTRL_Y = 'ctrl+y',
    CTRL_A = 'ctrl+a',
    CTRL_C = 'ctrl+c',
    CTRL_V = 'ctrl+v',
    CTRL_X = 'ctrl+x',
}
```

## 使用方式

### 导入

```typescript
// 导入快捷键相关
import { KeyboardShortcutService, KeyBinding, ShortcutScope } from '@/platform/keyboard';

// 导入条件相关
import { ConditionId } from '@/platform/conditional';
```

### 注册单个快捷键

```typescript
const shortcutService = container.get(KeyboardShortcutService);

// 使用枚举注册
const dispose = shortcutService.register(
    KeyBinding.CTRL_S,
    {
        handle: () => saveFile(),
        description: '保存文件'
    },
    ShortcutScope.EDITOR
);
```

### 批量注册快捷键

```typescript
import { KeyboardShortcutService, KeyBinding, ShortcutScope } from '@/platform/keyboard';
import { ConditionId } from '@/platform/conditional';

const disposables = shortcutService.registerBatch([
    {
        keybinding: KeyBinding.CTRL_W,
        handler: {
            handle: () => closeCurrentTab(),
            description: '关闭当前标签页'
        },
        scope: ShortcutScope.GLOBAL
    },
    {
        keybinding: KeyBinding.CTRL_F,
        handler: {
            handle: () => focusSearch(),
            description: '搜索文件',
            condition: ConditionId.IS_FILE_PANEL_ACTIVE
        },
        scope: ShortcutScope.FILE_TREE
    }
]);
```

### 混合使用（向后兼容）

为了保持向后兼容，仍然支持字符串字面量：

```typescript
// 仍然有效
shortcutService.register('ctrl+k', {
    handle: () => doSomething(),
}, 'global');
```

## 迁移指南

### 之前（字面量）

```typescript
// 快捷键字面量
shortcutService.register('ctrl+s', {
    handle: () => save(),
}, 'editor');

// 条件字面量
shortcutService.register('ctrl+f', {
    handle: () => search(),
    condition: 'isFilePanelActive'
}, 'file-tree');
```

### 之后（枚举）

```typescript
// 使用快捷键枚举
shortcutService.register(KeyBinding.CTRL_S, {
    handle: () => save(),
}, ShortcutScope.EDITOR);

// 使用条件枚举
shortcutService.register(KeyBinding.CTRL_F, {
    handle: () => search(),
    condition: ConditionId.IS_FILE_PANEL_ACTIVE
}, ShortcutScope.FILE_TREE);
```

## 添加新的条件

如果需要添加新的条件，在 `apps/web/src/platform/conditional/types.ts` 中的 `ConditionId` 枚举添加：

```typescript
// 在 types.ts 中
export enum ConditionId {
    // ... 现有条件
    IS_NEW_CONDITION = 'isNewCondition', // 新增
}
```

然后在 `evaluators.ts` 中注册评估器：

```typescript
// 在 evaluators.ts 中
conditionalService.register({
    id: ConditionId.IS_NEW_CONDITION,
    description: '新条件描述',
    evaluate: () => {
        // 你的评估逻辑
        return true;
    },
});
```

## 添加新的快捷键

如果需要添加新的快捷键组合，有两种方式：

### 方式 1：在 `KeyBinding` 枚举中添加

```typescript
// 在 types.ts 中
export enum KeyBinding {
    // ... 现有快捷键
    CTRL_ALT_D = 'ctrl+alt+d', // 新增
}
```

### 方式 2：直接使用字符串（快速原型）

```typescript
shortcutService.register('ctrl+alt+d', {
    handle: () => debugMode(),
});
```

## 优势

1. **类型安全** - TypeScript 会在编译时检查快捷键名称
2. **智能提示** - IDE 会自动补全可用的快捷键
3. **重构友好** - 修改快捷键定义时自动更新所有引用
4. **减少错误** - 避免拼写错误导致的快捷键失效
5. **代码规范** - 统一的命名约定，提高可读性
