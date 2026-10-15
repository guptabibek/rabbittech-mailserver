// Runs SOGo's real Mail app (the live page built by prepare.sh) against the fake backend in
// backend.mjs, once as stock SOGo (custom: false, our theme.js and custom-sogo.js left out)
// and once with them (custom: true), on a desktop and a phone screen. It walks through what a
// user does (folders, list, open, back, compose, search, flag, delete) and prints what worked,
// page errors, failed requests, requests the backend doesn't know and "RabbitTech" warnings.
// Screenshots go to tests/ui/output/live-*.png.
// Run: tests/ui/sogo/prepare.sh, then node tests/ui/sogo/live-check.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mailBackend, PAGE } from './backend.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '.cache', 'sogo-root');
const output = join(here, '..', 'output');
mkdirSync(output, { recursive: true });
// Screenshots from an earlier run would be mistaken for this one's
for (const f of readdirSync(output)) if (/^live-.*\.png$/.test(f)) rmSync(join(output, f));
if (!existsSync(join(root, 'live', 'view.html'))) {
  console.error('Run tests/ui/sogo/prepare.sh first');
  process.exit(2);
}

// ------------------------------------------------------------------ static server
const port = 8096;
const origin = `http://127.0.0.1:${port}`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try { await fetch(origin + '/live/data.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); }
}

// SOGo's stylesheet links Fira Sans files that aren't part of the web resources in git
const ignoredResources = /FiraSans/;

const browser = await chromium.launch();
const runs = [];
for (const custom of [false, true]) {
  for (const [width, height] of [[1366, 900], [390, 844]]) {
    runs.push(await run({ custom, width, height }));
  }
}
await browser.close();
server.kill();

// ------------------------------------------------------------------ summary
let failed = 0;
for (const r of runs) {
  console.log(`\n=== ${r.name}`);
  for (const c of r.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok || !c.detail ? '' : ' — ' + c.detail}`);
  const show = (title, list) => {
    if (!list.length) return;
    console.log(`  ${title} (${list.length}):`);
    for (const line of [...new Set(list)].slice(0, 25)) console.log('    ' + line);
  };
  for (const n of r.notes) console.log(`  note ${n}`);
  show('page errors', r.pageErrors);
  show('console errors', r.consoleErrors);
  show('RabbitTech warnings', r.rabbitWarnings);
  show('failed requests', r.failedRequests);
  show('requests the backend does not handle', r.unknown);
  if (!r.custom) failed += r.checks.filter(c => !c.ok).length + r.pageErrors.length + r.consoleErrors.length + r.failedRequests.length + r.unknown.length;
}
console.log(`\nStock SOGo (custom: false): ${failed ? failed + ' problem(s)' : 'everything works, no errors'}`);
console.log(`With theme.js + custom-sogo.js (custom: true): ${runs.filter(r => r.custom).map(r => `${r.width}px ${r.checks.filter(c => c.ok).length}/${r.checks.length} checks, ${r.pageErrors.length + r.consoleErrors.length} errors, ${r.rabbitWarnings.length} RabbitTech warnings`).join('; ')}`);
process.exit(failed ? 1 : 0);

// ------------------------------------------------------------------ one run
async function run({ custom, width, height }) {
  const name = `${custom ? 'custom' : 'plain'} ${width}px`;
  const slug = `live-${custom ? 'custom' : 'plain'}-${width}`;
  const result = { name, custom, width, checks: [], notes: [], pageErrors: [], consoleErrors: [], rabbitWarnings: [], failedRequests: [], unknown: [] };
  const check = (label, ok, detail = '') => {
    result.checks.push({ name: label, ok: !!ok, detail });
    if (!ok) console.log(`  [${name}] FAIL ${label}${detail ? ' — ' + detail : ''}`);
  };
  console.log(`Running ${name}`);
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => result.pageErrors.push(e.message.split('\n')[0]));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(text)) result.consoleErrors.push(text.split('\n')[0]);
    if (/^RabbitTech/.test(text)) result.rabbitWarnings.push(`${m.type()}: ${text.split('\n')[0]}`);
  });
  page.on('response', r => {
    if (r.status() >= 400 && !ignoredResources.test(r.url())) result.failedRequests.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  const backend = await mailBackend(page, { custom });
  const shot = step => page.screenshot({ path: join(output, `${slug}-${step}.png`) });
  const phone = width < 600;
  const visible = locator => locator.first().isVisible().catch(() => false);
  // Back to the Inbox list, so one failed step doesn't fail the next ones
  const recover = async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => { location.hash = '#!/Mail/0/INBOX'; }).catch(() => {});
    await page.waitForTimeout(800);
  };
  let failures = 0;
  const step = async (label, fn) => {
    const before = result.checks.filter(c => !c.ok).length;
    let error = null;
    try { await fn(); } catch (e) { error = e; check(label, false, why(e)); }
    if (result.checks.filter(c => !c.ok).length > before) {
      // What the screen looked like when the step went wrong
      await shot(`fail-${++failures}`).catch(() => {});
      result.notes.push(`screenshot ${slug}-fail-${failures}.png: ${label}`);
    }
    if (error) await recover();
  };

  await page.goto(origin + PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => location.hash.includes('/Mail/0/INBOX'), null, { timeout: 15000 }).catch(() => {});
  await page.locator('md-list-item.sg-message-list-item .sg-tile-subject:not(:empty)').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot('inbox');

  // Folder list with the Inbox unread count (in the side menu on a phone)
  await step('folder list shows Inbox with its unread count', async () => {
    if (phone) {
      await page.locator('[ng-click="toggleLeft()"]:visible').first().click();
      await page.waitForTimeout(700);
    }
    const inbox = page.locator('md-list-item.sg-mailbox-list-item', { hasText: 'Inbox' }).first();
    await inbox.waitFor({ timeout: 5000 });
    const badge = (await inbox.locator('.sg-counter-badge').textContent()).trim();
    const folders = await page.locator('md-list-item.sg-mailbox-list-item .sg-item-name span[ng-bind]').allTextContents();
    check('folder list shows Inbox with its unread count', badge === String(backend.unseen('INBOX')) && await inbox.isVisible(),
      `badge "${badge}", expected ${backend.unseen('INBOX')}; folders: ${folders.join(', ')}`);
    check('folder list has Drafts, Sent, Trash, Junk, Archive and Projects', ['Drafts', 'Sent', 'Trash', 'Junk', 'Archive', 'Projects'].every(f => folders.includes(f)), folders.join(', '));
    if (phone) {
      await shot('folders');
      await page.keyboard.press('Escape');
      await page.locator('md-backdrop').first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  });

  // Message rows: sender, subject and date
  const newest = backend.folder('INBOX').messages[backend.folder('INBOX').messages.length - 1];
  await step('message rows show sender, subject and date', async () => {
    const row = page.locator('md-list-item.sg-message-list-item', { hasText: newest.subject }).first();
    await row.waitFor({ timeout: 5000 });
    const subject = (await row.locator('.sg-tile-subject').textContent()).trim();
    const sender = (await row.locator('.sg-md-subhead > div:first-child').textContent()).trim();
    const date = (await row.locator('.sg-tile-date').textContent()).trim();
    const rows = await page.locator('md-list-item.sg-message-list-item').count();
    check('message rows show sender, subject and date', subject === newest.subject && sender.includes(newest.from[0].name) && /\d\d:\d\d/.test(date),
      JSON.stringify({ subject, sender, date }));
    check('the list is filled and scrolls (more rows than fit)', rows >= 8, `${rows} rows rendered`);
  });

  // Open a message, then go back to the list
  await step('clicking a row opens the message with its body', async () => {
    const target = backend.folder('INBOX').messages.find(m => m.subject.startsWith('Re: Shipment tracking portal'));
    await page.locator('md-list-item.sg-message-list-item', { hasText: target.subject }).first().click();
    const body = page.locator('[ui-view="message"] .msg-body, [ui-view="message"] .mailer_plaincontent').first();
    await body.waitFor({ timeout: 8000 });
    const text = (await page.locator('[ui-view="message"]').first().textContent()).replace(/\s+/g, ' ');
    check('clicking a row opens the message with its body', text.includes('Thanks for the demo yesterday') && location(page).includes(`/INBOX/${target.uid}`),
      `hash ${location(page)}`);
    check('opening an unread message marks it read on the server', target.flags.includes('seen') && backend.calls('view').some(e => e.uid === target.uid));
    await page.waitForTimeout(500);
    await shot('message');
  });
  await step('back returns to the list', async () => {
    // The view's close button (hidden on a desktop, where the list stays next to the message)
    const close = page.locator('[ui-view="message"] [ng-click="viewer.close()"]:visible');
    let via = 'browser back';
    if (await visible(close)) {
      via = 'the close/back button';
      await close.first().click({ timeout: 3000 });
    } else await page.goBack();
    await page.waitForFunction(() => /#!\/Mail\/0\/INBOX$/.test(location.hash), null, { timeout: 5000 });
    const start = Date.now();
    const shown = await page.locator('md-list-item.sg-message-list-item').first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    const took = Date.now() - start;
    check('back returns to the list', shown, `via ${via}, ${location(page)}, list not visible after ${took} ms`);
    if (shown && took > 1000) result.notes.push(`the list took ${took} ms to show again after going back`);
    await page.waitForTimeout(400);
  });

  // Compose with the app's own button (mailbox.newMessage)
  await step('compose opens the editor with CKEditor, To and Subject', async () => {
    // Stock SOGo gives a user without SOGoMailComposeWindow a speed dial: open it, then "Write
    // a new message". custom-sogo.js has its own Compose button (rtCompose → mailbox.newMessage).
    const single = page.locator('[ng-click="mailbox.newMessage($event)"]:visible');
    const trigger = page.locator('md-fab-speed-dial md-fab-trigger button:visible');
    const custom = page.locator('[ng-click^="rtCompose"]:visible');
    await page.locator('[ng-click="mailbox.newMessage($event)"]:visible, md-fab-speed-dial md-fab-trigger button:visible, [ng-click^="rtCompose"]:visible')
      .first().waitFor({ timeout: 5000 }).catch(() => {});
    let via;
    if (await visible(single)) via = 'the compose button';
    else if (await visible(trigger)) {
      via = 'the speed dial';
      await trigger.first().click();
      await page.waitForTimeout(500);
    }
    if (via) await single.first().click();
    else if (await visible(custom)) {
      via = 'the RabbitTech Compose button';
      await custom.first().click();
    } else throw new Error('no visible compose button');
    const dialog = page.locator('md-dialog#mailEditor');
    await dialog.waitFor({ timeout: 8000 });
    await dialog.locator('.ck-editor__editable').first().waitFor({ timeout: 8000 });
    const to = await visible(dialog.locator('md-chips[ng-model="editor.message.editable.to"] input'));
    const subject = await visible(dialog.locator('input[name="subject"]'));
    check('compose opens the editor with CKEditor, To and Subject', to && subject, JSON.stringify({ via, to, subject }));
    result.notes.push(`compose opened via ${via}`);
    check('compose asked the server for a draft (compose, then edit)', backend.calls('compose').length === 1 && backend.calls('edit').length === 1);
    await page.waitForTimeout(300);
    await shot('compose');
    // Address it, write something and send it
    const sentBefore = backend.folder('Sent').messages.length;
    await dialog.locator('md-chips[ng-model="editor.message.editable.to"] input').first().fill('nisha.gurung@everestlogistics.example');
    await dialog.locator('md-chips[ng-model="editor.message.editable.to"] input').first().press('Enter');
    await dialog.locator('input[name="subject"]').fill('Go-live on the 25th');
    await dialog.locator('.ck-editor__editable').first().click();
    await page.keyboard.type('Hi Nisha, the 25th works for us.');
    await dialog.locator('[ng-click="editor.send()"]').first().click();
    await dialog.waitFor({ state: 'detached', timeout: 8000 });
    const send = backend.calls('send').pop();
    check('sending posts the draft and it lands in Sent', send && send.body.to.join().includes('nisha.gurung@everestlogistics.example')
      && send.body.subject === 'Go-live on the 25th' && /the 25th works/.test(send.body.text)
      && backend.folder('Sent').messages.length === sentBefore + 1, JSON.stringify(send && send.body));
    await page.waitForTimeout(400);
  });

  // Search from the folder toolbar
  await step('searching filters the list', async () => {
    // Stock SOGo: the toolbar's search button shows the search form; custom-sogo.js keeps the
    // search box in the top bar
    const button = page.locator('[ng-click*="mailbox.searchMode"]:visible');
    if (await visible(button)) await button.first().click();
    const input = page.locator('input[name="folderSearch"]:visible');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('invoice');
    await page.waitForResponse(r => r.url().endsWith('/folderINBOX/view') && (r.request().postData() || '').includes('invoice'), { timeout: 5000 });
    await page.waitForTimeout(800);
    const subjects = await page.locator('md-list-item.sg-message-list-item .sg-tile-subject').allTextContents();
    const expected = backend.folder('INBOX').messages.filter(m => /invoice/i.test(m.subject) || /invoice/i.test(m.from[0].name)).length;
    const search = backend.calls('view').filter(e => e.body && e.body.filters).pop();
    check('searching filters the list', subjects.length === expected && subjects.every(s => /invoice/i.test(s)),
      `${subjects.length} rows (expected ${expected}): ${subjects.join(' | ')}; sent ${JSON.stringify(search && search.body)}`);
    await shot('search');
    await page.locator('form[name="searchForm"] button:visible').first().click();
    await page.waitForTimeout(600);
  });

  // Flag and delete from the message view
  await step('the flag button in the message view flags it on the server', async () => {
    const target = backend.folder('INBOX').messages.find(m => m.subject.startsWith('Website quotation request'));
    await page.locator('md-list-item.sg-message-list-item', { hasText: target.subject }).first().click();
    await page.locator('[ui-view="message"] .mailer_plaincontent').first().waitFor({ timeout: 8000 });
    await page.locator('[ui-view="message"] [ng-click="viewer.message.toggleFlag()"]:visible').first().click();
    await page.waitForTimeout(600);
    const call = backend.calls('markMessageFlagged').find(e => e.uid === target.uid);
    check('the flag button in the message view flags it on the server', call && target.flags.includes('flagged'), JSON.stringify(backend.calls('markMessageFlagged')));
    await shot('flagged');

    const before = backend.folder('Trash').messages.length;
    await page.locator('[ui-view="message"] [ng-click="viewer.deleteMessage()"]:visible').first().click();
    await page.waitForTimeout(1000);
    const del = backend.calls('batchDelete').pop();
    const inTrash = backend.folder('Trash').messages.some(m => m.subject === target.subject);
    check('delete in the message view moves it to Trash', del && del.folder === 'INBOX' && del.body.uids.includes(target.uid) && inTrash
      && backend.folder('Trash').messages.length === before + 1 && !backend.message('INBOX', target.uid), JSON.stringify(del && del.body));
    const rows = await page.locator('md-list-item.sg-message-list-item', { hasText: target.subject }).count();
    check('the deleted message is gone from the list', rows === 0, `${rows} rows left`);
    await shot('deleted');
  });

  result.unknown = backend.unknown().map(e => `${e.method} ${e.path}`);
  await context.close();
  return result;
}

// The first line of a Playwright error, plus why an element couldn't be clicked
function why(e) {
  const lines = String(e.message).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const reason = lines.find(l => /outside of the viewport|intercepts pointer events|not visible|not stable|not enabled|detached/.test(l));
  return lines[0] + (reason ? ' (' + reason.trim().replace(/^-\s*/, '') + ')' : '');
}

function location(page) {
  return new URL(page.url()).hash;
}
