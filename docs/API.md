# API — Pointage RH (contrat v1)

Base : `/api`. JSON uniquement (sauf uploads `multipart/form-data` et exports binaires).
Authentification : cookie `sid` **HttpOnly, SameSite=Strict, Secure (en HTTPS)** posé par `/auth/login`. Le frontend appelle toujours avec `credentials: 'include'`. Aucun jeton dans localStorage.
Toutes les heures renvoyées sont des ISO 8601 UTC (`2026-11-13T08:04:12.000Z`) ; le frontend les affiche dans le fuseau `company.timezone` (Africa/Abidjan = UTC+0). Les dates de journée (`workDate`) sont des `YYYY-MM-DD`.

## Conventions
- Erreur : `HTTP 4xx/5xx` + `{ "error": { "code": "DOUBLE_ARRIVEE", "message": "Texte lisible en français", "details"?: any } }`
- Liste paginée : `{ "items": [...], "total": 123, "page": 1, "pageSize": 25 }` — paramètres `?page=&pageSize=&q=&sort=`
- 401 `UNAUTHENTICATED` → rediriger vers /login. 403 `FORBIDDEN`. 423 `ACCOUNT_LOCKED`. 409 conflit métier. 422 `VALIDATION_ERROR` (details = issues zod).
- Rôles : `SUPER_ADMIN`, `HR_ADMIN`, `MANAGER`, `EMPLOYEE`. Le MANAGER ne voit que son département (filtré côté serveur).
- Header facultatif `X-Device-Id` (UUID généré par le navigateur, stocké en localStorage — non sensible) envoyé sur tous les appels.

## Auth
| Méthode | Route | Corps / réponse |
|---|---|---|
| POST | `/auth/login` | `{login, password}` → `{user}` (login = email ou matricule) |
| POST | `/auth/logout` | → `{ok:true}` |
| GET | `/auth/me` | → `{user, company, permissions: string[]}` |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` (min 8, 1 chiffre, 1 lettre) |

`user` = `{id, login, role, mustChangePassword, employee: {id, matricule, firstNames, lastName, photoUrl, departmentId, departmentName, positionTitle} | null}`
`company` = `{id, name, logoUrl, timezone, currency, setupCompleted, clockingEnabled}`

## Setup (assistant de configuration) — SUPER_ADMIN
| GET | `/setup/status` | → `{setupCompleted, clockingEnabled, checklist: [{key, label, done}]}` |
|---|---|---|
| PUT | `/setup/company` | `{name, address?, phone?, email?, timezone, currency, openingTime?, closingTime?}` |
| PUT | `/setup/schedule` | crée/maj l'horaire par défaut : corps = `ScheduleVersionInput` |
| POST | `/setup/activate` | → 409 `SETUP_INCOMPLETE` si checklist incomplète ; sinon active le pointage |
| POST | `/setup/deactivate` | suspend le pointage (motif obligatoire `{reason}`) |

## Paramètres — SUPER_ADMIN (lecture HR_ADMIN)
| GET/PUT | `/settings/company` | infos entreprise (PUT = même corps que setup/company) |
| POST | `/settings/company/logo` | multipart `file` (png/jpg/svg ≤ 2 Mo) |
| GET/PUT | `/settings/system` | `{clocking: {allowedNetworks: string[] (CIDR), enforceNetwork: boolean, maxAttemptsPerMinute, repeatedRefusalThreshold}, security: {sessionHours, maxLoginAttempts, lockMinutes}, retention: {auditDays, attendanceYears}, backup: {enabled, cron, keep}, overtime: {requireValidation: boolean, rates: [{code, label, percent}]}, anomalies: {maxWorkMinutes, offHoursMarginMin}}` |

## Organisation
| GET/POST | `/departments` | `{name, code, description?, managerEmployeeId?}` |
| PUT/DELETE | `/departments/:id` | DELETE = désactivation |
| GET/POST | `/positions` | `{title, departmentId?}` |
| PUT | `/positions/:id` | |

## Employés
| GET | `/employees` | `?q=&departmentId=&status=&page=&pageSize=` → paginé `Employee` |
|---|---|---|
| GET | `/employees/:id` | → `Employee & {user: {login, role, active, lastLoginAt} , schedule: {name, version} }` |
| POST | `/employees` | `EmployeeInput & {role?, password?}` → `{employee, initialPassword}` (mot de passe généré si absent, affiché une seule fois) |
| PUT | `/employees/:id` | `EmployeeInput` partiel |
| POST | `/employees/:id/deactivate` / `/reactivate` | `{reason}` |
| POST | `/employees/:id/reset-password` | → `{temporaryPassword}` |
| POST | `/employees/:id/photo` | multipart `file` |
| GET | `/employees/:id/qrcode` | → `{token, png: dataURL}` (QR personnel) |
| POST | `/employees/:id/qrcode/regenerate` | révoque l'ancien |
| GET | `/employees/:id/attendance?from&to` | journées |
| GET | `/employees/export.xlsx` | fichier |
| GET | `/employees/import-template.xlsx` | modèle |
| POST | `/employees/import` | multipart `file` xlsx → `{created, skipped, errors: [{row, message}]}` |
| GET | `/employees/badges.pdf?ids=1,2,3` | badges imprimables avec QR personnels |

`Employee` = `{id, matricule, lastName, firstNames, fullName, photoUrl, email, phone, gender, birthDate, departmentId, departmentName, positionId, positionTitle, hireDate, contractType, status, managerId, managerName, role, createdAt}`
`EmployeeInput` = `{matricule, lastName, firstNames, email?, phone?, gender?, birthDate?, departmentId?, positionId?, hireDate?, contractType, managerId?}`

## Horaires
| GET | `/schedules` | → `[{id, name, description, isDefault, active, currentVersion: ScheduleVersion, versions: ScheduleVersion[], assignmentsCount}]` |
|---|---|---|
| POST | `/schedules` | `{name, description?, version: ScheduleVersionInput}` |
| PUT | `/schedules/:id` | `{name?, description?, active?, isDefault?}` |
| POST | `/schedules/:id/versions` | `ScheduleVersionInput` (nouvelle version datée ; `effectiveFrom` ≥ aujourd'hui sauf SUPER_ADMIN) |
| GET | `/schedules/assignments` | `?employeeId=&departmentId=` |
| POST | `/schedules/assignments` | `{scheduleId, employeeIds?: number[], departmentId?, effectiveFrom, effectiveTo?}` |
| DELETE | `/schedules/assignments/:id` | (clôture `effectiveTo` = veille) |
| GET | `/schedules/resolve?employeeId=&date=` | → `{source: 'EMPLOYE'|'DEPARTEMENT'|'DEFAUT', schedule, version}` |
| GET/POST | `/holidays` | `{date, label, recurring}` ; DELETE `/holidays/:id` |

`ScheduleVersionInput` = `{effectiveFrom, startTime 'HH:mm', endTime, breakStart?, breakEnd?, workDays: number[] (1..7), dailyMinutes, lateToleranceMin, earlyLeaveToleranceMin, overtimeThresholdMin, breakTracking, maxBreaks, arrivalWindowBeforeMin}`

## Pointage (employé connecté)
| GET | `/clock/status` | → `ClockStatus` |
|---|---|---|
| POST | `/clock/scan` | `{action: 'ARRIVEE'|'DEPART'|'PAUSE_DEBUT'|'PAUSE_FIN', qrPayload: string, idempotencyKey: uuid, clientTime?}` → `{ok:true, event: {type, serverTime}, status: ClockStatus, message}` ou erreur |

`ClockStatus` = `{workDate, state, dayStatus, arrivalAt, departureAt, breaks: [{startAt, endAt}], breakTracking, maxBreaks, allowedActions: string[], schedule: {name, startTime, endTime, breakStart, breakEnd, lateToleranceMin} | null, isWorkingDay, holiday: string|null, leave: {type, label}|null, lateMinutes, workedMinutes, clockingEnabled}`

Codes d'erreur de `/clock/scan` (message toujours en français, `details.existingTime` si pertinent) :
`CLOCKING_DISABLED, EMPLOYEE_INACTIVE, NETWORK_NOT_ALLOWED, QR_INVALID, QR_EXPIRED, QR_WRONG_COMPANY, QR_WRONG_TYPE, DOUBLE_ARRIVEE, DOUBLE_DEPART, DEPART_SANS_ARRIVEE, ARRIVEE_APRES_DEPART, PAUSE_NON_AUTORISEE, PAUSE_EN_COURS, AUCUNE_PAUSE_EN_COURS, MAX_PAUSES_ATTEINT, TROP_TOT, TOO_MANY_ATTEMPTS, TRANSITION_INVALIDE`

Pointage pendant un jour non travaillé / férié / congé : accepté mais génère une anomalie (signalée dans `message`).

## Borne QR de localisation (écran fixe)
| GET | `/kiosk/:code/token?k=displayKey` | (public, clé de borne) → `{payload, expiresAt, rotationSeconds, label, type, companyName, png}` |
|---|---|---|
| POST | `/kiosk/badge` | (session admin/RH) `{badgeToken, action, locationCode}` — pointage de secours par badge personnel |

## QR Codes de localisation — SUPER_ADMIN
| GET | `/locations` | → `[{id, code, label, type, mode, rotationSeconds, active, displayUrl}]` |
|---|---|---|
| POST | `/locations` / PUT `/locations/:id` | `{code, label, type, mode, rotationSeconds, active}` |
| POST | `/locations/:id/rotate-secret` | invalide tous les QR imprimés / clés de borne |
| GET | `/locations/:id/print.pdf` | affiche imprimable (mode STATIQUE) |

## Présences (RH / responsables)
| GET | `/attendance` | `?date=&from=&to=&departmentId=&employeeId=&state=&dayStatus=&page=` → paginé `Attendance` |
|---|---|---|
| GET | `/attendance/:id` | → `Attendance & {events: AttendanceEvent[], breaks, corrections, anomalies, overtime}` |
| GET | `/attendance/live?date=` | → `{date, present: Attendance[], notArrived: Employee[], late: [], earlyLeave: [], incomplete: [], onBreak: [], onLeave: [], counts: {...}}` |
| POST | `/attendance/:id/correct` | `{arrivalAt?, departureAt?, dayStatus?, reason}` (motif obligatoire, min 5 car.) |
| POST | `/attendance/exceptional` | `{employeeId, workDate, arrivalAt?, departureAt?, reason}` |
| GET | `/attendance/events` | `?employeeId=&from=&to=&result=` journal brut |

`Attendance` = `{id, employeeId, employee: {fullName, matricule, departmentName, photoUrl}, workDate, state, dayStatus, arrivalAt, departureAt, expectedMinutes, lateRawMinutes, lateMinutes, earlyLeaveMinutes, presenceMinutes, breakMinutes, workedMinutes, normalMinutes, overtimePotentialMinutes, corrected, isClosed}`

## Anomalies
| GET | `/anomalies` | `?status=&type=&severity=&from=&to=&departmentId=&employeeId=` paginé |
|---|---|---|
| POST | `/anomalies/:id/resolve` | `{status: 'RESOLUE'|'IGNOREE'|'EN_COURS', note}` |
| POST | `/anomalies/run-detection` | `{date?}` relance la détection (RH) |

## Absences
| GET | `/absences` | `?from=&to=&departmentId=&employeeId=&dayStatus=` → journées non présentes classées |
|---|---|---|

## Congés & permissions
| GET | `/leave-types` ; POST/PUT (SUPER_ADMIN/RH) | |
|---|---|---|
| GET | `/leaves` | `?scope=mine|team|all&status=&from=&to=` paginé `LeaveRequest` |
| POST | `/leaves` | multipart ou JSON `{leaveTypeId, startDate, endDate, comment?, draft?: boolean}` (+ `file` optionnel) |
| POST | `/leaves/:id/submit` / `/cancel` | |
| POST | `/leaves/:id/manager-review` | `{decision: 'FAVORABLE'|'DEFAVORABLE', comment?}` |
| POST | `/leaves/:id/decide` | RH : `{decision: 'APPROUVE'|'REFUSE', comment?}` |
| GET | `/leaves/calendar?from=&to=&departmentId=` | → `[{id, employeeId, fullName, departmentName, type, color, startDate, endDate, status}]` (+ jours fériés) |

## Justificatifs
| GET | `/justifications?scope=mine|all&status=` | |
|---|---|---|
| POST | `/justifications` | multipart `{workDate?, attendanceId?, leaveRequestId?, reason, file?}` (pdf/jpg/png ≤ 5 Mo) |
| GET | `/justifications/:id/file` | téléchargement (propriétaire ou RH) |
| POST | `/justifications/:id/review` | `{status: 'VALIDE'|'REJETE', comment?}` — VALIDE requalifie la journée en ABSENCE_JUSTIFIEE |

## Heures supplémentaires
| GET | `/overtime?status=&from=&to=&departmentId=` | paginé |
|---|---|---|
| POST | `/overtime/:id/decide` | `{status: 'VALIDE'|'REFUSE', validatedMinutes?, rateCode?, comment?}` |

## Espace employé
| GET | `/me/summary?month=YYYY-MM` | → `{workedMinutes, expectedMinutes, lateCount, lateMinutes, absences, overtimePotential, overtimeValidated, leaveDaysTaken, daysPresent}` |
|---|---|---|
| GET | `/me/attendance?from=&to=` | journées `Attendance` |
| GET | `/me/qrcode` | → `{token, png}` |
| GET | `/me/calendar?month=YYYY-MM` | → `[{date, dayStatus, state, holiday?, leave?}]` |

## Dashboard
| GET | `/dashboard/kpis?date=` | → `{activeEmployees, presentToday, absentToday, lateToday, onLeave, presenceRate, incomplete, overtimePending, openAnomalies, notArrivedYet, pendingLeaves}` |
|---|---|---|
| GET | `/dashboard/charts?from=&to=&departmentId=` | → `{presenceDaily: [{date, present, absent, late}], lateMonthly: [{month, count, minutes}], absenceBreakdown: [{status, count}], presenceByDepartment: [{department, rate}], overtimeByDepartment: [{department, minutes}], presenceRateTrend: [{date, rate}]}` |

## Rapports
| GET | `/reports/:type` | type ∈ `daily, weekly, monthly, employee, late, absences, leaves, overtime, department, anomalies` ; `?from=&to=&employeeId=&departmentId=&status=&format=json|xlsx|pdf|csv` |
|---|---|---|

JSON → `{title, period: {from, to}, generatedAt, summary: [{label, value}], columns: [{key, label}], rows: []}`.

## Notifications
| GET | `/notifications?unread=1&limit=30` | → `{items: AppNotification[], unreadCount}` — `AppNotification = {id, type, title, body: string|null, link: string|null, readAt: string|null, createdAt}` (`link` = route frontend à ouvrir, ex. `/app/history`) |
|---|---|---|
| POST | `/notifications/:id/read` ; `/notifications/read-all` | |

## Audit — SUPER_ADMIN
| GET | `/audit?action=&userId=&from=&to=&page=` | paginé |
|---|---|---|

## Utilisateurs admin — SUPER_ADMIN
| GET | `/users?role=` | → `[{id, login, role, active, employeeId, employeeName, lastLoginAt, lockedUntil, createdAt}]` |
|---|---|---|
| POST | `/users` | `{login, password?, role, employeeId?}` |
| PUT | `/users/:id` | `{role?, active?}` |

## Sauvegardes — SUPER_ADMIN
| GET | `/backups` | → `[{id, fileName, sizeBytes, status: 'OK'|'ERREUR', trigger: 'AUTO'|'MANUEL', message, createdAt}]` |
|---|---|---|
| POST | `/backups` | sauvegarde immédiate |
| GET | `/backups/:id/download` | |

## Formats complémentaires
- `Anomaly` = `{id, employeeId, employee: {fullName, matricule, departmentName}, attendanceId, workDate, type, severity, status, message, details, detectedAt, resolvedAt, resolutionNote}` ; types : `ARRIVEE_MANQUANTE, DEPART_MANQUANT, DOUBLE_ARRIVEE, DOUBLE_DEPART, DEPART_SANS_ARRIVEE, HORS_HORAIRE, JOUR_NON_TRAVAILLE, PAUSE_NON_TERMINEE, DUREE_ANORMALE, DEPASSEMENT_HORAIRE, CORRECTION_MANUELLE, TENTATIVES_REPETEES, HORS_RESEAU, QR_INVALIDE`
- `LeaveRequest` = `{id, employeeId, employee: {fullName, matricule, departmentName}, leaveType: {id, code, label, category, color, requiresJustification}, startDate, endDate, workingDays, comment, status, managerDecision, managerComment, managerReviewedAt, hrComment, hrDecidedAt, justification: {id, fileName, status}|null, createdAt, canManagerReview: boolean, canDecide: boolean, canCancel: boolean}`
- `Justification` = `{id, employeeId, employee: {...}, workDate, attendanceId, leaveRequestId, reason, fileName, mimeType, hasFile, status, reviewComment, reviewedAt, createdAt}`
- `OvertimeRecord` = `{id, attendanceId, employeeId, employee: {...}, workDate, potentialMinutes, validatedMinutes, status, rateCode, comment, decidedAt, arrivalAt, departureAt, workedMinutes, expectedMinutes}`
- `AuditLog` = `{id, at, userId, userLogin, action, entity, entityId, before, after, reason, ip}`
- Absence (`/absences`) = `Attendance` dont `dayStatus` ∈ `ABSENCE_NON_JUSTIFIEE, ABSENCE_JUSTIFIEE, CONGE, PERMISSION, MISSION` + `justification` éventuelle.
- Événement de pointage (`/attendance/events`) = `{id, type, serverTime, source, result, reasonCode, reasonMessage, ip, deviceId, location, employee: {...}, supersededBy}`

## Santé
`GET /api/health` → `{ok, db, time, timezone}` (public)
