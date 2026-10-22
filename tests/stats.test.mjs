import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let tuiPath;
try {
  tuiPath = require.resolve('@earendil-works/pi-tui');
} catch {
  let host = process.env.PI_TPS_HOST_DIR;
  if (!host) {
    const npmRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
      encoding: 'utf8', shell: process.platform === 'win32',
    }).trim();
    host = join(npmRoot, '@earendil-works/pi-coding-agent');
  }
  tuiPath = createRequire(join(host, 'package.json')).resolve('@earendil-works/pi-tui');
}
const sourcePath = fileURLToPath(new URL('../index.ts', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
// A data URL keeps tests independent from local node_modules; only the runtime
// Text import is resolved through the installed Pi host. Type-only imports vanish.
const resolvedSource = source.replace('from "@earendil-works/pi-tui"', `from ${JSON.stringify(pathToFileURL(tuiPath).href)}`);
const { stripTypeScriptTypes } = await import('node:module');
const js = stripTypeScriptTypes(resolvedSource);
const { default: extension } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function setup() {
  const handlers = {};
  let renderer;
  extension({
    on(name, handler) { handlers[name] = handler; },
    registerEntryRenderer(type, fn) {
      assert.equal(type, 'pi-tps-stats');
      renderer = fn;
    },
  });
  return { handlers, render(entry) { return renderer(entry, { expanded: false }, { fg: (_color, text) => text }).render(300).join('\n'); } };
}

const usage = {
  input: 1000, output: 120, totalTokens: 1350, cacheRead: 200, cacheWrite: 30,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.004 },
};

test('assistant turn emits one persistent, rendered non-context custom entry', () => {
  const { handlers, render } = setup();
  const originalNow = Date.now;
  let now = 10000;
  Date.now = () => now;
  try {
    const message = { role: 'assistant', usage };
    handlers.message_start({ message });
    now = 13000;
    handlers.message_end({ message });
    // Tool execution takes time, but must not reduce response throughput.
    now = 30000;
    const result = handlers.turn_end({ message });
    assert.equal(result.continue, undefined);
    assert.equal(result.entries.length, 1);
    const entry = result.entries[0];
    assert.equal(entry.type, 'custom');
    assert.deepEqual(entry.data, {
      input: 1000, output: 120, total: 1350, cacheRead: 200, cacheWrite: 30,
      durationSeconds: 3, tokensPerSecond: 40, costUsd: 0.004,
    });
    const line = render(entry).replaceAll('\u00a0', ' ');
    for (const expected of ['вход 1 000', 'выход 120', 'всего 1 350', '200↓/30↑', '40 ток/с', '3 с', '$0.004']) {
      assert.ok(line.includes(expected), `Missing ${expected}: ${line}`);
    }
  } finally { Date.now = originalNow; }
});

test('ignores non-assistant events', () => {
  const { handlers } = setup();
  const message = { role: 'user', content: 'hello' };
  handlers.message_start({ message });
  handlers.message_end({ message });
  assert.equal(handlers.turn_end({ message }), undefined);
});

test('missing timing uses unavailable, and previous stats do not leak', () => {
  const { handlers, render } = setup();
  const message = { role: 'assistant', usage };
  handlers.message_end({ message });
  handlers.turn_end({ message });
  const next = handlers.turn_end({ message: { role: 'assistant', usage: { ...usage, output: 7 } } });
  assert.equal(next.entries[0].data.output, 7);
  assert.equal(next.entries[0].data.durationSeconds, null);
  assert.equal(next.entries[0].data.tokensPerSecond, null);
  assert.ok(render(next.entries[0]).includes('скорость н/д'));
});

test('zero duration never reports Infinity and zero cost is omitted', () => {
  const { handlers, render } = setup();
  const originalNow = Date.now;
  Date.now = () => 10000;
  try {
    const message = { role: 'assistant', usage: { ...usage, cost: { ...usage.cost, total: 0 } } };
    handlers.message_start({ message });
    handlers.message_end({ message });
    const entry = handlers.turn_end({ message }).entries[0];
    assert.equal(entry.data.tokensPerSecond, null);
    assert.ok(!render(entry).includes('$'));
  } finally { Date.now = originalNow; }
});
