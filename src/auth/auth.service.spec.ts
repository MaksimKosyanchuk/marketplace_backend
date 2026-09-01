import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('bcrypt');

describe('AuthService', () => {
    let service: AuthService;
    let usersService: jest.Mocked<UsersService>;
    let jwtService: jest.Mocked<JwtService>;
    let configService: jest.Mocked<ConfigService>;
    let prismaService: any;

    const mockUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        nickName: 'Tester',
        role: 'USER' as const,
    };

    const mockUsersService = {
        findByEmail: jest.fn(),
        create: jest.fn(),
        findByIdOrThrow: jest.fn(),
    };

    const mockJwtService = {
        signAsync: jest.fn(),
    };

    const mockConfigService = {
        get: jest.fn(),
    };

    const mockPrismaService = {
        refreshToken: {
            findUnique: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
            create: jest.fn(),
        },
    };

    const hashToken = (token: string) =>
        createHash('sha256').update(token).digest('hex');

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: PrismaService, useValue: mockPrismaService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        usersService = module.get(UsersService);
        jwtService = module.get(JwtService);
        configService = module.get(ConfigService);
        prismaService = module.get(PrismaService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('register', () => {
        const registerDto = {
            email: 'test@example.com',
            password: 'Password123',
            nickName: 'Tester',
        };

        it('should throw ConflictException if email is already registered', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);

            await expect(service.register(registerDto)).rejects.toThrow(
                ConflictException,
            );
            expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
                registerDto.email,
            );
            expect(mockUsersService.create).not.toHaveBeenCalled();
        });

        it('should register user and return access and refresh tokens', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);
            (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
            mockUsersService.create.mockResolvedValue(mockUser);
            mockJwtService.signAsync.mockResolvedValue('access_token_123');
            mockConfigService.get.mockReturnValue('7d');
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.register(registerDto);

            expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
                registerDto.email,
            );
            expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
            expect(mockUsersService.create).toHaveBeenCalledWith({
                email: registerDto.email,
                passwordHash: 'hashed_password',
                nickName: registerDto.nickName,
            });

            expect(jwtService.signAsync).toHaveBeenCalledWith({
                sub: mockUser.id,
                email: mockUser.email,
                role: mockUser.role,
            });

            expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: mockUser.id,
                    tokenHash: expect.any(String),
                    expiresAt: expect.any(Date),
                }),
            });

            expect(result).toEqual({
                accessToken: 'access_token_123',
                refreshToken: expect.any(String),
            });
        });
    });

    describe('login', () => {
        const loginDto = {
            email: 'test@example.com',
            password: 'Password123',
        };

        it('should throw UnauthorizedException if user is not found', async () => {
            mockUsersService.findByEmail.mockResolvedValue(null);

            await expect(service.login(loginDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should throw UnauthorizedException if password does not match', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            await expect(service.login(loginDto)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(bcrypt.compare).toHaveBeenCalledWith(
                loginDto.password,
                mockUser.passwordHash,
            );
        });

        it('should return tokens on valid credentials', async () => {
            mockUsersService.findByEmail.mockResolvedValue(mockUser);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            mockJwtService.signAsync.mockResolvedValue('access_token_123');
            mockConfigService.get.mockReturnValue('14d');
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.login(loginDto);

            expect(result).toEqual({
                accessToken: 'access_token_123',
                refreshToken: expect.any(String),
            });
        });
    });

    describe('refresh', () => {
        const rawToken = 'sample_refresh_token';
        const hashed = hashToken(rawToken);

        it('should throw UnauthorizedException if token is not found in database', async () => {
            mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

            await expect(service.refresh(rawToken)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(
                mockPrismaService.refreshToken.findUnique,
            ).toHaveBeenCalledWith({
                where: { tokenHash: hashed },
                include: { user: true },
            });
        });

        it('should delete token and throw UnauthorizedException if token is expired', async () => {
            const expiredToken = {
                id: 'token-id-1',
                tokenHash: hashed,
                expiresAt: new Date(Date.now() - 10000), // В прошлом
                user: mockUser,
            };

            mockPrismaService.refreshToken.findUnique.mockResolvedValue(
                expiredToken,
            );

            await expect(service.refresh(rawToken)).rejects.toThrow(
                UnauthorizedException,
            );

            expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
                where: { id: expiredToken.id },
            });
        });

        it('should rotate refresh token and return new token pair', async () => {
            const validToken = {
                id: 'token-id-1',
                tokenHash: hashed,
                expiresAt: new Date(Date.now() + 100000), // В будущем
                user: mockUser,
            };

            mockPrismaService.refreshToken.findUnique.mockResolvedValue(
                validToken,
            );
            mockPrismaService.refreshToken.delete.mockResolvedValue(
                validToken,
            );
            mockJwtService.signAsync.mockResolvedValue('new_access_token');
            mockConfigService.get.mockReturnValue('7d');
            mockPrismaService.refreshToken.create.mockResolvedValue({});

            const result = await service.refresh(rawToken);

            expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
                where: { id: validToken.id },
            });
            expect(result).toEqual({
                accessToken: 'new_access_token',
                refreshToken: expect.any(String),
            });
        });
    });

    describe('logout', () => {
        it('should delete tokens associated with hashed refresh token', async () => {
            const rawToken = 'logout_token';
            const hashed = hashToken(rawToken);

            mockPrismaService.refreshToken.deleteMany.mockResolvedValue({
                count: 1,
            });

            await service.logout(rawToken);

            expect(
                mockPrismaService.refreshToken.deleteMany,
            ).toHaveBeenCalledWith({
                where: { tokenHash: hashed },
            });
        });
    });

    describe('me', () => {
        it('should return user info without sensitive fields', async () => {
            mockUsersService.findByIdOrThrow.mockResolvedValue(mockUser);

            const result = await service.me(mockUser.id);

            expect(mockUsersService.findByIdOrThrow).toHaveBeenCalledWith(
                mockUser.id,
            );
            expect(result).toEqual({
                id: mockUser.id,
                email: mockUser.email,
                nickName: mockUser.nickName,
                role: mockUser.role,
            });
            expect((result as any).passwordHash).toBeUndefined();
        });
    });
});