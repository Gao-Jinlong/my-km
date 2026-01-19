/**
 * LocalStorage utilities for recent projects management
 */

import type { RecentProject, RecentProjectsConfig } from '@/lib/types/project';

const RECENT_PROJECTS_KEY = 'recentProjects';
const MAX_RECENT_PROJECTS = 5;

/**
 * 获取最近项目列表
 */
export function getRecentProjects(): RecentProject[] {
    if (typeof window === 'undefined') return [];

    try {
        const data = localStorage.getItem(RECENT_PROJECTS_KEY);
        if (!data) return [];

        const config: RecentProjectsConfig = JSON.parse(data);
        return config.recent || [];
    } catch (error) {
        console.error('Failed to load recent projects:', error);
        return [];
    }
}

/**
 * 保存最近项目列表
 */
export function saveRecentProjects(projects: RecentProject[]): void {
    if (typeof window === 'undefined') return;

    try {
        const config: RecentProjectsConfig = {
            recent: projects.slice(0, MAX_RECENT_PROJECTS),
            maxRecent: MAX_RECENT_PROJECTS,
        };
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(config));
    } catch (error) {
        console.error('Failed to save recent projects:', error);
    }
}

/**
 * 添加或更新最近项目
 */
export function addRecentProject(project: RecentProject): void {
    const recent = getRecentProjects();

    // 移除已存在的同名项目
    const filtered = recent.filter(p => p.id !== project.id);

    // 添加到开头
    const updated = [{ ...project, lastOpened: new Date().toISOString() }, ...filtered];

    saveRecentProjects(updated);
}

/**
 * 移除最近项目
 */
export function removeRecentProject(projectId: string): void {
    const recent = getRecentProjects();
    const filtered = recent.filter(p => p.id !== projectId);
    saveRecentProjects(filtered);
}

/**
 * 清除所有最近项目
 */
export function clearRecentProjects(): void {
    saveRecentProjects([]);
}
