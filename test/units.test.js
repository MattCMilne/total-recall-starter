// Unit checks that need no database: run with  node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgres://localhost/unused_for_unit_tests';
const { cleanTitle, firstMessageTitle } = await import('../server/titles.js');
const { sanitizeSettings, DEFAULT_SETTINGS } = await import('../server/settings.js');
const { renderMarkdown } = await import('../public/markdown.js');
const { isE164 } = await import('../server/telnyx.js');

test('chat titles are short and clean', () => {
  assert.equal(cleanTitle('"Weekly Sales Numbers."'), 'Weekly Sales Numbers');
  assert.equal(cleanTitle('Title: Client Onboarding Plan'), 'Client Onboarding Plan');
  assert.equal(cleanTitle('This is a whole sentence that goes on far too long to be a title'), null);
  assert.equal(firstMessageTitle(''), 'New chat');
  assert.ok(firstMessageTitle('word '.repeat(40)).split(' ').length <= 8);
});

test('settings reject unsafe values', () => {
  const s = sanitizeSettings({
    brand: { accent: 'red;}', appName: 'x'.repeat(200), theme: 'neon' },
    customPages: [{ key: 'bad', title: 'Bad', kind: 'link', url: 'javascript:alert(1)' }, { key: 'chat', title: 'Clash' }],
  }, DEFAULT_SETTINGS);
  assert.equal(s.brand.accent, DEFAULT_SETTINGS.brand.accent);
  assert.equal(s.brand.appName.length, 60);
  assert.equal(s.brand.theme, 'system');
  assert.equal(s.customPages.length, 1);
  assert.equal(s.customPages[0].kind, 'note');
  assert.ok(s.menu.some((m) => m.key === 'bad'));
});

test('markdown never passes raw HTML through', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(!html.includes('href="javascript'));
});

test('phone numbers must be E.164', () => {
  assert.ok(isE164('+15551234567'));
  assert.ok(!isE164('5551234567'));
  assert.ok(!isE164('+1 555 123 4567'));
});
