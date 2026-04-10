# 文件搜索快捷键优化实现总结

## 需求描述

将文件面板的搜索输入框隐藏，改为当激活的面板为文件面板时按 `Ctrl+F` 快捷键唤出搜索输入框。

## 设计方案

采用 **条件服务 (ConditionalService)** + **事件总线 (EventBusService)** 的混合架构模式：

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     ShortcutProvider                        │
│  - 注册 ctrl+f 快捷键，条件为 isFilePanelActive              │
│  - 快捷键触发时发布 file-search.focus 事件                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ 执行快捷键前
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     KeyboardShortcutService                 │
│  - 检查条件：conditionalService.evaluate('isFilePanelActive')│
│  - 条件满足时执行快捷键处理器                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ 条件评估
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     ConditionalService                      │
│  - 条件注册表：isFilePanelActive, isSearchPanelActive...    │
│  - 上下文管理：activePanelId, isInInput...                  │
│  - 评估 API: evaluate(conditionId): boolean                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ 查询面板状态
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     PanelService                            │
│  - isVisible('files-panel'): 面板是否可见                   │
│  - onDidChangePanel: 面板状态变化事件                       │
└─────────────────────────────────────────────────────────────┘
```

## 实现文件

### 新增文件

1. **`apps/web/src/platform/conditional/types.ts`**
   - 条件服务类型定义
   - `ConditionContext`, `ConditionEvaluator`, `ConditionConfig` 接口
   - `IConditionalService` 服务接口

2. **`apps/web/src/platform/conditional/service.ts`**
   - `ConditionalService` 服务实现
   - 条件注册、评估、上下文管理功能

3. **`apps/web/src/platform/conditional/index.ts`**
   - 条件服务导出入口

4. **`apps/web/src/platform/conditional/evaluators.ts`**
   - 条件评估器注册函数
   - `isFilePanelActive`, `isSearchPanelActive`, `isEditorActive`, `isInInput` 条件实现
   - 面板状态和焦点变化的上下文自动更新

### 修改文件

1. **`apps/web/src/platform/bootstrap.ts`**
   - 导入并注册 `ConditionalService`
   - 在 `bootstrap()` 中调用 `registerConditionEvaluators()`

2. **`apps/web/src/platform/keyboard/shortcut.service.ts`**
   - 扩展 `ShortcutHandler` 接口添加 `condition?: string` 字段
   - 注入 `ConditionalService`
   - 在快捷键执行前评估条件

3. **`apps/web/src/components/workspace/shortcut-provider.tsx`**
   - 注册 `ctrl+f` 快捷键，条件为 `isFilePanelActive`
   - 快捷键触发时发布 `file-search.focus` 事件

4. **`apps/web/src/components/workspace/sidebar/panels/files-panel.tsx`**
   - 搜索框默认隐藏，条件渲染
   - 订阅 `file-search.focus` 事件
   - 实现 `focusSearch()` 方法和 ESC 关闭功能

## 使用方式

### 1. 快捷键触发

当文件面板处于激活且展开状态时：
- 按 `Ctrl+F` 唤出搜索框
- 搜索框自动聚焦
- 按 `Esc` 关闭搜索框

### 2. 条件扩展

注册新的条件评估器：

```typescript
conditionalService.register({
    id: 'isSearchPanelActive',
    description: '搜索面板处于激活状态',
    evaluate: () => panelService.isVisible('search-panel'),
});
```

### 3. 快捷键条件使用

```typescript
shortcutService.register('ctrl+f', {
    handle: () => focusSearch(),
    description: '搜索文件',
    condition: 'isFilePanelActive',  // 条件 ID
}, 'file-tree');
```

## 可扩展性设计

### 1. 条件服务的通用性

`ConditionalService` 不仅可用于快捷键，还可用于：
- 菜单项启用/禁用
- 按钮可见性控制
- 功能权限判断

### 2. 上下文自动更新

服务启动时自动注册：
- 面板状态变化监听
- 焦点元素变化监听
- 编辑器状态监听

### 3. 事件驱动架构

通过 `EventBusService` 实现组件解耦：
- 快捷键处理器不直接调用组件方法
- 组件订阅事件响应外部触发
- 支持多个监听器响应同一事件

## 测试建议

1. **功能测试**：
   - [ ] 文件面板激活时 `Ctrl+F` 唤出搜索框
   - [ ] 文件面板折叠时 `Ctrl+F` 无响应
   - [ ] 其他面板激活时 `Ctrl+F` 无响应
   - [ ] `Esc` 关闭搜索框
   - [ ] 搜索框聚焦正常

2. **边界测试**：
   - [ ] 快速切换面板时快捷键行为
   - [ ] 搜索框显示时切换面板
   - [ ] 多个搜索请求处理

3. **回归测试**：
   - [ ] 其他快捷键正常工作
   - [ ] 面板拖拽大小功能正常
   - [ ] 文件树展开/折叠正常

## 后续优化建议

1. **搜索功能增强**：
   - 实现实时搜索过滤
   - 添加高亮匹配
   - 支持模糊搜索

2. **用户体验优化**：
   - 添加搜索历史
   - 支持键盘导航（上下箭头）
   - 添加最近打开文件快捷方式

3. **性能优化**：
   - 搜索防抖处理
   - 虚拟滚动支持大文件列表

## 参考设计

- VS Code 文件搜索快捷键：`Ctrl+P` (Quick Open)
- 条件服务模式参考：Azure Portal 条件 UI
- 事件总线模式参考：Redux Middleware, RxJS
