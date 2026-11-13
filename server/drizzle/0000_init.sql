CREATE TYPE "public"."anomaly_status" AS ENUM('OUVERTE', 'EN_COURS', 'RESOLUE', 'IGNOREE');--> statement-breakpoint
CREATE TYPE "public"."anomaly_type" AS ENUM('ARRIVEE_MANQUANTE', 'DEPART_MANQUANT', 'DOUBLE_ARRIVEE', 'DOUBLE_DEPART', 'DEPART_SANS_ARRIVEE', 'HORS_HORAIRE', 'JOUR_NON_TRAVAILLE', 'PAUSE_NON_TERMINEE', 'DUREE_ANORMALE', 'DEPASSEMENT_HORAIRE', 'CORRECTION_MANUELLE', 'TENTATIVES_REPETEES', 'HORS_RESEAU', 'QR_INVALIDE');--> statement-breakpoint
CREATE TYPE "public"."attendance_state" AS ENUM('NON_POINTE', 'PRESENT', 'EN_PAUSE', 'DE_RETOUR_DE_PAUSE', 'PARTI', 'POINTAGE_INCOMPLET', 'ANOMALIE');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('CDI', 'CDD', 'STAGE', 'INTERIM', 'CONSULTANT', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('EN_COURS', 'PRESENT', 'RETARD', 'ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION', 'FERIE', 'NON_TRAVAILLE', 'INCOMPLET');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."event_result" AS ENUM('ACCEPTE', 'REFUSE');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('QR_MOBILE', 'BADGE_BORNE', 'ADMIN_CORRECTION', 'ADMIN_EXCEPTIONNEL');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('ARRIVEE', 'DEPART', 'PAUSE_DEBUT', 'PAUSE_FIN');--> statement-breakpoint
CREATE TYPE "public"."justification_status" AS ENUM('EN_ATTENTE', 'VALIDE', 'REJETE');--> statement-breakpoint
CREATE TYPE "public"."leave_category" AS ENUM('CONGE', 'PERMISSION', 'MISSION', 'MALADIE', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('BROUILLON', 'EN_ATTENTE', 'APPROUVE', 'REFUSE', 'ANNULE');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('ENTREE', 'SORTIE', 'MIXTE');--> statement-breakpoint
CREATE TYPE "public"."overtime_status" AS ENUM('EN_ATTENTE', 'VALIDE', 'REFUSE');--> statement-breakpoint
CREATE TYPE "public"."qr_mode" AS ENUM('DYNAMIQUE', 'STATIQUE');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('FAVORABLE', 'DEFAVORABLE');--> statement-breakpoint
CREATE TYPE "public"."role_code" AS ENUM('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE');--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"attendance_id" integer,
	"work_date" date NOT NULL,
	"type" "anomaly_type" NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "anomaly_status" DEFAULT 'OUVERTE' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "attendance_breaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_id" integer NOT NULL,
	"field" varchar(40) NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text NOT NULL,
	"admin_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_id" integer,
	"employee_id" integer NOT NULL,
	"work_date" date,
	"type" "event_type" NOT NULL,
	"server_time" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "event_source" DEFAULT 'QR_MOBILE' NOT NULL,
	"location_qr_id" integer,
	"result" "event_result" NOT NULL,
	"reason_code" varchar(60),
	"reason_message" text,
	"session_id" varchar(64),
	"device_id" varchar(64),
	"ip" varchar(64),
	"user_agent" text,
	"client_time" timestamp with time zone,
	"idempotency_key" varchar(80),
	"superseded_by" integer,
	"created_by" integer,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"work_date" date NOT NULL,
	"schedule_version_id" integer,
	"state" "attendance_state" DEFAULT 'NON_POINTE' NOT NULL,
	"day_status" "day_status" DEFAULT 'EN_COURS' NOT NULL,
	"day_status_override" "day_status",
	"arrival_at" timestamp with time zone,
	"departure_at" timestamp with time zone,
	"break_count" smallint DEFAULT 0 NOT NULL,
	"expected_minutes" integer DEFAULT 0 NOT NULL,
	"late_raw_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_leave_minutes" integer DEFAULT 0 NOT NULL,
	"presence_minutes" integer DEFAULT 0 NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"normal_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_potential_minutes" integer DEFAULT 0 NOT NULL,
	"leave_request_id" integer,
	"justification_id" integer,
	"is_closed" boolean DEFAULT false NOT NULL,
	"corrected" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"user_login" varchar(160),
	"action" varchar(60) NOT NULL,
	"entity" varchar(60),
	"entity_id" varchar(60),
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" varchar(64),
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" varchar(200) NOT NULL,
	"size_bytes" integer,
	"status" varchar(20) NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"message" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"legal_name" varchar(200),
	"logo_path" text,
	"address" text,
	"phone" varchar(40),
	"email" varchar(160),
	"timezone" varchar(64) DEFAULT 'Africa/Abidjan' NOT NULL,
	"currency" varchar(8) DEFAULT 'XOF' NOT NULL,
	"opening_time" varchar(5),
	"closing_time" varchar(5),
	"setup_completed" boolean DEFAULT false NOT NULL,
	"clocking_enabled" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" text,
	"manager_employee_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_qr_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"matricule" varchar(30) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"first_names" varchar(120) NOT NULL,
	"photo_path" text,
	"email" varchar(160),
	"phone" varchar(40),
	"gender" varchar(1),
	"birth_date" date,
	"department_id" integer,
	"position_id" integer,
	"hire_date" date,
	"contract_type" "contract_type" DEFAULT 'CDI' NOT NULL,
	"status" "employee_status" DEFAULT 'ACTIVE' NOT NULL,
	"manager_id" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"label" varchar(120) NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"attendance_id" integer,
	"leave_request_id" integer,
	"work_date" date,
	"reason" text NOT NULL,
	"file_path" text,
	"file_name" varchar(200),
	"mime_type" varchar(80),
	"status" "justification_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day_start" boolean DEFAULT false NOT NULL,
	"half_day_end" boolean DEFAULT false NOT NULL,
	"working_days" integer DEFAULT 0 NOT NULL,
	"comment" text,
	"status" "leave_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"manager_decision" "review_decision",
	"manager_comment" text,
	"manager_reviewed_by" integer,
	"manager_reviewed_at" timestamp with time zone,
	"hr_decided_by" integer,
	"hr_decided_at" timestamp with time zone,
	"hr_comment" text,
	"justification_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"label" varchar(120) NOT NULL,
	"category" "leave_category" NOT NULL,
	"paid" boolean DEFAULT true NOT NULL,
	"requires_justification" boolean DEFAULT false NOT NULL,
	"requires_hr_validation" boolean DEFAULT true NOT NULL,
	"color" varchar(9),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_qr_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" varchar(120) NOT NULL,
	"type" "location_type" NOT NULL,
	"mode" "qr_mode" DEFAULT 'DYNAMIQUE' NOT NULL,
	"rotation_seconds" integer DEFAULT 30 NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"display_key" varchar(64) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(200),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"work_date" date NOT NULL,
	"potential_minutes" integer NOT NULL,
	"validated_minutes" integer,
	"status" "overtime_status" DEFAULT 'EN_ATTENTE' NOT NULL,
	"rate_code" varchar(40),
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" varchar(80) PRIMARY KEY NOT NULL,
	"label" varchar(160) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"department_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" "role_code" NOT NULL,
	"permission" varchar(80) NOT NULL,
	CONSTRAINT "role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"code" "role_code" PRIMARY KEY NOT NULL,
	"label" varchar(80) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"employee_id" integer,
	"department_id" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"effective_from" date NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"break_start" varchar(5),
	"break_end" varchar(5),
	"work_days" jsonb NOT NULL,
	"daily_minutes" integer NOT NULL,
	"late_tolerance_min" integer DEFAULT 10 NOT NULL,
	"early_leave_tolerance_min" integer DEFAULT 0 NOT NULL,
	"overtime_threshold_min" integer DEFAULT 0 NOT NULL,
	"break_tracking" boolean DEFAULT false NOT NULL,
	"max_breaks" smallint DEFAULT 1 NOT NULL,
	"arrival_window_before_min" integer DEFAULT 120 NOT NULL,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"device_id" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer,
	"login" varchar(160) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role_code" DEFAULT 'EMPLOYEE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_location_qr_id_location_qr_codes_id_fk" FOREIGN KEY ("location_qr_id") REFERENCES "public"."location_qr_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_schedule_version_id_schedule_versions_id_fk" FOREIGN KEY ("schedule_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_qr_codes" ADD CONSTRAINT "employee_qr_codes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justifications" ADD CONSTRAINT "justifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justifications" ADD CONSTRAINT "justifications_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_attendance_id_attendances_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_roles_code_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_permissions_code_fk" FOREIGN KEY ("permission") REFERENCES "public"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomalies_dedup_u" ON "anomalies" USING btree ("employee_id","work_date","type") WHERE status IN ('OUVERTE','EN_COURS');--> statement-breakpoint
CREATE INDEX "anomalies_status_i" ON "anomalies" USING btree ("status","work_date");--> statement-breakpoint
CREATE INDEX "ab_att_i" ON "attendance_breaks" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "ae_emp_i" ON "attendance_events" USING btree ("employee_id","server_time");--> statement-breakpoint
CREATE INDEX "ae_date_i" ON "attendance_events" USING btree ("work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ae_one_arrival_u" ON "attendance_events" USING btree ("attendance_id") WHERE type = 'ARRIVEE' AND result = 'ACCEPTE' AND superseded_by IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ae_one_departure_u" ON "attendance_events" USING btree ("attendance_id") WHERE type = 'DEPART' AND result = 'ACCEPTE' AND superseded_by IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ae_idem_u" ON "attendance_events" USING btree ("employee_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_emp_date_u" ON "attendances" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "attendances_date_i" ON "attendances" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "attendances_state_i" ON "attendances" USING btree ("state");--> statement-breakpoint
CREATE INDEX "audit_at_i" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_action_i" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_u" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "eqr_token_u" ON "employee_qr_codes" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "eqr_active_u" ON "employee_qr_codes" USING btree ("employee_id") WHERE active;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_matricule_u" ON "employees" USING btree ("matricule");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_u" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "employees_dept_i" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "employees_status_i" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_date_u" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "j_emp_i" ON "justifications" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "lr_emp_i" ON "leave_requests" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX "lr_status_i" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_code_u" ON "leave_types" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "lqr_code_u" ON "location_qr_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "notif_user_i" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ot_att_u" ON "overtime_records" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "ot_status_i" ON "overtime_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_title_dept_u" ON "positions" USING btree ("title","department_id");--> statement-breakpoint
CREATE INDEX "sa_emp_i" ON "schedule_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE INDEX "sa_dep_i" ON "schedule_assignments" USING btree ("department_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_versions_u" ON "schedule_versions" USING btree ("schedule_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_name_u" ON "schedules" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sessions_user_i" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_u" ON "users" USING btree (lower("login"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_employee_u" ON "users" USING btree ("employee_id");