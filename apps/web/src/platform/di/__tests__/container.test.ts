import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { ServiceContainer } from '../container';
import { Inject, Optional, Service } from '../decorators';

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
