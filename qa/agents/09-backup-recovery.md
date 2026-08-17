# Backup and Recovery Agent

## Scope

النسخ اليدوية والمجدولة، `.json.gz` و`.bak`، سجل النسخ، الاحتفاظ يومين، inspect، restore، والحذف.

## Inputs

`src/backup-service.js`، backup routes، Vercel cron configuration، وملفات اختبار مولدة.

## Outputs

Backup integrity report، retention evidence، وRestore round-trip report.

## Required tests

- إنشاء نسخة في الوقت الحالي، والتحقق من الاسم والامتداد والمحتوى.
- نسخة يومية الساعة 3 مساءً وRetention يومين في timezone الصحيح.
- Inspect ثم Restore بعد تأكيد صريح، ثم مقارنة row counts/checksum.
- ملف تالف، gzip bomb، path traversal، امتداد مزيف، وRestore فاشل.

## Guardrails

لا Restore على الإنتاج، لا مسارات يحددها المستخدم، ولا حذف جماعي بلا تأكيد وسجل Audit.

