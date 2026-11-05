import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import {
  DocumentProcessingService,
  type UploadedDocument,
} from "./document-processing.service";

const maxFileSizeBytes = 20 * 1024 * 1024;

@Controller("documents")
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly processingService: DocumentProcessingService) {}

  @Post("process")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: maxFileSizeBytes, files: 1 },
    }),
  )
  processDocument(@UploadedFile() file?: UploadedDocument) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("A non-empty document file is required");
    }

    return this.processingService.process(file);
  }
}