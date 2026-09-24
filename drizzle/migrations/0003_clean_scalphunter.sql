CREATE TYPE "public"."content_category_type" AS ENUM('sermon', 'bible_study');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'review', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'audio', 'video', 'document', 'external_video');--> statement-breakpoint
CREATE TYPE "public"."media_source" AS ENUM('uploaded', 'external_url');--> statement-breakpoint
CREATE TYPE "public"."series_type" AS ENUM('sermon', 'bible_study', 'sunday_school');--> statement-breakpoint
CREATE TABLE "bible_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"featured_media_id" uuid,
	"audio_media_id" uuid,
	"video_media_id" uuid,
	"document_media_id" uuid,
	"download_enabled" boolean DEFAULT true NOT NULL,
	"series_id" uuid,
	"category_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"teacher" text NOT NULL,
	"study_date" date NOT NULL,
	"scripture_reference" text,
	"lesson_number" integer,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bible_studies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "content_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_category_type" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"source" "media_source" DEFAULT 'uploaded' NOT NULL,
	"title" text,
	"alt_text" text,
	"original_filename" text,
	"storage_key" text,
	"external_url" text,
	"public_url" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"user_id" uuid,
	"ip_hash" text,
	"user_agent" text,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	CONSTRAINT "redirects_from_path_unique" UNIQUE("from_path")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "series_type" NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_media_id" uuid,
	"start_date" date,
	"end_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sermons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"featured_media_id" uuid,
	"audio_media_id" uuid,
	"video_media_id" uuid,
	"document_media_id" uuid,
	"download_enabled" boolean DEFAULT true NOT NULL,
	"series_id" uuid,
	"category_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"preacher" text NOT NULL,
	"sermon_date" date NOT NULL,
	"scripture_reference" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sermons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sunday_school_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"featured_media_id" uuid,
	"audio_media_id" uuid,
	"video_media_id" uuid,
	"document_media_id" uuid,
	"download_enabled" boolean DEFAULT true NOT NULL,
	"series_id" uuid NOT NULL,
	"category_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"lesson_number" integer NOT NULL,
	"lesson_date" date NOT NULL,
	"topic" text NOT NULL,
	"memory_verse" text,
	"introduction" text,
	"teacher" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sunday_school_lessons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "taggables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"taggable_type" text NOT NULL,
	"taggable_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_audio_media_id_media_id_fk" FOREIGN KEY ("audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_video_media_id_media_id_fk" FOREIGN KEY ("video_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_document_media_id_media_id_fk" FOREIGN KEY ("document_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_studies" ADD CONSTRAINT "bible_studies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_downloads" ADD CONSTRAINT "media_downloads_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_downloads" ADD CONSTRAINT "media_downloads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_audio_media_id_media_id_fk" FOREIGN KEY ("audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_video_media_id_media_id_fk" FOREIGN KEY ("video_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_document_media_id_media_id_fk" FOREIGN KEY ("document_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermons" ADD CONSTRAINT "sermons_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_audio_media_id_media_id_fk" FOREIGN KEY ("audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_video_media_id_media_id_fk" FOREIGN KEY ("video_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_document_media_id_media_id_fk" FOREIGN KEY ("document_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_og_media_id_media_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sunday_school_lessons" ADD CONSTRAINT "sunday_school_lessons_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggables" ADD CONSTRAINT "taggables_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bible_studies_status_published_idx" ON "bible_studies" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "bible_studies_series_idx" ON "bible_studies" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "bible_studies_category_idx" ON "bible_studies" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_categories_type_slug_unique" ON "content_categories" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "media_kind_idx" ON "media" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "media_uploader_idx" ON "media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "media_downloads_content_idx" ON "media_downloads" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "media_downloads_date_idx" ON "media_downloads" USING btree ("downloaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "series_type_slug_unique" ON "series" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "sermons_status_published_idx" ON "sermons" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "sermons_series_idx" ON "sermons" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "sermons_category_idx" ON "sermons" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "sunday_school_status_published_idx" ON "sunday_school_lessons" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "sunday_school_series_idx" ON "sunday_school_lessons" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sunday_school_series_lesson_unique" ON "sunday_school_lessons" USING btree ("series_id","lesson_number");--> statement-breakpoint
CREATE UNIQUE INDEX "taggables_tag_target_unique" ON "taggables" USING btree ("tag_id","taggable_type","taggable_id");--> statement-breakpoint
CREATE INDEX "taggables_target_idx" ON "taggables" USING btree ("taggable_type","taggable_id");