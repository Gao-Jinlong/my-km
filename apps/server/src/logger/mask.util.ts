/**
 * 敏感数据脱敏工具
 * 根据 docs/technical/logging-standard.md 规范实现
 */

export class SensitiveDataMasker {
    private static readonly MASK_PATTERNS = {
        // Email: 保留前 2 位和域名
        email: (value: string): string => {
            if (!value || !value.includes('@')) {
                return '***';
            }
            const [local, domain] = value.split('@');
            if (local.length <= 2) {
                return `***@${domain}`;
            }
            return `${local.slice(0, 2)}***@${domain}`;
        },

        // Phone (Chinese mobile): 保留前 3 位和后 4 位
        phone: (value: string): string => {
            if (!value || value.length !== 11) {
                return '***';
            }
            return `${value.slice(0, 3)}****${value.slice(-4)}`;
        },

        // ID Card: 保留前 6 位和后 4 位
        idCard: (value: string): string => {
            if (!value || value.length < 15) {
                return '***';
            }
            return `${value.slice(0, 6)}********${value.slice(-4)}`;
        },

        // Token/JWT: 仅显示前 8 位和后 4 位
        token: (value: string): string => {
            if (!value || value.length < 12) {
                return '***';
            }
            return `${value.slice(0, 8)}***${value.slice(-4)}`;
        },

        // IP Address (IPv4): 保留前 2 段
        ipv4: (value: string): string => {
            if (!value || !value.includes('.')) {
                return '***';
            }
            const parts = value.split('.');
            if (parts.length !== 4) {
                return '***';
            }
            return `${parts[0]}.${parts[1]}.*.*`;
        },

        // Password: 完全隐藏
        password: (): string => '***',

        // Secret/Key: 仅显示前 4 位和后 4 位
        secret: (value: string): string => {
            if (!value || value.length < 8) {
                return '***';
            }
            return `${value.slice(0, 4)}***${value.slice(-4)}`;
        },
    };

    /**
     * 脱敏单个值
     */
    static mask(fieldName: string, value: any): any {
        if (value === null || value === undefined) {
            return value;
        }

        // 跳过非字符串类型（除了特定字段）
        if (typeof value !== 'string') {
            return value;
        }

        const lowerFieldName = fieldName.toLowerCase();

        // 应用特定的脱敏规则
        if (lowerFieldName.includes('email')) {
            return SensitiveDataMasker.MASK_PATTERNS.email(value);
        }
        if (lowerFieldName.includes('phone') || lowerFieldName.includes('mobile')) {
            return SensitiveDataMasker.MASK_PATTERNS.phone(value);
        }
        if (lowerFieldName.includes('idcard') || lowerFieldName.includes('id-card')) {
            return SensitiveDataMasker.MASK_PATTERNS.idCard(value);
        }
        if (lowerFieldName.includes('token') || lowerFieldName.includes('jwt')) {
            return SensitiveDataMasker.MASK_PATTERNS.token(value);
        }
        if (lowerFieldName.includes('ip') || lowerFieldName.includes('ipaddress')) {
            return SensitiveDataMasker.MASK_PATTERNS.ipv4(value);
        }
        if (lowerFieldName.includes('password') || lowerFieldName.includes('passwd')) {
            return SensitiveDataMasker.MASK_PATTERNS.password();
        }
        if (
            lowerFieldName.includes('secret') ||
            lowerFieldName.includes('apikey') ||
            lowerFieldName.includes('api-key') ||
            lowerFieldName.includes('authorization')
        ) {
            return SensitiveDataMasker.MASK_PATTERNS.secret(value);
        }

        // 默认不脱敏
        return value;
    }

    /**
     * 递归脱敏对象
     */
    static maskObject(obj: Record<string, any>): Record<string, any> {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const masked: Record<string, any> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                masked[key] = value;
                continue;
            }

            if (Array.isArray(value)) {
                masked[key] = value.map(item =>
                    typeof item === 'object' && item !== null
                        ? SensitiveDataMasker.maskObject(item)
                        : item,
                );
            } else if (typeof value === 'object') {
                masked[key] = SensitiveDataMasker.maskObject(value);
            } else {
                masked[key] = SensitiveDataMasker.mask(key, value);
            }
        }

        return masked;
    }

    /**
     * 脱敏错误对象
     */
    static maskError(error: Error): Record<string, any> {
        const masked: Record<string, any> = {
            message: error.message,
            name: error.name,
        };

        if (error.stack) {
            masked.stack = error.stack;
        }

        // 脱敏错误对象中的其他属性
        for (const [key, value] of Object.entries(error)) {
            if (key === 'stack' || key === 'message' || key === 'name') {
                continue;
            }
            masked[key] =
                typeof value === 'object'
                    ? SensitiveDataMasker.maskObject(value)
                    : SensitiveDataMasker.mask(key, value);
        }

        return masked;
    }
}
