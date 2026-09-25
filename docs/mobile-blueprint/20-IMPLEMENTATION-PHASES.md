# 20 — Implementation Phases

Every phase exits only when its critical/high questions are closed or explicitly blocked.

| Phase | Objective | Inputs/outputs | Dependencies and exit gate |
| --- | --- | --- | --- |
| 0 Safety / discovery | protect repo and environments | source inventory, safety checklist | no app/DB/prod changes; docs baseline |
| 1 Reverse engineering | freeze current contracts | route/service/data evidence | API/data/auth maps verified |
| 2 Roles/capabilities | model access dimensions | role × tenant × feature matrix | no invented permissions |
| 3 API inventory | typed endpoint contracts | schemas/error/pagination catalog | route/consumer cross-check passes |
| 4 Product architecture | choose role-first product shape | workspace/navigation proposal | traceability review |
| 5 UX/IA | design mobile tasks/flows | IA, failure flows, prototypes | role and ergonomics review |
| 6 Design system | implement native token/primitives plan | tokens/states/accessibility | RTL/theme/platform review |
| 7 Technical decisions | settle RN/Expo/navigation/state/storage | ADRs | all mandatory ADR decisions approved |
| 8 Mobile foundation | create app shell/type/test infrastructure | repository/app baseline | CI/device smoke passes |
| 9 Auth/bootstrap | session/tenant/entitlement bootstrap | secure auth flow | auth/RLS/expiry tests pass |
| 10 Gym workspace | deliver high-frequency Gym flows | home/members/attendance/finance | Gym matrix and limits pass |
| 11 Trainer workspace | deliver independent trainer flows | clients/sessions/plans/tasks | trainer tenant/entitlement tests pass |
| 12 Member experience | deliver code portal | entry/member surfaces | member isolation/session tests pass |
| 13 Platform Admin | deliver platform operations | tenant/plan/audit views | explicit-target security tests pass |
| 14 Cross-cutting services | uploads/phone/WhatsApp/notifications/logging | shared adapters | contract/security tests pass |
| 15 Offline/cache | add conservative read cache | invalidation/offline states | no stale authorization; offline tests pass |
| 16 Security hardening | threat model and device controls | secure storage/redaction/review | security gate passes |
| 17 Performance | measure and optimize | device/network evidence | budgets met or exception approved |
| 18 Testing matrix | complete role/platform/RTL/theme/E2E | test report | no unclassified failures |
| 19 Traceability audit | ensure nothing disappeared | updated matrix/changelog | all capabilities mapped |
| 20 Production/store | release infrastructure and store prep | signing/privacy/rollback | release rehearsal passes |
| 21 Final acceptance | sign off | final QA/review | all gates pass; unresolved critical/high = 0 |

## Repeated phase loop

`Inspect → measure/reproduce → identify contract → implement → test → re-measure → update Blueprint/changelog/ADR → review.`
