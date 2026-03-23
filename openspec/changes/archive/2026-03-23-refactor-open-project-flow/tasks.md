## 1. 项目状态管理

- [x] 1.1 定义 ProjectInfo 和 ProjectState 类型
- [x] 1.2 实现 project-manager.ts 核心类
- [x] 1.3 扩展 workspace-store 添加项目状态字段
- [x] 1.4 实现项目持久化逻辑（localStorage）

## 2. 欢迎页面组件

- [x] 2.1 创建 Welcome 组件基本结构
- [x] 2.2 添加欢迎页面样式
- [x] 2.3 实现"打开项目"按钮点击处理

## 3. 项目选择器组件

- [x] 3.1 创建 ProjectPicker 对话框组件
- [x] 3.2 集成 File System Access API (showDirectoryPicker)
- [x] 3.3 实现加载状态和错误处理
- [x] 3.4 添加浏览器兼容性检查

## 4. 工作区页面重构

- [x] 4.1 修改 workspace/page.tsx 添加项目状态判断
- [x] 4.2 根据项目状态渲染欢迎页或工作区
- [x] 4.3 集成 project-manager 到组件生命周期

## 5. 资源清理集成

- [x] 5.1 实现项目关闭时清理文件句柄缓存
- [x] 5.2 实现项目关闭时注销 provider
- [x] 5.3 添加页面卸载时的自动清理

## 6. 测试和文档

- [x] 6.1 编写 project-manager 单元测试
- [x] 6.2 编写欢迎页面和选择器组件测试
- [x] 6.3 更新 README 添加项目打开流程说明
