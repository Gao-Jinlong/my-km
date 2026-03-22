# 缓存系统设计

## 缓存层次

```
┌─────────────────────────────────────┐
│         应用层 (NestJS)              │
├─────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐ │
│  │ CacheModule  │  │ RedisModule  │ │
│  │ (内存缓存)    │  │ (Redis)      │ │
│  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────┘
```

## 模块对比

| 模块 | 用途 | 场景 |
|------|------|------|
| CacheModule | 简单 KV 缓存 | 配置、临时数据 |
| RedisModule | 复杂数据结构 | 会话、队列、Pub/Sub |
| Prisma Query Cache | 数据库查询缓存 | 频繁查询 |

## 使用示例

```typescript
// CacheModule
await cacheManager.set('key', 'value', 5000); // 5s TTL
const value = await cacheManager.get('key');

// RedisModule
await redisClient.set('user:123', JSON.stringify(user));
await redisClient.hset('hash', 'field', 'value');
```

## 缓存策略

| 策略 | 说明 | 场景 |
|------|------|------|
| Cache-Aside | 先查缓存，未命中查库 | 通用场景 |
| Write-Through | 写缓存同时写库 | 高一致性要求 |
| Write-Behind | 先写缓存，异步写库 | 高吞吐场景 |

---
**更新**: 2026-01-13
