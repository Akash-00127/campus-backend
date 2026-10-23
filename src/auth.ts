import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthGuard } from "@nestjs/passport";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import * as bcrypt from "bcrypt";
import { PrismaService } from "./prisma.service";
import { Role } from "./types";

export class CredentialsDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
export class RegisterDto extends CredentialsDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) place!: string;
  @IsIn(["STUDENT", "SHOPKEEPER"]) role!: "STUDENT" | "SHOPKEEPER";
  @IsOptional() @IsString() shopId?: string;
}
export type TokenUser = {
  id: string;
  role: Role;
  shopId: string | null;
  email: string;
  name: string;
};
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user as TokenUser,
);
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "replace-this-before-production",
    });
  }
  async validate(payload: TokenUser) {
    return payload;
  }
}
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const needed = Reflect.getMetadata(ROLES_KEY, ctx.getHandler()) as
      Role[] | undefined;
    return (
      !needed || needed.includes(ctx.switchToHttp().getRequest().user?.role)
    );
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}
  private response(user: {
    id: string;
    role: Role;
    shopId: string | null;
    email: string;
    name: string;
  }) {
    const token = this.jwt.sign({
      id: user.id,
      role: user.role,
      shopId: user.shopId,
      email: user.email,
      name: user.name,
    });
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
    };
  }
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException("An account already exists with this email.");
    if (dto.role === "SHOPKEEPER" && !dto.shopId)
      throw new ForbiddenException("Select the shop you manage.");
    if (
      dto.shopId &&
      !(await this.prisma.shop.findUnique({ where: { id: dto.shopId } }))
    )
      throw new ForbiddenException("Invalid shop.");
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        place: dto.place.trim(),
        role: dto.role,
        shopId: dto.role === "SHOPKEEPER" ? dto.shopId : null,
        passwordHash: await bcrypt.hash(dto.password, 8),
      },
    });
    return this.response(user);
  }
  async login(dto: CredentialsDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException("Invalid email or password.");
    return this.response(user);
  }
  async me(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        place: true,
        role: true,
        shopId: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("register") register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post("login") login(@Body() dto: CredentialsDto) {
    return this.auth.login(dto);
  }
  @Get("me") @UseGuards(JwtAuthGuard) me(@CurrentUser() user: TokenUser) {
    return this.auth.me(user.id);
  }
}

export const authImports = [
  PassportModule,
  JwtModule.register({
    secret: process.env.JWT_SECRET || "replace-this-before-production",
    signOptions: { expiresIn: "12h" },
  }),
];
