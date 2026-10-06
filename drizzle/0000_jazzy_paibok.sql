CREATE TYPE "public"."audit_result" AS ENUM('success', 'denied', 'failure');--> statement-breakpoint
CREATE TYPE "public"."auth_token_purpose" AS ENUM('invite', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."board_member_role" AS ENUM('manager', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."board_visibility" AS ENUM('workspace', 'private');--> statement-breakpoint
CREATE TYPE "public"."card_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."card_source" AS ENUM('manual', 'form', 'email', 'api');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."email_automation_recipient" AS ENUM('requester', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('short_text', 'long_text', 'number', 'date', 'datetime', 'checkbox', 'select', 'radio', 'multiselect', 'email', 'phone', 'url', 'currency', 'user', 'attachment');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"custom_field_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(160) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_id" uuid,
	"session_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80),
	"entity_id" varchar(120),
	"result" "audit_result" DEFAULT 'success' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"purpose" "auth_token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_members" (
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "board_member_role" DEFAULT 'viewer' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_members_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "board_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visible_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_field" varchar(80) DEFAULT 'reference' NOT NULL,
	"sort_dir" varchar(4) DEFAULT 'asc' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(32) DEFAULT '#2563eb' NOT NULL,
	"icon" varchar(64),
	"visibility" "board_visibility" DEFAULT 'workspace' NOT NULL,
	"create_card_button_label" varchar(80),
	"expiration_minutes" integer,
	"kanban_visible_field_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"only_assignee_can_edit" boolean DEFAULT false NOT NULL,
	"only_manager_can_delete_cards" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_assignees" (
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	CONSTRAINT "card_assignees_card_id_user_id_pk" PRIMARY KEY("card_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "card_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"custom_field_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"phase_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"priority" "card_priority" DEFAULT 'medium' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"requester_name" varchar(160),
	"requester_email" varchar(320),
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"source" "card_source" DEFAULT 'manual' NOT NULL,
	"source_form_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"phase_id" uuid,
	"key" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"description" text,
	"type" "field_type" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"trigger_phase_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"recipient_type" "email_automation_recipient" DEFAULT 'requester' NOT NULL,
	"recipient_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid,
	"template_id" uuid,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"from_address" varchar(320) NOT NULL,
	"to_addresses" jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" varchar(300) NOT NULL,
	"html_body" text,
	"text_body" text,
	"provider_message_id" varchar(255),
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid,
	"key" varchar(100) NOT NULL,
	"name" varchar(160) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"html_body" text,
	"text_body" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid,
	"card_id" uuid,
	"actor_id" uuid,
	"type" varchar(100) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"custom_field_id" uuid,
	"target_field" varchar(80),
	"type" "field_type" NOT NULL,
	"label" varchar(160) NOT NULL,
	"help_text" text,
	"placeholder" varchar(240),
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"target_phase_id" uuid,
	"name" varchar(160) NOT NULL,
	"public_key" varchar(64) NOT NULL,
	"description" text,
	"success_message" text,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"require_requester_email" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"color" varchar(32),
	"position" integer DEFAULT 0 NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"card_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" varchar(64),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"avatar_url" text,
	"system_role" "system_role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_assignees" ADD CONSTRAINT "card_assignees_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_assignees" ADD CONSTRAINT "card_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_assignees" ADD CONSTRAINT "card_assignees_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_field_values" ADD CONSTRAINT "card_field_values_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_field_values" ADD CONSTRAINT "card_field_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_form_id_intake_forms_id_fk" FOREIGN KEY ("source_form_id") REFERENCES "public"."intake_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_trigger_phase_id_phases_id_fk" FOREIGN KEY ("trigger_phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_intake_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."intake_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_target_phase_id_phases_id_fk" FOREIGN KEY ("target_phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_card_idx" ON "attachments" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "attachments_custom_field_idx" ON "attachments" USING btree ("custom_field_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_unique" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_idx" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_expiry_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "board_members_user_idx" ON "board_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "board_reports_board_idx" ON "board_reports" USING btree ("board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_workspace_slug_unique" ON "boards" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "boards_workspace_position_idx" ON "boards" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "card_assignees_user_idx" ON "card_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_field_values_card_field_unique" ON "card_field_values" USING btree ("card_id","custom_field_id");--> statement-breakpoint
CREATE INDEX "card_field_values_field_idx" ON "card_field_values" USING btree ("custom_field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_board_number_unique" ON "cards" USING btree ("board_id","number");--> statement-breakpoint
CREATE INDEX "cards_phase_position_idx" ON "cards" USING btree ("phase_id","position");--> statement-breakpoint
CREATE INDEX "cards_workspace_updated_idx" ON "cards" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "cards_requester_email_idx" ON "cards" USING btree ("requester_email");--> statement-breakpoint
CREATE INDEX "comments_card_created_idx" ON "comments" USING btree ("card_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_board_key_unique" ON "custom_fields" USING btree ("board_id","key");--> statement-breakpoint
CREATE INDEX "custom_fields_board_position_idx" ON "custom_fields" USING btree ("board_id","position");--> statement-breakpoint
CREATE INDEX "custom_fields_phase_idx" ON "custom_fields" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "email_automations_board_idx" ON "email_automations" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "email_automations_trigger_idx" ON "email_automations" USING btree ("trigger_phase_id");--> statement-breakpoint
CREATE INDEX "email_messages_queue_idx" ON "email_messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "email_messages_card_idx" ON "email_messages" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_workspace_key_unique" ON "email_templates" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "email_templates_board_idx" ON "email_templates" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "events_card_occurred_idx" ON "events" USING btree ("card_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_workspace_occurred_idx" ON "events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "form_fields_form_position_idx" ON "form_fields" USING btree ("form_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_forms_public_key_unique" ON "intake_forms" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "intake_forms_board_idx" ON "intake_forms" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "phases_board_position_idx" ON "phases" USING btree ("board_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_unique" ON "workspaces" USING btree ("slug");