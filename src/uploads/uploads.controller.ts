import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { unlink } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';

// Config reutilizable de multer para imágenes
const imageMulterConfig = {
  storage: diskStorage({
    destination: './public/uploads/designs',
    filename: (req, file, cb) => {
      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      return cb(null, `${randomName}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return cb(
        new BadRequestException('Solo se permiten archivos de imagen.'),
        false,
      );
    }
    cb(null, true);
  },
};

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private prisma: PrismaService) {}

  // ── Diseño por ventana de cotización ─────────────────────────────────────
  @Post('design/:quotationWindowId')
  @UseInterceptors(FileInterceptor('file', imageMulterConfig))
  async uploadDesignImage(
    @Param('quotationWindowId') quotationWindowId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se ha subido ningún archivo.');

    const windowId = Number(quotationWindowId);
    const quotationWindow = await this.prisma.quotationWindow.findUnique({
      where: { id: windowId },
    });
    if (!quotationWindow)
      throw new NotFoundException(
        `No se encontró la ventana de cotización con ID #${windowId}`,
      );

    if (quotationWindow.design_image_url) {
      try {
        await unlink(
          join(process.cwd(), 'public', quotationWindow.design_image_url),
        );
      } catch {}
    }

    const imageUrl = `/uploads/designs/${file.filename}`;
    return this.prisma.quotationWindow.update({
      where: { id: windowId },
      data: { design_image_url: imageUrl },
    });
  }

  // ── Diseño por ventana de pedido ──────────────────────────────────────────
  @Post('order-window-design/:windowId')
  @UseInterceptors(FileInterceptor('file', imageMulterConfig))
  async uploadOrderWindowDesignImage(
    @Param('windowId') windowId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se ha subido ningún archivo.');

    const id = Number(windowId);
    const orderWindow = await this.prisma.window.findUnique({ where: { id } });
    if (!orderWindow)
      throw new NotFoundException(
        `No se encontró la ventana del pedido con ID #${id}`,
      );

    if (orderWindow.design_image_url) {
      try {
        await unlink(
          join(process.cwd(), 'public', orderWindow.design_image_url),
        );
      } catch (error) {
        console.warn(`No se pudo borrar la imagen anterior: ${error.message}`);
      }
    }

    const imageUrl = `/uploads/designs/${file.filename}`;
    return this.prisma.window.update({
      where: { id },
      data: { design_image_url: imageUrl },
    });
  }

  // ✅ ── Foto de referencia general (cotización) ────────────────────────────
  // No asocia a ningún registro — devuelve solo la URL.
  // La cotización la guarda cuando el formulario hace submit.
  @Post('reference-image')
  @UseInterceptors(FileInterceptor('file', imageMulterConfig))
  async uploadReferenceImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se ha subido ningún archivo.');
    const imageUrl = `/uploads/designs/${file.filename}`;
    return { url: imageUrl };
  }
}
