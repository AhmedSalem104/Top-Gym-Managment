'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expectedNativeIds = [
  'authRegistrationDialog', 'authRecoveryDialog', 'dashboardScopeDialog', 'memberPaymentMethodDialog',
  'dayPassDialog', 'expenseDialog', 'memberDialog', 'actionDialog', 'membershipPlanDialog',
  'membershipTypeDialog', 'detailsDialog', 'qrReaderDialog', 'memberQrDialog', 'branchCreateDialog',
  'backupRestoreDialog', 'authUserDialog', 'libraryFormDialog', 'libraryDetailsDialog',
  'externalTraineeDialog', 'coachingBuilderDialog', 'coachingProfileDialog', 'measurementDialog',
  'checkinDialog', 'coachingSubscriptionDialog', 'coachingClientEditDialog', 'coachingSessionDialog',
  'coachingMealLogDialog', 'trainerClientDialog', 'trainerClientDetailsDialog', 'trainerTimelineDialog',
  'trainerMeasurementDialog', 'trainerCheckinDialog', 'trainerPackageDialog', 'trainerSessionDialog',
  'trainerPurchaseDialog', 'trainerPaymentDialog', 'platformActionDialog',
  'platformRegistrationCredentialsDialog', 'saasRequestDialog'
];

test('Modal V3 registry contains the exact native inventory scope', () => {
  const enhancer = read('public/js/dialog-enhancements.js');
  const registry = enhancer.match(/const v3VariantById = Object\.freeze\(\{([\s\S]*?)\n    \}\);/u)?.[1] || '';
  const registered = [...registry.matchAll(/^\s{8}([\w]+):\s*'([\w-]+)'/gmu)].map((match) => match[1]);
  assert.deepEqual(registered, expectedNativeIds);

  const inventory = read('qa/reports/modal-popup-inventory-2026-10-20.md');
  for (let index = 1; index <= 40; index += 1) {
    assert.match(inventory, new RegExp(`\\bMOD-${String(index).padStart(3, '0')}\\b`, 'u'));
  }
});

test('MOD-040 uses the shared V3 surface through its specialized portal component', () => {
  const portal = read('public/js/member-portal-library.js');
  const foundation = read('public/css/components/modal-foundation.css');
  assert.match(portal, /portal-library-modal-card[\s\S]*?classList\.add\('lf-modal--v3', 'lf-modal-v3--details'\)/u);
  assert.match(portal, /detailsDialog\.dataset\.modalContract = 'logic-fit-v3'/u);
  assert.match(foundation, /\.portal-library-modal-card\.lf-modal--v3/u);
});

test('V3 chrome is scoped to registered native dialogs and its one specialized portal surface', () => {
  const foundation = read('public/css/components/modal-foundation.css');
  const start = foundation.indexOf('/* Modal V3 is an explicit, inventory-bound visual variant.');
  const end = foundation.indexOf('@media (prefers-reduced-motion: reduce)', start);
  assert.ok(start >= 0 && end > start, 'the V3 semantic block must have a bounded owner');
  const v3Styles = foundation.slice(start, end);
  assert.doesNotMatch(v3Styles, /!important|\.swal2|notification-center|navigation-drawer|popover|tooltip/u);
  assert.match(v3Styles, /dialog\.lf-modal-shell\.lf-modal--v3/u);
  assert.match(v3Styles, /\.portal-library-modal-card\.lf-modal--v3/u);
});

test('public authentication dialogs share Modal V3 source and generated login includes its canonical owner', () => {
  const html = read('public/index.html');
  const loginBuild = read('scripts/build-login-entry.js');
  for (const id of ['authRegistrationDialog', 'authRecoveryDialog']) {
    const tag = html.match(new RegExp(`<dialog\\b[^>]*\\bid="${id}"[^>]*>`, 'u'))?.[0] || '';
    assert.match(tag, /lf-modal--v3/u);
  }
  assert.match(loginBuild, /'components\/modal-foundation\.css'/u);
  assert.match(html, /class="dialog-actions"/u);
});

test('V3 action decoration is visual-only and protects existing destructive button semantics', () => {
  const enhancer = read('public/js/dialog-enhancements.js');
  assert.match(enhancer, /function applyV3ActionSemantics\(dialog\)/u);
  assert.match(enhancer, /preservesDestructiveStyle = button\.matches\('\.btn-danger, \.btn-destructive, \.danger, \.destructive, \[data-variant="destructive"\]'\)/u);
  assert.match(enhancer, /button\.classList\.add\('lf-modal-v3__cancel'\)/u);
  assert.match(enhancer, /button\.classList\.add\('lf-modal-v3__primary'\)/u);
});
