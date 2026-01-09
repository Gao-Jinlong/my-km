export interface Category {
  id: string
  name: string
  slug: string
  parentId?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateCategoryDto {
  name: string
  slug: string
  parentId?: string
}

export interface UpdateCategoryDto {
  name?: string
  slug?: string
  parentId?: string
}
