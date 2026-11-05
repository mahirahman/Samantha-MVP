import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { DocumentsController } from "./documents.controller";
import { DocumentProcessingService } from "./document-processing.service";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentProcessingService, SupabaseAuthGuard],
})
export class DocumentsModule {}