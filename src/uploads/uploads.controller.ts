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
import { PrismaService } from '../prisma/prisma.service';
import { getCloudinaryStorage } from './cloudinary.config';

// Config reutilizable de multer para imágenes — almacena en Cloudinary
const imageMulterConfig = {
  storage: getCloudinaryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExts = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (
      !allowedExts.test(file.originalname) ||
      !allowedMimes.includes(file.mimetype)
    ) {
      return cb(
        new BadRequestException(
          'Solo se permiten imágenes JPG, PNG, GIF o WebP.',
        ),
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

    const imageUrl = file.path;
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

    const imageUrl = file.path;
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
    const imageUrl = file.path;
    return { url: imageUrl };
  }
}
