# Store / POS / Inventory

## النطاق

وحدة المتجر في TOP GYM هي Domain مستقل داخل الـModular Monolith، لكنها تعيد استخدام الجلسات والصلاحيات والتقارير والمصروفات وقاعدة الأعضاء الحالية. لا يوجد Customer مكرر عند اختيار عضو: عملية البيع تحفظ `member_id` وتقرأ الاسم والهاتف الحاليين من `dbo.members` داخل Transaction البيع.

## دورة العمل

```text
Product + Variant
      ↓
Purchase received → Weighted Average balance → Stock movement ledger
      ↓
POS sale (Member أو Walk-in) → Sale items → Payment → Stock movement
      ↓
Return/refund → optional restock → audit
      ↓
Revenue - COGS - Store expenses = Net store profit
```

## الواجهة

التبويب `#store` يُحمّل lazy عند فتحه من `public/js/feature-loader.js`، ويحتوي على:

| القسم | الوظيفة |
|---|---|
| نقطة البيع | البحث، السلة، اختيار العضو، Walk-in، الدفع وطباعة الإيصال |
| المنتجات | إضافة وتعديل منتج ونسخة SKU/سعر/تكلفة وتعطيل المنتج |
| المخزون | الرصيد، الحد الأدنى، الصلاحية، التنبيهات والتسوية |
| المشتريات | استلام فاتورة وتحديث الرصيد وسجل الحركة |
| المبيعات | سجل الفواتير والمدفوع والمتبقي |
| الموردون | إضافة وتعديل بيانات الموردين |
| مصروفات المتجر | مصروفات ذات `expense_source=store` مع إلغاء محاسبي قابل للتدقيق |
| تقارير المتجر | حسب المنتج والتصنيف والعميل وطرق الدفع واليوم والمشتريات والمخزون والمرتجعات وCOGS والربحية حسب الصلاحية |

الملفات الرئيسية:

- `public/index.html`: shell وقسم المتجر.
- `public/js/pages/store/store.js`: POS وعمليات العرض.
- `public/css/pages/store.css`: طبقة التصميم الوحيدة للمتجر.

## API

كل المسارات التالية محمية بالجلسة و`src/permissions/route-permissions.js`:

| Method | Endpoint | الصلاحية |
|---|---|---|
| GET | `/api/store/bootstrap` | `store.view` |
| GET | `/api/store/dashboard` | `store.view` |
| GET | `/api/store/reports` | `store.reports.view` |
| GET/POST/PUT | `/api/store/categories` | عرض/إدارة المنتجات |
| GET/POST/PUT/DELETE | `/api/store/products` | `store.view` / `store.products.manage` |
| POST/PUT/DELETE | `/api/store/products/:id/variants` | `store.products.manage` |
| GET/POST/PUT | `/api/store/suppliers` | عرض/إدارة الموردين |
| GET | `/api/store/inventory` | `store.inventory.view` |
| GET | `/api/store/inventory/movements` | `store.inventory.view` |
| POST | `/api/store/inventory/adjustments` | `store.inventory.adjust` |
| GET | `/api/store/customers/search` | `store.sales.create` |
| GET/POST | `/api/store/purchases` | `store.purchases.manage` |
| GET/POST | `/api/store/sales` | عرض/إنشاء المبيعات |
| POST | `/api/store/sales/:id/returns` | `store.returns.manage` |
| GET/POST/PUT/DELETE | `/api/store/expenses` | `store.expenses.manage` |
| GET | `/api/members/:id/store-purchases` | `members.read` + `store.sales.view` |

مثال إنشاء بيع لعضو موجود:

```json
{
  "memberId": 42,
  "items": [{ "variantId": 7, "quantity": 1 }],
  "discountAmount": 0,
  "taxAmount": 0,
  "paidAmount": 350,
  "paymentMethod": "cash"
}
```

مثال بيع Walk-in:

```json
{
  "customerName": "زائر",
  "customerPhone": "01000000000",
  "items": [{ "variantId": 7, "quantity": 1 }],
  "paidAmount": 100,
  "paymentMethod": "cash"
}
```

## قاعدة البيانات

التفاصيل الكاملة في `database/migrations/007-store.sql`. الرصيد في `gym_store_inventory_balances` قابل لإعادة البناء من سجل `gym_store_stock_movements`. لا يتم حذف الفواتير المالية أو حركات المخزون عند المرتجع؛ يتم إنشاء سجل مرتجع وحركة عكسية.

مصروفات المتجر تستخدم جدول `gym_expenses` الحالي مع `expense_source='store'` وحقول التصنيف وطريقة الدفع والمنفذ. الإلغاء يكتب `is_voided/voided_at/voided_by_user_id` بدل حذف السجل، وبذلك يظهر المتجر في الإجمالي العام دون إنشاء Finance System ثانٍ مع الحفاظ على الأثر المحاسبي.

## الأمان والصلاحيات

- Owner يمتلك جميع صلاحيات المتجر.
- Assistant يبدأ دون صلاحيات المتجر، ويمنحه Owner المطلوب فقط من شاشة الصلاحيات.
- صلاحية `store.profit.view` منفصلة؛ دونها لا تُرجع COGS أو الربح أو مصروفات المتجر داخل Store API.
- التحديثات الحساسة تكتب Audit داخل `gym_store_audit_log`.
- الاستعلامات Parameterized، والمخزون يُحدّث داخل `withTransaction` مع أقفال على الرصيد.

## الاختبارات والتشغيل

```bash
npm run build:css
npm run qa:gate
node --check public/js/pages/store/store.js
node --check src/services/store-service.js
```

اختبر يدويًا على Test Database: إضافة منتج، استلام شراء، بيع لعضو، بيع Walk-in، نقص مخزون، مرتجع، تسوية، مصروف متجر، منع Assistant، وعدم ظهور الربحية دون الصلاحية.
