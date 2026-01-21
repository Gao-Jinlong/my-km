# Sidebar 模块架构设计

## 📋 文档信息

- **所属模块**: Sidebar
- **版本**: 2.0.0
- **创建日期**: 2026-01-21
- **状态**: 📝 架构设计阶段
- **作者**: My-KM Team

---

## 🎯 架构概述

### 设计目标

Sidebar 模块采用 **Service + View 分离架构**,实现 action、state、view 的三层解耦,便于后续扩展更复杂的跨模块功能调用。

### 核心价值

1. **关注点分离**: 业务逻辑、状态管理、UI 渲染各司其职
2. **可扩展性**: 支持动态添加/删除面板,插件式扩展
3. **可测试性**: 每层可独立测试,降低耦合度
4. **可维护性**: 清晰的分层架构,易于理解和维护

---

## 📐 分层架构设计

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    View Layer (UI)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Sidebar.tsx │  │ SidebarTabs  │  │  Panels/     │  │
│  │              │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ 通过 Hook 连接
┌───────────────────────▼─────────────────────────────────┐
│                   Hook Layer                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   useSidebar()       │  │   useTabPanel()          │ │
│  │  - 状态获取          │  │  - 面板状态管理           │ │
│  │  - 操作封装          │  │  - 面板生命周期           │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │ 调用 Service
┌───────────────────────▼─────────────────────────────────┐
│                 Service Layer (业务逻辑)                  │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ SidebarService   │  │ PanelRegistryService      │  │
│  │ - Tab 管理       │  │ - 面板注册/注销           │  │
│  │ - 状态持久化      │  │ - 面板生命周期管理         │  │
│  │ - 拖拽逻辑        │  │ - 动态挂载/卸载            │  │
│  └──────────────────┘  └────────────────────────────┘  │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ TabManagerService│  │ StorageService            │  │
│  │ - Tab CRUD       │  │ - localStorage 读写       │  │
│  │ - 顺序管理        │  │ - 状态序列化/反序列化      │  │
│  │ - 验证逻辑        │  │ - 存储版本管理            │  │
│  └──────────────────┘  └────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ 读写 Store
┌───────────────────────▼─────────────────────────────────┐
│              Store Layer (Zustand)                      │
│          workspace-store.ts (全局状态持久化)            │
└─────────────────────────────────────────────────────────┘
```

---

## 📂 目录结构设计

```
apps/web/src/modules/sidebar/
├── service/                          # Service Layer - 业务逻辑层
│   ├── sidebar.service.ts           # Sidebar 核心服务
│   ├── tab-manager.service.ts       # Tab 管理服务
│   ├── panel-registry.service.ts    # 面板注册表服务
│   ├── storage.service.ts           # 存储服务 (持久化)
│   └── index.ts                     # 服务统一导出
├── hooks/                            # Hook Layer - 连接层
│   ├── use-sidebar.ts               # Sidebar 主 Hook
│   ├── use-tab-panel.ts             # Tab Panel Hook
│   └── use-drag-sort.ts             # 拖拽排序 Hook
├── components/                       # View Layer - UI 渲染层
│   ├── sidebar.tsx                  # Sidebar 容器组件
│   ├── sidebar-tabs.tsx             # Tab 切换栏组件
│   ├── sidebar-footer.tsx           # 底部操作区组件
│   ├── sortable-tab.tsx             # 可拖拽 Tab 组件
│   ├── tab-context-menu.tsx         # Tab 右键菜单
│   ├── settings-menu.tsx            # 设置菜单
│   ├── user-menu.tsx                # 用户菜单
│   └── panels/                      # 面板组件
│       ├── index.tsx                # 面板注册表
│       ├── files-panel.tsx          # 文件面板
│       ├── search-panel.tsx         # 搜索面板
│       └── [future-panels]...       # 未来面板
├── types/                            # 类型定义
│   ├── sidebar.types.ts             # Sidebar 类型
│   └── panel.types.ts               # 面板类型
├── constants/                       # 常量定义
│   ├── tabs.constants.ts            # Tab 常量
│   └── panels.constants.ts          # 面板常量
└── index.ts                         # 模块统一导出
```

---

## 🎯 各层职责划分

### 1. View Layer (UI 渲染层)

**职责**:
- 渲染 UI 界面
- 响应用户交互
- 显示状态数据

**原则**:
- 不包含业务逻辑
- 通过 Hook 获取状态和操作
- 纯展示组件,易于测试

**示例**:
```typescript
// components/sidebar.tsx
export function Sidebar() {
  const { tabs, activeTab, collapsed, switchTab } = useSidebar();

  return (
    <div className="sidebar">
      {!collapsed && <SidebarTabs tabs={tabs} activeTab={activeTab} onTabClick={switchTab} />}
      <SidebarContent activeTab={activeTab} />
      <SidebarFooter />
    </div>
  );
}
```

---

### 2. Hook Layer (连接层)

**职责**:
- 连接 Service 和 View
- 封装状态和操作
- 处理生命周期

**原则**:
- 不包含复杂业务逻辑
- 提供简洁的 API 给 View
- 管理订阅和清理

**示例**:
```typescript
// hooks/use-sidebar.ts
export function useSidebar() {
  const service = SidebarService.getInstance();
  const [state, setState] = useState(service.getState());

  useEffect(() => {
    const unsubscribe = service.subscribe(setState);
    return unsubscribe;
  }, []);

  return {
    tabs: state.tabs,
    activeTab: state.activeTab,
    collapsed: state.collapsed,
    switchTab: service.switchTab.bind(service),
    addTab: service.addTab.bind(service),
    removeTab: service.removeTab.bind(service),
  };
}
```

---

### 3. Service Layer (业务逻辑层)

**职责**:
- 实现业务逻辑
- 协调多个 Service
- 管理状态持久化

**原则**:
- 独立于 UI 框架
- 可复用和可测试
- 提供统一接口

**SidebarService**:
- 管理 Sidebar 整体状态
- 协调 Tab 管理服务和面板注册服务
- 处理跨 Tab 的业务逻辑

**TabManagerService**:
- Tab 的增删改查
- Tab 顺序管理
- Tab 状态持久化
- Tab 验证

**PanelRegistryService**:
- 面板的动态注册/注销
- 面板生命周期管理
- 面板状态隔离
- 面板懒加载

**StorageService**:
- localStorage 读写
- 状态序列化/反序列化
- 存储版本管理

---

### 4. Store Layer (状态管理层)

**职责**:
- 全局状态管理
- 状态持久化
- 状态订阅通知

**技术栈**:
- Zustand (状态管理)
- persist (持久化中间件)

---

## 🔄 动态挂载/卸载机制

### 面板注册机制

**面板定义**:
```typescript
interface PanelDefinition {
  id: string;
  component: React.ComponentType<PanelProps>;
  icon: string;
  label: string;
  isDeletable: boolean;
  defaultOrder: number;
  lazy?: boolean; // 是否懒加载
}
```

**注册面板**:
```typescript
// 在模块初始化时注册面板
PanelRegistryService.register([
  {
    id: 'files-panel',
    component: FilesPanel,
    icon: 'Files',
    label: 'Files',
    isDeletable: false,
    defaultOrder: 0,
  },
  {
    id: 'search-panel',
    component: SearchPanel,
    icon: 'Search',
    label: 'Search',
    isDeletable: false,
    defaultOrder: 1,
  },
]);
```

**动态添加面板**:
```typescript
// 插件或扩展模块可以动态注册新面板
PanelRegistryService.register({
  id: 'custom-panel',
  component: CustomPanel,
  icon: 'Custom',
  label: 'Custom',
  isDeletable: true,
  defaultOrder: 2,
});
```

**面板懒加载**:
```typescript
// 支持懒加载,优化首屏性能
PanelRegistryService.register({
  id: 'lazy-panel',
  component: lazy(() => import('./panels/lazy-panel')),
  icon: 'Lazy',
  label: 'Lazy',
  isDeletable: true,
  defaultOrder: 3,
});
```

---

### 动态挂载流程

```
1. 用户点击 Tab
   ↓
2. View 层通知 Hook
   ↓
3. Hook 调用 SidebarService.switchTab()
   ↓
4. SidebarService 验证 Tab 有效性
   ↓
5. PanelRegistryService 检查面板是否注册
   ↓
6. 如果已注册:
   - 激活 Panel
   - 恢复 Panel 状态
   ↓
7. 如果未注册:
   - 拒绝切换
   - 提示错误
   ↓
8. Hook 通知 View 更新
   ↓
9. View 渲染新 Panel
```

---

### 动态卸载流程

```
1. 用户右键点击 Tab 选择删除
   ↓
2. View 层通知 Hook
   ↓
3. Hook 调用 SidebarService.removeTab()
   ↓
4. SidebarService 验证:
   - Tab 是否可删除
   - 是否为最后一个 Tab
   ↓
5. 如果可删除:
   - 卸载 Panel
   - 清理 Panel 状态
   - 从注册表中移除 (可选)
   ↓
6. 如果不可删除:
   - 拒绝删除
   - 提示错误
   ↓
7. Hook 通知 View 更新
   ↓
8. View 渲染更新后的 Tab 列表
```

---

## 🎨 状态隔离策略

### Panel 状态隔离

每个 Panel 拥有独立的状态空间,通过 Tab ID 作为 key 进行隔离:

```typescript
// Store 中的状态结构
interface SidebarState {
  tabs: TabConfig[];
  activeTab: string;
  panelStates: Map<string, PanelState>; // key 为 Tab ID
}

// Files Panel 状态
interface FilesPanelState {
  expandedFolders: string[];
  selectedFile: string | null;
  scrollPosition: number;
}

// Search Panel 状态
interface SearchPanelState {
  query: string;
  results: SearchResult[];
  filters: SearchFilters;
}
```

### 状态持久化

```typescript
// 持久化时将 Map 转为数组
const persistedState = {
  panelStates: Array.from(state.panelStates.entries()),
};

// 恢复时将数组转回 Map
const restoredState = {
  panelStates: new Map(persistedState.panelStates),
};
```

---

## 🔌 跨模块调用方式

### 调用 Sidebar 功能

其他模块可以通过 SidebarService 调用 Sidebar 功能:

```typescript
// 在编辑器模块中打开文件面板
import { SidebarService } from '@/modules/sidebar';

SidebarService.getInstance().switchTab('files');

// 在 AI 模块中打开搜索面板
SidebarService.getInstance().switchTab('search');
```

### 动态注册面板

```typescript
// AI 模块动态注册结果面板
import { PanelRegistryService } from '@/modules/sidebar';
import { AIResultsPanel } from './components';

PanelRegistryService.register({
  id: 'ai-results',
  component: AIResultsPanel,
  icon: 'Brain',
  label: 'AI Results',
  isDeletable: true,
  defaultOrder: 10,
});

// 添加 Tab
import { SidebarService } from '@/modules/sidebar';

SidebarService.getInstance().addTab({
  id: 'ai-results-tab',
  panelId: 'ai-results',
  label: 'AI Results',
});
```

---

## 📊 状态持久化策略

### 持久化内容

- Tab 配置 (顺序、可见性)
- 当前激活的 Tab
- Sidebar 折叠状态
- 各 Panel 的独立状态

### 持久化方式

使用 Zustand 的 persist 中间件:

```typescript
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({ ... }),
    {
      name: 'sidebar-state',
      partialize: (state) => ({
        sidebarActiveTab: state.sidebarActiveTab,
        sidebarTabs: state.sidebarTabs,
        tabPanelStates: Array.from(state.tabPanelStates.entries()),
      }),
      merge: (persisted, current) => ({
        ...current,
        ...persisted,
        tabPanelStates: persisted.tabPanelStates
          ? new Map(persisted.tabPanelStates)
          : current.tabPanelStates,
      }),
    }
  )
);
```

### 存储版本管理

```typescript
interface StorageVersion {
  version: number;
  data: any;
}

// 版本迁移
const migrate = (state: any): any => {
  if (state.version === 1) {
    // 从 v1 迁移到 v2
    return {
      ...state,
      version: 2,
      // 迁移逻辑
    };
  }
  return state;
};
```

---

## 🚀 实施计划

### Phase 1: 基础架构搭建

- [ ] 创建目录结构
- [ ] 实现 Service Layer (4 个 Service)
- [ ] 实现 Hook Layer (3 个 Hook)
- [ ] 迁移现有组件到新架构
- [ ] 单元测试

**预计工时**: 5-6 天

---

### Phase 2: 动态面板机制

- [ ] 实现面板注册表
- [ ] 实现动态挂载/卸载
- [ ] 实现懒加载
- [ ] 实现状态隔离
- [ ] 集成测试

**预计工时**: 3-4 天

---

### Phase 3: 优化和完善

- [ ] 性能优化
- [ ] 错误处理
- [ ] 文档完善
- [ ] 示例代码
- [ ] E2E 测试

**预计工时**: 2-3 天

---

## 📚 相关文档

- [Sidebar 概述文档](./overview.md) - 功能需求和验收标准
- [文件夹面板文档](./files-panel.md) - 文件面板详细设计
- [搜索面板文档](./search-panel.md) - 搜索面板详细设计
- [工作视图模块](../workspace-view/workspace-view.md) - 工作视图整体架构

---

## 📝 变更历史

| 版本 | 日期 | 变更说明 | 作者 |
|-----|------|---------|-----|
| 2.0.0 | 2026-01-21 | 架构重构,引入 Service + View 分离设计 | My-KM Team |
| 1.0.0 | 2026-01-20 | 初始版本,左侧侧边栏架构 | My-KM Team |

---

**文档状态**: ✅ 架构设计完成
**下一步**: 开始实施 Phase 1
