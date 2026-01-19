import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/services/password.service';
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
    imports: [PrismaModule, LoggerModule, CacheModule, EmailModule],
    controllers: [UsersController],
    providers: [UsersService, PasswordService],
    exports: [UsersService],
})
export class UsersModule {}
