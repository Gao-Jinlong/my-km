# 使用 Handoff 调试 File System Access API

## 问题背景

本项目使用浏览器的 **File System Access API**（`window.showDirectoryPicker()`）让用户选择本地目录作为知识库工作区。在 AI 辅助调试场景中，自动化工具（Playwright、Chrome DevTools Protocol）**无法操作原生系统文件选择器**，因为 `showDirectoryPicker()` 弹出的是操作系统级对话框，不是 DOM 元素，无法被程序化拦截或模拟。

## 解决方案：Handoff

gstack browse 提供 `handoff` / `resume` 命令，将 headless 浏览器切换为可见的 Chrome 窗口，由用户手动完成系统对话框操作，完成后 AI 通过 `resume` 重新获取控制权。

### 工作流程

```
AI 控制 headless 浏览器 → handoff → 打开可见 Chrome → 用户手动操作 → resume → AI 恢复控制
```

### 具体步骤

```bash
# 1. 启动项目
pnpm dev:web

# 2. 启动 browse，导航到页面
$B goto http://localhost:4000

# 3. handoff：打开可见 Chrome，交由用户操作
$B handoff "请点击'打开项目' -> '选择目录'，选择目标文件夹"

# 4. 用户在可见 Chrome 中完成操作（点击按钮、选择目录等）
#    浏览器状态（cookies、localStorage、tabs）在 handoff 期间完整保留

# 5. 用户完成后，resume 恢复 AI 控制
$B resume
```

### 验证

resume 后通过 `snapshot` 确认加载结果：

```bash
$B snapshot -i
# 应看到文件树条目：test03、aaa.km、ttt.km 等
```

## 为什么需要 Handoff

| 方案 | 能否处理 File System Access API | 说明 |
|------|------|------|
| Playwright `setInputFiles` | 仅支持 `<input type="file">` | 对 `showDirectoryPicker` 无效 |
| CDP `Page.setInterceptFileChooserDialog` | 仅支持 `<input type="file">` | 对 File System Access API 无效 |
| JS 覆盖 `showDirectoryPicker` + Mock Handle | 可以，但有局限 | Mock 对象不支持写入、文件监听 |
| **Handoff** | **完全支持** | 用户操作真实 picker，拿到真实句柄 |

## Handoff 的优势

- **真实句柄**：拿到的是操作系统级的 `FileSystemDirectoryHandle`，拥有完整读写权限
- **状态保留**：cookies、localStorage、标签页在 handoff 期间完整保留
- **适用范围广**：CAPTCHA、OAuth、MFA、任何需要人工干预的场景都适用

## 相关文件

- `apps/web/src/platform/file-system/providers/fs-access-provider.ts` — File System Access API provider
- `apps/web/src/components/project/project-picker.tsx` — 项目选择器组件
- `apps/web/src/platform/file-system/project-manager.ts` — 项目管理器
