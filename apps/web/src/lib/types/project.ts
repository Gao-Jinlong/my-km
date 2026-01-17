/**
 * Project type definitions
 */

// 项目配置接口（对应 .my-km/project.json）
export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  tags: string[];
  icon?: string;
  color?: string;
  status: 'active' | 'archived';
  metadata?: Record<string, any>;
}

// 最近项目信息（存储在 LocalStorage）
export interface RecentProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  path: string;
  lastOpened: string;
  handleId?: string;
}

// 最近项目列表配置
export interface RecentProjectsConfig {
  recent: RecentProject[];
  maxRecent: number;
}
