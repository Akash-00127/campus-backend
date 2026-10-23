import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { DataSource } from "typeorm";
import { RecordStatus, User } from "../../platform/entities";
@Injectable()
export class DatabaseJwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly db: DataSource) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "development-config-required",
    });
  }
  async validate(payload: { sub?: string; version?: number }) {
    if (!payload.sub) throw new UnauthorizedException();
    const user = await this.db
      .getRepository(User)
      .findOneBy({ id: payload.sub, status: RecordStatus.ACTIVE });
    if (!user || user.tokenVersion !== payload.version)
      throw new UnauthorizedException("Please sign in again.");
    return user;
  }
}
