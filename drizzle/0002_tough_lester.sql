CREATE TABLE "rate_limit_counters" (
	"bucket" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_counters_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expiry_idx" ON "rate_limit_counters" USING btree ("expires_at");