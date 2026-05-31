/**
 * 服务注册中心
 *
 * 统一管理所有平台服务的注册和访问
 */

// reflect-metadata 必须在所有装饰器被求值前加载
import 'reflect-metadata';

import {
    type AIHarnessService,
    createAIHarnessService,
} from '../features/ai/harness/ai-harness.service';
import { CommandService } from './command/service';
import { registerConditionEvaluators } from './conditional/evaluators';
import { ConditionalService } from './conditional/service';
import { ContextMenuService } from './context-menu/service';
import { ServiceContainer } from './di';
import { DialogService } from './dialog/service';
import { DocumentStore } from './document-store/service';
import { EditorContainer } from './editor/container';
import { EditorTabService } from './editor-tab/service';
import { EventBusService } from './event-bus/service';
import { FileOpenService } from './file-open/service';
import { FileSystemService } from './file-system/service';
import { KeyboardShortcutService } from './keyboard/shortcut.service';
import { MessageChannelService } from './message-channel/service';
import { MonitorService } from './monitor/service';
import { IndexedDBWriter } from './monitor/writers/indexeddb';
import { PanelService } from './panel/service';
import { createWSClientService, WSClientService } from './ws-client';

/**
 * 应用服务容器类型
 */
export interface AppServices {
    monitorService: MonitorService;
    fileSystemService: FileSystemService;
    contextMenuService: ContextMenuService;
    dialogService: DialogService;
    editorContainer: EditorContainer;
    editorTabService: EditorTabService;
    documentStore: DocumentStore;
    fileOpenService: FileOpenService;
    eventBusService: EventBusService;
    commandService: CommandService;
    messageChannelService: MessageChannelService;
    keyboardShortcutService: KeyboardShortcutService;
    panelService: PanelService;
    conditionalService: ConditionalService;
    wsClient: WSClientService;
    aiHarness: AIHarnessService;
}

/**
 * 创建并注册所有服务
 */
function createServiceContainer(): ServiceContainer {
    const container = new ServiceContainer();

    // 注册所有服务（MonitorService 最先注册，无依赖）
    container.register(MonitorService);
    container.register(FileSystemService);
    container.register(ContextMenuService);
    container.register(DialogService);
    container.register(EditorContainer);
    container.register(DocumentStore);
    container.register(EditorTabService);
    container.register(FileOpenService);
    container.register(EventBusService);
    container.register(CommandService);
    container.register(MessageChannelService);
    container.register(KeyboardShortcutService);
    container.register(PanelService);
    container.register(ConditionalService);

    // WSClientService（工厂模式创建，registerInstance 注册为单例）
    const wsUrl = process.env.NEXT_PUBLIC_AI_WS_URL ?? 'http://localhost:3000/ai';
    const wsClient = createWSClientService(wsUrl);
    container.registerInstance(WSClientService.name, wsClient);

    // AI Harness（使用注入的 WSClientService）
    const aiHarness = createAIHarnessService(wsClient);
    container.registerInstance('aiHarness', aiHarness);

    return container;
}

/**
 * 全局服务容器实例（惰性初始化）
 */
let _container: ServiceContainer | null = null;

export function getContainer(): ServiceContainer {
    if (!_container) {
        _container = createServiceContainer();
    }
    return _container;
}

// 为了向后兼容，保留 container 导出但改为惰性 getter
export const container = new Proxy<ServiceContainer>({} as ServiceContainer, {
    get(_target, prop) {
        return getContainer()[prop as keyof ServiceContainer];
    },
});

/**
 * 引导函数 - 初始化所有服务（可选调用）
 *
 * @returns ServiceContainer 实例
 */
export function bootstrap(): ServiceContainer {
    // 验证依赖
    const validation = container.validate();
    if (!validation.valid) {
        console.error('Service validation failed:', validation.errors);
        throw new Error(`Service container validation failed: ${validation.errors.join(', ')}`);
    }

    // 注册条件评估器（必须在 KeyboardShortcutService 初始化之前调用）
    registerConditionEvaluators();

    // 初始化监控服务（添加 IndexedDB 持久化）
    const monitorService = container.get(MonitorService);
    monitorService.addWriter(new IndexedDBWriter());

    // 初始化快捷键服务（此时条件评估器已注册）
    const keyboardShortcutService = container.get(KeyboardShortcutService);
    keyboardShortcutService.initialize();

    return container;
}

// 注意：bootstrap() 现在在 BootstrapProvider 中调用
// 不要在模块加载时自动执行，因为 Next.js 的模块打包可能导致时序问题
