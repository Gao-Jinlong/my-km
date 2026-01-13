import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/services/password.service';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [PrismaModule, LoggerModule, CacheModule, EmailModule],
    controllers: [UsersController],
    providers: [UsersService, PasswordService],
    exports: [UsersService],
})
export class UsersModule {}
