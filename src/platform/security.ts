import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserRole } from "./entities";

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "replace-this-before-production",
    });
  }
  async validate(payload: {
    id: string;
    role: UserRole;
    universityId?: string;
    campusId?: string;
    vendorId?: string;
    email: string;
  }) {
    return payload;
  }
}
