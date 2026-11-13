/**
 * Schéma relationnel — Pointage RH
 * Conventions : snake_case en base, camelCase en TS, horodatages timestamptz (UTC en base),
 * dates de travail (work_date) exprimées dans le fuseau de l'entreprise (Africa/Abidjan par défaut).
 */
import {
  pgTable, pgEnum, serial, integer, text, varchar, boolean, timestamp, date, jsonb,
  uniqueIndex, index, smallint, primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const ts = (n: string) => timestamp(n, { withTimezone: true });
const created = () => ts('created_at').defaultNow().notNull();
const updated = () => ts('updated_at').defaultNow().notNull();

/* ------------------------------------------------------------------ ENUMS */
export const roleEnum = pgEnum('role_code', ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']);
export const employeeStatusEnum = pgEnum('employee_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const contractEnum = pgEnum('contract_type', ['CDI', 'CDD', 'STAGE', 'INTERIM', 'CONSULTANT', 'AUTRE']);
export const attendanceStateEnum = pgEnum('attendance_state', [
  'NON_POINTE', 'PRESENT', 'EN_PAUSE', 'DE_RETOUR_DE_PAUSE', 'PARTI', 'POINTAGE_INCOMPLET', 'ANOMALIE',
]);
/** Qualification de la journée (indépendante de l'état de pointage) */
export const dayStatusEnum = pgEnum('day_status', [
  'EN_COURS', 'PRESENT', 'RETARD', 'ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION',
  'MISSION', 'FERIE', 'NON_TRAVAILLE', 'INCOMPLET',
]);
export const eventTypeEnum = pgEnum('event_type', ['ARRIVEE', 'DEPART', 'PAUSE_DEBUT', 'PAUSE_FIN']);
export const eventResultEnum = pgEnum('event_result', ['ACCEPTE', 'REFUSE']);
export const eventSourceEnum = pgEnum('event_source', ['QR_MOBILE', 'BADGE_BORNE', 'ADMIN_CORRECTION', 'ADMIN_EXCEPTIONNEL']);
export const locationTypeEnum = pgEnum('location_type', ['ENTREE', 'SORTIE', 'MIXTE']);
export const qrModeEnum = pgEnum('qr_mode', ['DYNAMIQUE', 'STATIQUE']);
export const leaveStatusEnum = pgEnum('leave_status', ['BROUILLON', 'EN_ATTENTE', 'APPROUVE', 'REFUSE', 'ANNULE']);
export const leaveCategoryEnum = pgEnum('leave_category', ['CONGE', 'PERMISSION', 'MISSION', 'MALADIE', 'AUTRE']);
export const reviewEnum = pgEnum('review_decision', ['FAVORABLE', 'DEFAVORABLE']);
export const justifStatusEnum = pgEnum('justification_status', ['EN_ATTENTE', 'VALIDE', 'REJETE']);
export const overtimeStatusEnum = pgEnum('overtime_status', ['EN_ATTENTE', 'VALIDE', 'REFUSE']);
export const anomalyStatusEnum = pgEnum('anomaly_status', ['OUVERTE', 'EN_COURS', 'RESOLUE', 'IGNOREE']);
export const severityEnum = pgEnum('severity', ['FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE']);
export const anomalyTypeEnum = pgEnum('anomaly_type', [
  'ARRIVEE_MANQUANTE', 'DEPART_MANQUANT', 'DOUBLE_ARRIVEE', 'DOUBLE_DEPART', 'DEPART_SANS_ARRIVEE',
  'HORS_HORAIRE', 'JOUR_NON_TRAVAILLE', 'PAUSE_NON_TERMINEE', 'DUREE_ANORMALE', 'DEPASSEMENT_HORAIRE',
  'CORRECTION_MANUELLE', 'TENTATIVES_REPETEES', 'HORS_RESEAU', 'QR_INVALIDE',
]);

/* --------------------------------------------------------------- COMPANY */
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  logoPath: text('logo_path'),
  address: text('address'),
  phone: varchar('phone', { length: 40 }),
  email: varchar('email', { length: 160 }),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Africa/Abidjan'),
  currency: varchar('currency', { length: 8 }).notNull().default('XOF'),
  openingTime: varchar('opening_time', { length: 5 }), // HH:mm (horaires de l'établissement)
  closingTime: varchar('closing_time', { length: 5 }),
  setupCompleted: boolean('setup_completed').notNull().default(false),
  clockingEnabled: boolean('clocking_enabled').notNull().default(false),
  activatedAt: ts('activated_at'),
  createdAt: created(), updatedAt: updated(),
});

/** Paramètres clé/valeur typés (pointage, sécurité, conservation, sauvegarde, majorations HS…) */
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: integer('updated_by'),
  updatedAt: updated(),
});

/* ---------------------------------------------------------- ORGANISATION */
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  description: text('description'),
  managerEmployeeId: integer('manager_employee_id'),
  active: boolean('active').notNull().default(true),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ codeU: uniqueIndex('departments_code_u').on(t.code) }));

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 120 }).notNull(),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ titleU: uniqueIndex('positions_title_dept_u').on(t.title, t.departmentId) }));

/* ------------------------------------------------------------- RBAC */
export const roles = pgTable('roles', {
  code: roleEnum('code').primaryKey(),
  label: varchar('label', { length: 80 }).notNull(),
  description: text('description'),
});
export const permissions = pgTable('permissions', {
  code: varchar('code', { length: 80 }).primaryKey(),
  label: varchar('label', { length: 160 }).notNull(),
});
export const rolePermissions = pgTable('role_permissions', {
  role: roleEnum('role').notNull().references(() => roles.code, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 80 }).notNull().references(() => permissions.code, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.role, t.permission] }) }));

/* ------------------------------------------------------------ PERSONNES */
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  matricule: varchar('matricule', { length: 30 }).notNull(),
  lastName: varchar('last_name', { length: 80 }).notNull(),
  firstNames: varchar('first_names', { length: 120 }).notNull(),
  photoPath: text('photo_path'),
  email: varchar('email', { length: 160 }),
  phone: varchar('phone', { length: 40 }),
  gender: varchar('gender', { length: 1 }), // 'M' | 'F' | null (facultatif)
  birthDate: date('birth_date'),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
  positionId: integer('position_id').references(() => positions.id, { onDelete: 'set null' }),
  hireDate: date('hire_date'),
  contractType: contractEnum('contract_type').notNull().default('CDI'),
  status: employeeStatusEnum('status').notNull().default('ACTIVE'),
  managerId: integer('manager_id'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({
  matU: uniqueIndex('employees_matricule_u').on(t.matricule),
  emailU: uniqueIndex('employees_email_u').on(t.email),
  deptI: index('employees_dept_i').on(t.departmentId),
  statusI: index('employees_status_i').on(t.status),
}));

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'restrict' }),
  login: varchar('login', { length: 160 }).notNull(), // email ou matricule
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('EMPLOYEE'),
  active: boolean('active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  failedAttempts: smallint('failed_attempts').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  passwordChangedAt: ts('password_changed_at'),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({
  loginU: uniqueIndex('users_login_u').on(sql`lower(${t.login})`),
  empU: uniqueIndex('users_employee_u').on(t.employeeId),
}));

/** Sessions serveur (révocables) — le cookie HttpOnly porte un JWT référencant la session */
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
  deviceId: varchar('device_id', { length: 64 }),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').defaultNow().notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: created(),
}, (t) => ({ userI: index('sessions_user_i').on(t.userId) }));

/* ------------------------------------------------------------- HORAIRES */
/** Modèle d'horaire (nom stable) ; les règles vivent dans des versions datées */
export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ nameU: uniqueIndex('schedules_name_u').on(t.name) }));

/**
 * Version d'un horaire, avec date d'entrée en vigueur. Jamais modifiée une fois en vigueur :
 * une modification crée une nouvelle version → les anciennes présences gardent leurs règles.
 */
export const scheduleVersions = pgTable('schedule_versions', {
  id: serial('id').primaryKey(),
  scheduleId: integer('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  effectiveFrom: date('effective_from').notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(), // HH:mm
  endTime: varchar('end_time', { length: 5 }).notNull(),     // si <= start → traverse minuit
  breakStart: varchar('break_start', { length: 5 }),
  breakEnd: varchar('break_end', { length: 5 }),
  workDays: jsonb('work_days').$type<number[]>().notNull(), // ISO 1=lundi … 7=dimanche
  dailyMinutes: integer('daily_minutes').notNull(),          // durée théorique de travail effectif
  lateToleranceMin: integer('late_tolerance_min').notNull().default(10),
  earlyLeaveToleranceMin: integer('early_leave_tolerance_min').notNull().default(0),
  overtimeThresholdMin: integer('overtime_threshold_min').notNull().default(0), // HS comptées au-delà de théorique + seuil
  breakTracking: boolean('break_tracking').notNull().default(false), // pauses pointées ?
  maxBreaks: smallint('max_breaks').notNull().default(1),
  arrivalWindowBeforeMin: integer('arrival_window_before_min').notNull().default(120), // pointage accepté X min avant le début
  note: text('note'),
  createdBy: integer('created_by'),
  createdAt: created(),
}, (t) => ({ u: uniqueIndex('schedule_versions_u').on(t.scheduleId, t.effectiveFrom) }));

/** Affectation : à un employé (prioritaire) ou à un département, avec période d'effet */
export const scheduleAssignments = pgTable('schedule_assignments', {
  id: serial('id').primaryKey(),
  scheduleId: integer('schedule_id').notNull().references(() => schedules.id, { onDelete: 'restrict' }),
  employeeId: integer('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
  departmentId: integer('department_id').references(() => departments.id, { onDelete: 'cascade' }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdBy: integer('created_by'),
  createdAt: created(),
}, (t) => ({
  empI: index('sa_emp_i').on(t.employeeId, t.effectiveFrom),
  depI: index('sa_dep_i').on(t.departmentId, t.effectiveFrom),
}));

export const holidays = pgTable('holidays', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  label: varchar('label', { length: 120 }).notNull(),
  recurring: boolean('recurring').notNull().default(false), // même jour chaque année
  createdAt: created(),
}, (t) => ({ dateU: uniqueIndex('holidays_date_u').on(t.date) }));

/* ------------------------------------------------------------ QR CODES */
export const locationQrCodes = pgTable('location_qr_codes', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 40 }).notNull(), // QR_ENTREE, QR_SORTIE…
  label: varchar('label', { length: 120 }).notNull(),
  type: locationTypeEnum('type').notNull(),
  mode: qrModeEnum('mode').notNull().default('DYNAMIQUE'),
  rotationSeconds: integer('rotation_seconds').notNull().default(30),
  secretVersion: integer('secret_version').notNull().default(1), // incrémenter = invalider les codes imprimés
  displayKey: varchar('display_key', { length: 64 }).notNull(), // clé de la borne d'affichage
  active: boolean('active').notNull().default(true),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ codeU: uniqueIndex('lqr_code_u').on(t.code) }));

export const employeeQrCodes = pgTable('employee_qr_codes', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).notNull(), // aléatoire 256 bits, non prévisible
  active: boolean('active').notNull().default(true),
  revokedAt: ts('revoked_at'),
  createdAt: created(),
}, (t) => ({
  tokenU: uniqueIndex('eqr_token_u').on(t.token),
  activeU: uniqueIndex('eqr_active_u').on(t.employeeId).where(sql`active`),
}));

/* ------------------------------------------------------------ PRÉSENCES */
/** Une ligne par employé et par journée de travail (contrainte d'unicité = anti-doublon) */
export const attendances = pgTable('attendances', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: date('work_date').notNull(),
  scheduleVersionId: integer('schedule_version_id').references(() => scheduleVersions.id),
  state: attendanceStateEnum('state').notNull().default('NON_POINTE'),
  dayStatus: dayStatusEnum('day_status').notNull().default('EN_COURS'),
  dayStatusOverride: dayStatusEnum('day_status_override'), // qualification imposée par les RH (avec motif tracé)
  arrivalAt: ts('arrival_at'),
  departureAt: ts('departure_at'),
  breakCount: smallint('break_count').notNull().default(0),
  // Calculs (minutes) — figés à partir de la version d'horaire de la journée
  expectedMinutes: integer('expected_minutes').notNull().default(0),
  lateRawMinutes: integer('late_raw_minutes').notNull().default(0),
  lateMinutes: integer('late_minutes').notNull().default(0),
  earlyLeaveMinutes: integer('early_leave_minutes').notNull().default(0),
  presenceMinutes: integer('presence_minutes').notNull().default(0),
  breakMinutes: integer('break_minutes').notNull().default(0),
  workedMinutes: integer('worked_minutes').notNull().default(0),
  normalMinutes: integer('normal_minutes').notNull().default(0),
  overtimePotentialMinutes: integer('overtime_potential_minutes').notNull().default(0),
  leaveRequestId: integer('leave_request_id'),
  justificationId: integer('justification_id'),
  isClosed: boolean('is_closed').notNull().default(false), // journée clôturée par le job de fin de journée
  corrected: boolean('corrected').notNull().default(false),
  notes: text('notes'),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({
  u: uniqueIndex('attendances_emp_date_u').on(t.employeeId, t.workDate),
  dateI: index('attendances_date_i').on(t.workDate),
  stateI: index('attendances_state_i').on(t.state),
}));

/** Journal immuable des tentatives de pointage (acceptées ET refusées) */
export const attendanceEvents = pgTable('attendance_events', {
  id: serial('id').primaryKey(),
  attendanceId: integer('attendance_id').references(() => attendances.id, { onDelete: 'restrict' }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'restrict' }),
  workDate: date('work_date'),
  type: eventTypeEnum('type').notNull(),
  serverTime: ts('server_time').defaultNow().notNull(),
  source: eventSourceEnum('source').notNull().default('QR_MOBILE'),
  locationQrId: integer('location_qr_id').references(() => locationQrCodes.id),
  result: eventResultEnum('result').notNull(),
  reasonCode: varchar('reason_code', { length: 60 }),
  reasonMessage: text('reason_message'),
  sessionId: varchar('session_id', { length: 64 }),
  deviceId: varchar('device_id', { length: 64 }),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
  clientTime: ts('client_time'), // informatif uniquement — jamais utilisé comme référence
  idempotencyKey: varchar('idempotency_key', { length: 80 }),
  supersededBy: integer('superseded_by'), // correction administrative
  createdBy: integer('created_by'),
  meta: jsonb('meta'),
}, (t) => ({
  empI: index('ae_emp_i').on(t.employeeId, t.serverTime),
  dateI: index('ae_date_i').on(t.workDate),
  // Anti-doublon en base : une seule ARRIVEE et un seul DEPART acceptés et non remplacés par journée
  oneArrival: uniqueIndex('ae_one_arrival_u').on(t.attendanceId)
    .where(sql`type = 'ARRIVEE' AND result = 'ACCEPTE' AND superseded_by IS NULL`),
  oneDeparture: uniqueIndex('ae_one_departure_u').on(t.attendanceId)
    .where(sql`type = 'DEPART' AND result = 'ACCEPTE' AND superseded_by IS NULL`),
  idemU: uniqueIndex('ae_idem_u').on(t.employeeId, t.idempotencyKey),
}));

/** Pauses pointées (séparées des arrivées/départs principaux) */
export const attendanceBreaks = pgTable('attendance_breaks', {
  id: serial('id').primaryKey(),
  attendanceId: integer('attendance_id').notNull().references(() => attendances.id, { onDelete: 'cascade' }),
  startAt: ts('start_at').notNull(),
  endAt: ts('end_at'),
  createdAt: created(),
}, (t) => ({ attI: index('ab_att_i').on(t.attendanceId) }));

/** Historique des corrections administratives (ancienne / nouvelle valeur, motif, auteur, date) */
export const attendanceCorrections = pgTable('attendance_corrections', {
  id: serial('id').primaryKey(),
  attendanceId: integer('attendance_id').notNull().references(() => attendances.id, { onDelete: 'restrict' }),
  field: varchar('field', { length: 40 }).notNull(), // arrivalAt | departureAt | dayStatus | EXCEPTIONNEL…
  oldValue: text('old_value'),
  newValue: text('new_value'),
  reason: text('reason').notNull(),
  adminUserId: integer('admin_user_id').notNull().references(() => users.id),
  createdAt: created(),
});

/* ------------------------------------------------------------ ANOMALIES */
export const anomalies = pgTable('anomalies', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  attendanceId: integer('attendance_id').references(() => attendances.id, { onDelete: 'set null' }),
  workDate: date('work_date').notNull(),
  type: anomalyTypeEnum('type').notNull(),
  severity: severityEnum('severity').notNull(),
  status: anomalyStatusEnum('status').notNull().default('OUVERTE'),
  message: text('message').notNull(),
  details: jsonb('details'),
  detectedAt: ts('detected_at').defaultNow().notNull(),
  resolvedBy: integer('resolved_by'),
  resolvedAt: ts('resolved_at'),
  resolutionNote: text('resolution_note'),
}, (t) => ({
  // évite de recréer la même anomalie ouverte pour un même jour
  u: uniqueIndex('anomalies_dedup_u').on(t.employeeId, t.workDate, t.type).where(sql`status IN ('OUVERTE','EN_COURS')`),
  statusI: index('anomalies_status_i').on(t.status, t.workDate),
}));

/* ------------------------------------------------------------ CONGÉS */
export const leaveTypes = pgTable('leave_types', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 30 }).notNull(),
  label: varchar('label', { length: 120 }).notNull(),
  category: leaveCategoryEnum('category').notNull(),
  paid: boolean('paid').notNull().default(true),
  requiresJustification: boolean('requires_justification').notNull().default(false),
  requiresHrValidation: boolean('requires_hr_validation').notNull().default(true),
  color: varchar('color', { length: 9 }),
  active: boolean('active').notNull().default(true),
}, (t) => ({ codeU: uniqueIndex('leave_types_code_u').on(t.code) }));

export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  leaveTypeId: integer('leave_type_id').notNull().references(() => leaveTypes.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  halfDayStart: boolean('half_day_start').notNull().default(false),
  halfDayEnd: boolean('half_day_end').notNull().default(false),
  workingDays: integer('working_days').notNull().default(0),
  comment: text('comment'),
  status: leaveStatusEnum('status').notNull().default('EN_ATTENTE'),
  managerDecision: reviewEnum('manager_decision'),
  managerComment: text('manager_comment'),
  managerReviewedBy: integer('manager_reviewed_by'),
  managerReviewedAt: ts('manager_reviewed_at'),
  hrDecidedBy: integer('hr_decided_by'),
  hrDecidedAt: ts('hr_decided_at'),
  hrComment: text('hr_comment'),
  justificationId: integer('justification_id'),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ empI: index('lr_emp_i').on(t.employeeId, t.startDate), statusI: index('lr_status_i').on(t.status) }));

export const justifications = pgTable('justifications', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  attendanceId: integer('attendance_id').references(() => attendances.id, { onDelete: 'set null' }),
  leaveRequestId: integer('leave_request_id'),
  workDate: date('work_date'),
  reason: text('reason').notNull(),
  filePath: text('file_path'),
  fileName: varchar('file_name', { length: 200 }),
  mimeType: varchar('mime_type', { length: 80 }),
  status: justifStatusEnum('status').notNull().default('EN_ATTENTE'),
  reviewedBy: integer('reviewed_by'),
  reviewedAt: ts('reviewed_at'),
  reviewComment: text('review_comment'),
  createdAt: created(),
}, (t) => ({ empI: index('j_emp_i').on(t.employeeId) }));

/* ------------------------------------------------------- HEURES SUP. */
export const overtimeRecords = pgTable('overtime_records', {
  id: serial('id').primaryKey(),
  attendanceId: integer('attendance_id').notNull().references(() => attendances.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  workDate: date('work_date').notNull(),
  potentialMinutes: integer('potential_minutes').notNull(),
  validatedMinutes: integer('validated_minutes'),
  status: overtimeStatusEnum('status').notNull().default('EN_ATTENTE'),
  rateCode: varchar('rate_code', { length: 40 }), // référence à un taux paramétré (aucun taux inventé)
  decidedBy: integer('decided_by'),
  decidedAt: ts('decided_at'),
  comment: text('comment'),
  createdAt: created(), updatedAt: updated(),
}, (t) => ({ attU: uniqueIndex('ot_att_u').on(t.attendanceId), statusI: index('ot_status_i').on(t.status) }));

/* ------------------------------------------------------- NOTIFICATIONS */
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  link: varchar('link', { length: 200 }),
  readAt: ts('read_at'),
  createdAt: created(),
}, (t) => ({ userI: index('notif_user_i').on(t.userId, t.readAt) }));

/* ------------------------------------------------------------- AUDIT */
/** Append-only : UPDATE/DELETE bloqués par trigger en base */
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  at: ts('at').defaultNow().notNull(),
  userId: integer('user_id'),
  userLogin: varchar('user_login', { length: 160 }),
  action: varchar('action', { length: 60 }).notNull(),
  entity: varchar('entity', { length: 60 }),
  entityId: varchar('entity_id', { length: 60 }),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  ip: varchar('ip', { length: 64 }),
  userAgent: text('user_agent'),
}, (t) => ({ atI: index('audit_at_i').on(t.at), actionI: index('audit_action_i').on(t.action) }));

/** Tentatives de pointage par employé (limitation + détection d'abus) */
export const backups = pgTable('backups', {
  id: serial('id').primaryKey(),
  fileName: varchar('file_name', { length: 200 }).notNull(),
  sizeBytes: integer('size_bytes'),
  status: varchar('status', { length: 20 }).notNull(),
  trigger: varchar('trigger', { length: 20 }).notNull(), // AUTO | MANUEL
  message: text('message'),
  createdBy: integer('created_by'),
  createdAt: created(),
});
