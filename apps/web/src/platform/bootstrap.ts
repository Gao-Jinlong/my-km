/**
 * 服务注册中心
 *
 * 统一管理所有平台服务的注册和访问
 *
 * @example
 * ```typescript
 * // 在应用启动时
 * import { bootstrap, container } from '@/platform/bootstrap';
 *
 * // 使用容器
 * const contextMenuService = container.get(ContextMenuService);
 * const fileSystemService = container.get(FileSystemService);
 * ```
 */

import { CommandService } from './command/service';
import { registerConditionEvaluators } from './conditional/evaluators';
import { ConditionalService } from './conditional/service';
import { ContextMenuService } from './context-menu/service';
import { ServiceContainer } from './di';
import { DialogService } from './dialog/service';
import { EditorContainer } from './editor/container';
import { EditorTabService } from './editor-tab/service';
import { EventBusService } from './event-bus/service';
import { FileOpenService } from './file-open/service';
import { FileSystemService } from './file-system/service';
import { KeyboardShortcutService } from './keyboard/shortcut.service';
import { MessageChannelService } from './message-channel/service';
import { PanelService } from './panel/service';

/**
 * 应用服务容器类型
 */
export interface AppServices {
    fileSystemService: FileSystemService;
    contextMenuService: ContextMenuService;
    dialogService: DialogService;
    editorContainer: EditorContainer;
    editorTabService: EditorTabService;
    fileOpenService: FileOpenService;
    eventBusService: EventBusService;
    commandService: CommandService;
    messageChannelService: MessageChannelService;
    keyboardShortcutService: KeyboardShortcutService;
    panelService: PanelService;
    conditionalService: ConditionalService;
}

/**
 * 创建并注册所有服务
 */
function createServiceContainer(): ServiceContainer {
    const container = new ServiceContainer();

    // 注册所有服务
    container.register(FileSystemService);
    container.register(ContextMenuService);
    container.register(DialogService);
    container.register(EditorContainer);
    container.register(EditorTabService);
    container.register(FileOpenService);
    container.register(EventBusService);
    container.register(CommandService);
    container.register(MessageChannelService);
    container.register(KeyboardShortcutService);
    container.register(PanelService);
    container.register(ConditionalService);

    return container;
}

/**
 * 全局服务容器实例
 */
export const container = createServiceContainer();

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

    // 注册条件评估器
    registerConditionEvaluators();

    // 打印依赖图（开发模式）
    if (process.env.NODE_ENV === 'development') {
        console.log('Dependency Graph:', container.getDependencyGraph());
    }

    return container;
}

// 自动执行引导
if (typeof window !== 'undefined') {
    bootstrap();
}
