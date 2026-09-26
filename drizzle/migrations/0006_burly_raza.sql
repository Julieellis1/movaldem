CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."question_selection" AS ENUM('fixed', 'random_pool');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."quiz_kind" AS ENUM('general', 'category', 'weekly', 'monthly', 'annual', 'special');--> statement-breakpoint
CREATE TYPE "public"."quiz_status" AS ENUM('draft', 'scheduled', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('manual', 'auto_timeout', 'admin');--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"text" text NOT NULL,
	"text_normalized" text NOT NULL,
	"difficulty" "question_difficulty" DEFAULT 'medium' NOT NULL,
	"marks" numeric(6, 2) DEFAULT '1' NOT NULL,
	"explanation" text,
	"ref_book" text,
	"ref_chapter" integer,
	"ref_verse_start" integer,
	"ref_verse_end" integer,
	"ref_display" text,
	"status" "question_status" DEFAULT 'active' NOT NULL,
	"type" text DEFAULT 'multiple_choice' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"is_correct" boolean,
	"marks_awarded" numeric(6, 2),
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"option_order" jsonb NOT NULL,
	"marks" numeric(6, 2) NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"submission_type" "submission_type",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"score" numeric(8, 2),
	"max_score" numeric(8, 2),
	"percentage" numeric(5, 2),
	"correct_count" integer,
	"wrong_count" integer,
	"unanswered_count" integer,
	"time_taken_seconds" integer,
	"passed" boolean,
	"cancelled_reason" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "quiz_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"quiz_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quiz_questions_quiz_id_question_id_pk" PRIMARY KEY("quiz_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"instructions" text,
	"kind" "quiz_kind" DEFAULT 'general' NOT NULL,
	"category_id" uuid,
	"include_subcategories" boolean DEFAULT true NOT NULL,
	"question_selection" "question_selection" DEFAULT 'random_pool' NOT NULL,
	"number_of_questions" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"pass_mark_percent" integer DEFAULT 50 NOT NULL,
	"negative_marks" numeric(6, 2) DEFAULT '0' NOT NULL,
	"randomize_questions" boolean DEFAULT true NOT NULL,
	"randomize_options" boolean DEFAULT true NOT NULL,
	"max_attempts" integer,
	"review_policy" text DEFAULT 'after_close' NOT NULL,
	"leaderboard_eligible" boolean DEFAULT false NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" "quiz_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quizzes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_quiz_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."quiz_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "public"."question_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_questions" ADD CONSTRAINT "quiz_attempt_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_category_id_quiz_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."quiz_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_options_question_idx" ON "question_options" USING btree ("question_id","sort_order");--> statement-breakpoint
CREATE INDEX "questions_category_idx" ON "questions" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "questions_normalized_idx" ON "questions" USING btree ("category_id","text_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_attempt_question_unique" ON "quiz_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempt_questions_position_unique" ON "quiz_attempt_questions" USING btree ("attempt_id","position");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_status_idx" ON "quiz_attempts" USING btree ("quiz_id","status");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_submitted_idx" ON "quiz_attempts" USING btree ("user_id","submitted_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_submitted_idx" ON "quiz_attempts" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "quiz_categories_parent_idx" ON "quiz_categories" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "quiz_questions_order_idx" ON "quiz_questions" USING btree ("quiz_id","sort_order");--> statement-breakpoint
CREATE INDEX "quizzes_status_idx" ON "quizzes" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "quizzes_category_idx" ON "quizzes" USING btree ("category_id");
-- QUIZ-31: exactly one in_progress attempt per user per quiz (partial unique
-- index). Drizzle's index builder cannot express WHERE, so it is added here.
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_attempts_one_in_progress_per_user"
  ON "quiz_attempts" USING btree ("user_id","quiz_id")
  WHERE "status" = 'in_progress';
