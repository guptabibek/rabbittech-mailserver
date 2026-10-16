// UI smoke tests for the RabbitTech console and webmail.
// Starts the harness (router.php) and the webmail mock (sogo/prepare.sh must have run), then
// checks every main page in light, dark and phone width, plus the behaviour that broke before.
// Screenshots go to tests/ui/output. Run: cd tests/ui && npm ci && node smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mailBackend, PAGE } from './sogo/backend.mjs';

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
const webmail = existsSync(join(sogoRoot, 'live', 'view.html')) ? serveStatic(8095, sogoRoot) : null;
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

  // SOGo's real Mail app: the page sogo/live.py renders from SOGo's own templates, its own
  // scripts, and sogo/backend.mjs answering its requests like SOGo does. Checks the Gmail-style
  // layout custom-sogo.js applies to it, what its buttons do on the server, and the fail-safe.
  console.log('Webmail: Mail app');
  const openMail = async ({ theme = 'light', width = 1366, height = 900, custom = true, pageFilter } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors = [], warnings = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (/RabbitTech mail layout/.test(m.text())) warnings.push(m.text());
      else if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
    });
    page.on('response', r => { if (r.status() >= 400 && !fonts.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
    await page.addInitScript(t => { try { localStorage.setItem('mailcow_theme', t); } catch (e) {} }, theme);
    const backend = await mailBackend(ctx, { custom, pageFilter });
    await page.goto(webmail + PAGE, { waitUntil: 'load' });
    await page.waitForSelector('md-list-item.sg-message-list-item .sg-tile-subject', { timeout: 20000 });
    await page.waitForTimeout(500);
    return { ctx, page, backend, errors, warnings };
  };
  const classes = page => page.evaluate(() => document.documentElement.className.split(/\s+/));
  const changes = ['layout', 'brand', 'compose', 'search', 'rows', 'fab', 'back'].map(c => 'rt-gmail-' + c);
  const rows = page => page.locator('md-list-item.sg-message-list-item');
  // The message a list row shows (its directive's controller; Angular's scope() is off in SOGo)
  const messageOf = row => row.evaluate(el => {
    const m = angular.element(el).controller('sgMessageListItem').message;
    return { uid: m.uid, subject: m.subject, isflagged: m.isflagged, isread: m.isread };
  });
  const until = async (test, ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 100))) if (await test()) return true;
    return false;
  };

  {
    // Stock SOGo first: if this fails, the fake server is wrong, not our layout
    const { ctx, page, errors } = await openMail({ custom: false });
    check('mail app: stock SOGo runs against the fake server without errors', errors.length === 0 && await rows(page).count() > 5, errors.join(' | '));
    await ctx.close();
  }

  {
    const { ctx, page, backend, errors, warnings } = await openMail();
    const cls = await classes(page);
    check('mail app: every layout change applied, no warnings', changes.every(c => cls.includes(c)) && warnings.length === 0, cls.join(' ') + ' ' + warnings.join(' | '));
    await page.screenshot({ path: join(output, 'webmail-app-light.png') });

    // Installable: the manifest, its icons, and Chromium's own verdict on the page
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const m = link && await (await fetch(link.href)).json();
      const sizes = m ? await Promise.all(m.icons.map(icon => new Promise(done => {
        const img = new Image();
        img.onload = () => done(icon.sizes === img.naturalWidth + 'x' + img.naturalHeight);
        img.onerror = () => done(false);
        img.src = icon.src;
      }))) : [];
      const touch = document.querySelector('link[rel="apple-touch-icon"]');
      return {
        fields: !!m && m.name === 'RabbitTech Webmail' && m.start_url === '/webmail' && m.scope === '/' && m.display === 'standalone',
        purposes: m ? m.icons.map(i => i.sizes + ' ' + i.purpose).join(', ') : '',
        sizes: sizes.length === 3 && sizes.every(Boolean),
        touch: !!touch && await fetch(touch.href).then(r => r.ok),
        theme: (document.querySelector('meta[name="theme-color"]') || {}).content,
      };
    });
    check('mail app: the page links a manifest that opens /webmail in its own window',
      manifest.fields && manifest.purposes === '192x192 any, 512x512 any, 512x512 maskable', JSON.stringify(manifest));
    check('mail app: app icons load at their stated sizes, iPhone icon too', manifest.sizes && manifest.touch, JSON.stringify(manifest));
    check('mail app: the window title bar matches the light page', manifest.theme === '#f5f6fa', manifest.theme);
    // Chromium itself: it found our manifest, parsed it without errors, and sees nothing that
    // stops installing (it offers any page as an app, so the manifest part is what counts)
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    const app = await cdp.send('Page.getAppManifest');
    check('mail app: Chromium reads the manifest without errors and can install webmail',
      /\/webmail\.webmanifest$/.test(app.url) && app.errors.length === 0 && installabilityErrors.length === 0,
      JSON.stringify({ url: app.url, errors: app.errors, installabilityErrors }));

    // Search box in the top bar, readable, filters and resets the list
    const box = page.locator('md-toolbar.toolbar-main form.rt-search input[type="search"]');
    const look = await box.evaluate(el => {
      const label = el.parentNode.querySelector('label');
      return { color: getComputedStyle(el).color, label: label && getComputedStyle(label).fontSize };
    });
    check('mail app: search box is in the top bar with dark text and a 15px placeholder', look.color === 'rgb(16, 18, 27)' && look.label === '15px', JSON.stringify(look));
    const all = await rows(page).count();
    await box.fill('invoice');
    await until(() => backend.calls('view').some(c => JSON.stringify(c.body || '').includes('invoice')));
    await page.waitForTimeout(600);
    const found = await rows(page).allInnerTexts();
    check('mail app: typing in the search box filters the folder', found.length > 0 && found.length < all && found.every(t => /invoice/i.test(t)), found.length + ' of ' + all);
    await box.fill('');
    const restored = await until(async () => (await rows(page).count()) === all);
    check('mail app: emptying the search box shows the whole folder again', restored, String(await rows(page).count()));

    // Rows: one line, 56px apart (SOGo's scrolling relies on it)
    const geo = await rows(page).first().evaluate(el => {
      const r = e => el.querySelector(e).getBoundingClientRect();
      const sender = r('.sg-md-subhead > div'), subject = r('.sg-tile-subject');
      return { height: el.getBoundingClientRect().height, sameLine: Math.abs((sender.top + sender.bottom) - (subject.top + subject.bottom)) < 6 };
    });
    check('mail app: rows are one line and 56px tall', geo.height === 56 && geo.sameLine, JSON.stringify(geo));
    const textIcons = await page.evaluate(() => [...document.querySelectorAll('md-icon')]
      .filter(i => i.offsetParent && i.getBoundingClientRect().width > 40).map(i => i.textContent.trim()));
    check('mail app: every visible icon is drawn as an icon, not as its name', textIcons.length === 0, textIcons.join(', '));

    // Star, read/unread, archive and delete from a row, as the server sees them
    const row = rows(page).nth(3);
    const msg = await messageOf(row);
    await row.locator('.rt-star').click();
    check('mail app: the star flags the message on the server', await until(() => backend.calls(msg.isflagged ? 'markMessageUnflagged' : 'markMessageFlagged').some(c => c.uid === msg.uid)));
    await row.hover();
    check('mail app: Archive, Delete and Read show on the row under the pointer', await row.locator('.rt-row-actions').isVisible());
    await row.locator('.rt-act').nth(2).click();
    check('mail app: the read button marks the message read or unread', await until(() => backend.calls(msg.isread ? 'markMessageUnread' : 'markMessageRead').some(c => c.uid === msg.uid)));
    const subjectIn = (folder, subject) => backend.folder(folder).messages.some(m => m.subject === subject);
    const toArchive = await messageOf(rows(page).nth(1));
    await rows(page).nth(1).hover();
    await rows(page).nth(1).locator('.rt-act').nth(0).click();
    const archived = await until(() => subjectIn('Archive', toArchive.subject) && !subjectIn('INBOX', toArchive.subject));
    const moved = backend.calls('moveMessages').pop();
    check('mail app: Archive moves the message to the Archive folder', archived && moved && moved.body.folder === '/0/folderArchive', JSON.stringify(moved && moved.body));
    await page.waitForTimeout(400);
    check('mail app: the archived message leaves the list', !(await rows(page).allInnerTexts()).some(t => t.includes(toArchive.subject)));
    const toTrash = await messageOf(rows(page).nth(1));
    await rows(page).nth(1).hover();
    await rows(page).nth(1).locator('.rt-act').nth(1).click();
    check('mail app: Delete moves the message to Trash', await until(() => subjectIn('Trash', toTrash.subject) && !subjectIn('INBOX', toTrash.subject)));

    // An open message takes the list's place; back returns to it
    await rows(page).nth(0).click();
    await page.waitForSelector('#detailView:not(.sg-close) .msg-body');
    const reading = () => page.evaluate(() => ({
      list: getComputedStyle(document.querySelector('.view-list')).visibility,
      back: !!document.querySelector('.rt-back') && document.querySelector('.rt-back').offsetParent !== null,
    }));
    const read = await until(async () => { const r = await reading(); return r.list === 'hidden' && r.back; }, 3000);
    check('mail app: an open message replaces the list and has a back arrow', read, JSON.stringify(await reading()));
    await page.click('.rt-back');
    check('mail app: back shows the list again', await until(() => page.evaluate(() =>
      !!document.querySelector('#detailView.sg-close') && getComputedStyle(document.querySelector('.view-list')).visibility === 'visible')));

    // Compose: a window at the bottom right, the mail behind it still usable
    await page.click('.rt-compose');
    await page.waitForSelector('md-dialog.sg-mail-editor', { state: 'visible' });
    await page.waitForTimeout(800);
    const win = await page.evaluate(() => {
      const d = document.querySelector('md-dialog.sg-mail-editor').getBoundingClientRect();
      const backdrop = [...document.querySelectorAll('md-backdrop')].some(b => b.offsetParent !== null);
      return { float: !!document.querySelector('.md-dialog-container.rt-float'), backdrop, right: Math.round(innerWidth - d.right), bottom: Math.round(innerHeight - d.bottom), width: Math.round(d.width) };
    });
    check('mail app: Compose opens a window at the bottom right with no backdrop', win.float && !win.backdrop && win.right <= 30 && win.bottom <= 2 && win.width < 700, JSON.stringify(win));
    check('mail app: compose asked the server for a new draft', backend.calls('compose').length > 0);
    await page.screenshot({ path: join(output, 'webmail-app-compose.png') });
    // Left part of the row: the compose window covers the right
    await rows(page).nth(2).click({ position: { x: 300, y: 28 } });
    check('mail app: a message opens while the compose window stays open', await until(() => page.evaluate(() =>
      !!document.querySelector('#detailView:not(.sg-close) .msg-body') && !!document.querySelector('md-dialog.sg-mail-editor'))));
    check('mail app light: no errors', errors.length === 0, errors.join(' | '));

    // Classic layout and back
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('md-list-item.sg-message-list-item .sg-tile-subject');
    const classic = await page.evaluate(() => ({
      gmail: document.documentElement.classList.contains('rt-gmail'),
      search: !!document.querySelector('.view-list form[sg-search]'),
      button: !!document.querySelector('.rt-layout-switch'),
    }));
    check('mail app: the switch gives the classic layout, with a way back', !classic.gmail && classic.search && classic.button, JSON.stringify(classic));
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('md-list-item.sg-message-list-item .sg-tile-subject');
    check('mail app: switching back restores the new layout', (await classes(page)).includes('rt-gmail-search'));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openMail({ theme: 'dark' });
    await page.screenshot({ path: join(output, 'webmail-app-dark.png') });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.view-list')).backgroundColor);
    check('mail app dark: dark list, no errors', bg === 'rgb(18, 21, 28)' && errors.length === 0, bg + ' ' + errors.join(' | '));
    const theme = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    check('mail app dark: the window title bar is dark too', theme === '#0b0d12', theme);
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openMail({ width: 390, height: 844 });
    const phone = await page.evaluate(() => {
      const form = document.querySelector('form.rt-search').getBoundingClientRect();
      const apps = document.querySelector('.toolbar-main .sg-toolbar-group-last').getBoundingClientRect();
      return { sideways: document.documentElement.scrollWidth > innerWidth, searchBelow: form.top >= apps.bottom - 1 };
    });
    check('mail app 390px: no sideways scrolling, search on its own row', !phone.sideways && phone.searchBelow, JSON.stringify(phone));
    await page.screenshot({ path: join(output, 'webmail-app-phone.png') });
    await rows(page).nth(0).click();
    await page.waitForSelector('#detailView:not(.sg-close) .msg-body');
    // The message slides in from the right on phones; wait for it to settle
    const onScreen = async () => { const b = await page.locator('.rt-back').boundingBox(); return b && b.x >= 0 && b.x + b.width <= 390; };
    check('mail app 390px: the back arrow is on screen', await until(onScreen, 3000), JSON.stringify(await page.locator('.rt-back').boundingBox()));
    await page.click('.rt-back');
    await page.waitForSelector('#detailView.sg-close', { state: 'attached' });
    await page.click('.sg-fab-bottom-center');
    await page.waitForSelector('md-dialog.sg-mail-editor', { state: 'visible' });
    check('mail app 390px: compose is full screen, not a window', !(await page.locator('.md-dialog-container.rt-float').count()));
    check('mail app 390px: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  {
    // Fail-safe: templates that no longer match leave those parts as SOGo has them
    const pageFilter = html => html.replace('type="search" name="folderSearch"', 'type="text" name="folderSearch"').replace('ng-click="viewer.close()"', 'ng-click="viewer.close( )"');
    const { ctx, page, errors, warnings } = await openMail({ pageFilter });
    const cls = await classes(page);
    check('mail app fail-safe: unmatched changes are skipped with a warning, the rest apply',
      !cls.includes('rt-gmail-search') && !cls.includes('rt-gmail-back') && cls.includes('rt-gmail-rows') &&
      warnings.some(w => /"search" skipped/.test(w)) && warnings.some(w => /"back" skipped/.test(w)), cls.join(' ') + ' ' + warnings.join(' | '));
    check('mail app fail-safe: search stays in the list toolbar', await page.locator('.view-list form[sg-search]').count() === 1);
    await rows(page).nth(0).click();
    await page.waitForSelector('#detailView:not(.sg-close) .msg-body');
    check('mail app fail-safe: without the back arrow the list stays beside the open message',
      await page.evaluate(() => getComputedStyle(document.querySelector('.view-list')).visibility === 'visible'));
    check('mail app fail-safe: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} else {
  console.log('Webmail mock skipped: run tests/ui/sogo/prepare.sh first');
}

await browser.close();
stopAll();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
