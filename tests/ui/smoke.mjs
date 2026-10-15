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
    env: { ...process.env, ...env }, stdio: 'ignore',
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
const webmail = existsSync(sogoRoot) ? serveStatic(8095, sogoRoot) : null;
await Promise.all([main, tfa, problems, session].map(u => ready(u + '/admin')));
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
  await page.close();
}
{
  const { page } = await open(problems + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert .rt-alert-text').allTextContents();
  check('Overview lists stopped and unhealthy containers, disk, certificate and queue', alerts.length === 5
    && /olefy/.test(alerts[0]) && /rspamd/.test(alerts[1]) && /96%/.test(alerts[2]) && /certificate/.test(alerts[3]) && /64/.test(alerts[4]), alerts.join(' | '));
  await page.screenshot({ path: join(output, 'overview-alerts.png') });
  await page.close();
}
{
  // Two tabs share one session: the idle tab must not warn or reload while the other is active
  const ctx = await browser.newContext();
  await ctx.clock.install({ time: new Date('2026-10-15T08:00:00Z') });
  const a = await ctx.newPage(), b = await ctx.newPage();
  let loads = 0; a.on('load', () => loads++);
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
  const before = loads;
  await ctx.clock.runFor(310000);
  await a.waitForTimeout(1000);
  check('session: the page reloads once the session has ended', loads > before);
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
        };
      });
      const label = `webmail ${name} ${theme}`;
      check(`${label}: no errors`, errors.length === 0, errors.join(' | '));
      check(`${label}: RabbitTech stylesheet and palette in use`, state.style && !state.stockTheme && state.dark === (theme === 'dark'), JSON.stringify(state));
      check(`${label}: top bar colour`, state.bar === (theme === 'dark' ? 'rgb(18, 21, 28)' : 'rgb(255, 255, 255)'), state.bar);
      check(`${label}: pinch-zoom allowed`, !/maximum-scale/.test(state.viewport), state.viewport);
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
