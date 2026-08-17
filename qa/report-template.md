# QA Report Template

## Header

- Agent ID:
- Commit SHA:
- Date/time:
- Environment:
- Database: isolated / unavailable / production-forbidden

## Scope

ما الذي تم اختباره وما الذي لم يتم اختباره؟

## Test Results

| Test ID | Input | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|
| DOMAIN-001 | — | — | — | PASS/FAIL/BLOCKED | P0-P3 | file/route |

## Findings

لكل Finding: السبب، التأثير، خطوات إعادة الإنتاج، الإصلاح المقترح، واختبار Regression المطلوب.

## Approval

- Security gate:
- Domain gate:
- QA Orchestrator:
- Final decision: `PASS` / `FAIL` / `BLOCKED`

