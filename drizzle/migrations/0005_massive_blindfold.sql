CREATE TYPE "public"."giving_project_status" AS ENUM('draft', 'active', 'completed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."giving_type" AS ENUM('tithe', 'offering', 'general', 'project');--> statement-breakpoint
CREATE TYPE "public"."payment_event_source" AS ENUM('webhook', 'verify', 'admin');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'successful', 'failed', 'abandoned', 'refunded');--> statement-breakpoint
CREATE TABLE "giving_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"featured_media_id" uuid,
	"target_amount" integer NOT NULL,
	"amount_raised_cached" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "giving_project_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "giving_projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"source" "payment_event_source" NOT NULL,
	"event_type" text NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"paystack_reference" text,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"type" "giving_type" NOT NULL,
	"project_id" uuid,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"failure_reason" text,
	"receipt_number" text,
	"receipt_sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transactions_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
ALTER TABLE "giving_projects" ADD CONSTRAINT "giving_projects_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_giving_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."giving_projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "giving_projects_status_idx" ON "giving_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_events_tx_idx" ON "payment_events" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_status_created_idx" ON "transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "transactions_project_idx" ON "transactions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "transactions_user_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_email_idx" ON "transactions" USING btree ("email");