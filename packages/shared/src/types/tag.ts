export interface Tag {
  id: string
  name: string
  slug: string
  color?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateTagDto {
  name: string
  slug: string
  color?: string
}

export interface UpdateTagDto {
  name?: string
  slug?: string
  color?: string
}
