import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNextThemeName,
  getPreferredThemeNames,
} from '../.pi/lib/theme-cycle.ts';

test('getPreferredThemeNames keeps the requested theme order only', () => {
  assert.deepEqual(
    getPreferredThemeNames([
      'dark',
      'green',
      'white',
      'orange',
      'solarized',
      'default',
    ]),
    ['green', 'orange', 'default', 'white'],
  );
});

test('getNextThemeName returns undefined when no preferred themes exist', () => {
  assert.equal(getNextThemeName(['dark', 'light'], 'dark'), undefined);
});

test('getNextThemeName falls back to the first preferred theme when current is missing', () => {
  assert.equal(
    getNextThemeName(['white', 'green', 'default'], undefined),
    'green',
  );
  assert.equal(
    getNextThemeName(['white', 'green', 'default'], 'missing'),
    'green',
  );
});

test('getNextThemeName cycles in the requested custom order and wraps around', () => {
  const themeNames = [
    'white',
    'cyan',
    'green',
    'default',
    'black',
    'orange',
    'purple',
  ];

  assert.equal(getNextThemeName(themeNames, 'green'), 'purple');
  assert.equal(getNextThemeName(themeNames, 'white'), 'green');
});
