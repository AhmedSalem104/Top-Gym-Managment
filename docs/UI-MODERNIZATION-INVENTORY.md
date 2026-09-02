# Logic Fit UI Modernization Inventory

> Baseline inventory created before the HeroUI-inspired modernization pass. It is derived from the source HTML, hash-router markers, dynamically rendered view hooks, and the existing structural screen inventory. `NOT VERIFIED` means the modernized visual, interaction, accessibility, theme, and responsive state has not yet been re-certified.

## Baseline

| Item | Evidence | Status |
|---|---|---|
| Source architecture | Vanilla HTML/CSS/JavaScript with one generated stylesheet | PASS |
| Functional selector contract | IDs, names, data-* hooks and route hooks retained as the compatibility contract | PASS |
| Entry HTML pages | 7 | PASS |
| Active Gym hash views | 18 | PASS |
| Platform Admin panels | 9 | PASS |
| Registration step flows | Gym 6 + Trainer 6 | PASS |
| Portal roots/tools | 6 roots + 5 tools | PASS |
| Store subviews | 8 | PASS |
| Overlay roots | 29 | PASS |
| Form/filter/action hooks | 181 | PASS |
| Modernization visual certification | Must be re-run after migration | NOT VERIFIED |

## Status vocabulary

- `PASS`: reviewed and evidence exists for the stated dimension.
- `FIXED`: a visual or interaction issue was corrected and re-tested.
- `BLOCKED`: review cannot safely proceed because of a dependency or regression.
- `NOT VERIFIED`: discovered in source or structural QA, but the modernization dimension is not yet evidenced.

## Primary surface inventory

| Route | Screen | Module | Tenant type | Role | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` / `#dashboard` | Gateway / Login | Public + Auth | Gym entry | Unauthenticated, Owner, Assistant | Premium gateway then auth card | Gateway → login → session restore | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/register-gym` | Gym registration | Public onboarding | Gym | Unauthenticated | Six-step wizard, plan/payment/proof | Step validation → request submission | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/register-trainer` | Trainer registration | Public onboarding | Independent Trainer | Unauthenticated | Six-step wizard, plan/payment/proof | Step validation → request submission | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Platform Admin login | Control Plane Auth | Platform | PlatformAdmin | Dedicated login surface | Login → authenticated control plane | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Platform Admin shell | Control Plane | Platform | PlatformAdmin | Sidebar + topbar + panel router | Panel navigation, search, actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin-forbidden` | Forbidden state | Access boundary | Platform | Non-platform user | Centered error state | Safe return navigation | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/member-portal` | Member portal entry/home | Portal | Gym | Member | Mobile-first portal shell | Code lookup → member data | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/member-portal` | Client portal mode | Portal | Independent Trainer | Client | Shared portal shell, trainer mode | Client authentication → scoped data | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Trainer workspace | Trainer | Independent Trainer | Owner | Workspace shell + operational panels | Login → workspace actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |

## Gym hash-view inventory

| Route | Screen | Module | Tenant type | Role | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `#dashboard` | Dashboard | Gym operations | Gym | Owner / Assistant | KPI grid, alerts, finance, analytics | Load dashboard → actions → reports/analytics | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#members` | Members | Membership | Gym | Owner / Assistant | Searchable table + dialogs | Search/filter → CRUD → membership actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#trainees` | External trainees | Coaching | Gym | Owner / Assistant | Searchable directory + dialogs | CRUD → coaching profile → plans | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#attendance` | Attendance | Daily operations | Gym | Owner / Assistant | Check-in form + filtered history | Phone/QR → check-in/out → history | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#management` | Prices and memberships | Commercial | Gym | Owner | Catalog tables + dialogs | Edit plans/types → pricing in member flow | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#branding` | Branding | Tenant settings | Gym | Owner | Grouped form + live preview | Edit → preview → publish | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#member-payment-methods` | Member payment methods | Commercial settings | Gym | Owner | CRUD cards/form | Create/edit/delete payment method | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#permissions` | Permissions | Access control | Gym | Owner | User picker + permission matrix | Select assistant → grant/revoke | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#reports` | Reports | Reporting | Gym | Owner / Assistant | Report selector + charts/tables | Select report → query → print/PDF | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#feedback` | Member feedback | Feedback | Gym | Owner / Assistant | Filters + list/pagination | Filter → inspect → respond/review | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#library` | Exercise/food library | Shared catalog | Gym | Owner / Assistant | Search/filter + cards/dialogs | Search → details → CRUD where permitted | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#intelligence` | Operational intelligence | AI | Gym | Owner / Assistant | Priority insight cards + forms | Query → insight/plan draft → review | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | Store / POS | Commerce | Gym | Owner / Assistant | Multi-view store workspace | Browse → cart → checkout → inventory | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#expenses` | Expenses | Finance | Gym | Owner / Assistant | Form + filtered records | Create/edit/delete → financial summary | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#backup-history` | Backup history | Resilience | Gym | Owner | Action-first history panel | Backup → verify → restore confirmation | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#member-subscription-requests` | Member subscription requests | Membership | Gym | Owner | Proof review table | Review proof → approve/reject | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#portal-analytics` | Portal analytics | Portal operations | Gym | Owner | Metric cards + trend sections | Choose range → refresh → inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#saas-billing` | SaaS billing | Platform subscription | Gym / Independent Trainer | Owner | Progressive plan/request cards | Choose plan → term → proof/request | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |

## Store and nested view inventory

| Parent route | View | Module | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|
| `#store` | `pos` | Store/POS | Product search + cart + checkout | Add/remove → payment → receipt | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `#store` | `products` | Store | Product CRUD table/form | Search → create/edit/delete | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `inventory` | Store | Stock table/actions | Inspect → adjust → audit | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `purchases` | Store | Purchases table/form | Create → receive → update stock | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `sales` | Store | Sales table/history | Filter → inspect → print | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `suppliers` | Store | Supplier CRUD | Search → create/edit/delete | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `expenses` | Store | Expense subview | Record → filter → report | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `#store` | `reports` | Store | Report summaries | Choose report → render/print | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |

## Trainer surface inventory

| Route | Screen / overlay | Module | Tenant type | Role | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/trainer-workspace` | Workspace overview | Trainer operations | Independent Trainer | Owner | KPI/priority panels + recent activity | Load workspace → actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Clients | Trainer operations | Independent Trainer | Owner | Client table/cards | Search → CRUD → details | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Client details | Coaching | Independent Trainer | Owner | Dialog with profile/timeline sections | Open → inspect → coaching actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Assessments and measurements | Coaching | Independent Trainer | Owner | Forms + timeline | Add → view history → compare | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Training plans | Coaching | Independent Trainer | Owner | Builder/dialog | Create/edit/save/print | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Nutrition plans | Coaching | Independent Trainer | Owner | Builder/dialog | Create/edit/save/print | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Sessions | Coaching commerce | Independent Trainer | Owner | Session list + form | Schedule → complete/cancel/no-show | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Packages | Coaching commerce | Independent Trainer | Owner | Package cards/table + form | Create/edit → sell/renew | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Purchases and payments | Finance | Independent Trainer | Owner | Payment list/forms | Purchase/payment → balance/history | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Check-ins | Follow-up | Independent Trainer | Owner | Form + client history | Add → timeline/follow-up | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/trainer-workspace` | Reports | Reporting | Independent Trainer | Owner | Summary panels/tables | Filter → render/print | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/trainer-workspace` | Client/timeline dialog | Coaching | Independent Trainer | Owner | Dialog | Open → inspect history | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/trainer-workspace` | Client form dialog | Coaching | Independent Trainer | Owner | Form dialog | Add/edit client → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Measurement dialog | Coaching | Independent Trainer | Owner | Form dialog | Add measurement → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Check-in dialog | Follow-up | Independent Trainer | Owner | Form dialog | Add check-in → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/trainer-workspace` | Package dialog | Coaching commerce | Independent Trainer | Owner | Form dialog | Create/edit package → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Session dialog | Coaching commerce | Independent Trainer | Owner | Form dialog | Schedule/edit session → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Purchase dialog | Coaching commerce | Independent Trainer | Owner | Form dialog | Purchase package → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/trainer-workspace` | Payment dialog | Finance | Independent Trainer | Owner | Form dialog | Record payment → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |

## Platform Admin panel inventory

| Route | Panel | Module | Role | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|
| `/platform-admin` | Dashboard | Control Plane | PlatformAdmin | KPI/status/quick-action cards | Refresh → navigate → inspect | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Tenants / Gyms | Customer management | PlatformAdmin | Searchable table + profile panel | Search/filter → details → actions | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Subscription requests | Commercial control | PlatformAdmin | Review queue table | Inspect proof → approve/reject | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Gym registrations | Provisioning | PlatformAdmin | Registration queue/table | Inspect → approve/reject/provision | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Payment methods | Platform settings | PlatformAdmin | CRUD form/table | Create/edit/delete | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/platform-admin` | Plans | Commercial control | PlatformAdmin | Plan cards/edit forms | Edit limits/features safely | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Backups | Resilience | PlatformAdmin | Backup metadata/table | Inspect/recover where allowed | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/platform-admin` | Audit | Security | PlatformAdmin | Audit list/table | Filter → inspect event metadata | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/platform-admin` | Settings | Platform settings | PlatformAdmin | Grouped settings form | Edit → validate → save | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |

## Portal roots and tools

| Route | Root/tool | Module | Mode | Current UI pattern | Existing flow preserved | Light | Dark | RTL | Responsive | Priority | Migration |
|---|---|---|---|---|---|---|---|---|---|---|
| `/member-portal` | `portalLoginPanel` | Portal Auth | Gym / Trainer | Entry form | Authenticate/lookup → portal | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/member-portal` | `portalResult` | Portal data | Gym / Trainer | Result shell | Load scoped profile/data | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/member-portal` | `portalHomeView` | Portal home | Gym / Trainer | Home summary | View current status | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/member-portal` | `portalFeedbackSection` / `feedback` | Feedback | Gym / Trainer | Form/dialog | Submit feedback | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/member-portal` | `portalSubscriptionSection` / `subscription` | Subscription | Gym | Request flow | Browse → request → proof | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P0 | NOT STARTED |
| `/member-portal` | `portalLibrarySection` / `exercises` / `foods` | Library | Gym / Trainer | Focused portal views | Browse/search library | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |
| `/member-portal` | `print` | Print/PDF | Gym / Trainer | Print-oriented layout | Print/download scoped data | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | P1 | NOT STARTED |

## Shared overlay and state inventory

The 29 discovered overlay roots are part of the screen contract and must be
reviewed with the same design system. Their business behavior is not changed
by the modernization.

| Surface | Overlay IDs |
|---|---|
| Gym application | `actionDialog`, `authUserDialog`, `backupRestoreDialog`, `coachingBuilderDialog`, `coachingProfileDialog`, `dayPassDialog`, `detailsDialog`, `expenseDialog`, `externalTraineeDialog`, `libraryDetailsDialog`, `libraryFormDialog`, `memberDialog`, `memberQrDialog`, `membershipPlanDialog`, `membershipTypeDialog`, `membershipTypesDialog`, `pricingDialog`, `qrReaderDialog` |
| Platform Admin | `platformActionDialog`, `platformRegistrationCredentialsDialog` |
| Trainer workspace | `trainerCheckinDialog`, `trainerClientDetailsDialog`, `trainerClientDialog`, `trainerMeasurementDialog`, `trainerPackageDialog`, `trainerPaymentDialog`, `trainerPurchaseDialog`, `trainerSessionDialog`, `trainerTimelineDialog` |

| Shared state surface | Coverage required | Current evidence |
|---|---|---|
| Loading / skeleton | page, card, table and async action states | NOT VERIFIED |
| Empty state | no data, no search results, no portal data | NOT VERIFIED |
| Error state | validation, API failure, permission/capability denial | NOT VERIFIED |
| Success feedback | save, approval, payment, upload, restore | NOT VERIFIED |
| Disabled / busy | async buttons and unavailable actions | NOT VERIFIED |
| Modal / drawer | focus, Escape, outside click, scroll lock, mobile bounds | NOT VERIFIED |
| Toast / live region | success/error/warning/info announcements | NOT VERIFIED |
| Search / filter / pagination | all 181 discovered hooks | NOT VERIFIED |

## Modernization completion rule

This inventory is the pre-migration source of truth. A screen is not complete
when its default screenshot looks polished only. Its row must be updated after
the relevant Light, Dark, RTL, responsive, accessibility, state, and functional
workflow checks have evidence. Any row that remains `NOT VERIFIED` or
`BLOCKED` prevents declaring the global modernization complete.
