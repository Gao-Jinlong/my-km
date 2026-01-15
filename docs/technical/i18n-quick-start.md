# My-KM 国际化 (i18n) 快速开始指南

## 🚀 快速上手

### 1. 启动开发服务器

```bash
# 方式 1: 从项目根目录
cd /Users/gaojinlong/ThisMac/project/my-km
pnpm dev

# 方式 2: 只启动前端
cd apps/web
pnpm dev
```

服务器将在 `http://localhost:4000` 启动

### 2. 访问应用

#### 中文版
- 首页: http://localhost:4000/zh-CN
- 注册: http://localhost:4000/zh-CN/register
- 登录: http://localhost:4000/zh-CN/login

#### 英文版
- 首页: http://localhost:4000/en
- 注册: http://localhost:4000/en/register
- 登录: http://localhost:4000/en/login

### 3. 切换语言

在页面右上角点击语言切换按钮：
- 🇨🇳 简体中文
- 🇺🇸 English

---

## 📝 添加新翻译

### 1. 编辑翻译文件

**中文**: `/apps/web/messages/zh-CN.json`
```json
{
  "your": {
    "namespace": {
      "key": "你的中文翻译"
    }
  }
}
```

**英文**: `/apps/web/messages/en.json`
```json
{
  "your": {
    "namespace": {
      "key": "Your English Translation"
    }
  }
}
```

### 2. 在组件中使用

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function YourComponent() {
    const t = useTranslations('your.namespace');

    return <div>{t('key')}</div>;
}
```

### 3. 在服务端组件中使用

```tsx
import { getTranslations } from 'next-intl/server';

export default async function ServerComponent() {
    const t = await getTranslations('your.namespace');

    return <div>{t('key')}</div>;
}
```

---

## 🔧 常见任务

### 添加新语言

1. 创建新的翻译文件 `/apps/web/messages/{locale}.json`
2. 更新 `/apps/web/src/i18n/config.ts`:

```typescript
export const locales: Locale[] = ['zh-CN', 'en', 'ja']; // 添加日语

export const localeNames: Record<Locale, string> = {
    'zh-CN': '简体中文',
    'en': 'English',
    'ja': '日本語', // 添加
};

export const localeFlags: Record<Locale, string> = {
    'zh-CN': '🇨🇳',
    'en': '🇺🇸',
    'ja': '🇯🇵', // 添加
};
```

3. 更新 `/apps/web/src/i18n/routing.ts`:

```typescript
export const routing = defineRouting({
    localePrefix: 'always',
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en', 'ja'], // 添加
});
```

### 创建翻译链接

使用 `Link` 从 `@/i18n/routing`:

```tsx
import { Link } from '@/i18n/routing';

export function Navigation() {
    return (
        <nav>
            <Link href="/about">关于</Link>
            <Link href="/contact">联系</Link>
        </nav>
    );
}
```

### 编程式语言切换

```tsx
'use client';

import { useRouter, usePathname } from '@/i18n/routing';

export function LanguageButton({ newLocale }: { newLocale: string }) {
    const router = useRouter();
    const pathname = usePathname();

    const switchLocale = () => {
        router.replace(pathname, { locale: newLocale });
    };

    return <button onClick={switchLocale}>Switch to {newLocale}</button>;
}
```

### 获取当前语言

```tsx
'use client';

import { useLocale } from 'next-intl';

export function CurrentLocale() {
    const locale = useLocale();
    return <div>Current language: {locale}</div>;
}
```

---

## 🌐 API 通信

### 前端自动发送语言头

API 客户端会自动从 URL 提取语言并添加 `X-Locale` 请求头：

```typescript
// 访问 /zh-CN/dashboard 时
// 所有 API 请求会自动添加:
// X-Locale: zh-CN
```

### 后端接收语言

```typescript
import { CurrentLocale } from '@/i18n';

@Controller('auth')
export class AuthController {
    @Post('register')
    async register(
        @Body() registerDto: RegisterDto,
        @CurrentLocale() locale: string, // 自动注入当前语言
    ) {
        // locale: 'zh-CN' 或 'en'
        return this.authService.register(registerDto, locale);
    }
}
```

### 后端翻译错误消息

```typescript
import { I18nService } from '@/i18n';

@Injectable()
export class AuthService {
    constructor(private readonly i18nService: I18nService) {}

    async register(dto: RegisterDto, locale: string) {
        if (error) {
            throw new BadRequestException({
                code: 'AUTH_USER_EXISTS',
                message: this.i18nService.getErrorMessage('AUTH_USER_EXISTS', locale),
            });
        }
    }
}
```

---

## 🎨 最佳实践

### 1. 翻译文件组织

使用命名空间组织翻译：

```json
{
  "auth": {
    "login": { ... },
    "register": { ... }
  },
  "dashboard": { ... },
  "errors": { ... }
}
```

### 2. 翻译 key 命名

- 使用点号分隔: `auth.login.title`
- 使用驼峰命名: `forgotPassword`
- 保持一致性

### 3. 参数化翻译

```json
{
  "welcome": "欢迎, {{name}}!",
  "itemCount": "你有 {{count}} 个项目"
}
```

使用:

```tsx
t('welcome', { name: 'John' })
t('itemCount', { count: 5 })
```

### 4. 复数形式

```json
{
  "items": {
    "zero": "没有项目",
    "one": "1 个项目",
    "other": "{{count}} 个项目"
  }
}
```

---

## 🐛 故障排除

### 问题: 翻译不显示

**解决方案**:
1. 检查翻译文件是否正确加载
2. 检查 namespace 是否正确
3. 检查 key 是否存在

### 问题: 语言切换不工作

**解决方案**:
1. 确保使用 `Link` from `@/i18n/routing`
2. 检查路由配置
3. 查看浏览器控制台错误

### 问题: 构建失败

**解决方案**:
```bash
# 清理构建缓存
rm -rf .next
pnpm build
```

### 问题: 类型错误

**解决方案**:
```bash
# 重新生成类型
pnpm build
```

---

## 📚 相关文档

- [完整实现方案](./i18n-implementation.md) - 详细的架构设计和实现步骤
- [测试报告](./i18n-testing-report.md) - 功能测试和性能指标
- [next-intl 官方文档](https://next-intl-docs.vercel.app/)
- [Next.js i18n 文档](https://nextjs.org/docs/app/building-your-application/routing/internationalization)

---

**最后更新**: 2026-01-15
**维护者**: Development Team
