# my-km 后端 DDD 重设计方案

> 学习型文档：基于当前项目代码现状，给出一份完整的 DDD（领域驱动设计）重构方案。
> 既包含战略设计（Bounded Context、Context Map），也包含战术设计（Aggregate、Value Object、Repository、Domain Event）。
>
> **阅读建议**：按章节顺序读，先建立心智模型再看代码示例。每个示例都给出"当前实现 vs DDD 实现"的对比。

---

## 目录

- [0. 当前架构存在的核心问题](#0-当前架构存在的核心问题)
- [1. DDD 落地方法论](#1-ddd-落地方法论)
- [2. 战略设计：限界上下文与上下文映射](#2-战略设计限界上下文与上下文映射)
- [3. 通用语言（Ubiquitous Language）](#3-通用语言ubiquitous-language)
- [4. 分层架构与目录结构](#4-分层架构与目录结构)
- [5. 战术设计：Identity 上下文完整实现](#5-战术设计identity-上下文完整实现)
- [6. 战术设计：Conversation 上下文要点](#6-战术设计conversation-上下文要点)
- [7. 跨上下文集成：领域事件](#7-跨上下文集成领域事件)
- [8. 测试策略](#8-测试策略)
- [9. 渐进式迁移路径](#9-渐进式迁移路径)
- [10. 进一步学习的资源](#10-进一步学习的资源)

---

## 0. 当前架构存在的核心问题

在动手设计之前，先回顾一下当前 `apps/server/src/` 在 DDD 视角下的问题，作为重构动机：

| # | 问题 | 当前代码佐证 |
|---|---|---|
| 1 | 限界上下文边界模糊：`auth/` 和 `users/` 互相穿透，本应是同一个 Identity 上下文 | `auth.service.ts:139,194,250,304` 直接读写 `prisma.user / emailVerification / passwordReset` |
| 2 | 基础设施术语污染领域语言：`Thread / Run / Checkpointer` 都是 LangGraph 协议词 | `schema.prisma:97-156` |
| 3 | 贫血模型：所有规则散落在 Service 的 if-else 里，`User` 没有任何行为 | `users.service.ts:451,658` 同一规则写两遍 |
| 4 | 缺少 Repository：Prisma 直接渗透到应用层，甚至 Controller 直接 `prisma.run.findMany`(`runs.controller.ts:34`) | 31 处 `this.prisma.user.xxx` |
| 5 | 聚合事务边界缺失：注册流程跨 user + emailVerification + Redis 三处写入，无事务包裹 | `users.service.ts:486-555` |
| 6 | Application Service 与 Domain Service 概念混淆：所有都叫 `*Service` | 全局 |
| 7 | 副作用由 Controller 编排，且 fire-and-forget | `users.controller.ts:50-66` |
| 8 | 缺少领域事件：跨上下文耦合靠直接调用而非事件 | `auth.service.ts → emailService.sendXxx()` 直接调用 |

---

## 1. DDD 落地方法论

DDD 不是"目录改名 + 加一层 Repository"。核心是三件事：

1. **战略设计**：用业务能力切分 Bounded Context，而不是按数据表切。
2. **战术设计**：让聚合（Aggregate）承载业务规则，Service 只做编排。
3. **依赖反转**：领域层不依赖任何框架/ORM/HTTP，基础设施实现领域定义的接口。

> **判断标准**：一个 DDD 项目做得好不好，最简单的判断方式是 —— **删掉 NestJS 和 Prisma，`domain/` 目录还能编译通过吗？**

---

## 2. 战略设计：限界上下文与上下文映射

### 2.1 识别 Bounded Context

从业务能力反推，my-km 应该有 4 个清晰的上下文：

| Bounded Context | 业务能力 | 当前代码出处 | 聚合根 |
|---|---|---|---|
| **Identity** | 用户身份、注册、密码、邮箱验证 | `users/` + `auth/email-verification` + `auth/password-reset` | `User` |
| **Access**（认证） | 登录、Session、JWT、Token 轮换 | `auth/login` + `auth/refresh` + `auth/services/token` | `Session` |
| **Conversation** | AI 对话、会话线程、消息历史 | `ai/thread` + `ai/run` + `ai/store` | `Conversation`（替代 Thread） |
| **LLM Gateway** | LLM Provider 抽象、模型调用 | `ai/llm` + `ai/langgraph` | 无聚合，纯领域服务 |

> **为什么 Identity 和 Access 要拆开？**
> `User` 是长生命周期聚合（一辈子只有一个），`Session` 是短生命周期聚合（每次登录就一个、过期就丢）。
> 如果放在一个聚合里，`User.sessions[]` 会无限膨胀，破坏聚合"小"的原则，也会让 `User` 的事务竞争激烈。

### 2.2 Context Map（上下文映射）

```
┌─────────────┐  ACL  ┌─────────────┐
│  Identity   │◀──────│   Access    │   Customer-Supplier
│  (User 聚合) │       │ (Session聚合)│   Identity 是上游
└─────────────┘       └─────────────┘
       ▲                     ▲
       │ 领域事件             │
       │ UserRegistered      │
       │                     │
┌──────┴──────────────────────┴──────┐
│        Conversation Context        │
│        (Conversation 聚合)         │
└────────────────┬───────────────────┘
                 │ ACL (LLMGatewayAdapter)
                 ▼
        ┌────────────────┐
        │  LLM Gateway   │   Conformist (顺从 LangGraph 协议)
        └────────────────┘
```

集成方式：

- **Identity → Access**：`Customer-Supplier`，Access 通过 `UserCredentialQuery`（应用查询接口）从 Identity 拿密码哈希。
- **Identity → Conversation**：**领域事件**，`UserRegistered` 触发 `Conversation` 上下文初始化默认空间（可选）。
- **Conversation → LLM Gateway**：**Anti-Corruption Layer**，把 LangGraph 的 `Run/Thread/Checkpoint` 翻译成自己的 `Conversation/Turn/Snapshot`，**不让 LangGraph 协议词汇渗透进领域层**。

---

## 3. 通用语言（Ubiquitous Language）

DDD 的灵魂。当前项目最大的问题就是用基础设施词汇当业务词汇。重新约定：

| 当前（基础设施味） | DDD 重命名（业务味） | 含义 |
|---|---|---|
| `Thread` | `Conversation` | 一次完整的对话 |
| `Run` | `Turn` | 对话中的一次问答轮次 |
| `RunEvent` | `TurnEvent` | 轮次中产生的领域事件 |
| `Checkpointer` | `ConversationSnapshotStore` | 对话快照存储 |
| `LLMProvider` | `LanguageModel` | 语言模型 |
| `EmailVerification` | `EmailVerificationToken`（`User` 内值对象） | 邮箱验证凭证 |
| `PasswordReset` | `PasswordResetTicket`（`User` 内值对象） | 密码重置凭证 |
| `Session` | `Session` 聚合根 | 登录会话 |

> **原则**：领域层的类名/方法名/变量名应该能直接读给产品经理听，而他们能理解。
> 如果出现 `runManager.finalize(runId)` 这种术语，产品经理是听不懂的 —— 那就不是领域语言。


---

## 4. 分层架构与目录结构

经典 DDD 四层 + Hexagonal（六边形架构）：

```
apps/server/src/
  modules/
    identity/                            # Bounded Context 1
      domain/                            # 领域层（零外部依赖）
        model/
          user.aggregate.ts              # User 聚合根
          email.vo.ts                    # 值对象
          password.vo.ts
          email-verification-token.vo.ts
          password-reset-ticket.vo.ts
        events/
          user-registered.event.ts       # 领域事件
          email-verified.event.ts
          password-changed.event.ts
        services/
          password-hasher.ts             # 领域服务接口
        repositories/
          user.repository.ts             # 仓储接口
        errors/
          identity.errors.ts             # 上下文专属错误
      application/                       # 应用层（编排）
        commands/
          register-user.handler.ts
          verify-email.handler.ts
          change-password.handler.ts
        queries/
          find-user-profile.handler.ts
        ports/                           # 出站端口（接口）
          email-notifier.port.ts
      infrastructure/                    # 基础设施（适配器）
        persistence/
          prisma-user.repository.ts      # 实现领域接口
          user.mapper.ts                 # ORM 与领域映射
        crypto/
          bcrypt-password-hasher.ts
        notifications/
          email-notifier.adapter.ts
      interface/                         # 接口层（HTTP/WS）
        http/
          users.controller.ts
          dto/
        events/                          # 订阅其他上下文事件
      identity.module.ts
    access/
    conversation/
    llm-gateway/
  shared-kernel/                         # 共享内核（谨慎使用）
    aggregate-root.ts
    value-object.ts
    domain-event.ts
    result.ts
```

### 4.1 关键约束

用 ESLint `no-restricted-imports` 强制：

| 层 | 可 import | 不可 import |
|---|---|---|
| `domain/` | `shared-kernel/`、自身 | `@nestjs/*`、`@prisma/*`、任何 `infrastructure/*`、`application/*` |
| `application/` | `domain/`、`shared-kernel/` | `infrastructure/*`、`interface/*` |
| `infrastructure/` | `domain/`（实现接口）、第三方库 | `interface/*` |
| `interface/` | `application/` | 直接调用 `domain/` 业务方法 |
| 跨上下文 | 仅通过领域事件 / 应用查询接口 | 直接 import 别的 BC 的 `domain/` |

> 这一节是 DDD 落地的"安全网"。一旦约束被破坏（例如 domain 层 import 了 `@nestjs/common`），DDD 的优势（可测试性、独立演进）就会快速劣化。

### 4.2 各层职责一句话总结

- **Domain**：业务规则与不变量。**不知道**自己是被 HTTP 还是 CLI 调用，**不知道**自己持久化到 PostgreSQL 还是内存。
- **Application**：用例编排。打开事务、加载聚合、调用聚合方法、保存聚合、发布领域事件。**不写业务规则**。
- **Infrastructure**：技术实现。Prisma、Bcrypt、Redis、SMTP、LangGraph SDK 都在这里。
- **Interface**：协议适配。HTTP Controller、WS Gateway、CLI Command。**不调 Repository，不直接操作聚合**。


---

## 5. 战术设计：Identity 上下文完整实现

下面用 Identity 上下文做一次端到端完整实现，覆盖：值对象、聚合根、领域事件、仓储接口、应用层命令、基础设施实现。

### 5.1 Shared Kernel：聚合根与值对象基类

```typescript
// shared-kernel/domain-event.ts
export interface DomainEvent {
    readonly occurredAt: Date;
    readonly eventName: string;
}

// shared-kernel/aggregate-root.ts
import type { DomainEvent } from './domain-event';

export abstract class AggregateRoot<TId> {
    private _events: DomainEvent[] = [];
    constructor(public readonly id: TId) {}

    protected addEvent(event: DomainEvent): void {
        this._events.push(event);
    }

    /** 应用层在保存聚合后调用，发布事件并清空 */
    pullEvents(): DomainEvent[] {
        const events = this._events;
        this._events = [];
        return events;
    }
}

// shared-kernel/value-object.ts
export abstract class ValueObject {
    abstract equals(other: this): boolean;
}
```

### 5.2 值对象：用类型封装规则，杜绝原始类型偏执

#### Email

```typescript
// modules/identity/domain/model/email.vo.ts
import { ValueObject } from '@/shared-kernel/value-object';
import { InvalidEmailError } from '../errors/identity.errors';

export class Email extends ValueObject {
    private constructor(public readonly value: string) {
        super();
    }

    static create(raw: string): Email {
        const v = raw.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
            throw new InvalidEmailError(raw);
        }
        return new Email(v);
    }

    equals(o: Email): boolean {
        return this.value === o.value;
    }
}
```

> **对比当前实现**：当前 `email: string` 在每个 DTO/Service/Prisma 模型里都是原始字符串，校验散落在各处（`auth.service.ts:42` 传给 prisma 之前不会再校验）。改成值对象后，`Email` 类型本身就是"已校验"的契约——任何拿到 `Email` 实例的代码都不需要再做格式校验。

#### Password（区分明文与哈希）

```typescript
// modules/identity/domain/model/password.vo.ts
import { ValueObject } from '@/shared-kernel/value-object';
import { WeakPasswordError } from '../errors/identity.errors';

export class HashedPassword extends ValueObject {
    private constructor(public readonly hash: string) {
        super();
    }
    static fromHash(hash: string): HashedPassword {
        return new HashedPassword(hash);
    }
    equals(o: HashedPassword): boolean {
        return this.hash === o.hash;
    }
}

export class PlainPassword extends ValueObject {
    private constructor(public readonly value: string) {
        super();
    }
    static create(raw: string): PlainPassword {
        if (raw.length < 8) throw new WeakPasswordError('TOO_SHORT');
        if (!/[A-Z]/.test(raw)) throw new WeakPasswordError('NEED_UPPER');
        if (!/[0-9]/.test(raw)) throw new WeakPasswordError('NEED_DIGIT');
        return new PlainPassword(raw);
    }
    equals(o: PlainPassword): boolean {
        return this.value === o.value;
    }
}
```

> **关键设计**：明文密码是 `PlainPassword`、哈希密码是 `HashedPassword`，**不会混用**。聚合根存储的永远是 `HashedPassword`，明文只出现在"用户输入到聚合接收"的瞬间。

#### EmailVerificationToken（聚合内值对象）

```typescript
// modules/identity/domain/model/email-verification-token.vo.ts
import { ValueObject } from '@/shared-kernel/value-object';
import { randomBytes } from 'node:crypto';

export class EmailVerificationToken extends ValueObject {
    private constructor(
        public readonly value: string,
        public readonly expiresAt: Date,
    ) {
        super();
    }

    static issue(ttlHours = 24): EmailVerificationToken {
        const value = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
        return new EmailVerificationToken(value, expiresAt);
    }

    static restore(value: string, expiresAt: Date): EmailVerificationToken {
        return new EmailVerificationToken(value, expiresAt);
    }

    isExpired(now: Date = new Date()): boolean {
        return now >= this.expiresAt;
    }

    matches(raw: string): boolean {
        return this.value === raw;
    }

    equals(o: EmailVerificationToken): boolean {
        return this.value === o.value;
    }
}
```

> **DDD 要点**：原本 Prisma schema 里 `EmailVerification` 是独立表，被建模为独立实体。但从业务看它**只服务于一个 User**、**离开 User 没有意义**——这正是 Aggregate 内 Value Object 的特征。表结构可以保留两张表（持久化关注），但领域模型上它属于 `User` 聚合。


### 5.3 User 聚合根：业务规则的归宿

```typescript
// modules/identity/domain/model/user.aggregate.ts
import { AggregateRoot } from '@/shared-kernel/aggregate-root';
import { Email } from './email.vo';
import { HashedPassword, PlainPassword } from './password.vo';
import { EmailVerificationToken } from './email-verification-token.vo';
import { PasswordResetTicket } from './password-reset-ticket.vo';
import { PasswordHasher } from '../services/password-hasher';
import {
    UserRegistered,
    EmailVerified,
    PasswordChanged,
    PasswordResetRequested,
} from '../events';
import {
    EmailAlreadyVerifiedError,
    InvalidVerificationTokenError,
    OAuthUserCannotChangePasswordError,
    PasswordSameAsOldError,
    InvalidCredentialsError,
} from '../errors/identity.errors';

export type UserId = string & { readonly __brand: 'UserId' };

interface UserState {
    id: UserId;
    email: Email;
    username?: string;
    hashedPassword?: HashedPassword;     // OAuth 用户没有
    isEmailVerified: boolean;
    isActive: boolean;
    pendingVerification?: EmailVerificationToken;
    pendingPasswordReset?: PasswordResetTicket;
    createdAt: Date;
    lastLoginAt?: Date;
}

export class User extends AggregateRoot<UserId> {
    private constructor(private state: UserState) {
        super(state.id);
    }

    // ============ 工厂方法 ============

    /** 创建：邮箱注册（带密码） */
    static async register(input: {
        id: UserId;
        email: Email;
        password: PlainPassword;
        username?: string;
        hasher: PasswordHasher;
    }): Promise<User> {
        const hashed = await input.hasher.hash(input.password);
        const token = EmailVerificationToken.issue();

        const user = new User({
            id: input.id,
            email: input.email,
            username: input.username,
            hashedPassword: hashed,
            isEmailVerified: false,
            isActive: true,
            pendingVerification: token,
            createdAt: new Date(),
        });

        user.addEvent(new UserRegistered(user.id, input.email, token));
        return user;
    }

    /** 重建：从持久化恢复（不发事件） */
    static rehydrate(state: UserState): User {
        return new User(state);
    }

    // ============ 业务方法（行为） ============

    /** 验证邮箱 */
    verifyEmail(rawToken: string, now: Date = new Date()): void {
        if (this.state.isEmailVerified) {
            throw new EmailAlreadyVerifiedError(this.id);
        }
        const token = this.state.pendingVerification;
        if (!token || !token.matches(rawToken) || token.isExpired(now)) {
            throw new InvalidVerificationTokenError(this.id);
        }

        this.state.isEmailVerified = true;
        this.state.pendingVerification = undefined;
        this.addEvent(new EmailVerified(this.id, this.state.email));
    }

    /** 修改密码（需要旧密码） */
    async changePassword(input: {
        oldPassword: PlainPassword;
        newPassword: PlainPassword;
        hasher: PasswordHasher;
    }): Promise<void> {
        if (!this.state.hashedPassword) {
            throw new OAuthUserCannotChangePasswordError(this.id);
        }
        const ok = await input.hasher.compare(input.oldPassword, this.state.hashedPassword);
        if (!ok) throw new InvalidCredentialsError();

        // 业务规则：新旧密码不能相同
        const sameHash = await input.hasher.compare(input.newPassword, this.state.hashedPassword);
        if (sameHash) throw new PasswordSameAsOldError();

        this.state.hashedPassword = await input.hasher.hash(input.newPassword);
        this.addEvent(new PasswordChanged(this.id));
    }

    /** 请求密码重置 */
    requestPasswordReset(): PasswordResetTicket {
        const ticket = PasswordResetTicket.issue();
        this.state.pendingPasswordReset = ticket;
        this.addEvent(new PasswordResetRequested(this.id, this.state.email, ticket));
        return ticket;
    }

    /** 用 ticket 重置密码 */
    async resetPasswordWith(input: {
        rawTicket: string;
        newPassword: PlainPassword;
        hasher: PasswordHasher;
        now?: Date;
    }): Promise<void> {
        const ticket = this.state.pendingPasswordReset;
        const now = input.now ?? new Date();
        if (!ticket || !ticket.matches(input.rawTicket) || ticket.isExpired(now) || ticket.used) {
            throw new InvalidVerificationTokenError(this.id);
        }
        this.state.hashedPassword = await input.hasher.hash(input.newPassword);
        this.state.pendingPasswordReset = ticket.markUsed();
        this.addEvent(new PasswordChanged(this.id));
    }

    /** 登录验证（仅返回结果，不改状态） */
    async authenticate(input: {
        password: PlainPassword;
        hasher: PasswordHasher;
    }): Promise<void> {
        if (!this.state.isActive) throw new InvalidCredentialsError();
        if (!this.state.isEmailVerified) throw new InvalidCredentialsError();
        if (!this.state.hashedPassword) throw new InvalidCredentialsError();

        const ok = await input.hasher.compare(input.password, this.state.hashedPassword);
        if (!ok) throw new InvalidCredentialsError();
    }

    /** 登录成功后由应用层回调，更新最后登录时间 */
    recordLogin(at: Date = new Date()): void {
        this.state.lastLoginAt = at;
    }

    deactivate(): void {
        this.state.isActive = false;
    }

    // ============ 只读访问（给 Mapper / Application 用） ============

    snapshot(): Readonly<UserState> {
        return Object.freeze({ ...this.state });
    }
}
```

> **对比当前实现**：
>
> - 当前 `users.service.ts:451 / 658` 这两段"新密码不能与旧密码相同"的逻辑被复制了两次。聚合方法 `changePassword` 把它收敛到了一个地方。
> - 当前 `auth.service.ts:65-72` 的"邮箱必须已验证 + 账号必须激活"散落在 service 中。聚合方法 `authenticate` 把这些不变量包装在 User 自己身上。
> - 当前 `users.service.ts:486-555` 的注册流程是"prisma.user.create + prisma.emailVerification.create + redis 写"三段式。`User.register()` 工厂返回的聚合**自身**包含 `pendingVerification` 字段，由 Repository 在一个事务里整体保存。

### 5.4 Repository 接口（Domain 层）

```typescript
// modules/identity/domain/repositories/user.repository.ts
import { User, UserId } from '../model/user.aggregate';
import { Email } from '../model/email.vo';

export abstract class UserRepository {
    abstract nextId(): UserId;
    abstract findById(id: UserId): Promise<User | null>;
    abstract findByEmail(email: Email): Promise<User | null>;
    abstract findByUsername(username: string): Promise<User | null>;
    abstract findByVerificationToken(rawToken: string): Promise<User | null>;
    abstract findByPasswordResetTicket(rawTicket: string): Promise<User | null>;

    /** 保存整个聚合（包括 pendingVerification / pendingPasswordReset） */
    abstract save(user: User): Promise<void>;
}
```

> 这个接口**完全在 domain 层**，不依赖 Prisma。这就是依赖反转的关键。

### 5.5 PasswordHasher 领域服务接口

```typescript
// modules/identity/domain/services/password-hasher.ts
import { PlainPassword, HashedPassword } from '../model/password.vo';

export abstract class PasswordHasher {
    abstract hash(plain: PlainPassword): Promise<HashedPassword>;
    abstract compare(plain: PlainPassword, hashed: HashedPassword): Promise<boolean>;
}
```

> **为什么 PasswordHasher 是领域服务而不是基础设施？**
> 因为"如何加密密码"是业务规则的一部分（比如"必须用 bcrypt cost ≥ 12"是业务约束）。但**具体实现**（用 bcrypt 还是 argon2）是基础设施关切。所以接口在 domain，实现在 infrastructure。


### 5.6 领域事件

```typescript
// modules/identity/domain/events/user-registered.event.ts
import type { DomainEvent } from '@/shared-kernel/domain-event';
import type { UserId } from '../model/user.aggregate';
import type { Email } from '../model/email.vo';
import type { EmailVerificationToken } from '../model/email-verification-token.vo';

export class UserRegistered implements DomainEvent {
    readonly eventName = 'identity.user.registered';
    readonly occurredAt = new Date();
    constructor(
        readonly userId: UserId,
        readonly email: Email,
        readonly verificationToken: EmailVerificationToken,
    ) {}
}

// 其他事件类似：EmailVerified / PasswordChanged / PasswordResetRequested
```

### 5.7 应用层：Command Handler（用例）

```typescript
// modules/identity/application/commands/register-user.handler.ts
import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@/shared-kernel/unit-of-work';
import { UserRepository } from '../../domain/repositories/user.repository';
import { PasswordHasher } from '../../domain/services/password-hasher';
import { EmailAlreadyExistsError } from '../../domain/errors/identity.errors';
import { Email } from '../../domain/model/email.vo';
import { PlainPassword } from '../../domain/model/password.vo';
import { User } from '../../domain/model/user.aggregate';

export interface RegisterUserCommand {
    email: string;
    password: string;
    username?: string;
}

@Injectable()
export class RegisterUserHandler {
    constructor(
        private readonly users: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly uow: UnitOfWork,
    ) {}

    async execute(cmd: RegisterUserCommand): Promise<{ userId: string }> {
        const email = Email.create(cmd.email);
        const password = PlainPassword.create(cmd.password);

        return this.uow.run(async () => {
            // 1. 业务规则：邮箱唯一
            const existing = await this.users.findByEmail(email);
            if (existing) throw new EmailAlreadyExistsError(email);

            // 2. 创建聚合（聚合内部已包含 pendingVerification）
            const user = await User.register({
                id: this.users.nextId(),
                email,
                password,
                username: cmd.username,
                hasher: this.hasher,
            });

            // 3. 一次保存整个聚合（一个事务）
            await this.users.save(user);

            return { userId: user.id };

            // 注意：UnitOfWork 在事务提交后会发布 user.pullEvents() 中的所有事件
        });
    }
}
```

> **对比当前实现**：
>
> - 当前 `UsersService.registerUser()` 76 行代码，直接调用 `prisma.user.create + prisma.emailVerification.create + cache.set + cache.set`，**无事务**。
> - DDD 实现 25 行，逻辑清晰，事务由 `UnitOfWork` 统一管理，副作用（发邮件）通过领域事件解耦。

```typescript
// modules/identity/application/commands/verify-email.handler.ts
@Injectable()
export class VerifyEmailHandler {
    constructor(
        private readonly users: UserRepository,
        private readonly uow: UnitOfWork,
    ) {}

    async execute(cmd: { token: string }): Promise<void> {
        return this.uow.run(async () => {
            const user = await this.users.findByVerificationToken(cmd.token);
            if (!user) throw new InvalidVerificationTokenError();

            user.verifyEmail(cmd.token); // 聚合方法承载所有规则

            await this.users.save(user);
        });
    }
}
```

> 注意 Application Service 自己**不写业务规则**——所有 if-else 都在聚合方法里。Handler 只做"加载-调用-保存"三步。

### 5.8 基础设施实现

#### Prisma 仓储实现

```typescript
// modules/identity/infrastructure/persistence/prisma-user.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRepository } from '../../domain/repositories/user.repository';
import { User, UserId } from '../../domain/model/user.aggregate';
import { Email } from '../../domain/model/email.vo';
import { UserMapper } from './user.mapper';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PrismaUserRepository extends UserRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    nextId(): UserId {
        return randomUUID() as UserId;
    }

    async findById(id: UserId): Promise<User | null> {
        const row = await this.prisma.user.findUnique({
            where: { id },
            include: { emailVerifications: true, passwordResets: true },
        });
        return row ? UserMapper.toDomain(row) : null;
    }

    async findByEmail(email: Email): Promise<User | null> {
        const row = await this.prisma.user.findUnique({
            where: { email: email.value },
            include: { emailVerifications: true, passwordResets: true },
        });
        return row ? UserMapper.toDomain(row) : null;
    }

    async findByVerificationToken(rawToken: string): Promise<User | null> {
        const verification = await this.prisma.emailVerification.findUnique({
            where: { token: rawToken },
            include: {
                user: { include: { emailVerifications: true, passwordResets: true } },
            },
        });
        return verification ? UserMapper.toDomain(verification.user) : null;
    }

    /**
     * 整聚合保存：在同一事务内 upsert User + 同步 pending 子表
     * Mapper 把聚合状态拆成 prisma 操作。
     */
    async save(user: User): Promise<void> {
        const ops = UserMapper.toPersistenceOps(user);
        await this.prisma.$transaction(ops);
    }

    // ... 其他方法
}
```

#### Mapper（领域 ↔ ORM）

```typescript
// modules/identity/infrastructure/persistence/user.mapper.ts
export class UserMapper {
    /** ORM row -> 聚合 */
    static toDomain(row: any): User {
        return User.rehydrate({
            id: row.id as UserId,
            email: Email.create(row.email),
            username: row.username ?? undefined,
            hashedPassword: row.password ? HashedPassword.fromHash(row.password) : undefined,
            isEmailVerified: row.isEmailVerified,
            isActive: row.isActive,
            pendingVerification: row.emailVerifications?.[0]
                ? EmailVerificationToken.restore(
                      row.emailVerifications[0].token,
                      row.emailVerifications[0].expiresAt,
                  )
                : undefined,
            pendingPasswordReset: row.passwordResets?.[0]
                ? PasswordResetTicket.restore({
                      value: row.passwordResets[0].token,
                      expiresAt: row.passwordResets[0].expiresAt,
                      usedAt: row.passwordResets[0].usedAt,
                  })
                : undefined,
            createdAt: row.createdAt,
            lastLoginAt: row.lastLoginAt ?? undefined,
        });
    }

    /** 聚合 -> 一组 prisma 操作（包装在事务里执行） */
    static toPersistenceOps(user: User) {
        const s = user.snapshot();
        return [
            this.upsertUser(s),
            ...this.syncPendingVerification(s),
            ...this.syncPendingPasswordReset(s),
        ];
    }

    private static upsertUser(s: ReturnType<User['snapshot']>) {
        return prisma.user.upsert({
            where: { id: s.id },
            create: {
                id: s.id,
                email: s.email.value,
                username: s.username,
                password: s.hashedPassword?.hash,
                isEmailVerified: s.isEmailVerified,
                isActive: s.isActive,
                createdAt: s.createdAt,
                lastLoginAt: s.lastLoginAt,
            },
            update: {
                email: s.email.value,
                username: s.username,
                password: s.hashedPassword?.hash,
                isEmailVerified: s.isEmailVerified,
                isActive: s.isActive,
                lastLoginAt: s.lastLoginAt,
            },
        });
    }
    // ... syncPendingVerification / syncPendingPasswordReset 略
}
```

> **关键洞察**：聚合的"整存整取"通过 Mapper 实现。Repository 暴露的接口看起来是 `save(user)` 一行，背后是一个事务里的多张表 upsert。这正好把"聚合即一致性边界"落到实处。

#### Bcrypt PasswordHasher 实现

```typescript
// modules/identity/infrastructure/crypto/bcrypt-password-hasher.ts
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordHasher } from '../../domain/services/password-hasher';
import { PlainPassword, HashedPassword } from '../../domain/model/password.vo';

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
    private readonly cost = 12;

    async hash(plain: PlainPassword): Promise<HashedPassword> {
        const hash = await bcrypt.hash(plain.value, this.cost);
        return HashedPassword.fromHash(hash);
    }

    async compare(plain: PlainPassword, hashed: HashedPassword): Promise<boolean> {
        return bcrypt.compare(plain.value, hashed.hash);
    }
}
```


### 5.9 接口层：Controller 只做协议适配

```typescript
// modules/identity/interface/http/users.controller.ts
@Controller('users')
export class UsersController {
    constructor(
        private readonly registerHandler: RegisterUserHandler,
        private readonly verifyEmailHandler: VerifyEmailHandler,
        private readonly changePasswordHandler: ChangePasswordHandler,
        private readonly profileQuery: FindUserProfileHandler,
    ) {}

    @Public()
    @Post('register')
    async register(@Body() dto: RegisterDto) {
        const { userId } = await this.registerHandler.execute({
            email: dto.email,
            password: dto.password,
            username: dto.username,
        });
        return { userId, message: '注册成功，请查收验证邮件' };
    }

    @Public()
    @Get('verify-email')
    async verifyEmail(@Query('token') token: string) {
        await this.verifyEmailHandler.execute({ token });
        return { ok: true };
    }

    // ... 其他端点
}
```

> **对比当前实现**：
>
> - 当前 `users.controller.ts:50-66` 在注册流程里直接调用 `emailService.sendVerificationEmail(...).catch(...)`——Controller 知道太多业务流程。
> - DDD 实现里 Controller 完全不知道邮件这回事——发邮件是 `UserRegistered` 事件订阅者的责任。

### 5.10 NestJS 模块装配

```typescript
// modules/identity/identity.module.ts
@Module({
    imports: [PrismaModule, EventBusModule],
    controllers: [UsersController],
    providers: [
        // domain 接口 -> infra 实现的绑定
        { provide: UserRepository, useClass: PrismaUserRepository },
        { provide: PasswordHasher, useClass: BcryptPasswordHasher },
        { provide: EmailNotifier, useClass: SmtpEmailNotifier },

        // application
        RegisterUserHandler,
        VerifyEmailHandler,
        ChangePasswordHandler,
        FindUserProfileHandler,

        // 事件订阅者（infra 层）
        UserRegisteredEmailHandler,
        PasswordResetEmailHandler,
    ],
    exports: [
        // 跨上下文复用：只暴露查询接口，不暴露聚合 / 仓储
        FindUserProfileHandler,
        UserCredentialQuery,
    ],
})
export class IdentityModule {}
```

> **关键**：`exports` 只暴露应用查询接口，**绝不暴露 `UserRepository` 或 `User` 聚合**。这样 Access 上下文要拿用户凭据，只能通过 `UserCredentialQuery`，不会绕过聚合直接改 User 状态。

---

## 6. 战术设计：Conversation 上下文要点

Conversation 是更复杂的上下文（涉及外部协议、流式、长事务），简要给出关键设计：

### 6.1 聚合结构

```typescript
class Conversation extends AggregateRoot<ConversationId> {
    private constructor(private state: {
        id: ConversationId;
        ownerId: UserId;
        title: string;
        turns: Turn[];                 // 子实体集合（受限引用）
        modelPreference?: ModelChoice; // 值对象
        status: ConversationStatus;
    }) { super(state.id); }

    static start(input: { ownerId: UserId; title: string }): Conversation { ... }

    /** 启动新一轮对话 */
    askQuestion(question: UserMessage, model: ModelChoice): Turn {
        if (this.hasActiveTurn()) throw new ConcurrentTurnError();
        const turn = Turn.create(this.id, question, model);
        this.state.turns.push(turn);
        this.addEvent(new TurnStarted(this.id, turn.id));
        return turn;
    }

    completeTurn(turnId: TurnId, answer: AssistantMessage, usage: TokenUsage): void { ... }
    interruptTurn(turnId: TurnId, reason: InterruptReason): void { ... }
}
```

### 6.2 Anti-Corruption Layer：包住 LangGraph

```typescript
// modules/conversation/infrastructure/llm/langgraph-runner.ts
// 这是 ACL：把 LangGraph 协议翻译成 Conversation 领域语言

@Injectable()
export class LangGraphTurnRunner {
    constructor(private readonly llmGateway: LlmGateway) {}

    /**
     * 输入：领域语言的 Turn
     * 输出：领域语言的事件流（不暴露 LangGraph 的 streamMode 细节）
     */
    async *run(turn: Turn): AsyncIterable<TurnEvent> {
        const graph = this.compileGraph(turn.model);
        const stream = await graph.stream(/* ... */);

        for await (const chunk of stream) {
            // 翻译 LangGraph 的 ['messages', payload] 到领域事件
            yield this.translateToTurnEvent(chunk);
        }
    }
}
```

> **核心**：当前 `ai.service.ts:executeRunProtocol` 把 LangGraph 协议、序列化、状态判定全部混在一起。引入 ACL 后，领域层只知道 `TurnEvent`，LangGraph 的概念被锁在 infra 层。如果将来换成 Vercel AI SDK 或自建 orchestrator，**领域层零修改**。

### 6.3 Conversation 上下文目录

```
modules/conversation/
  domain/
    model/
      conversation.aggregate.ts
      turn.entity.ts                    # 子实体
      user-message.vo.ts
      assistant-message.vo.ts
      model-choice.vo.ts
      token-usage.vo.ts
    events/
      conversation-started.event.ts
      turn-started.event.ts
      turn-completed.event.ts
    repositories/
      conversation.repository.ts
    services/
      turn-runner.ts                    # 接口
  application/
    commands/
      start-conversation.handler.ts
      ask-question.handler.ts
      cancel-turn.handler.ts
    queries/
      list-conversations.handler.ts
      get-conversation-history.handler.ts
  infrastructure/
    persistence/
      prisma-conversation.repository.ts
    llm/
      langgraph-turn-runner.ts          # ACL 实现
      providers/
        anthropic.adapter.ts
        openai.adapter.ts
  interface/
    http/
      conversations.controller.ts
    ws/
      conversation-stream.gateway.ts
```


---

## 7. 跨上下文集成：领域事件

### 7.1 UnitOfWork + Outbox 模式

```typescript
// shared-kernel/unit-of-work.ts
@Injectable()
export class UnitOfWork {
    constructor(
        private readonly prisma: PrismaService,
        private readonly eventBus: EventBus,
    ) {}

    async run<T>(fn: () => Promise<T>): Promise<T> {
        return this.prisma.$transaction(async tx => {
            // 在 AsyncLocalStorage 中注入 tx，让 Repository 在事务内执行
            return runWithTx(tx, async () => {
                const result = await fn();
                // 注：事件发布在事务提交之后；若需"恰好一次"语义用 Outbox 表
                return result;
            });
        }).then(async result => {
            await this.flushPendingEvents();
            return result;
        });
    }
}
```

### 7.2 事件订阅：跨上下文集成的唯一通道

```typescript
// modules/identity/infrastructure/notifications/user-registered.handler.ts
@Injectable()
export class UserRegisteredEmailHandler {
    constructor(private readonly notifier: EmailNotifier) {}

    @OnEvent('identity.user.registered')
    async handle(event: UserRegistered): Promise<void> {
        await this.notifier.sendVerificationEmail({
            to: event.email,
            token: event.verificationToken.value,
        });
    }
}
```

> **对比当前实现**：
> 当前 `users.controller.ts:50-66` Controller 在调用完 service 后，自己 `emailService.sendVerificationEmail(...).catch(...)`。
> DDD 实现里这段逻辑被替换成"聚合发事件 → 事件订阅者发邮件"，Controller 再也不知道邮件这件事。

### 7.3 跨 BC 集成示例

```typescript
// modules/conversation/interface/events/initialize-default-workspace.handler.ts
// 当 Identity 上下文有新用户注册时，Conversation 上下文订阅事件，给用户初始化默认对话空间

@Injectable()
export class InitializeDefaultWorkspaceHandler {
    constructor(private readonly handler: CreateDefaultWorkspaceHandler) {}

    @OnEvent('identity.user.registered')
    async handle(event: UserRegistered): Promise<void> {
        await this.handler.execute({ userId: event.userId });
    }
}
```

> 这就是上下文映射图里 Identity → Conversation 那条 `领域事件` 边的代码落地。两个上下文**互不依赖对方的领域模型**。

---

## 8. 测试策略

DDD 架构对测试金字塔的影响巨大：

| 测试类型 | 测试对象 | 是否需要 mock |
|---|---|---|
| **单元测试**（最多） | 聚合、值对象、领域服务 | 否，纯 TS 类，零依赖 |
| **应用层测试** | Command Handler | mock Repository、PasswordHasher |
| **集成测试**（少量） | 真 Prisma + 真 Redis | 用 testcontainers 起真实 DB |
| **E2E 测试**（最少） | HTTP/WS | 真实启动 Nest 应用 |

### 8.1 聚合单元测试（无依赖）

```typescript
describe('User aggregate', () => {
    it('throws when changing password to the same value', async () => {
        const user = await User.register({
            id: 'u1' as UserId,
            email: Email.create('a@b.com'),
            password: PlainPassword.create('OldPass123'),
            hasher: new FakeHasher(), // in-memory hasher
        });

        await expect(
            user.changePassword({
                oldPassword: PlainPassword.create('OldPass123'),
                newPassword: PlainPassword.create('OldPass123'),
                hasher: new FakeHasher(),
            }),
        ).rejects.toThrow(PasswordSameAsOldError);
    });

    it('emits UserRegistered event on register', async () => {
        const user = await User.register(/* ... */);
        const events = user.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(UserRegistered);
    });
});
```

> **观察**：聚合测试**不需要 NestJS、不需要 Prisma、不需要 mock Service**。这是 DDD 最直接的工程收益。当前项目里相关测试都需要 mock `PrismaService`，复杂且脆弱。

---

## 9. 渐进式迁移路径

完全重写不现实，给出 **5 阶段** 的迁移路线，每阶段独立可上线：

### Phase 1：建立 Shared Kernel（1 周）

- 添加 `shared-kernel/` 目录，引入 `AggregateRoot`、`ValueObject`、`DomainEvent` 基类。
- 建立 ESLint 分层约束。
- 引入轻量级 EventBus（直接用 `@nestjs/event-emitter` 即可）。

### Phase 2：重构 Identity（2-3 周）

- 按上面的目录结构搬运 `users/` + `auth/email-verification` + `auth/password-reset` 到 `modules/identity/`。
- 抽取 `User` 聚合，但**先保留旧的 service 调用方式**作为门面。
- 把 `UsersService.registerUser` 改为内部委派给 `RegisterUserHandler.execute`。
- 添加聚合单元测试。

### Phase 3：重构 Access（1-2 周）

- 把 `auth/login + refresh + token` 抽到 `modules/access/`。
- 创建 `Session` 聚合；`SessionRepository` 替代 `prisma.session` 直访。
- 通过 `UserCredentialQuery`（应用查询）从 Identity 拿密码哈希，停止 cross-import。

### Phase 4：重构 Conversation（3-4 周，最重）

- 重命名 `Thread → Conversation`、`Run → Turn`（保留旧表名做兼容）。
- 引入 `LangGraphTurnRunner` 作为 ACL，把 `ai.service.executeRunProtocol` 的协议翻译逻辑全部搬入。
- 拆 `AiChatService` 为多个 Handler：`StartConversationHandler` / `AskQuestionHandler` / `CancelTurnHandler`。

### Phase 5：清理与边界强化（持续）

- 删除已废弃的 `auth/` `users/` `ai/` 旧目录。
- 用 dependency-cruiser 或 madge 在 CI 里硬性校验分层约束。
- 写一份"如何添加一个用例"的开发者指南。

---

## 10. 进一步学习的资源

### 书籍

- **《领域驱动设计》Eric Evans**：原典，第 2、4、5、14 章必读。
- **《实现领域驱动设计》Vaughn Vernon**：实操指南，TS 风格的代码示例。
- **《领域驱动设计精粹》Vaughn Vernon**：薄册子，3 小时入门。
- **《整洁架构》Robert C. Martin**：四层架构与依赖反转的理论基础。

### 在线资源

- DDD Reference（Eric Evans 官方词汇表）：https://www.domainlanguage.com/ddd/reference/
- nestjs-ddd 模板：https://github.com/Sairyss/domain-driven-hexagon
- 事件风暴（Event Storming）方法：用便签纸画出业务事件的工作坊技术，是切分 Bounded Context 的最佳工具

### 项目内的参照

- `apps/server/src/auth/services/password.service.ts`：当前唯一干净的 Domain Service 候选。
- `apps/server/src/ai/llm/provider-registry.ts` + `llm-factory.ts`：当前已有 ACL 雏形。

---

## 附：核心概念速查表

| 概念 | 一句话定义 | 落地形式 |
|---|---|---|
| Bounded Context | 一个特定的领域语言模型有效的边界 | 一个 NestJS 模块 |
| Aggregate Root | 一致性边界的入口实体 | `class User extends AggregateRoot` |
| Entity | 有唯一标识、可变状态 | `class Turn`（带 id） |
| Value Object | 无标识、靠值相等、不可变 | `class Email` / `class HashedPassword` |
| Domain Service | 不属于任何聚合的领域行为 | `PasswordHasher`（接口） |
| Application Service | 用例编排，不写规则 | `RegisterUserHandler` |
| Repository | 聚合的持久化抽象 | `UserRepository`（接口） |
| Domain Event | 领域中发生过的事实 | `UserRegistered` |
| ACL | 防止外部模型污染领域 | `LangGraphTurnRunner` |
| Ubiquitous Language | 团队共享的领域词汇 | 类名/方法名/变量名 |

---

**最后更新**：2026-06-12

学习路径建议：
1. 先读 § 0-3 建立心智模型
2. 跟着 § 5（Identity 上下文）写一遍代码
3. 把当前 `users/` 模块按 § 9 Phase 2 实操迁移
4. 再回头看 § 6 处理 Conversation 这种复杂场景
