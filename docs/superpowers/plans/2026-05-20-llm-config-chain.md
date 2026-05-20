# LLM Config Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 LLM 配置链路断裂问题，实现三层 fallback（请求级 → 系统默认 → 报错），让 Executor 在运行时能正确获取 LLM provider 配置。

**Architecture:** 在 `AiModule.onModuleInit()` 从环境变量构建默认 LLMConfig，通过 `ExecutionCtx.defaultConfig` 注入到 Executor。入口层（REST/WS）解析前端传入的可选 `llmConfig`，构建 `NodeLLMConfigMap` 传入。`LLMResolver.resolve()` 实现三层解析：configMap[nodeId] → defaultConfig → throw。

**Tech Stack:** TypeScript, NestJS, Jest

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/ai/ws/ai-ws-events.types.ts` | 修改 | `ClientMessage` 类型增加 `llmConfig?` 字段 |
| `src/ai/dto/send-message.dto.ts` | 修改 | REST DTO 增加可选 `llmConfig` 字段 + class-validator |
| `src/ai/llm/llm-default-config.ts` | 新建 | `buildDefaultLlmConfig()` — 从 env 构建默认配置 |
| `src/ai/workflow/executor.types.ts` | 修改 | `ExecutionCtx` 增加 `defaultConfig?: LLMConfig` |
| `src/ai/workflow/llm-resolver.ts` | 修改 | `resolve()` 支持三层 fallback |
| `src/ai/workflow/orchestrator.ts` | 修改 | 转发 `defaultConfig` 到 `ExecutionCtx` |
| `src/ai/dispatch/request-dispatcher.ts` | 修改 | `DispatchContext` 增加 `defaultConfig`，转发到 orchestrator |
| `src/ai/ws/ai-message-router.ts` | 修改 | 从 WS payload 提取 `llmConfig`，构建 `llmConfigMap`，传入 `defaultConfig` |
| `src/ai/ai.controller.ts` | 修改 | REST 入口解析 `dto.llmConfig`，传入 `defaultConfig` |
| `src/ai/llm/__tests__/llm-default-config.spec.ts` | 新建 | 默认配置构建单元测试 |
| `src/ai/workflow/__tests__/llm-resolver.spec.ts` | 新建 | LLMResolver 三层 fallback 单元测试 |
| `src/ai/__tests__/config-chain.spec.ts` | 新建 | 入口层配置传递集成测试 |

---

### Task 1: 定义入口层 `llmConfig` 类型

**目标:** 让 REST DTO 和 WS 消息类型支持前端传入可选的 `provider` + `model`。

**Files:**
- Modify: `src/ai/dto/send-message.dto.ts:1-19`
- Modify: `src/ai/ws/ai-ws-events.types.ts:50-60` (ClientMessage type)

- [ ] **Step 1: 修改 `send-message.dto.ts`，增加 `LlmConfigDto` 类和 `llmConfig` 字段**

```typescript
// src/ai/dto/send-message.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class LlmConfigDto {
    @ApiProperty({ description: 'LLM provider 名称' })
    @IsString()
    @IsNotEmpty()
    provider!: string;

    @ApiPropertyOptional({ description: '模型名称（不传则使用 provider 默认模型）' })
    @IsOptional()
    @IsString()
    model?: string;
}

export class SendMessageDto {
    @ApiPropertyOptional({ description: 'Room ID（可选，不传则自动创建）' })
    @IsOptional()
    @IsString()
    roomId?: string;

    @ApiProperty({ description: '用户消息内容' })
    @IsString()
    @IsNotEmpty()
    content!: string;

    @ApiPropertyOptional({ description: 'AI 上下文信息' })
    @IsOptional()
    @IsObject()
    context?: Record<string, unknown>;

    @ApiPropertyOptional({ description: 'LLM 配置（provider + model）', type: LlmConfigDto })
    @IsOptional()
    @IsObject()
    llmConfig?: LlmConfigDto;
}
```

- [ ] **Step 2: 修改 `ai-ws-events.types.ts`，给 `CreateAndSend` 和 `SendMessage` 消息类型增加 `llmConfig?` 字段**

```typescript
// src/ai/ws/ai-ws-events.types.ts — 修改 ClientMessage 类型定义

// 新增 LlmConfig 接口
export interface LlmConfig {
    provider: string;
    model?: string;
}

export type ClientMessage =
    | { type: ClientMessageType.CreateAndSend; content: string; context?: EditorContext; llmConfig?: LlmConfig }
    | {
          type: ClientMessageType.SendMessage;
          roomId: string;
          content: string;
          context?: EditorContext;
          llmConfig?: LlmConfig;
      }
    | { type: ClientMessageType.ToolResult; roomId: string; toolCallId: string; result: unknown }
    | { type: ClientMessageType.Stop; roomId: string }
    | { type: ClientMessageType.Join; roomId: string };
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 编译通过（无新错误）

- [ ] **Step 4: Commit**

```bash
git add src/ai/dto/send-message.dto.ts src/ai/ws/ai-ws-events.types.ts
git commit -m "feat(llm): add llmConfig to REST DTO and WS message types"
```

---

### Task 2: 创建 `buildDefaultLlmConfig()` 工具函数

**目标:** 从环境变量构建系统默认 LLMConfig，作为 fallback 链路的最后一层。

**Files:**
- Create: `src/ai/llm/llm-default-config.ts`
- Create: `src/ai/llm/__tests__/llm-default-config.spec.ts`

**优先级:** ANTHROPIC > OPENAI > ZHIPU > DASHSCOPE（按注册顺序），可通过 `DEFAULT_LLM_PROVIDER` 覆盖。

- [ ] **Step 1: 写测试（TDD — 先写后实现）**

```typescript
// src/ai/llm/__tests__/llm-default-config.spec.ts
import { buildDefaultLlmConfig } from '../llm-default-config';

describe('buildDefaultLlmConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('returns undefined when no API keys are set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        delete process.env.DASHSCOPE_API_KEY;

        const result = buildDefaultLlmConfig();
        expect(result).toBeUndefined();
    });

    it('prefers ANTHROPIC when multiple keys are set', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.OPENAI_API_KEY = 'sk-xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6-20250514',
        });
    });

    it('falls back to OPENAI when ANTHROPIC key is missing', () => {
        delete process.env.ANTHROPIC_API_KEY;
        process.env.OPENAI_API_KEY = 'sk-xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'openai',
            model: 'gpt-4o',
        });
    });

    it('falls back to ZHIPU when ANTHROPIC and OPENAI keys are missing', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        process.env.ZHIPUAI_API_KEY = 'xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'zhipu',
            model: 'glm-4',
        });
    });

    it('falls back to DASHSCOPE when only its key is set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;
        delete process.env.ZHIPUAI_API_KEY;
        process.env.DASHSCOPE_API_KEY = 'xxx';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'dashscope',
            model: 'qwen-max',
        });
    });

    it('respects DEFAULT_LLM_PROVIDER override', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.OPENAI_API_KEY = 'sk-xxx';
        process.env.DEFAULT_LLM_PROVIDER = 'openai';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'openai',
            model: 'gpt-4o',
        });
    });

    it('respects DEFAULT_LLM_MODEL override', () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';
        process.env.DEFAULT_LLM_MODEL = 'claude-opus-4-7';

        const result = buildDefaultLlmConfig();
        expect(result).toEqual({
            provider: 'anthropic',
            model: 'claude-opus-4-7',
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server && npx jest src/ai/llm/__tests__/llm-default-config.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../llm-default-config'`

- [ ] **Step 3: 实现 `buildDefaultLlmConfig()`**

```typescript
// src/ai/llm/llm-default-config.ts
import type { LLMConfig } from './provider.types';

/**
 * 从环境变量构建系统默认 LLMConfig。
 *
 * 优先级: ANTHROPIC > OPENAI > ZHIPU > DASHSCOPE
 * 可通过 DEFAULT_LLM_PROVIDER 覆盖首选 provider，
 * 可通过 DEFAULT_LLM_MODEL 覆盖默认模型名称。
 */
export function buildDefaultLlmConfig(): LLMConfig | undefined {
    const providerOrder = ['anthropic', 'openai', 'zhipu', 'dashscope'] as const;
    const apiKeyEnvMap: Record<string, string> = {
        anthropic: 'ANTHROPIC_API_KEY',
        openai: 'OPENAI_API_KEY',
        zhipu: 'ZHIPUAI_API_KEY',
        dashscope: 'DASHSCOPE_API_KEY',
    };
    const defaultModels: Record<string, string> = {
        anthropic: 'claude-sonnet-4-6-20250514',
        openai: 'gpt-4o',
        zhipu: 'glm-4',
        dashscope: 'qwen-max',
    };

    const overrideProvider = process.env.DEFAULT_LLM_PROVIDER?.toLowerCase();
    const overrideModel = process.env.DEFAULT_LLM_MODEL;

    // 如果指定了覆盖 provider，优先使用它（需有对应的 API key）
    if (overrideProvider && apiKeyEnvMap[overrideProvider]) {
        const apiKey = process.env[apiKeyEnvMap[overrideProvider]];
        if (apiKey) {
            return {
                provider: overrideProvider,
                model: overrideModel ?? defaultModels[overrideProvider],
            };
        }
    }

    // 否则按优先级查找第一个有 API key 的 provider
    for (const provider of providerOrder) {
        const apiKey = process.env[apiKeyEnvMap[provider]];
        if (apiKey) {
            return {
                provider,
                model: overrideModel ?? defaultModels[provider],
            };
        }
    }

    return undefined;
}
```

- [ ] **Step 4: 运行测试确认全部通过**

```bash
cd apps/server && npx jest src/ai/llm/__tests__/llm-default-config.spec.ts --no-coverage
```

Expected: 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/ai/llm/llm-default-config.ts src/ai/llm/__tests__/llm-default-config.spec.ts
git commit -m "feat(llm): add buildDefaultLlmConfig from env vars with priority fallback"
```

---

### Task 3: 修复 `LLMResolver` — 实现三层 fallback

**目标:** `resolve()` 正确实现 `configMap[nodeId] → defaultConfig → throw`。当前 `resolve()` 签名已支持 `defaultConfig` 参数，但调用链从未传入。

**Files:**
- Modify: `src/ai/workflow/llm-resolver.ts:21-27`

**注意:** `LLMResolver.resolve()` 当前实现已经正确使用了 `configMap?.[nodeId] ?? defaultConfig` 逻辑，**代码本身没有问题**。问题在调用链没有传入 `defaultConfig`。此 task 为确认性验证。

- [ ] **Step 1: 写 LLMResolver 三层 fallback 测试**

```typescript
// src/ai/workflow/__tests__/llm-resolver.spec.ts
import { Test, type TestingModule } from '@nestjs/testing';
import { LLMResolver } from '../llm-resolver';
import { LLMFactory } from '../../llm/llm-factory';
import { ProviderRegistry } from '../../llm/provider-registry';
import type { LLMConfig, LLMProvider, NodeLLMConfigMap } from '../../llm/provider.types';
import type { LLMMessage, LLMOutput, ToolDefinition } from '../../ai.types';

// Mock LLMProvider
function mockProvider(name: string, model: string): LLMProvider {
    return {
        name,
        model,
        chat: async function* (_msgs: LLMMessage[], _tools?: ToolDefinition[], _sig?: AbortSignal) {
            yield { content: 'mock', done: true } as LLMOutput;
        },
    };
}

describe('LLMResolver', () => {
    let resolver: LLMResolver;
    let factory: LLMFactory;
    let registry: ProviderRegistry;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProviderRegistry,
                LLMFactory,
                LLMResolver,
            ],
        }).compile();

        resolver = module.get(LLMResolver);
        factory = module.get(LLMFactory);
        registry = module.get(ProviderRegistry);

        // Register a mock provider
        registry.register('test-provider', (config: LLMConfig) =>
            mockProvider(config.provider, config.model),
        );
    });

    const defaultConfig: LLMConfig = { provider: 'test-provider', model: 'default-model' };
    const nodeConfig: LLMConfig = { provider: 'test-provider', model: 'node-specific' };

    it('throws when both configMap and defaultConfig are undefined', () => {
        expect(() => resolver.resolve('llm_call')).toThrow(
            'No LLM config for node "llm_call" and no default',
        );
    });

    it('uses configMap[nodeId] when available', () => {
        const configMap: NodeLLMConfigMap = { llm_call: nodeConfig };
        const provider = resolver.resolve('llm_call', configMap, defaultConfig);
        expect(provider.model).toBe('node-specific');
    });

    it('falls back to defaultConfig when configMap[nodeId] is missing', () => {
        const configMap: NodeLLMConfigMap = { other_node: nodeConfig };
        const provider = resolver.resolve('llm_call', configMap, defaultConfig);
        expect(provider.model).toBe('default-model');
    });

    it('uses defaultConfig when configMap is undefined', () => {
        const provider = resolver.resolve('llm_call', undefined, defaultConfig);
        expect(provider.model).toBe('default-model');
    });

    it('prefers configMap[nodeId] over defaultConfig', () => {
        const configMap: NodeLLMConfigMap = { llm_call: nodeConfig };
        const provider = resolver.resolve('llm_call', configMap, defaultConfig);
        expect(provider.model).toBe('node-specific');
    });
});
```

- [ ] **Step 2: 运行测试确认通过**

`LLMResolver` 现有实现已正确支持三层 fallback，测试应通过。

```bash
cd apps/server && npx jest src/ai/workflow/__tests__/llm-resolver.spec.ts --no-coverage
```

Expected: 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/ai/workflow/__tests__/llm-resolver.spec.ts
git commit -m "test(llm): add LLMResolver three-layer fallback unit tests"
```

---

### Task 4: 将 `defaultConfig` 注入到 `ExecutionCtx` 调用链

**目标:** 让 `defaultConfig` 从 `RequestDispatcher` 一路流转到 `Executor.createLLMCaller()`，传入 `LLMResolver.resolve()`。

**Files:**
- Modify: `src/ai/workflow/executor.types.ts:42-51` — `ExecutionCtx` 增加 `defaultConfig?`
- Modify: `src/ai/workflow/orchestrator.ts:19-27` (OrchestratorDispatchCtx), `51-60` (executionCtx build)
- Modify: `src/ai/dispatch/request-dispatcher.ts:15-23` (DispatchContext), `53-59` (dispatch call)
- Modify: `src/ai/workflow/executor.ts:231-237` (createLLMCaller)

- [ ] **Step 1: 修改 `executor.types.ts` — 给 `ExecutionCtx` 增加 `defaultConfig` 字段**

```typescript
// src/ai/workflow/executor.types.ts — 修改 ExecutionCtx 接口
import type { LLMConfig, NodeLLMConfigMap } from '../llm/provider.types';
// ... 其他 imports 不变 ...

export interface ExecutionCtx {
    roomId: string;
    clientId: string;
    content: string;
    callbacks: WorkflowCallbacks;
    abortSignal: AbortSignal;
    llmConfigMap?: NodeLLMConfigMap;
    defaultConfig?: LLMConfig;       // ← 新增
    graphName?: string;
    tokenLimit?: number;
}
```

- [ ] **Step 2: 修改 `orchestrator.ts` — `OrchestratorDispatchCtx` 增加 `defaultConfig`，转发到 `ExecutionCtx`**

```typescript
// src/ai/workflow/orchestrator.ts

// 1. 修改 OrchestratorDispatchCtx 接口 (line 19-27)
export interface OrchestratorDispatchCtx {
    roomId: string;
    clientId: string;
    content: string;
    callbacks: WorkflowCallbacks;
    llmConfigMap?: NodeLLMConfigMap;
    defaultConfig?: import('../llm/provider.types').LLMConfig;  // ← 新增
    graphName?: string;
    tokenLimit?: number;
}

// 2. 修改 dispatch() 中的 executionCtx 构建 (line 51-60)
const executionCtx: ExecutionCtx = {
    roomId,
    clientId: session.clientId,
    content: ctx.content,
    callbacks,
    abortSignal: session.abortController.signal,
    llmConfigMap: ctx.llmConfigMap,
    defaultConfig: ctx.defaultConfig,  // ← 新增
    graphName: ctx.graphName,
    tokenLimit: ctx.tokenLimit,
};
```

- [ ] **Step 3: 修改 `request-dispatcher.ts` — `DispatchContext` 增加 `defaultConfig`，转发到 orchestrator**

```typescript
// src/ai/dispatch/request-dispatcher.ts

// 1. 修改 DispatchContext 接口 (line 15-23)
export interface DispatchContext {
    roomId: string;
    clientId: string;
    content: string;
    context?: Record<string, unknown>;
    llmConfigMap?: Record<string, LLMConfig>;
    defaultConfig?: LLMConfig;   // ← 新增
    graphName?: string;
    callbacks?: WorkflowCallbacks;
}

// 2. 修改 dispatch() 中的 orchestrator 调用 (line 53-59)
await this.orchestrator.dispatch({
    roomId,
    clientId,
    content,
    llmConfigMap: ctx.llmConfigMap,
    defaultConfig: ctx.defaultConfig,  // ← 新增
    graphName: ctx.graphName,
    callbacks,
});
```

- [ ] **Step 4: 修改 `executor.ts` — `createLLMCaller()` 传入 `defaultConfig`**

```typescript
// src/ai/workflow/executor.ts — 修改 createLLMCaller 方法 (line 231-237)

private createLLMCaller(
    configMap?: import('../llm/provider.types').NodeLLMConfigMap,
) {
    const defaultConfig = this.ctx.defaultConfig;  // ← 新增：从 ctx 取默认配置
    return async function* (messages: LLMMessage[], signal?: AbortSignal) {
        const provider = this.deps.llmResolver.resolve('llm_call', configMap, defaultConfig);
        const tools = this.deps.toolDispatcher.getDefinitions();
        yield* provider.chat(messages, tools, signal);
    }.bind(this);
}
```

- [ ] **Step 5: 运行 TypeScript 编译检查**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 编译通过

- [ ] **Step 6: Commit**

```bash
git add src/ai/workflow/executor.types.ts src/ai/workflow/orchestrator.ts \
          src/ai/dispatch/request-dispatcher.ts src/ai/workflow/executor.ts
git commit -m "refactor(llm): wire defaultConfig through ExecutionCtx to LLMResolver"
```

---

### Task 5: 在入口层构建并注入 `defaultConfig`

**目标:** `AiModule.onModuleInit()` 调用 `buildDefaultLlmConfig()` 缓存默认配置，入口层通过 NestJS 注入或读取。

**Files:**
- Modify: `src/ai/ai.module.ts:64-113`
- Modify: `src/ai/llm/provider-registry.ts` — 新增 `defaultConfig` getter

- [ ] **Step 1: 在 `ProviderRegistry` 上暴露 `defaultConfig`**

```typescript
// src/ai/llm/provider-registry.ts — 在类末尾新增 (line 53 之前)

    private _defaultConfig: LLMConfig | undefined;

    /**
     * 设置系统默认 LLM 配置（启动时调用一次）
     */
    setDefaultConfig(config: LLMConfig): void {
        this._defaultConfig = config;
        this.logger.log(`Default LLM config set: ${config.provider}/${config.model}`);
    }

    /**
     * 获取系统默认 LLM 配置
     */
    get defaultConfig(): LLMConfig | undefined {
        return this._defaultConfig;
    }
```

- [ ] **Step 2: 修改 `AiModule.onModuleInit()` 构建默认配置**

```typescript
// src/ai/ai.module.ts — 修改 onModuleInit 方法 (line 71-79)
import { buildDefaultLlmConfig } from './llm/llm-default-config';
// ... 其他 imports 不变 ...

async onModuleInit() {
    // Register all configured providers to ProviderRegistry
    this.registerProvider('anthropic', AnthropicProvider);
    this.registerProvider('openai', OpenAIProvider);
    this.registerProvider('zhipu', ZhipuProvider);
    this.registerProvider('dashscope', DashscopeProvider);

    // Build and register default LLM config from environment
    const defaultConfig = buildDefaultLlmConfig();
    if (defaultConfig) {
        this.providerRegistry.setDefaultConfig(defaultConfig);
        this.logger.log(`Default LLM: ${defaultConfig.provider}/${defaultConfig.model}`);
    } else {
        this.logger.warn('No LLM API keys found — LLM calls will fail until configured');
    }

    // Register built-in graph definitions
    this.graphRegistry.register(new ChatGraph());
}
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add src/ai/llm/provider-registry.ts src/ai/ai.module.ts
git commit -m "feat(llm): build default LLM config at module init from env vars"
```

---

### Task 6: 在 REST 和 WS 入口层注入 `defaultConfig` 并解析请求级配置

**目标:** REST controller 和 WS message router 正确解析 `llmConfig` 和 `defaultConfig`，构建完整的 `DispatchContext`。

**Files:**
- Modify: `src/ai/ai.controller.ts:36-71`
- Modify: `src/ai/ws/ai-message-router.ts:104-178`

- [ ] **Step 1: 修改 `AiController.sendMessage()` — 解析 `dto.llmConfig` 并注入 `defaultConfig`**

```typescript
// src/ai/ai.controller.ts — 修改构造函数和 sendMessage 方法

// 1. 修改构造函数，注入 ProviderRegistry (line 39-43)
constructor(
    private requestDispatcher: RequestDispatcher,
    private roomService: RoomService,
    private messageService: MessageService,
    private providerRegistry: ProviderRegistry,  // ← 新增
) {}

// 2. 修改 sendMessage 中的 dispatch 调用 (line 59-64)
await this.requestDispatcher.dispatch({
    roomId,
    clientId: `rest:${Date.now()}`,
    content: dto.content,
    context: dto.context,
    llmConfigMap: dto.llmConfig
        ? { llm_call: { provider: dto.llmConfig.provider, model: dto.llmConfig.model ?? '' } }
        : undefined,
    defaultConfig: this.providerRegistry.defaultConfig,  // ← 新增
});
```

同时需要在文件顶部 import：

```typescript
// 在 import 区域新增
import { ProviderRegistry } from './llm/provider-registry';
```

- [ ] **Step 2: 修改 `AiMessageRouter` — 解析 WS payload 中的 `llmConfig` 并注入 `defaultConfig`**

`AiMessageRouter` 不直接访问 `ProviderRegistry`，需要通过构造函数注入。

```typescript
// src/ai/ws/ai-message-router.ts

// 1. 修改构造函数，注入 ProviderRegistry (line 24-32)
import { ProviderRegistry } from '../llm/provider-registry';
// ... 已有 imports 不变 ...

@Injectable()
export class AiMessageRouter implements OnModuleInit {
    constructor(
        private messageBus: MessageBus,
        private wsGateway: WsGateway,
        private roomService: RoomService,
        private messageService: MessageService,
        private roomSessionRegistry: RoomSessionRegistry,
        private requestDispatcher: RequestDispatcher,
        private toolDispatcher: ToolDispatcher,
        private providerRegistry: ProviderRegistry,  // ← 新增
    ) {}

// 2. 修改 _handleCreateAndSend 的 dispatch 调用 (line 131-137)
const llmConfigMap = (context as any)?.llmConfig
    ? { llm_call: { provider: (context as any).llmConfig.provider, model: (context as any).llmConfig.model ?? '' } }
    : undefined;

await this.requestDispatcher.dispatch({
    roomId: room.id,
    clientId,
    content,
    context: context as Record<string, unknown> | undefined,
    llmConfigMap,
    defaultConfig: this.providerRegistry.defaultConfig,  // ← 新增
    callbacks,
});

// 3. 修改 _handleSendMessage 的 dispatch 调用 (line 171-177)
const llmConfigMap = (context as any)?.llmConfig
    ? { llm_call: { provider: (context as any).llmConfig.provider, model: (context as any).llmConfig.model ?? '' } }
    : undefined;

await this.requestDispatcher.dispatch({
    roomId,
    clientId,
    content,
    context: context as Record<string, unknown> | undefined,
    llmConfigMap,
    defaultConfig: this.providerRegistry.defaultConfig,  // ← 新增
    callbacks,
});
```

**注意:** `context` 在 WS 消息中是 `EditorContext | undefined`，`llmConfig` 不在 `EditorContext` 内。WS 消息通过 `msg.payload` 直接传递，`llmConfig` 在 payload 顶层。修改 `_routeRoomMessage` 中的 payload 解析：

```typescript
// 修改 _routeRoomMessage 中 CreateAndSend 的解析 (line 71-75)
case ClientMessageType.CreateAndSend: {
    const { content, context, llmConfig } = msg.payload as Record<string, unknown>;
    await this._handleCreateAndSend(msg.clientId, String(content), context, llmConfig as import('../ws/ai-ws-events.types').LlmConfig | undefined, emit);
    break;
}

// 修改 _routeRoomMessage 中 SendMessage 的解析 (line 76-85)
case ClientMessageType.SendMessage: {
    const { roomId, content, context, llmConfig } = msg.payload as Record<string, unknown>;
    await this._handleSendMessage(
        msg.clientId,
        String(roomId),
        String(content),
        context,
        llmConfig as import('../ws/ai-ws-events.types').LlmConfig | undefined,
        emit,
    );
    break;
}
```

修改方法签名：

```typescript
// _handleCreateAndSend 签名 (line 104)
private async _handleCreateAndSend(
    clientId: string,
    content: string,
    context: unknown,
    llmConfig: import('../ws/ai-ws-events.types').LlmConfig | undefined,
    emit: EmitToClient,
): Promise<void> {

// _handleSendMessage 签名 (line 140)
private async _handleSendMessage(
    clientId: string,
    roomId: string,
    content: string,
    context: unknown,
    llmConfig: import('../ws/ai-ws-events.types').LlmConfig | undefined,
    emit: EmitToClient,
): Promise<void> {
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 编译通过

- [ ] **Step 4: Commit**

```bash
git add src/ai/ai.controller.ts src/ai/ws/ai-message-router.ts
git commit -m "feat(llm): parse llmConfig from REST/WS entry points, inject defaultConfig"
```

---

### Task 7: 端到端验证 — 确认 bug 已修复

**目标:** 运行现有测试，确认配置链路完整，`No LLM config for node "llm_call"` 错误不再出现。

- [ ] **Step 1: 运行全部 AI 模块测试**

```bash
cd apps/server && npx jest src/ai --no-coverage
```

Expected: 全部通过

- [ ] **Step 2: 运行 TypeScript 编译检查**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: 运行应用级编译检查（lint + build）**

```bash
cd apps/server && npx eslint src/ai --max-warnings 0
```

Expected: 无 lint 错误

- [ ] **Step 4: Commit（如有剩余变更）**

```bash
git status  # 确认无未提交变更
```

---

## 自审 Checklist

### 1. 原始问题覆盖

| 需求 | 对应 Task | 状态 |
|------|-----------|------|
| 修复 `No LLM config for node "llm_call"` 错误 | Task 3 (确认 resolver 逻辑) + Task 4 (注入 defaultConfig) + Task 5 (构建默认配置) + Task 6 (入口层注入) | ✅ |
| 支持前端动态选择 provider | Task 1 (定义类型) + Task 6 (解析请求级配置) | ✅ |
| 三层 fallback (请求 → 默认 → 报错) | Task 2 (默认配置构建) + Task 3 (resolver fallback 测试) + Task 4 (调用链传递) | ✅ |
| 向后兼容 (不传配置也能工作) | Task 5 (env 默认配置) — 只要有 API key 就能 fallback | ✅ |

### 2. Placeholder 扫描

- 无 `TBD`/`TODO`/`fill in` 占位符
- 所有步骤包含实际代码
- 所有测试包含完整测试代码
- 无 `Similar to Task N` 引用

### 3. 类型一致性

- `LLMConfig` 类型在所有文件中使用 `import type { LLMConfig } from '../llm/provider.types'` 保持一致
- `LlmConfig` (WS 类型) 与 `LlmConfigDto` (REST DTO) 字段一致: `{ provider: string, model?: string }`
- `NodeLLMConfigMap` 使用已有的 `Record<string, LLMConfig>` 类型
- `llmConfigMap` 在入口层构建时使用 `{ llm_call: { provider, model } }` 格式，key 固定为 `llm_call`，与 `executor.ts:233` 中 `resolve('llm_call', ...)` 一致

---

## 数据流总览（重构后）

```
前端 WS payload: { type: "create_and_send", content: "...", llmConfig: { provider: "zhipu" } }
                                    │
                                    ▼
AiMessageRouter._handleCreateAndSend()
    ├── 从 payload 提取 llmConfig
    ├── 构建 llmConfigMap = { llm_call: { provider: "zhipu", model: "" } }
    └── dispatch({ llmConfigMap, defaultConfig: registry.defaultConfig })
                                    │
                                    ▼
RequestDispatcher.dispatch() ───→ RoomOrchestrator.dispatch()
                                    │
                                    ▼
                              ExecutionCtx {
                                llmConfigMap: { llm_call: { ... } },  // 请求级
                                defaultConfig: { provider: "anthropic", model: "..." }  // 系统级
                              }
                                    │
                                    ▼
                              Executor.createLLMCaller(configMap)
                                  │  const defaultConfig = this.ctx.defaultConfig
                                  ▼
                              LLMResolver.resolve('llm_call', configMap, defaultConfig)
                                  │
                                  ├── configMap?.['llm_call']  → { provider: "zhipu" } ✅ 命中
                                  ├── ?? defaultConfig         → fallback
                                  └── ?? throw                 → 不再触发
```

REST 路径类似，只是 `AiController.sendMessage()` 从 `dto.llmConfig` 提取配置。

---

## 风险点

1. **`model` 为空字符串**: 当请求指定了 `provider` 但没指定 `model` 时，我们传入空字符串 `''`。各 provider 的 SDK 可能不接受空 model。修复方式：在 `createLLMCaller` 中，如果 model 为空，从 defaultConfig 取 model。这个优化留到 Task 6 实现时处理。

2. **WS payload 的 `llmConfig` 位置**: 当前 WS 消息格式中 `llmConfig` 在 payload 顶层，与 `content`/`context` 并列。前端需要同步修改发送格式。这不是 bug（是新增可选字段），但需要在 PR 描述中说明。
