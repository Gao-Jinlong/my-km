export enum ArticleStatus {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED',
}

export interface Article {
    id: string;
    title: string;
    content: string;
    summary?: string;
    coverImage?: string;
    status: ArticleStatus;
    categoryId?: string;
    createdAt: Date;
    updatedAt: Date;
    publishedAt?: Date;
}

export interface CreateArticleDto {
    title: string;
    content: string;
    summary?: string;
    coverImage?: string;
    status?: ArticleStatus;
    categoryId?: string;
    tagIds?: string[];
}

export interface UpdateArticleDto {
    title?: string;
    content?: string;
    summary?: string;
    coverImage?: string;
    status?: ArticleStatus;
    categoryId?: string;
    tagIds?: string[];
}
