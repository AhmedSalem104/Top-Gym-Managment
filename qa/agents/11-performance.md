# Performance Agent

## Scope

وقت التحميل، Bundle، Lazy Loading، تكرار Requests، debounce، rendering، والجداول.

## Inputs

Network traces، bundle sizes، `feature-loader.js`، API timings، وقياسات Core Web Vitals.

## Outputs

Before/after metrics، bottleneck report، وحدود أداء قابلة للقياس.

## Required tests

- تحميل Dashboard ثم كل Tab مع cache بارد ودافئ.
- عدم تكرار API request عند render أو تغيير بسيط.
- بحث سريع مع debounce وإلغاء request القديم.
- 5/1000/10000 rows حسب البيئة، وقياس LCP/CLS/INP.

## Guardrails

لا يضيف memoization أو virtualization بلا قياس، ولا يضحي بصحة البيانات من أجل رقم أداء.

