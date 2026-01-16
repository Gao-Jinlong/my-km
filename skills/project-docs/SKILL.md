---
name: project-docs
description: Index and query project documentation (Markdown docs, API endpoints, config files). Use when the user asks about project specifications, API documentation, technical architecture, or needs to find information from docs/ directory, NestJS controllers, or configuration files.
metadata:
  author: my-km-project
  version: "1.0.0"
---

# Project Documentation Indexer & Queryer

This skill indexes and queries project documentation to help AI assistants quickly reference relevant docs, APIs, and configurations during development.

## When to Use

Activate this skill when the user asks about:
- Project specifications or requirements
- API endpoints and their implementations
- Technical architecture decisions
- Configuration file details
- How to implement specific features
- Database schemas and design
- Frontend/backend technology stack
- Internationalization (i18n) implementation
- Caching strategies
- Authentication system
- Git conventions or development standards

## How It Works

### 1. Index Generation

The skill generates three types of indexes:

**Document Index** (`references/doc-index.json`):
- Scans all Markdown files in `docs/` directory
- Extracts: title, category (spec/technical/readme), type, summary, metadata, headers, word count
- Categorizes: product specs, technical docs, navigation docs

**API Index** (`references/api-index.json`):
- Scans all NestJS controllers in `apps/server/src/`
- Extracts: route path, HTTP method, summary, controller name, file location
- Groups by: controller, HTTP method

**Config Index** (`references/config-index.json`):
- Scans configuration files (package.json, tsconfig.json, docker-compose.yml, etc.)
- Extracts: description, type, key fields

### 2. Query Modes

#### Question-Answering Mode (Default)

Use for natural language questions:

```
"How is user authentication implemented?"
"What database tables are used for articles?"
"Which technology stack is used for the frontend?"
"How does the caching system work?"
```

**Process:**
1. Extract keywords from the question
2. Search indexes (title > summary > headers)
3. Read top 3 relevant documents
4. Generate structured answer with citations

#### Browse Mode

Use for structured navigation:

```
"Browse technical documentation"
"Show all product specs"
"List all API-related documents"
"What database design docs are available?"
```

**Process:**
1. Parse category/type parameters
2. Filter matching documents
3. Generate structured list with links

#### API Query Mode

Use for API-specific queries:

```
"Show all auth API endpoints"
"What endpoints use POST method?"
"List all user controller endpoints"
```

**Process:**
1. Parse controller/method/path parameters
2. Filter matching endpoints
3. Generate table with method, path, and description

#### Config Query Mode

Use for configuration queries:

```
"Show package.json configuration"
"What scripts are available?"
"List all TypeScript configs"
```

**Process:**
1. Parse type/path parameters
2. Filter matching configs
3. Generate description with key fields

## Generating Indexes

Before querying, ensure indexes are up-to-date:

```bash
npm run generate-docs-index
```

Or run the script directly:

```bash
npx tsx skills/project-docs/scripts/generate-index.ts
```

**When to regenerate indexes:**
- After adding new documentation
- After modifying API endpoints
- After updating configuration files
- After changes to document structure

## Query Examples

### Example 1: Question-Answering

**User:** "How is the authentication system implemented?"

**Response:**
Based on project documentation, the authentication system is implemented as follows:

**Technology Stack:**
- NestJS + JWT + Passport
- Local strategy for email/password authentication
- JWT strategy for token-based authentication

**Key API Endpoints:**
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Refresh access token
- `GET /auth/verify-email` - Email verification
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password

**Implementation Location:**
- Controller: `apps/server/src/auth/auth.controller.ts`
- Service: `apps/server/src/auth/auth.service.ts`
- Guards: `apps/server/src/auth/guards/`
- Strategy: `apps/server/src/auth/strategies/`

**Documentation:**
- Requirements: `docs/spec/user-authentication.md`
- Technical details: See controller source code

### Example 2: Browse Mode

**User:** "Browse technical documentation"

**Response:**
## Technical Documentation (10 files)

### Core Architecture
- [Technical Specification](docs/technical/technical-specification.md) - Overall tech stack and project structure
- [Database Design](docs/technical/database-design.md) - Table schemas, relationships, indexes
- [API Design](docs/technical/api-design.md) - RESTful API endpoint specifications

### Frontend
- [Frontend Tech Stack](docs/technical/frontend-tech-stack.md) - Next.js, UI library, state management
- [Internationalization (i18n)](docs/technical/i18n.md) - Multi-language support implementation

### System Design
- [Caching Design](docs/spec/cache-design.md) - Multi-level caching strategy
- [CORS Configuration](docs/technical/cors-configuration.md) - Cross-origin settings
- [Logging Standards](docs/technical/logging-standard.md) - Logging conventions

### Development Standards
- [Git Commit Convention](docs/technical/git-commit-convention.md) - Commit message standards
- [Infrastructure TODO](docs/technical/infrastructure-todo.md) - Pending infrastructure tasks

**Tip:** Use specific questions to get detailed information from these documents.

### Example 3: API Query

**User:** "Show all auth controller endpoints"

**Response:**
## Auth API Endpoints (8 endpoints)

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | User login with email and password |
| POST | /auth/logout | User logout and invalidate tokens |
| POST | /auth/refresh | Refresh access token using refresh token |
| GET | /auth/verify-email | Verify email address with token |

### Password Management
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/forgot-password | Request password reset email |
| POST | /auth/reset-password | Reset password with token |

### Email Verification
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/resend-verification | Resend verification email |

**Implementation:**
- Controller: `apps/server/src/auth/auth.controller.ts`
- Service: `apps/server/src/auth/auth.service.ts`
- DTOs: `apps/server/src/auth/dto/`

**Related Documentation:**
- [User Authentication Specs](docs/spec/user-authentication.md)
- [API Design](docs/technical/api-design.md)

## Reading Documents

When you find relevant documents, use the `Read` tool to read the full content. The index provides file paths for direct access.

Example:
```
Index says: docs/technical/i18n.md
Read: docs/technical/i18n.md
```

## Response Format Guidelines

### For Question-Answering:
1. Start with a direct answer
2. Provide structured breakdown (technology stack, APIs, code locations)
3. Include citations (document paths)
4. Add related documentation links
5. Keep it concise - don't return entire documents

### For Browse Mode:
1. Group by category (Requirements, Features, Architecture, etc.)
2. Use markdown links for navigation
3. Include brief descriptions
4. Add tips for further exploration

### For API Queries:
1. Present as a table (Method | Path | Description)
2. Group by functionality
3. Include implementation details
4. Link to related documentation

### For Config Queries:
1. Show key configuration values
2. Explain important settings
3. Provide usage examples
4. Link to related configs

## Progressive Disclosure

This skill is structured for efficient context usage:

1. **Metadata** (~100 tokens): Loaded at startup
2. **Instructions** (~2000 tokens): This file, loaded when activated
3. **Indexes** (~10KB): JSON files loaded on-demand
4. **Full Documents**: Loaded via Read tool as needed

Keep responses focused. Use indexes to identify relevant documents, then read only what's needed.

## Troubleshooting

### Index is outdated

**Problem:** Information doesn't match current codebase

**Solution:**
```bash
npm run generate-docs-index
```

### No results found

**Problem:** Query returns empty results

**Possible causes:**
1. Indexes haven't been generated yet
2. Query keywords don't match indexed content
3. Documents were deleted/renamed

**Solutions:**
1. Run index generation
2. Try more general keywords
3. Use browse mode to see available documents

## See Also

- [Index Generation Script](scripts/generate-index.ts)
- [Document Index](references/doc-index.json)
- [API Index](references/api-index.json)
- [Config Index](references/config-index.json)
- [Project Documentation](docs/README.md)
