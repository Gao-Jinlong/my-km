import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * 密码服务
 * 负责密码哈希和验证
 */
@Injectable()
export class PasswordService {
    private readonly SALT_ROUNDS = 12;

    /**
     * 哈希密码
     * @param password 明文密码
     * @returns 哈希后的密码
     */
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, this.SALT_ROUNDS);
    }

    /**
     * 验证密码
     * @param password 明文密码
     * @param hashedPassword 哈希后的密码
     * @returns 密码是否匹配
     */
    async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
        return bcrypt.compare(password, hashedPassword);
    }
}
