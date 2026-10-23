import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

type Upload = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class MediaService {
  private readonly directory = join(process.cwd(), "uploads");

  async image(file?: Upload) {
    if (!file) throw new BadRequestException("Choose an image file to upload.");
    if (!file.mimetype.startsWith("image/"))
      throw new BadRequestException("Only image files are allowed.");
    if (file.size > 6_000_000)
      throw new BadRequestException("Image must be smaller than 6 MB.");
    try {
      await mkdir(this.directory, { recursive: true });
      const name = `${randomUUID()}.webp`;
      await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(join(this.directory, name));
      return { url: `/uploads/${name}` };
    } catch {
      throw new InternalServerErrorException("This image could not be processed.");
    }
  }
}
