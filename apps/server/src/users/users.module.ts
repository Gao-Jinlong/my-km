import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/services/password.service';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule, LoggerModule],
    controllers: [UsersController],
    providers: [UsersService, PasswordService],
    exports: [UsersService],
})
export class UsersModule {}
