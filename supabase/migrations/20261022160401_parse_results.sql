CREATE TABLE "filing_sections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "filing_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"filing_id" integer NOT NULL,
	"ipo_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"level" smallint NOT NULL,
	"part" text,
	"printed_page" integer,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filing_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "parser_version" text;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "parse_path" text;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "table_count" integer;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "parse_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "filing_sections" ADD CONSTRAINT "filing_sections_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filing_sections" ADD CONSTRAINT "filing_sections_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "filing_sections_filing_ordinal_uq" ON "filing_sections" USING btree ("filing_id","ordinal");--> statement-breakpoint
CREATE INDEX "filing_sections_ipo_idx" ON "filing_sections" USING btree ("ipo_id");