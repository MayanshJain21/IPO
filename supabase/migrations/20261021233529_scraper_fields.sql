ALTER TYPE "public"."document_type" ADD VALUE 'prospectus' BEFORE 'addendum';--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "title" text;