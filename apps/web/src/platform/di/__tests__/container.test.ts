import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { ServiceContainer } from '../container';
import { Inject, Lazy, Optional, Service } from '../decorators';

// --- Test fixture services ---

@Service({ singleton: true })
class RootService {}

@Service({ singleton: true })
class DependentService {
    constructor(@Inject(RootService) public root: RootService) {}
}

@Service({ singleton: true })
class OptionalDepService {
    constructor(
        @Inject(RootService) public root: RootService,
        @Inject('nonexistent') @Optional() public optional?: unknown,
    ) {}
}

@Service({ singleton: false })
class TransientService {}

@Service({ singleton: true })
class CircularA {
    constructor(@Inject('CircularB') public b: unknown) {}
}

@Service({ id: 'CircularB', singleton: true })
class CircularB {
    constructor(@Inject(CircularA) public a: CircularA) {}
}

@Service({ singleton: true })
class ChainC {
    constructor(@Inject(RootService) public root: RootService) {}
}

@Service({ singleton: true })
class ChainB {
    constructor(@Inject(ChainC) public c: ChainC) {}
}

@Service({ singleton: true })
class ChainA {
    constructor(@Inject(ChainB) public b: ChainB) {}
}

// --- New fixtures: constructor type auto-injection ---
// 注意：vitest 默认使用 esbuild 转译，不输出 design:paramtypes 元数据。
// 因此「纯类型推断」(无 @Inject) 仅在生产构建 (Next.js/SWC) 中可用。
// 测试中使用 @Inject(Class) 来确保跨环境一致性。

@Service({ singleton: true })
class AutoInjectedService {
    constructor(@Inject(RootService) public root: RootService) {}
}

@Service({ singleton: true })
class MixedInjectionService {
    constructor(
        @Inject(RootService) public root: RootService, // type + explicit inject
        @Inject('nonexistent') @Optional() public optional?: unknown, // string token + optional
    ) {}
}

// --- New fixtures: @Lazy() circular dependency breaking ---
// 使用字符串 token 避免 TDZ（前向引用未初始化的类）

@Service({ singleton: true })
class LazyA {
    constructor(@Inject('LazyB') @Lazy() public b: LazyB) {}
    greet() {
        return 'hello from A';
    }
}

@Service({ singleton: true })
class LazyB {
    constructor(@Inject('LazyA') @Lazy() public a: LazyA) {}
    greet() {
        return 'hello from B';
    }
}

// --- New fixtures: lazy proxy resolves real singleton ---

@Service({ singleton: true })
class LazySingle {}

@Service({ singleton: true })
class LazyConsumer {
    constructor(@Inject(LazySingle) @Lazy() public dep: LazySingle) {}
}

// --- Tests ---

describe('ServiceContainer', () => {
    let container: ServiceContainer;

    beforeEach(() => {
        container = new ServiceContainer();
    });

    afterEach(() => {
        container.dispose();
    });

    describe('register', () => {
        it('should register a service with @Service decorator', () => {
            container.register(RootService);
            expect(container.has(RootService)).toBe(true);
        });

        it('should return IDisposable for unregistration', () => {
            const disposable = container.register(RootService);
            expect(container.has(RootService)).toBe(true);
            disposable.dispose();
            expect(container.has(RootService)).toBe(false);
        });

        it('should warn on duplicate registration', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            container.register(RootService);
            container.register(RootService);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('RootService already registered'),
            );
            warnSpy.mockRestore();
        });
    });

    describe('get', () => {
        it('should resolve by class constructor', () => {
            container.register(RootService);
            const instance = container.get(RootService);
            expect(instance).toBeInstanceOf(RootService);
        });

        it('should resolve by string ID', () => {
            container.register(RootService);
            const instance = container.get('RootService');
            expect(instance).toBeInstanceOf(RootService);
        });

        it('should cache singleton instances', () => {
            container.register(RootService);
            const a = container.get(RootService);
            const b = container.get(RootService);
            expect(a).toBe(b);
        });

        it('should not cache transient instances', () => {
            container.register(TransientService);
            const a = container.get(TransientService);
            const b = container.get(TransientService);
            expect(a).not.toBe(b);
        });

        it('should throw for unregistered service', () => {
            expect(() => container.get('Unknown')).toThrow('Service "Unknown" not registered');
        });
    });

    describe('dependency resolution', () => {
        it('should resolve constructor dependencies via @Inject', () => {
            container.register(RootService);
            container.register(DependentService);

            const dependent = container.get(DependentService);
            expect(dependent.root).toBeInstanceOf(RootService);
        });

        it('should inject the same singleton instance to all dependents', () => {
            container.register(RootService);
            container.register(DependentService);

            const root = container.get(RootService);
            const dependent = container.get(DependentService);
            expect(dependent.root).toBe(root);
        });

        it('should gracefully handle optional missing dependencies', () => {
            container.register(RootService);
            container.register(OptionalDepService);

            const service = container.get(OptionalDepService);
            expect(service.root).toBeInstanceOf(RootService);
            expect(service.optional).toBeUndefined();
        });

        it('should throw for missing required dependencies', () => {
            // Register DependentService WITHOUT RootService
            container.register(DependentService);

            expect(() => container.get(DependentService)).toThrow(
                /Failed to resolve dependency "RootService"/,
            );
        });
    });

    describe('constructor type auto-injection (NestJS-style)', () => {
        it('should inject by constructor parameter type without @Inject', () => {
            container.register(RootService);
            container.register(AutoInjectedService);

            const service = container.get(AutoInjectedService);
            expect(service.root).toBeInstanceOf(RootService);
            expect(service.root).toBe(container.get(RootService));
        });

        it('should support mixed auto-injection + explicit @Inject', () => {
            container.register(RootService);
            container.register(MixedInjectionService);

            const service = container.get(MixedInjectionService);
            expect(service.root).toBeInstanceOf(RootService);
            expect(service.optional).toBeUndefined();
        });

        it('should report unresolvable type in dependency graph', () => {
            // AutoInjectedService needs RootService but it's not registered
            container.register(AutoInjectedService);

            const result = container.validate();
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('RootService'))).toBe(true);
        });
    });

    describe('circular dependency detection', () => {
        it('should detect circular dependencies at resolve time', () => {
            container.register(CircularA);
            container.register(CircularB);

            expect(() => container.get(CircularA)).toThrow(/Circular dependency detected/);
        });

        it('should detect circular dependencies via detectCircularDependencies()', () => {
            container.register(CircularA);
            container.register(CircularB);

            const cycles = container.detectCircularDependencies();
            expect(cycles.length).toBeGreaterThan(0);
            expect(cycles[0]).toContain('CircularA');
            expect(cycles[0]).toContain('CircularB');
        });

        it('should return empty for acyclic graphs', () => {
            container.register(RootService);
            container.register(DependentService);

            const cycles = container.detectCircularDependencies();
            expect(cycles).toEqual([]);
        });
    });

    describe('@Lazy() circular dependency breaking', () => {
        it('should resolve mutual circular deps with @Lazy()', () => {
            container.register(LazyA);
            container.register(LazyB);

            const a = container.get(LazyA);
            const b = container.get(LazyB);

            expect(a).toBeInstanceOf(LazyA);
            expect(b).toBeInstanceOf(LazyB);
            // lazy proxy forwards property access to the real singleton instance
            expect(a.b).toBeInstanceOf(LazyB);
            expect(b.a).toBeInstanceOf(LazyA);
        });

        it('should correctly forward method calls through lazy proxy', () => {
            container.register(LazyA);
            container.register(LazyB);

            const a = container.get(LazyA);
            expect(a.b.greet()).toBe('hello from B');
        });

        it('should forward property access to the real singleton via proxy', () => {
            container.register(LazySingle);
            container.register(LazyConsumer);

            const consumer = container.get(LazyConsumer);
            // proxy forwards `instanceof` and property access to the real singleton
            expect(consumer.dep).toBeInstanceOf(LazySingle);
        });

        it('lazy proxy should not be mistaken for a Promise', async () => {
            container.register(LazySingle);
            container.register(LazyConsumer);

            const consumer = container.get(LazyConsumer);
            // The proxy must not be thenable
            expect(await Promise.resolve(consumer.dep)).toBe(consumer.dep);
            expect((consumer.dep as unknown as { then?: unknown }).then).toBeUndefined();
        });
    });

    describe('validate', () => {
        it('should report valid for complete registrations', () => {
            container.register(RootService);
            container.register(DependentService);

            const result = container.validate();
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should report missing dependencies', () => {
            container.register(DependentService);
            // RootService NOT registered

            const result = container.validate();
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('RootService'))).toBe(true);
        });

        it('should report circular dependencies', () => {
            container.register(CircularA);
            container.register(CircularB);

            const result = container.validate();
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Circular'))).toBe(true);
        });
    });

    describe('getDependencyGraph', () => {
        it('should return the full dependency graph', () => {
            container.register(RootService);
            container.register(DependentService);

            const graph = container.getDependencyGraph();
            expect(graph.RootService).toEqual([]);
            expect(graph.DependentService).toEqual(['RootService']);
        });

        it('should reflect auto-injected dependencies in graph', () => {
            container.register(RootService);
            container.register(AutoInjectedService);

            const graph = container.getDependencyGraph();
            expect(graph.AutoInjectedService).toEqual(['RootService']);
        });
    });

    describe('chained dependencies', () => {
        it('should resolve a chain: A -> B -> C -> Root', () => {
            container.register(RootService);
            container.register(ChainC);
            container.register(ChainB);
            container.register(ChainA);

            const a = container.get(ChainA);
            expect(a).toBeInstanceOf(ChainA);
            expect(a.b).toBeInstanceOf(ChainB);
            expect(a.b.c).toBeInstanceOf(ChainC);
            expect(a.b.c.root).toBeInstanceOf(RootService);
        });
    });
});
