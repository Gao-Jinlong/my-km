/**
 * 面板注册表
 * 将面板 ID 映射到对应的组件
 */

import type { TabPanelState } from '@/types/workspace';

export interface PanelConfig {
    id: string;
    component: React.ComponentType<PanelComponentProps>;
    label: string;
}

export interface PanelComponentProps {
    state?: TabPanelState;
    onStateChange: (state: Partial<TabPanelState>) => void;
}

// 导入面板组件
import { FilesPanel } from './files-panel';
import { SearchPanel } from './search-panel';

/**
 * 面板注册表
 * 所有可用的面板组件都应在这里注册
 */
export const PANEL_REGISTRY: Record<string, PanelConfig> = {
    'files-panel': {
        id: 'files-panel',
        component: FilesPanel,
        label: 'Files',
    },
    'search-panel': {
        id: 'search-panel',
        component: SearchPanel,
        label: 'Search',
    },
    // 未来可以添加更多面板
    // 'outline-panel': { id: 'outline-panel', component: OutlinePanel, label: 'Outline' },
};

/**
 * 根据面板 ID 获取面板组件
 */
export function getPanelComponent(
    panelId: string,
): React.ComponentType<PanelComponentProps> | null {
    return PANEL_REGISTRY[panelId]?.component || null;
}

/**
 * 检查面板是否存在
 */
export function hasPanel(panelId: string): boolean {
    return panelId in PANEL_REGISTRY;
}
