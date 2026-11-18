# 013 — صلاحية الخصم (ق-1 / D-44)

## القاعدة المقترحة للمراجعة
المدير والمالك يعدّلان سعر الجلسة دائماً. تعديل السعر صلاحية لها حد خصم أقصى (%)، يمنحها المدير لأي دور أو لأي موظفة.

إتاحة تسجيل الجلسات على الإنتاج تنتظر اعتماد قاعدة السعر والخصم D-44.

## القبول
- بدون صلاحية: السعر = سعر الخدمة، وأي خصم يُرفض (`DISCOUNT_OVER_LIMIT`).
- مع صلاحية X%: السعر بين سعر الخدمة و (100-X)% منه؛ الحد مسموح تماماً.
- لا رفع للسعر فوق سعر الخدمة؛ الخصم يحتاج سبباً.
- الحد يُفرض في RLS (`sessions_insert`) وليس في الكود فقط؛ سعر القائمة يطابق الكتالوج.
- إدارة الصلاحيات (`/discounts`) للمالك والمدير فقط؛ منح وسحب مسجّلان في `audit_log`.
- لا تسرب `discount_grants` بين الشركات (`db/tests/isolation.sql`).

## الخطة
1. migration 0014: `discount_grants`، `discount_manager`، `discount_cap`، أعمدة `list_price_mills`/`discount_reason`، policy جديدة.
2. domain `checkDiscount` + use-case + repo port `discountCap`.
3. server functions للإعدادات + صفحة `/discounts` + حقول السعر والسبب في `/sessions`.
4. اختبارات domain وuse-case وتكامل RLS.
