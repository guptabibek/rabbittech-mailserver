// UI smoke tests for the RabbitTech console and webmail.
// Starts the harness (router.php) and the webmail mock (sogo/prepare.sh must have run), then
// checks every main page in light, dark and phone width, plus the behaviour that broke before.
// Screenshots go to tests/ui/output. Run: cd tests/ui && npm ci && node smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, 'output');
const sogoRoot = join(here, '.cache', 'sogo-root');
mkdirSync(output, { recursive: true });

// ------------------------------------------------------------------ servers
const children = [];
function serve(port, env = {}) {
  const child = spawn('php', ['-S', `127.0.0.1:${port}`, join(here, 'router.php')], {
    // Several workers, so parallel page loads (two tabs reloading together) don't queue up
    env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4', ...env }, stdio: 'ignore',
  });
  children.push(child);
  return `http://127.0.0.1:${port}`;
}
function serveStatic(port, dir) {
  const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  children.push(child);
  return `http://127.0.0.1:${port}`;
}
async function ready(url) {
  for (let i = 0; i < 50; i++) {
    try { await fetch(url); return; } catch (e) { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('server did not start: ' + url);
}
function stopAll() { for (const c of children) c.kill(); }
process.on('exit', stopAll);

const main = serve(8088);
const tfa = serve(8089, { HARNESS_TFA: '1' });
const problems = serve(8090, { HARNESS_STOPPED: 'olefy', HARNESS_UNHEALTHY: 'rspamd', HARNESS_DF: '96', HARNESS_CERT_DAYS: '6', HARNESS_QUEUE: '64' });
const session = serve(8091, { HARNESS_SESSION_LIFETIME: '300' });
const setup = serve(8092, { HARNESS_CERT_PLACEHOLDER: '1', HARNESS_ACME: 'aaaa', HARNESS_BACKUP: 'failed', HARNESS_DNS: '1' });
const webmail = existsSync(sogoRoot) ? serveStatic(8095, sogoRoot) : null;
await Promise.all([main, tfa, problems, session, setup].map(u => ready(u + '/admin')));
if (webmail) await ready(webmail + '/mail.html');

// ------------------------------------------------------------------ helpers
const failures = [];
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const browser = await chromium.launch();
async function open(url, { theme = 'light', width = 1366, ignore = null } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !(ignore && ignore.test(r.url()))) errors.push(r.status() + ' ' + r.url()); });
  await page.addInitScript(t => { try { localStorage.setItem('mailcow_theme', t); } catch (e) {} }, theme);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return { page, errors };
}
const slug = s => s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'root';

// ------------------------------------------------------------------ console pages
console.log('Console pages');
const shellPages = ['/admin/dashboard', '/admin/mailbox', '/admin/system', '/admin/queue', '/quarantine', '/user',
  '/domainadmin/mailbox', '/domainadmin/user', '/edit/mailbox/bibek@rabbittech.com.np', '/edit/domain/rabbittech.com.np'];
const publicPages = ['/', '/admin', '/reset-password'];
for (const path of [...shellPages, ...publicPages]) {
  for (const [theme, width] of [['light', 1366], ['dark', 1366], ['light', 390]]) {
    const { page, errors } = await open(main + path, { theme, width });
    const name = `${path} ${theme} ${width}px`;
    check(`${name}: no errors`, errors.length === 0, errors.join(' | '));
    if (shellPages.includes(path)) {
      const state = await page.evaluate(() => ({
        ready: document.documentElement.classList.contains('rt-shell-ready'),
        failed: document.documentElement.classList.contains('rt-shell-failed'),
        title: (document.querySelector('.rt-page-title, h1') || {}).textContent || '',
      }));
      check(`${name}: shell ready with a page title`, state.ready && !state.failed && state.title.trim() !== '', JSON.stringify(state));
    }
    if (width < 600) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${name}: no sideways scrolling`, overflow <= 1, overflow + 'px wider than the screen');
    }
    await page.screenshot({ path: join(output, `${slug(path)}-${theme}-${width}.png`) });
    await page.close();
  }
}

// ------------------------------------------------------------------ behaviour
console.log('Behaviour');
{
  const { page } = await open(main + '/admin/mailbox#/mailboxes');
  await page.keyboard.press('Tab');
  check('skip link is the first thing keyboard users reach', await page.evaluate(() => document.activeElement.classList.contains('rt-skip-link')));
  await page.close();
}
{
  // Select-all must leave mailcow's selection list consistent: every selected row exactly once
  const { page } = await open(main + '/admin/mailbox#/mailboxes');
  let sent = null;
  await page.route('**/api/v1/edit/**', async route => {
    sent = new URLSearchParams(route.request().postData()).get('items');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const rows = page.locator('#mailbox_table tbody input[name="multi_select"]');
  const header = page.locator('#mailbox_table thead .rt-select-all');
  // mailcow navigates after a bulk action, so each case starts from a fresh page load
  const reload = async () => { await page.goto(main + '/admin/mailbox#/mailboxes', { waitUntil: 'networkidle' }); await page.waitForTimeout(600); };
  const activate = async () => {
    sent = null;
    await page.evaluate(() => document.querySelector('#tab-mailboxes [data-action="edit_selected"][data-id="mailbox"][data-api-attr*="active"]').click());
    await page.waitForTimeout(400);
    return sent === null ? [] : JSON.parse(sent).sort();
  };
  // The checkboxes hold URL-encoded usernames; mailcow decodes them when it sends the request
  const all = (await rows.evaluateAll(list => list.map(i => decodeURIComponent(i.value)))).sort();
  await rows.first().check(); await header.check(); await header.uncheck();
  check('select one row, select all, select none → nothing selected', (await activate()).length === 0);
  await reload(); await header.check();
  check('select all → every row once', JSON.stringify(await activate()) === JSON.stringify(all));
  await reload(); await rows.nth(0).check(); await rows.nth(1).check(); await header.check();
  check('select two rows, then all → every row once', JSON.stringify(await activate()) === JSON.stringify(all));
  await reload(); await header.check();
  const third = decodeURIComponent(await rows.nth(2).getAttribute('value'));
  await rows.nth(2).uncheck();
  const counter = (await page.locator('#tab-mailboxes .rt-selection-count').first().textContent()).trim();
  check('select all, then clear one row → the others, counted', JSON.stringify(await activate()) === JSON.stringify(all.filter(v => v !== third)) && counter.startsWith(String(all.length - 1)), counter);
  await page.close();
}
{
  const { page } = await open(main + '/admin/queue');
  const display = await page.evaluate(() => [...document.querySelectorAll('[class*="mass-actions"]')].map(e => getComputedStyle(e).display));
  check('mail queue bulk actions are visible on desktop', display.some(d => d !== 'none'), display.join(','));
  await page.close();
}
{
  const { page } = await open(tfa + '/user');
  const text = (await page.locator('#tfa_pretty').textContent()).trim();
  check('2FA shows "On" with its methods', /^On/.test(text) && /TOTP/.test(text) && /WebAuthn/.test(text), text);
  await page.close();
}
{
  const calls = [];
  const page = await browser.newPage();
  page.on('request', r => { if (r.url().includes('/api/v1/get/')) calls.push(r.url()); });
  await page.goto(main + '/admin/dashboard', { waitUntil: 'networkidle' });
  check('Overview counts the quarantine without loading every item', !calls.some(u => u.includes('quarantine/all')));
  check('Overview shows no alerts when all is well', await page.locator('#rt-alerts').evaluate(e => e.hidden));
  const backup = (await page.locator('.rt-meta [data-rt-time]').textContent()).trim();
  check('Overview shows when the last backup was made', /ago/.test(backup), backup);
  await page.close();
}
{
  const { page } = await open(problems + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert .rt-alert-text').allTextContents();
  check('Overview lists stopped and unhealthy containers, disk, certificate and queue, most severe first', alerts.length === 5
    && /Office macro scanner/.test(alerts[0]) && /96%/.test(alerts[1]) && /Spam filter/.test(alerts[2]) && /certificate/.test(alerts[3]) && /64/.test(alerts[4]), alerts.join(' | '));
  await page.screenshot({ path: join(output, 'overview-alerts.png') });
  await page.close();
}
{
  // A new server: no certificate yet (ACME blocked by an AAAA record), a failed backup, DNS gaps
  const { page, errors } = await open(setup + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert').evaluateAll(items => items.map(item => ({
    level: item.className.replace(/.*rt-alert-/, ''),
    text: item.querySelector('.rt-alert-text').textContent.trim(),
    hint: item.querySelector('.rt-alert-hint').textContent.replace(/\s+/g, ' ').trim(),
  })));
  const find = re => alerts.find(a => re.test(a.text)) || { text: '', hint: '' };
  const cert = find(/No certificate has been issued for mail\.rabbittech\.com\.np/);
  check('no certificate yet: says so, with the reason from the ACME log', /IPv6 \(AAAA\) record/.test(cert.hint) && cert.level === 'danger', JSON.stringify(cert));
  check('a failed backup shows its reason', /Missing or empty archives: mariadb/.test(find(/last backup failed/).hint));
  check('missing reverse DNS names the IP and hostname', /PTR record of 94\.136\.186\.45 to mail\.rabbittech\.com\.np/.test(find(/Reverse DNS/).hint));
  check('domains with the same problem share one alert', find(/No DMARC record/).text === 'No DMARC record: a.example, b.example, c.example and 2 more');
  check('every alert has a title and hint, with nothing left unformatted', alerts.length === 9
    && alerts.every(a => a.text && a.hint && !/%[sd]/.test(a.text + a.hint)), JSON.stringify(alerts.map(a => a.text)));
  const levels = alerts.map(a => a.level).join(',');
  check('danger alerts come before warnings', /^(danger,)*(warning,?)*$/.test(levels), levels);
  check('no page errors with every alert shown', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: join(output, 'overview-setup-alerts.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open the ACME log' }).click();
  await page.waitForTimeout(300);
  check('"Open the ACME log" opens the ACME log', await page.locator('#tab-acme-logs').evaluate(e => e.classList.contains('active')));
  await page.close();
}
// Mailbox users and domain admins never see the mailcow, SOGo or Rspamd names, not even in dialogs
// that are still closed. Container names ("sogo-mailcow") stay: admins type them in docker compose.
for (const path of ['/', '/user', '/quarantine', '/domainadmin/mailbox', '/domainadmin/user', '/edit/mailbox/bibek@rabbittech.com.np']) {
  const { page } = await open(main + path);
  const names = await page.evaluate(() => {
    const re = /mailcow|sogo|rspamd|postcow/i;
    const named = text => re.test(text.replace(/[\w-]+-mailcow\b/g, ''));
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      if (!['SCRIPT', 'STYLE', 'TEXTAREA'].includes(node.parentElement.tagName) && named(node.textContent)) found.push(node.textContent.trim());
    }
    for (const el of document.querySelectorAll('[title], [aria-label], [placeholder], [data-bs-original-title]')) {
      for (const attr of ['title', 'aria-label', 'placeholder', 'data-bs-original-title']) {
        if (named(el.getAttribute(attr) || '')) found.push(el.getAttribute(attr));
      }
    }
    return found;
  });
  check(`${path}: no mailcow, SOGo or Rspamd names`, names.length === 0, names.slice(0, 3).join(' | '));
  await page.close();
}
{
  // Two tabs share one session: the idle tab must not warn or reload while the other is active
  const ctx = await browser.newContext();
  await ctx.clock.install({ time: new Date('2026-10-15T08:00:00Z') });
  const a = await ctx.newPage(), b = await ctx.newPage();
  await a.goto(session + '/admin/mailbox', { waitUntil: 'networkidle' });
  await b.goto(session + '/admin/mailbox', { waitUntil: 'networkidle' });
  const warns = p => p.evaluate(() => !!document.querySelector('.rt-session-warning'));
  await ctx.clock.runFor(170000);
  await b.evaluate(() => new Promise(r => $.get('/api/v1/get/domain/all').always(r)));
  await ctx.clock.runFor(100000);
  check('session: no warning while another tab is active', !(await warns(a)));
  await ctx.clock.runFor(120000);
  check('session: warning once both tabs are idle', (await warns(a)) && (await warns(b)));
  await b.click('.rt-session-warning button');
  await b.waitForTimeout(500);
  await ctx.clock.runFor(6000);
  check('session: "Stay signed in" clears the warning in every tab', !(await warns(a)) && !(await warns(b)));
  // Both tabs reload at once; wait for the reload itself rather than a fixed time
  const reloaded = a.waitForEvent('load', { timeout: 20000 }).then(() => true, () => false);
  await ctx.clock.runFor(310000);
  check('session: the page reloads once the session has ended', await reloaded);
  await ctx.close();
}

// ------------------------------------------------------------------ webmail
if (webmail) {
  console.log('Webmail mock');
  // SOGo's stylesheet links Fira Sans files that aren't part of the web resources in git
  const fonts = /FiraSans/;
  for (const name of ['mail', 'compose', 'calendar', 'contacts', 'prefs']) {
    for (const theme of ['light', 'dark']) {
      const { page, errors } = await open(`${webmail}/${name}.html`, { theme, ignore: fonts });
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => {
        const bar = document.querySelector('md-toolbar.toolbar-main');
        return {
          style: !!document.getElementById('rabbittech-sogo'),
          stockTheme: !!document.querySelector('link[href*="theme-default.css"]'),
          dark: document.documentElement.getAttribute('data-theme') === 'dark',
          bar: bar ? getComputedStyle(bar).backgroundColor : null,
          viewport: document.querySelector('meta[name="viewport"]').content,
          consoleButton: (document.querySelector('[ng-href="/user"]') || {}).getAttribute ? document.querySelector('[ng-href="/user"]').getAttribute('aria-label') : null,
        };
      });
      const label = `webmail ${name} ${theme}`;
      check(`${label}: no errors`, errors.length === 0, errors.join(' | '));
      check(`${label}: RabbitTech stylesheet and palette in use`, state.style && !state.stockTheme && state.dark === (theme === 'dark'), JSON.stringify(state));
      check(`${label}: top bar colour`, state.bar === (theme === 'dark' ? 'rgb(18, 21, 28)' : 'rgb(255, 255, 255)'), state.bar);
      check(`${label}: pinch-zoom allowed`, !/maximum-scale/.test(state.viewport), state.viewport);
      check(`${label}: console button says RabbitTech Mail, not mailcow`, state.consoleButton === 'RabbitTech Mail Preferences', state.consoleButton);
      if (name === 'mail' && theme === 'light') {
        const color = await page.evaluate(() => getComputedStyle(document.querySelector('md-list-item.sg-message-list-item.md-bg')).color);
        check('webmail: selected message text is dark on the light highlight', color === 'rgb(16, 18, 27)', color);
      }
      await page.screenshot({ path: join(output, `webmail-${name}-${theme}.png`) });
      await page.close();
    }
  }
} else {
  console.log('Webmail mock skipped: run tests/ui/sogo/prepare.sh first');
}

await browser.close();
stopAll();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
