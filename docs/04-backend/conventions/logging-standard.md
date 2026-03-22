# 日志规范

## 日志级别

| 级别 | 描述 | 使用场景 | 生产环境 |
|------|------|----------|----------|
| `fatal` | 系统无法运行的错误 | 数据库连接失败 | ✅ 记录 |
| `error` | 业务流程错误 | API 调用失败 | ✅ 记录 |
| `warn` | 潜在问题 | 参数缺失、降级服务 | ✅ 记录 |
| `info` | 关键业务节点 | 用户登录、状态变更 | ✅ 记录 |
| `debug` | 调试信息 | 函数参数、中间变量 | ❌ 不记录 |
| `trace` | 执行轨迹 | 函数入口/出口 | ❌ 不记录 |

## 使用原则

```typescript
// ✅ 正确示例
logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
logger.error('Failed to create article', { error: err.message });

// ❌ 错误示例
console.log('User logged in');  // 不使用 console
logger.info(`User ${userId}...`);  // 使用结构化字段
```

## 日志格式

### 开发环境
可读文本格式，带颜色

### 生产环境
JSON 格式，单行

## 敏感数据脱敏

以下数据自动脱敏：
- 邮箱：`u***@example.com`
- 手机：`138****1234`
- Token: `[REDACTED]`
- IP: `192.168.***.1`

---
**更新**: 2026-01-12
