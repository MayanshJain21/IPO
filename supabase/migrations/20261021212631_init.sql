CREATE TYPE "public"."detection_method" AS ENUM('rule', 'llm', 'rule+llm');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('drhp', 'rhp', 'addendum', 'mar', 'results');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('found', 'downloaded', 'parsed', 'indexed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."flag_check" AS ENUM('ofs_share', 'debt_repayment', 'related_party', 'promoter_litigation', 'customer_concentration', 'supplier_concentration', 'cashflow_vs_profit', 'receivables_growth', 'auditor_remarks', 'pre_ipo_pricing', 'valuation_vs_peers', 'contingent_liabilities');--> statement-breakpoint
CREATE TYPE "public"."flag_level" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('upcoming', 'open', 'closed', 'listed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."promise_category" AS ENUM('use_of_proceeds', 'capacity', 'growth', 'margin', 'other');--> statement-breakpoint
CREATE TYPE "public"."promise_status" AS ENUM('pending', 'kept', 'delayed', 'broken');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"filing_id" integer NOT NULL,
	"ipo_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"section" text,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"text" text NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "filings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "filings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ipo_id" integer NOT NULL,
	"doc_type" "document_type" NOT NULL,
	"source_url" text NOT NULL,
	"filed_on" date,
	"status" "filing_status" DEFAULT 'found' NOT NULL,
	"sha256" char(64),
	"storage_path" text,
	"page_count" integer,
	"error" text,
	"parsed_at" timestamp with time zone,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_source_url_unique" UNIQUE("source_url"),
	CONSTRAINT "filings_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "filings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "financials" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "financials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ipo_id" integer NOT NULL,
	"filing_id" integer NOT NULL,
	"period_label" text NOT NULL,
	"period_end" date NOT NULL,
	"months" smallint DEFAULT 12 NOT NULL,
	"consolidated" boolean DEFAULT true NOT NULL,
	"revenue_from_ops" numeric(16, 2),
	"other_income" numeric(16, 2),
	"total_income" numeric(16, 2),
	"ebitda" numeric(16, 2),
	"pat" numeric(16, 2),
	"total_assets" numeric(16, 2),
	"net_worth" numeric(16, 2),
	"total_borrowings" numeric(16, 2),
	"cash_and_equivalents" numeric(16, 2),
	"trade_receivables" numeric(16, 2),
	"inventories" numeric(16, 2),
	"operating_cash_flow" numeric(16, 2),
	"capex" numeric(16, 2),
	"contingent_liabilities" numeric(16, 2),
	"source_page" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "flags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ipo_id" integer NOT NULL,
	"check" "flag_check" NOT NULL,
	"level" "flag_level" NOT NULL,
	"method" "detection_method" NOT NULL,
	"reason" text NOT NULL,
	"value" numeric(16, 4),
	"page" integer,
	"section" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ipos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ipos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"company_name" text NOT NULL,
	"sector" text,
	"status" "issue_status" DEFAULT 'upcoming' NOT NULL,
	"nse_symbol" text,
	"bse_code" text,
	"price_band_low" numeric(12, 2),
	"price_band_high" numeric(12, 2),
	"face_value" numeric(10, 2),
	"lot_size" integer,
	"issue_size_cr" numeric(16, 2),
	"fresh_issue_cr" numeric(16, 2),
	"ofs_cr" numeric(16, 2),
	"open_date" date,
	"close_date" date,
	"allotment_date" date,
	"listing_date" date,
	"listing_price" numeric(12, 2),
	"registrar" text,
	"lead_managers" text[],
	"subscription" jsonb,
	"risk_score" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ipos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ipos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promises" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promises_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ipo_id" integer NOT NULL,
	"filing_id" integer NOT NULL,
	"category" "promise_category" NOT NULL,
	"description" text NOT NULL,
	"target_amount_cr" numeric(16, 2),
	"target_date" date,
	"page" integer NOT NULL,
	"section" text,
	"status" "promise_status" DEFAULT 'pending' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financials" ADD CONSTRAINT "financials_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financials" ADD CONSTRAINT "financials_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_ipo_id_ipos_id_fk" FOREIGN KEY ("ipo_id") REFERENCES "public"."ipos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_filing_ordinal_uq" ON "chunks" USING btree ("filing_id","ordinal");--> statement-breakpoint
CREATE INDEX "chunks_ipo_idx" ON "chunks" USING btree ("ipo_id");--> statement-breakpoint
CREATE INDEX "filings_ipo_idx" ON "filings" USING btree ("ipo_id");--> statement-breakpoint
CREATE INDEX "filings_status_idx" ON "filings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "financials_period_uq" ON "financials" USING btree ("ipo_id","period_label","consolidated");--> statement-breakpoint
CREATE INDEX "financials_ipo_idx" ON "financials" USING btree ("ipo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_ipo_check_uq" ON "flags" USING btree ("ipo_id","check");--> statement-breakpoint
CREATE INDEX "ipos_status_open_date_idx" ON "ipos" USING btree ("status","open_date");--> statement-breakpoint
CREATE INDEX "promises_ipo_idx" ON "promises" USING btree ("ipo_id");