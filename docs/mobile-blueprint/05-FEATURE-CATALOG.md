# 05 — Feature Catalog

Canonical entries come from `src/services/feature-catalog.js` (`FEATURE_CATALOG`, 31 entries). A feature is not a role, permission, tenant type, or limit.

| Key | Tenant compatibility | Limit keys | Current API families / surfaces | Mobile destination |
| --- | --- | --- | --- | --- |
| dashboard | gym | — | `/dashboard`, `/bootstrap` | Gym home |
| members | gym | maxMembers | `/members`, `/memberships` | Gym members |
| attendance | gym | — | `/attendance` | Gym attendance |
| coaching | gym, independent_trainer | — | `/coaching`, `/workout`, `/trainer/training-plans` | Gym/Trainer coaching |
| nutrition | gym, independent_trainer | — | `/diet`, `/diet-plans`, `/trainer/nutrition-plans` | Nutrition workspace |
| ai | gym, independent_trainer | maxAiGenerations | `/intelligence`, `/trainer/intelligence` | Contextual assistant; server-limited |
| library | gym, independent_trainer | — | `/library`, `/trainer/library` | Shared library |
| pricing | gym | — | `/pricing`, membership pricing | Gym pricing |
| payments | gym, independent_trainer | — | `/payments`, `/finance`, `/trainer/payments` | Payment/ledger flows |
| finance | gym | — | `/finance`, `/monthly-finance` | Gym finance |
| day_passes | gym | — | `/day-passes` | Gym day passes |
| reports | gym, independent_trainer | — | `/reports`, `/trainer/reports` | Role-specific reports |
| store | gym | — | `/store`, `/pos` | Gym store/POS |
| inventory | gym | — | `/inventory`, `/commerce/stock` | Gym inventory |
| branches | gym | maxBranches | `/branches` | Gym branch context |
| bar | gym | — | `/bar` | Gym bar/POS |
| portal | gym, independent_trainer | — | `/member-portal`, trainer client portal | Member/client portal |
| branding | gym, independent_trainer | maxStorageMb | `/branding` | Settings/branding |
| team | gym, independent_trainer | maxUsers | `/auth/users`, permissions | Team administration |
| backup | gym | maxStorageMb | `/backup` | Admin-only; likely web-only mobile |
| audit | gym | — | audit surfaces | Activity/audit |
| clients | independent_trainer | maxClients | `/trainer/workspace`, `/trainer/clients` | Trainer clients |
| assessments | independent_trainer | — | trainer measurements/assessments | Trainer assessments |
| progress | independent_trainer | — | trainer progress | Trainer progress |
| goals | independent_trainer | — | `/trainer/goals` | Trainer goals |
| sessions | independent_trainer | — | `/trainer/sessions` | Trainer schedule |
| packages | independent_trainer | — | `/trainer/packages`, purchases | Trainer packages |
| notifications | gym, independent_trainer | — | `/notifications`, trainer notifications | Notification center |
| tasks | independent_trainer | — | `/trainer/tasks` | Trainer action center |
| templates | independent_trainer | — | `/trainer/templates` | Trainer templates |
| prioritySupport | gym, independent_trainer | — | no API path in catalog | Support entry if exposed |

## Compatibility notes

- `intelligence` is a legacy alias normalized to `ai`; it is not a second feature.
- Branches are listed as a core Gym capability in `CORE_FEATURE_KEYS_BY_TENANT_TYPE`, even though they have a catalog row and plan limit.
- A catalog key does not itself authorize an operation. Route permission and server capability checks remain mandatory.
- The catalog’s current `apiPaths` are family hints; exact method/path inventory is in `03-API-CATALOG.md`.
