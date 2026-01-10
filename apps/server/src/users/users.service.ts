import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.user.findMany();
    }

    async findOne(id: number) {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async create(data: any) {
        return this.prisma.user.create({
            data,
        });
    }

    async update(id: number, data: any) {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    async delete(id: number) {
        return this.prisma.user.delete({
            where: { id },
        });
    }
}
