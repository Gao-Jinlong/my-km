# UI Package

这是项目的共享 UI 组件库，基于 shadcn/ui。

## 组件

目前包含的组件：

- Button - 按钮组件

## 使用

```typescript
import { Button } from 'ui'

export default function Page() {
  return (
    <Button variant="default" size="md">
      点击我
    </Button>
  )
}
```

## 开发

这个包中的组件可以被 web 应用和其他应用导入使用。

## 样式

组件使用 Tailwind CSS 和 class-variance-authority 进行样式管理。
