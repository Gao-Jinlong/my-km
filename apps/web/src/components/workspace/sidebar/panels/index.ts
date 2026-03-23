import type { ComponentType } from 'react';
import type { TabPanelState } from '@/types/workspace';
import { FilesPanel } from './files-panel';
import { SearchPanel } from './search-panel';

export interface PanelComponentProps {
    state?: TabPanelState;
    onStateChange: (state: Partial<TabPanelState>) => void;
}

export interface PanelConfig {
    id: string;
    component: ComponentType<PanelComponentProps>;
    label: string;
}

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
};

export function getPanelComponent(panelId: string): ComponentType<PanelComponentProps> | null {
    return PANEL_REGISTRY[panelId]?.component ?? null;
}

export function hasPanel(panelId: string): boolean {
    return panelId in PANEL_REGISTRY;
}
