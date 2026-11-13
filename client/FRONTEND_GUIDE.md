# Guide frontend — Pointage RH (lire avec docs/API.md)
Stack : React 18 + TS + Vite + Tailwind 3 + React Router 6 + TanStack Query 5 + RHF/Zod + Radix + lucide-react + sonner. Alias `@/` = `src/`.
Commandes : `npm run dev` (5173, proxy `/api` et `/uploads` → `API_TARGET` ou http://localhost:4000), `npm run typecheck`, `npm run build`.
Aucune ressource externe (réseau local sans internet) : police Inter embarquée, pas de CDN. Interface 100 % FR, icônes Lucide, pas d'emojis.

## Où coder
- **Pages** : remplacer le fichier existant `src/pages/admin/<Nom>.tsx` ou `src/pages/app/<Nom>.tsx` (export default). Routes déjà déclarées dans `src/routes/AppRouter.tsx` (lazy) ; `/app/scan/:action` (slug `arrivee|depart|pause-debut|pause-fin`, voir `SCAN_ACTION_SLUGS`) et `/borne/:code` sont plein écran hors layout.
- **Hooks API** : `src/features/<domaine>/api.ts` (ex. `features/employees/api.ts`). Exemples : `features/auth/api.ts`, `features/notifications/api.ts`.
- **Composants métier partagés d'un domaine** : `src/features/<domaine>/components/*`. Composants génériques : `src/components/ui`.
- Droits par route/menu : `src/components/layout/nav.ts` (`ADMIN_NAV`, `rolesFor`) — appliqués automatiquement aux routes `/admin/*`.

## Conventions données
- Clés : `['<domaine>', 'list', filtres]`, `['<domaine>', 'detail', id]` ; exporter `xxxKeys`. Invalider `['<domaine>']` après mutation.
- `useQuery({ queryKey, queryFn: ({signal}) => api.get<Paginated<Employee>>('/employees', filtres, signal) })`. Les params vides sont ignorés.
- Erreurs : toute mutation sans `onError` affiche automatiquement `toast.error(error.message)` (message FR du serveur). `meta: { successMessage: 'Employé créé.' }` → toast succès ; `meta: { silent: true }` → rien. Dans un formulaire : `catch (e) { if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k,m]) => setError(k, {message:m})) }`.
- Affichage chargement/erreur/vide : `Skeleton`/`TableSkeleton`, `<ErrorState error={q.error} onRetry={q.refetch}/>`, `EmptyState`. Jamais de données fictives.
- Formulaires : RHF + `zodResolver(schema)` + `FormField` ; messages Zod en français.

## src/lib
- `api.ts` : `api.get(path, params?, signal?)`, `api.post(path, body?)`, `api.put`, `api.patch`, `api.delete`, `api.upload(path, {file, ...champs})` (multipart), `downloadFile(path, params?, nomParDéfaut)` (xlsx/pdf/csv), `assetUrl(photoUrl)`. Cookies inclus, header `X-Device-Id`. Erreurs → `ApiError {status, code, message, details, fieldErrors}` ; `status 0` = serveur injoignable ; 401 → session vidée + redirection /login. `errorMessage(e)`, `isApiError(e)`.
- `format.ts` (fuseau `company.timezone`) : `formatDate` 13/11/2026, `formatDateShort`, `formatDateLong` « Jeudi 13 novembre 2026 », `formatDayShort`, `formatWeekday`, `formatMonth('2026-11')`, `formatTime` 08:04, `formatTimeSeconds`, `formatDateTime`, `formatDuration(465)` « 7 h 45 », `formatRelative`, `formatNumber`, `formatPercent(0.87|87)`, `formatCurrency`, `todayISO()`, `currentMonthISO()`, `addDaysISO`, `addMonthsISO`, `monthRange('2026-11')`, `dayName(1..7)`, `formatWorkDays([1..5])`. Les `workDate` 'YYYY-MM-DD' sont gérées sans décalage.
- `labels.ts` : `ROLE_LABELS`, `CLOCK_STATE`, `DAY_STATUS`, `LEAVE_STATUS`, `ANOMALY_STATUS`, `SEVERITY`, `REVIEW_STATUS` (VALIDE/REJETE…), `EMPLOYEE_STATUS`, `CLOCK_ACTION`, `SCAN_ACTION_SLUGS`/`scanSlug`, `LEAVE_DECISION`, `SCHEDULE_SOURCE`, `GENDER`, `CONTRACT_TYPE`, `REPORT_TYPES`, `labelOf(dict, code)`.
- `types.ts` : `Role, User, Company, MeResponse, Paginated<T>, Employee, Attendance, ClockStatus, ClockState, DayStatus, LeaveStatus, AnomalyStatus, Severity, ClockAction, AppNotification`.
- `utils.ts` : `cn()`, `initials()`, `uuid()` (idempotencyKey, marche en HTTP), `toQuery()`.

## Auth — `useAuth()` (`@/features/auth/AuthProvider`)
`{ user, company, permissions, role, hasRole(...roles), can(perm), hasEmployee, isLoading, refresh(), logout() }` ; `homePathFor(user, company)`, `displayName(user)`. Garde-fous : `RequireAuth`, `RequireRole roles=[...]`, `RequireEmployee` (`src/routes/guards.tsx`). `ChangePasswordDialog`, `PasswordInput` disponibles.

## Composants UI — `import { … } from '@/components/ui'`
- `Button` variant `default|secondary|outline|ghost|destructive|success|dark|link`, size `sm|default|lg|xl|icon|icon-sm`, `loading`, `leftIcon`, `rightIcon`, `block`. `buttonVariants()` pour styler un `<Link>`.
- `Input` (`leftIcon`, `rightSlot`), `Textarea`, `Label` (`required`), `Checkbox`, `Switch` (Radix : `checked`/`onCheckedChange`).
- `Select` simple : `value`, `onValueChange`, `options=[{value,label}]`, `placeholder`, `allLabel="Tous"` (valeur '' = tous). Primitives : `SelectRoot/Trigger/Content/Item/Value`.
- `DatePicker` (`value` 'YYYY-MM-DD', `onChange(string)`, `type date|month|time|datetime-local`), `DateRangePicker {from,to,onChange}`.
- `SearchInput {value, onChange, debounce=300}`, `useDebounced(v)`, `FilterBar {search, children (filtres), actions, onReset, canReset}`.
- `Badge` variant `neutral|muted|outline|brand|info|success|warning|danger|dark`, `dot`. `StatusBadge kind="state|day|leave|anomaly|severity|review|employee" value={code}`.
- `Card`, `CardHeader {title, description, actions}`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription`.
- `Dialog`, `DialogContent size="sm|md|lg|xl"`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter`, `DialogClose`.
- `ConfirmDialog {open, onOpenChange, title, description, confirmLabel, tone='danger'|'default', withReason, reasonRequired, reasonMinLength=5, onConfirm(reason) => Promise}` (reste ouvert si la promesse échoue).
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem {icon, destructive}`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuCheckboxItem`.
- `Tabs`, `TabsList variant="pills|underline"`, `TabsTrigger`, `TabsContent`. `Tooltip {content, side}`. `Popover/PopoverTrigger/PopoverContent`.
- `Avatar {name, src, size xs|sm|md|lg|xl}` (initiales en repli). `Skeleton`, `TableSkeleton {rows, cols}`, `Spinner`, `PageLoader`, `Separator`.
- Tables : `TableContainer` > `Table` > `TableHeader/TableBody/TableRow {clickable, selected}/TableHead {sortable, sortDirection, onSort, align}/TableCell {align}` ; `TableEmptyRow {colSpan}`. `Pagination {page, pageSize, total, onPageChange, onPageSizeChange}` à placer sous la table dans `TableContainer`.
- `EmptyState {icon, title, description, action, compact}`, `ErrorState {error, onRetry, title, compact}`.
- `PageHeader {title, description, actions, backTo, children}` en tête de chaque page. `StatCard`/`KpiCard {label, value, icon, tone brand|success|warning|danger|neutral, hint, trend, invertTrend, loading, to | onClick}`.

## Style
Couleurs Tailwind : `ink` #111827, `brand` (#2563EB, `brand-50` #EFF6FF), `surface` #F8FAFC, `muted` #64748B, `success`/`warning`/`danger` (+ `-soft`, `-border`). Bordures `slate-200`, rayons `rounded-lg` (champs) / `rounded-xl` (cartes), ombres `shadow-card`/`shadow-pop`, `tabular` pour les chiffres. Mobile : zones tactiles ≥ 44 px, `pb-safe`/`pt-safe`.
