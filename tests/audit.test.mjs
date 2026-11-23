import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = new URL('https://aboodivplay.github.io/Intelligent-Game-Server-Optimization/');
const { auditLog, dashboardShell, remediation } = await import('../dashboard.js');
const early = { id: '42', action: 'Key rotated', detail: 'Paper', timestamp: '2026-10-10T12:00:00Z', cleared: true };
const fresh = { ...early, id: '43', action: 'Policy saved', detail: '<example>', cleared: false };

test('the current view shows new actions and escapes server-supplied details', () => {
  const html = auditLog([fresh, early]);
  assert.match(html, /Policy saved/);
  assert.match(html, /&lt;example&gt;/);
  assert.doesNotMatch(html, /Key rotated|<example>/);
  assert.match(html, /Show cleared entries/);
});

test('clearing leaves a reviewable empty state and disables a second clear', () => {
  const html = auditLog([early]);
  assert.match(html, /History cleared/);
  assert.match(html, /id="clear-audit" disabled/);
  const reviewed = auditLog([early], true);
  assert.match(reviewed, /Key rotated/);
  assert.match(reviewed, /Hide cleared entries/);
});

test('an account can find its audit history before it has a server', () => {
  const content = remediation({ servers: [], audit: [] }, undefined);
  assert.match(content, /No recorded actions/);
  assert.match(content, /id="clear-audit" disabled/);
  const shell = dashboardShell({ name: 'Student' }, 'Remediation', content);
  assert.match(shell, /data-tab="Remediation" class="active" aria-current="page"/);
  assert.equal((shell.match(/<button data-tab=/g) || []).length, 8);
});
