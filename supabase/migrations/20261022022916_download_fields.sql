ALTER TYPE "public"."filing_status" ADD VALUE 'duplicate' BEFORE 'parsed';--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "pdf_url" text;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "downloaded_at" timestamp with time zone;