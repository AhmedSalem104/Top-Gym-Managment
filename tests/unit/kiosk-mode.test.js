'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Gym App exposes one reusable global Kiosk controller', () => {
    const source = read('public/js/kiosk.js');

    assert.match(source, /topgym\.kiosk\.enabled/);
    assert.match(source, /window\.TopGymKiosk/);
    assert.match(source, /function set\(next\)/);
    assert.match(source, /function toggle\(\)/);
    assert.match(source, /requestFullscreen/);
    assert.match(source, /fullscreenchange/);
    assert.match(source, /topgym:kioskchange/);
    assert.match(source, /kiosk-exit-control/);
});

test('Kiosk is scoped to the Gym App shell and keeps a visible exit path', () => {
    const index = read('public/index.html');
    const styles = read('public/css/components/navigation-shell.css');

    assert.match(index, /id="globalKioskToggle"[^>]*data-kiosk-toggle/);
    assert.match(index, /id="attendanceKioskButton"[^>]*data-kiosk-toggle/);
    assert.match(index, /\/js\/kiosk\.js\?v=1/);
    assert.match(styles, /\.app-shell\.is-kiosk-mode\s*>\s*\.topbar/);
    assert.match(styles, /\.app-shell\.is-kiosk-mode\s*>\s*\.page-tabs/);
    assert.match(styles, /\.kiosk-exit-control/);
    assert.match(styles, /prefers-reduced-motion/);
});
