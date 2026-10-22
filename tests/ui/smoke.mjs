// UI smoke tests for the RabbitTech console and webmail.
// Starts the harness (router.php) and the webmail mock (sogo/prepare.sh must have run), then
// checks every main page in light, dark and phone width, plus the behaviour that broke before.
// Screenshots go to tests/ui/output. Run: cd tests/ui && npm ci && node smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mailBackend, PAGE, CALENDAR_PAGE, CONTACTS_PAGE, PREFS_PAGE } from './sogo/backend.mjs';

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
const setup = serve(8092, { HARNESS_CERT_PLACEHOLDER: '1', HARNESS_ACME: 'aaaa', HARNESS_BACKUP: 'failed', HARNESS_DNS: '1', HARNESS_RESTORE: 'failed', HARNESS_REPORTS: 'problems' });
const restoreOld = serve(8093, { HARNESS_RESTORE: 'old', HARNESS_REPORTS: 'waiting' });
const backupOff = serve(8094, { HARNESS_BACKUP: 'off', HARNESS_RESTORE: 'failed', HARNESS_REPORTS: 'off' });
const webmail = existsSync(join(sogoRoot, 'live', 'view.html')) ? serveStatic(8095, sogoRoot) : null;
await Promise.all([main, tfa, problems, session, setup, restoreOld, backupOff].map(u => ready(u + '/admin')));
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
  // The bulk action posts the selected rows. Wait for that request itself: a fixed wait was too
  // short on slow CI runners. With nothing selected there is no request, so that case only waits.
  const activate = async (expectRequest = true) => {
    sent = null;
    const request = expectRequest ? page.waitForRequest('**/api/v1/edit/**', { timeout: 10000 }).catch(() => null) : null;
    await page.evaluate(() => document.querySelector('#tab-mailboxes [data-action="edit_selected"][data-id="mailbox"][data-api-attr*="active"]').click());
    if (!expectRequest) {
      await page.waitForTimeout(400);
      return sent === null ? [] : JSON.parse(sent).sort();
    }
    const posted = await request;
    return posted ? JSON.parse(new URLSearchParams(posted.postData()).get('items')).sort() : null;
  };
  const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);
  const sentVs = (got, want) => `sent ${got === null ? 'nothing' : JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
  // The checkboxes hold URL-encoded usernames; mailcow decodes them when it sends the request
  const all = (await rows.evaluateAll(list => list.map(i => decodeURIComponent(i.value)))).sort();
  await rows.first().check(); await header.check(); await header.uncheck();
  let got = await activate(false);
  check('select one row, select all, select none → nothing selected', got.length === 0, sentVs(got, []));
  await reload(); await header.check();
  got = await activate();
  check('select all → every row once', same(got, all), sentVs(got, all));
  await reload(); await rows.nth(0).check(); await rows.nth(1).check(); await header.check();
  got = await activate();
  check('select two rows, then all → every row once', same(got, all), sentVs(got, all));
  await reload(); await header.check();
  const third = decodeURIComponent(await rows.nth(2).getAttribute('value'));
  await rows.nth(2).uncheck();
  const counter = (await page.locator('#tab-mailboxes .rt-selection-count').first().textContent()).trim();
  const others = all.filter(v => v !== third);
  got = await activate();
  check('select all, then clear one row → the others, counted', same(got, others) && counter.startsWith(String(all.length - 1)), `${counter}; ${sentVs(got, others)}`);
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
  const backup = (await page.locator('.rt-meta [data-rt-time]').first().textContent()).trim();
  check('Overview shows when the last backup was made', /ago/.test(backup), backup);
  const restore = (await page.locator('.rt-meta div', { hasText: 'Last restore test' }).locator('dd').innerText()).trim();
  check('Overview shows the last restore test passed, and when', await page.locator('.rt-meta .rt-restore-ok .bi-check-circle-fill').count() === 1
    && /^2 days ago$/.test(restore), restore);
  await page.close();
}
{
  const { page } = await open(restoreOld + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert').evaluateAll(items => items.map(item => item.className + ' ' + item.textContent.replace(/\s+/g, ' ').trim()));
  check('a restore test over the interval + 3 days old is a warning', alerts.length === 1 && /rt-alert-warning/.test(alerts[0])
    && /The last restore test is from \d+ \w+ \d{4} /.test(alerts[0]) && /scripts\/restore-test\.sh/.test(alerts[0]), alerts.join(' | '));
  await page.close();
}
{
  const { page } = await open(backupOff + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert .rt-alert-text').allTextContents();
  const restore = (await page.locator('.rt-meta div', { hasText: 'Last restore test' }).locator('dd').innerText()).trim();
  check('with backups off, the restore test says Off and its old failure is not shown', restore === 'Off'
    && alerts.length === 1 && /Automatic backups are turned off/.test(alerts[0]), restore + ' | ' + alerts.join(' | '));
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
  const restore = find(/last restore test failed/);
  check('a failed restore test is a danger alert naming the failed check', restore.level === 'danger'
    && /What failed: dkim: No DKIM key in the backup for example\.org\. The full report is in backups\/restore-test-last-run\.log/.test(restore.hint), JSON.stringify(restore));
  check('the server card marks the restore test failed', await page.locator('.rt-meta .rt-restore-failed .bi-x-circle-fill').count() === 1);
  check('missing reverse DNS names the IP and hostname', /PTR record of 94\.136\.186\.45 to mail\.rabbittech\.com\.np/.test(find(/Reverse DNS/).hint));
  check('domains with the same problem share one alert', find(/No DMARC record/).text === 'No DMARC record: a.example, b.example, c.example and 2 more');
  check('every alert has a title and hint, with nothing left unformatted', alerts.length === 19
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
// ------------------------------------------------------------------ mail security
console.log('Mail security');
{
  // The setup server: DNS gaps around MTA-STS, TLS and DMARC reporting, and bad news in the reports
  const { page } = await open(setup + '/admin/dashboard');
  const alerts = await page.locator('.rt-alert').evaluateAll(items => items.map(item => ({
    level: item.className.replace(/.*rt-alert-/, ''),
    text: item.querySelector('.rt-alert-text').textContent.trim(),
    hint: item.querySelector('.rt-alert-hint').textContent.replace(/\s+/g, ' ').trim(),
    links: [...item.querySelectorAll('.rt-alert-hint a')].map(a => a.getAttribute('href')),
  })));
  const find = re => alerts.find(a => re.test(a.text)) || { text: '', hint: '', links: [] };
  const mx = find(/MX host is missing from the MTA-STS policy/);
  check('an MX host missing from an enforced MTA-STS policy is a danger', mx.level === 'danger' && /Add mail\.rabbittech\.com\.np, and any other MX host/.test(mx.hint), JSON.stringify(mx));
  check('one domain: the alert links to its Mail security tab', mx.links[0] === '/edit/domain/rabbittech.com.np#mail-security', mx.links.join(' '));
  const tls = find(/No TLS reports for/);
  check('several domains: the alert links to the domain list', tls.links[0] === '/admin/mailbox#/domains' && /rua=mailto:reports@rabbittech\.com\.np/.test(tls.hint), JSON.stringify(tls));
  check('DMARC reports to another domain need its consent, named in the hint', /<domain>\._report\._dmarc\.rabbittech\.com\.np with the value v=DMARC1/.test(find(/can't reach the reports mailbox/).hint));
  check('the MTA-STS policy alert says where senders fetch it', /mta-sts\.<domain> to mail\.rabbittech\.com\.np with a CNAME/.test(find(/MTA-STS policy can't be fetched/).hint));
  check('a failed report run says why', /Reason: There is no mailbox reports@rabbittech\.com\.np\. Create it in the console/.test(find(/Mail reports can't be read from reports@rabbittech\.com\.np/).hint));
  check('this server\'s own mail failing DMARC is counted', /reported 9 messages from this server \(94\.136\.186\.45\)/.test(find(/Mail from this server failed DMARC: rabbittech\.com\.np/).hint));
  check('failed TLS connections, with the most common failure', /reported 6 failed TLS connections in the last 7 days, most often “certificate-expired”/.test(find(/couldn't deliver securely to: rabbittech\.com\.np/).hint));
  await page.close();
}
{
  // A month of good reports: no alerts, the card shows each domain and who sends as it
  const { page, errors } = await open(main + '/admin/dashboard');
  const domains = await page.locator('#rt-reports-domains tbody tr').evaluateAll(rows => rows.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  check('Mail reports: messages and DMARC pass rate per domain', domains.length === 2 && /^rabbittech\.com\.np 1,556 98\.9% 1,428 of 1,428 connections$/.test(domains[0])
    && /^staging\.rabbittech\.com\.np 28 100% No TLS reports$/.test(domains[1]), domains.join(' | '));
  const senders = await page.locator('#rt-reports-senders tbody tr').evaluateAll(rows => rows.map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  check('Mail reports: senders, busiest first, this server marked', senders.length === 3 && /^mail\.rabbittech\.com\.np This server 94\.136\.186\.45 rabbittech\.com\.np, staging\.rabbittech\.com\.np [\d,]+ 100%$/.test(senders[0])
    && /^mail-sor-f69\.google\.com 209\.85\.220\.69 rabbittech\.com\.np 84 100%$/.test(senders[1]) && /^203\.0\.113\.66 rabbittech\.com\.np 16 0% 16 failed$/.test(senders[2]), senders.join(' | '));
  const foot = (await page.locator('.rt-reports-foot').textContent()).replace(/\s+/g, ' ').trim();
  check('Mail reports: how many reports, from whom', foot === 'From 98 reports by Enterprise Outlook, Google Inc., google.com', foot);
  const meta = (await page.locator('.rt-reports-meta').textContent()).replace(/\s+/g, ' ').trim();
  check('Mail reports: when they were last read', /^Last 30 days · read 5 minutes ago$/.test(meta), meta);
  check('no page errors with the reports card', errors.length === 0, errors.join(' | '));
  await page.locator('#rt-reports').screenshot({ path: join(output, 'overview-mail-reports.png') });
  await page.close();
}
for (const [server, title, hint] of [[backupOff, "Mail reports aren't collected", /set RT_REPORTS_MAILBOX in mailcow\.conf/], [restoreOld, 'No reports yet', /once a day to reports@rabbittech\.com\.np/]]) {
  const { page } = await open(server + '/admin/dashboard');
  const text = (await page.locator('#rt-reports .card-body').textContent()).replace(/\s+/g, ' ').trim();
  check(`Mail reports card: "${title}"`, text.startsWith(title) && hint.test(text) && await page.locator('#rt-reports table').count() === 0, text);
  await page.close();
}
{
  // The domain's Mail security tab loads only when it opens
  const { page } = await open(main + '/edit/domain/rabbittech.com.np');
  const requests = [];
  page.on('request', r => { if (r.url().includes('rt_mail_security.php')) requests.push(r.url()); });
  await page.waitForTimeout(300);
  check('the Mail security checks are not run until the tab opens', requests.length === 0);
  await page.locator('[data-bs-target="#dmailsecurity"]').click();
  await page.locator('.rt-security-list').waitFor();
  const rows = await page.locator('.rt-security-item').evaluateAll(items => items.map(i => i.getAttribute('data-rt-check') + ':' + i.className.replace(/.*rt-security-/, '')));
  check('a domain set up well: every check OK, MTA-STS not set up', rows.join(' ') === 'mx:ok spf:ok dkim:ok dmarc:ok dmarc_reports:ok mta_sts:off tls_reports:ok'
    && requests.length === 1 && requests[0].endsWith('?domain=rabbittech.com.np'), rows.join(' '));
  const texts = await page.locator('.rt-security-list').innerText();
  check('every check has a title, a state and an explanation', !/ms_|%\d?\$?s/.test(texts) && await page.locator('.rt-security-why:empty, .rt-security-name:empty').count() === 0, texts.slice(0, 200));
  await page.locator('.rt-security').screenshot({ path: join(output, 'domain-mail-security.png') });
  await page.getByRole('button', { name: 'Set up MTA-STS' }).click();
  await page.waitForTimeout(400);
  const form = await page.evaluate(() => {
    const f = document.querySelector('form[data-id="dommtasts"]');
    return { open: document.getElementById('dmtasts').classList.contains('active'), mode: f.mode.value, mx: f.mx.value, maxAge: f.max_age.value, active: f.querySelector('input[type=checkbox][name=active]').checked };
  });
  check('"Set up MTA-STS" opens the MTA-STS tab with a safe start: testing, this server, active', form.open && form.mode === 'testing' && form.mx === 'mail.rabbittech.com.np'
    && form.maxAge === '86400' && form.active, JSON.stringify(form));
  await page.locator('[data-bs-target="#dmailsecurity"]').click();
  await page.getByRole('button', { name: 'Check again' }).click();
  await page.waitForTimeout(600);
  check('"Check again" runs the checks again', requests.length === 2);
  await page.close();
}
{
  // A domain with problems: what is wrong, and the records to publish
  const { page, errors } = await open(setup + '/edit/domain/rabbittech.com.np#mail-security');
  await page.locator('.rt-security-list').waitFor();
  // textContent: the record labels are upper-case only on screen
  const item = async key => (await page.locator(`[data-rt-check="${key}"]`).textContent()).replace(/\s+/g, ' ').trim();
  check('the Overview\'s link opens the Mail security tab', await page.locator('#dmailsecurity').evaluate(e => e.classList.contains('active')));
  check('SPF: the record to publish keeps what is there and adds this server', /Needs a fix/.test(await item('spf'))
    && /Published now: v=spf1 include:_spf\.google\.com ~all/.test(await item('spf')) && /Value v=spf1 include:_spf\.google\.com a:mail\.rabbittech\.com\.np ~all/.test(await item('spf')), await item('spf'));
  check('DMARC reports: the record with the reports address added', /Value v=DMARC1; p=none; rua=mailto:reports@rabbittech\.com\.np/.test(await item('dmarc_reports')));
  check('MTA-STS record: says the id is old, shows the current one', /earlier version of the policy/.test(await item('mta_sts_txt')) && /_mta-sts\.rabbittech\.com\.np Type TXT Value v=STSv1; id=20261016120000/.test(await item('mta_sts_txt')), await item('mta_sts_txt'));
  check('MTA-STS policy: a certificate problem, and the CNAME to publish', /isn't valid for that name/.test(await item('mta_sts_policy')) && /mta-sts\.rabbittech\.com\.np Type CNAME Value mail\.rabbittech\.com\.np/.test(await item('mta_sts_policy')), await item('mta_sts_policy'));
  check('MTA-STS MX: names the host the policy misses, with a way to fix it', /Not listed: backup-mx\.example\.net\./.test(await item('mta_sts_mx')) && /Edit the policy/.test(await item('mta_sts_mx')), await item('mta_sts_mx'));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-rt-check="tls_reports"] .rt-record-value .rt-copy').click();
  await page.waitForTimeout(200);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('the copy button copies the record', copied === 'v=TLSRPTv1; rua=mailto:reports@rabbittech.com.np'
    && await page.locator('[data-rt-check="tls_reports"] .rt-record-value .rt-copy.is-copied .bi-check2').count() === 1, copied);
  check('no page errors on the Mail security tab', errors.length === 0, errors.join(' | '));
  await page.locator('.rt-security').screenshot({ path: join(output, 'domain-mail-security-problems.png') });
  await page.close();
}
for (const [theme, width] of [['dark', 1366], ['light', 390]]) {
  const { page, errors } = await open(setup + '/edit/domain/rabbittech.com.np#mail-security', { theme, width });
  await page.locator('.rt-security-list').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`Mail security tab ${theme} ${width}px: opens from the link, no errors, no sideways scrolling`, errors.length === 0 && overflow <= 1, errors.join(' | ') + ' ' + overflow);
  await page.locator('.rt-security').screenshot({ path: join(output, `domain-mail-security-${theme}-${width}.png`) });
  await page.close();
}
{
  const { page } = await open(backupOff + '/edit/domain/rabbittech.com.np#mail-security');
  await page.locator('.rt-security-list').waitFor();
  const tls = (await page.locator('[data-rt-check="tls_reports"]').innerText()).replace(/\s+/g, ' ');
  check('without a reports mailbox: TLS reports "Not set up" and a note on how to collect them', /Not set up/.test(tls) && /RT_REPORTS_MAILBOX isn't set/.test(tls)
    && /Set RT_REPORTS_MAILBOX in mailcow\.conf/.test(await page.locator('.rt-security-note').textContent()), tls);
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
  for (const name of ['mail', 'compose', 'calendar', 'contacts']) {
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
  // One of SOGo's apps against the fake server: errors, failed requests and the layout's
  // warnings are collected. Calendar and Contacts run on a pinned clock (Thursday 15 October
  // 2026, 10:20 in Kathmandu), the date their seeded events and views are built around.
  // allow404: requests whose 404 is SOGo's normal answer, not an error.
  const CLOCK = '2026-10-15T10:20:00+05:45';
  const openApp = async (path, ready, { theme = 'light', width = 1366, height = 900, custom = true, pageFilter, editorFilter, clock, allow404, storage = {} } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Kathmandu' });
    const page = await ctx.newPage();
    if (clock) await page.clock.setFixedTime(new Date(clock));
    const errors = [], warnings = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (/^RabbitTech .*layout/.test(m.text())) warnings.push(m.text());
      else if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
    });
    page.on('response', r => {
      if (r.status() >= 400 && !fonts.test(r.url()) && !(r.status() === 404 && allow404 && allow404.test(r.url()))) errors.push(r.status() + ' ' + r.url());
    });
    await page.addInitScript(t => { try { localStorage.setItem('mailcow_theme', t); } catch (e) {} }, theme);
    // storage: other localStorage entries the page finds when it loads
    await page.addInitScript(entries => { try { for (const k in entries) localStorage.setItem(k, entries[k]); } catch (e) {} }, storage);
    const backend = await mailBackend(ctx, { custom, pageFilter, editorFilter, clock });
    await page.goto(webmail + path, { waitUntil: 'load' });
    await page.waitForSelector(ready, { timeout: 20000 });
    await page.waitForTimeout(500);
    return { ctx, page, backend, errors, warnings };
  };
  const openMail = (options = {}) => openApp(PAGE, 'md-list-item.sg-message-list-item .sg-tile-subject', options);
  const classes = page => page.evaluate(() => document.documentElement.className.split(/\s+/));
  const changes = ['brand', 'compose', 'search', 'rows', 'fab', 'sort', 'count', 'back'].map(c => 'rt-gmail-' + c);
  // The compose window's changes, made when SOGo first fetches its template
  const composeChanges = ['actions', 'composer'].map(c => 'rt-gmail-' + c);
  // The open compose window's parts, as a person sees them
  const composeParts = page => page.evaluate(() => { try {
    const d = document.querySelector('md-dialog.sg-mail-editor');
    const bar = d.querySelector(':scope > form > md-toolbar');
    const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const rect = selector => d.querySelector(selector).getBoundingClientRect();
    const to = d.querySelector('md-chips[ng-model="editor.message.editable.to"]').parentNode;
    const area = rect('md-input-container.sg-mail-editor-content'), pill = rect('.rt-compose-format'), actions = rect('.rt-compose-actions');
    const barButton = b => b.classList.contains('rt-compose-min') ? 'rt-compose-min'
      : /toggleFullscreen/.test(b.getAttribute('ng-click')) ? 'full' : b.getAttribute('ng-click') === 'editor.cancel()' ? 'close' : b.getAttribute('ng-click');
    const action = b => b.classList.contains('rt-send') ? b.textContent.trim() : b.classList.contains('rt-format-toggle') ? 'Aa'
      : b.matches('label') ? 'attach' : b.matches('md-menu > .md-button') ? 'more' : b.getAttribute('data-cke-tooltip-text');
    return {
      title: bar.querySelector('.rt-compose-title').textContent.trim(),
      barHeight: Math.round(bar.getBoundingClientRect().height),
      barButtons: [...bar.querySelectorAll('.md-button')].filter(shown).map(barButton),
      sendInBar: !!bar.querySelector('[ng-click="editor.send()"], [ng-click="editor.save()"]'),
      ccBccOnTo: !!to.querySelector('.rt-cc-bcc [ng-click="editor.hideCc = false"]') && !!to.querySelector('.rt-cc-bcc [ng-click="editor.hideBcc = false"]'),
      fromHidden: !shown(d.querySelector('.rt-from-line')),
      order: area.bottom <= pill.top + 1 && pill.bottom <= actions.top + 1,
      pillHeight: Math.round(d.querySelector('.rt-compose-format > .ck-toolbar').getBoundingClientRect().height),
      pill: [...d.querySelectorAll('.rt-compose-format .ck-toolbar__items [data-cke-tooltip-text]')].filter(shown).map(b => b.getAttribute('data-cke-tooltip-text')),
      actions: [...d.querySelectorAll('.rt-compose-actions :is(.rt-send, .rt-format-toggle, label[for="fileInput"], .rt-compose-tools > .ck-button, md-menu > .md-button)')]
        .filter(shown).map(action),
    };
  } catch (e) {
    // A part that isn't there fails the checks that use it, not the whole run
    return { error: String(e), barButtons: [], pill: [], actions: [] };
  } });
  const openCompose = async (page, button = '.rt-compose') => {
    await page.click(button);
    await page.waitForSelector('md-dialog.sg-mail-editor', { state: 'visible' });
    await page.waitForTimeout(800);
  };
  // The list header's chips (a filter, an order other than newest first) and its count
  const chips = page => page.evaluate(() => [...document.querySelectorAll('.view-list .rt-list-chips > .rt-chip')]
    .filter(c => c.getClientRects().length).map(c => c.querySelector('span').innerText.trim()));
  const orderChip = page => page.evaluate(() => {
    const words = document.querySelector('.view-list .rt-chip span[ng-bind^="rtSortText"]');
    return words && words.closest('.rt-chip').getClientRects().length ? words.innerText.trim() : null;
  });
  const listCount = page => page.evaluate(() => {
    const count = document.querySelector('.view-list > md-toolbar:not(.advanced-search-clickable-toolbar) .rt-list-count');
    return count ? count.innerText.trim() : null;
  });
  // A menu that stays open (a checkmark) closes on a click outside it, as for a person
  const closeMenu = async page => {
    for (let i = 0; i < 3 && await page.locator('.md-open-menu-container.md-active').count(); i++) {
      await page.locator('md-backdrop.md-menu-backdrop').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
  };
  const sortBy = async (page, item) => {
    await page.click('.view-list .md-button[aria-label="Sort"]');
    // A missing item fails the checks that follow, not the whole run
    await page.locator('.md-open-menu-container.md-active md-menu-item', { hasText: item }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    await closeMenu(page);
  };
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

    // No line above the list: the count is in the header, and the usual view has no chips
    const inbox = backend.folder('INBOX').messages.length;
    check('mail app: the count is in the list header, with no line above the list and no chips', (await listCount(page)) === inbox + ' messages' &&
      !(await page.locator('#messagesList .md-subheader').count()) && (await chips(page)).length === 0, (await listCount(page)) + ' ' + JSON.stringify(await chips(page)));
    await page.click('.view-list .md-button[aria-label="Sort"]');
    await page.locator('.md-open-menu-container.md-active md-menu-item').first().waitFor({ state: 'visible' });
    const sortMenu = await page.locator('.md-open-menu-container.md-active md-menu-item').allInnerTexts();
    await closeMenu(page);
    const items = sortMenu.map(t => t.replace(/^check\s*/, '').trim());
    check('mail app: the Sort menu says Date received and Date sent', items.includes('Date received') && items.includes('Date sent') &&
      !items.includes('Order Received'), items.join(' | '));
    await sortBy(page, 'Subject');
    const bySubject = await until(async () => (await orderChip(page)) === 'Subject Z\u2013A');
    const subjects = (await rows(page).locator('.sg-tile-subject').allInnerTexts()).slice(0, 3);
    check('mail app: sorting by subject shows a "Subject Z\u2013A" chip and the server sorts the folder', bySubject &&
      backend.calls('view').some(c => JSON.stringify(c.body || '').includes('"sort":"subject"')) && subjects[0].startsWith('W'),
      (await orderChip(page)) + ' ' + JSON.stringify(subjects));
    await sortBy(page, 'Descending Order');
    check('mail app: ascending, the chip says "Subject A\u2013Z"', await until(async () => (await orderChip(page)) === 'Subject A\u2013Z'), await orderChip(page));
    await sortBy(page, 'Date received');
    check('mail app: by date received, ascending, the chip says "Oldest first"', await until(async () => (await orderChip(page)) === 'Oldest first'), await orderChip(page));
    await sortBy(page, 'Descending Order');
    check('mail app: back to the usual order, newest first, the chip goes', await until(async () => (await orderChip(page)) === null), await orderChip(page));
    // A chip's × undoes what it shows
    await sortBy(page, 'Subject');
    await until(async () => (await orderChip(page)) === 'Subject Z\u2013A');
    const views = backend.calls('view').length;
    await page.locator('.view-list .rt-chip', { has: page.locator('span[ng-bind^="rtSortText"]') }).click({ timeout: 5000 }).catch(() => {});
    check('mail app: the order chip goes back to newest first', await until(async () => (await orderChip(page)) === null) &&
      backend.calls('view').slice(views).some(c => /"sort":"arrival"/.test(JSON.stringify(c.body || '')) && /"asc":0/.test(JSON.stringify(c.body || ''))),
      JSON.stringify(backend.calls('view').slice(views).map(c => c.body && c.body.sortingAttributes)));
    await page.click('.view-list .md-button[aria-label="Filter"]');
    await page.locator('.md-open-menu-container.md-active md-menu-item', { hasText: 'unread' }).first().click({ timeout: 5000 }).catch(() => {});
    await closeMenu(page);
    const unreadOnly = await until(async () => JSON.stringify(await chips(page)) === '["Unread"]' && /^\d+ messages$/.test(await listCount(page)) &&
      (await listCount(page)) !== inbox + ' messages');
    check('mail app: "unread only" shows an Unread chip and the unread count', unreadOnly, JSON.stringify(await chips(page)) + ' ' + await listCount(page));
    await page.locator('.view-list .rt-chip:visible').first().click({ timeout: 5000 }).catch(() => {});
    check('mail app: the Unread chip shows all messages again', await until(async () => (await chips(page)).length === 0 &&
      (await listCount(page)) === inbox + ' messages'), JSON.stringify(await chips(page)) + ' ' + await listCount(page));
    // A label: its name on the chip; one message is "1 message"
    await page.click('.view-list .md-button[aria-label="Filter"]');
    await page.locator('.md-open-menu-container.md-active md-menu-item', { hasText: 'Forwarded' }).first().click({ timeout: 5000 }).catch(() => {});
    await closeMenu(page);
    check('mail app: a label filter shows the label\'s name, and one message says "1 message"', await until(async () =>
      JSON.stringify(await chips(page)) === '["Forwarded"]' && (await listCount(page)) === '1 message'), JSON.stringify(await chips(page)) + ' ' + await listCount(page));
    await page.locator('.view-list .rt-chip:visible').first().click({ timeout: 5000 }).catch(() => {});
    check('mail app: the label chip shows all messages again', await until(async () => (await chips(page)).length === 0 &&
      (await listCount(page)) === inbox + ' messages'), JSON.stringify(await chips(page)) + ' ' + await listCount(page));

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
    // Left part of the row: the compose window covers the right
    await rows(page).nth(2).click({ position: { x: 300, y: 28 } });
    check('mail app: a message opens while the compose window stays open', await until(() => page.evaluate(() =>
      !!document.querySelector('#detailView:not(.sg-close) .msg-body') && !!document.querySelector('md-dialog.sg-mail-editor'))));

    // The compose window like Gmail's: SOGo's window, changed as it is fetched
    // A control that isn't there fails the checks that follow, not the whole run
    const tap = target => (typeof target === 'string' ? page.locator(target) : target).click({ timeout: 5000 }).catch(() => {});
    const composeCls = await classes(page);
    check('mail compose: both compose changes applied, no warnings', composeChanges.every(c => composeCls.includes(c)) && warnings.length === 0,
      composeCls.join(' ') + ' ' + warnings.join(' | '));
    const parts = await composeParts(page);
    check('mail compose: a 40px bar with "New Message", minimise, full screen and close, and no Send or Save',
      parts.title === 'New Message' && parts.barHeight === 40 && parts.barButtons.join() === 'rt-compose-min,full,close' && !parts.sendInBar, JSON.stringify(parts));
    check('mail compose: Cc and Bcc on the To line, no From line for one identity', parts.ccBccOnTo && parts.fromHidden, JSON.stringify(parts));
    check('mail compose: the formatting bar sits in one row between the writing area and the bottom bar',
      parts.order && parts.pillHeight <= 44 && /^Undo/.test(parts.pill[0]) && parts.pill.some(t => /^Bold/.test(t)), JSON.stringify(parts));
    check('mail compose: the bottom bar has Send, Aa, attach, link, emoji and image, then more options',
      parts.actions.join() === 'Send,Aa,attach,Link (Ctrl+K),Insert emoji,Upload image from computer,more', JSON.stringify(parts.actions));
    check('mail compose: Send is off without a recipient', await page.locator('.rt-send').isDisabled());
    const pill = page.locator('.rt-compose-format');
    await tap('.rt-format-toggle');
    const formatOff = await until(async () => !(await pill.isVisible()));
    await tap('.rt-format-toggle');
    check('mail compose: Aa hides and shows the formatting bar', formatOff && await until(() => pill.isVisible()));
    // Emoji: CKEditor's characters, opened on SOGo's emoticons
    await page.locator('.sg-mail-editor .ck-editor__editable').click({ timeout: 5000 }).catch(() => {});
    await page.click('.rt-compose-tools > .ck-button[data-cke-tooltip-text="Insert emoji"]', { timeout: 5000 }).catch(() => {});
    const emoji = page.locator('.ck-special-characters .ck-character-grid__tile').first();
    await emoji.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const category = await page.locator('.ck-special-characters .ck-character-categories').innerText().catch(() => '');
    await emoji.click({ timeout: 5000 }).catch(() => {});
    check('mail compose: the emoji button opens the emoticons and puts one in the message', /Emoticons/.test(category) &&
      await until(() => page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector('.sg-mail-editor .ck-editor__editable').innerText))), category);
    // The panel stays open for more, like Gmail's; its close button closes it
    await page.locator('.ck-dialog .ck-form__header .ck-button').click({ timeout: 5000 }).catch(() => {});
    check('mail compose: the emoji panel closes', await until(async () => !(await page.locator('.ck-special-characters').isVisible())));
    // Recipients: Enter adds what was typed, or the highlighted suggestion instead
    const to = page.locator('md-dialog.sg-mail-editor md-chips[ng-model="editor.message.editable.to"] input');
    const toChips = () => page.locator('md-dialog.sg-mail-editor md-chips[ng-model="editor.message.editable.to"] md-chip').allInnerTexts();
    await to.waitFor({ state: 'visible' });
    await tap(to);
    await to.pressSequentially('someone@example.org');
    await page.keyboard.press('Enter');
    check('mail compose: Enter adds the address being typed', await until(async () => JSON.stringify(await toChips()) === '["someone@example.org"]'),
      JSON.stringify(await toChips()));
    await to.pressSequentially('nisha');
    await page.locator('.md-autocomplete-suggestions-container li').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('mail compose: Enter on a highlighted suggestion adds that contact only', await until(async () => {
      const chips = await toChips();
      return chips.length === 2 && /^Nisha Gurung <nisha\.gurung@everestlogistics\.example>$/.test(chips[1]);
    }), JSON.stringify(await toChips()));
    await page.locator('md-dialog.sg-mail-editor input[name="subject"]').fill('Go-live on the 25th');
    await page.locator('.sg-mail-editor .ck-editor__editable').click({ timeout: 5000 }).catch(() => {});
    await page.keyboard.type(' The 25th works for us. See you then!');
    check('mail compose: the bar shows the subject once there is one', await until(async () => (await composeParts(page)).title === 'Go-live on the 25th'));
    check('mail compose: Send is on with a recipient', await until(async () => !(await page.locator('.rt-send').isDisabled())));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(output, 'webmail-app-compose.png') });
    // More options: Save draft, then SOGo's own options
    await tap('.rt-compose-actions > md-menu > .md-button');
    const saveItem = page.locator('.md-open-menu-container.md-active md-menu-item', { hasText: 'Save draft' });
    await saveItem.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const optionItems = await page.locator('.md-open-menu-container.md-active md-menu-item').allInnerTexts();
    await saveItem.click({ timeout: 5000 }).catch(() => {});
    await closeMenu(page);
    check('mail compose: more options has Save draft, and it saves the draft on the server',
      /Save draft/.test(optionItems[0] || '') && optionItems.some(t => /Return Receipt/.test(t)) && await until(() => backend.calls('save').length > 0), optionItems.join(' | '));
    // Minimise: only the bar, at the bottom right; a click on the bar opens it again
    await tap('.rt-compose-min');
    const minimised = await until(async () => { const b = await page.locator('md-dialog.sg-mail-editor').boundingBox(); return b && b.height <= 41 && b.width <= 330; });
    const minBox = await page.locator('md-dialog.sg-mail-editor').boundingBox();
    check('mail compose: minimise leaves only the bar at the bottom right', minimised && !(await page.locator('.rt-compose-actions').isVisible()) &&
      !!minBox && minBox.y + minBox.height >= 898 && minBox.x + minBox.width >= 1300, JSON.stringify(minBox));
    await page.screenshot({ path: join(output, 'webmail-app-compose-min.png') });
    await tap('md-dialog.sg-mail-editor .rt-compose-title');
    check('mail compose: a click on the bar opens it again', await until(async () => (await page.locator('md-dialog.sg-mail-editor').boundingBox())?.height > 500 &&
      await page.locator('.rt-send').isVisible()));
    // Full screen: large and centred, and back
    const fullButton = page.locator('md-dialog.sg-mail-editor .md-button[ng-click^="editor.toggleFullscreen"]');
    await tap(fullButton);
    const centred = async () => { const b = await page.locator('md-dialog.sg-mail-editor').boundingBox(); return b && b.width > 1000 && Math.abs(b.x - (1366 - b.x - b.width)) < 4; };
    check('mail compose: full screen is large and centred, with the same bars', await until(centred) && await page.locator('.rt-send').isVisible() &&
      await pill.isVisible(), JSON.stringify(await page.locator('md-dialog.sg-mail-editor').boundingBox()));
    await tap(fullButton);
    await until(async () => (await page.locator('md-dialog.sg-mail-editor').boundingBox())?.width < 600);
    // Send: SOGo sends it and the window closes
    await tap('.rt-send');
    check('mail compose: Send sends the message and the window closes', await until(() => backend.calls('send').some(c => c.status === 200), 8000) &&
      await until(async () => !(await page.locator('md-dialog.sg-mail-editor').count()), 8000) &&
      backend.store.sent.some(m => m.subject === 'Go-live on the 25th'), JSON.stringify(backend.calls('send').map(c => c.status)));
    check('mail app light: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  {
    // There is no classic layout any more: a browser that had switched to it gets the new one
    const { ctx, page, errors, warnings } = await openMail({ storage: { rt_webmail_layout: 'classic' } });
    const cls = await classes(page);
    const left = await page.evaluate(() => ({ setting: localStorage.getItem('rt_webmail_layout'), button: !!document.querySelector('.rt-layout-switch') }));
    check('mail app: a browser left in the classic layout gets the new one, and the setting is cleared',
      changes.every(c => cls.includes(c)) && left.setting === null && !left.button && warnings.length === 0 && errors.length === 0,
      cls.join(' ') + ' ' + JSON.stringify(left) + ' ' + warnings.concat(errors).join(' | '));
    await ctx.close();
  }

  {
    const { ctx, page, errors } = await openMail({ theme: 'dark' });
    await page.screenshot({ path: join(output, 'webmail-app-dark.png') });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.view-list')).backgroundColor);
    check('mail app dark: dark list, no errors', bg === 'rgb(18, 21, 28)' && errors.length === 0, bg + ' ' + errors.join(' | '));
    const theme = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    check('mail app dark: the window title bar is dark too', theme === '#0b0d12', theme);
    await openCompose(page);
    const look = await page.evaluate(() => {
      const d = document.querySelector('md-dialog.sg-mail-editor');
      const color = selector => getComputedStyle(d.querySelector(selector)).backgroundColor;
      return { bar: color(':scope > form > md-toolbar'), pill: color('.rt-compose-format > .ck-toolbar'), paper: color('md-input-container.sg-mail-editor-content') };
    });
    await page.screenshot({ path: join(output, 'webmail-app-compose-dark.png') });
    check('mail compose dark: dark bars around the white writing area, no errors', look.bar === 'rgb(28, 33, 44)' && look.pill === look.bar &&
      look.paper === 'rgb(255, 255, 255)' && errors.length === 0, JSON.stringify(look) + ' ' + errors.join(' | '));
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
    await openCompose(page, '.sg-fab-bottom-center');
    check('mail app 390px: compose is full screen, not a window', !(await page.locator('.md-dialog-container.rt-float').count()));
    const small = await page.evaluate(() => {
      const d = document.querySelector('md-dialog.sg-mail-editor').getBoundingClientRect();
      const bar = document.querySelector('.rt-compose-actions').getBoundingClientRect();
      const send = document.querySelector('.rt-send').getBoundingClientRect();
      const min = document.querySelector('.rt-compose-min');
      return { width: Math.round(d.width), barBottom: Math.round(bar.bottom), send: send.width > 0 && send.left >= 0, min: !!min && min.getClientRects().length > 0,
        sideways: document.documentElement.scrollWidth > innerWidth };
    });
    check('mail compose 390px: the bottom bar with Send is on screen, without minimise', small.width === 390 && small.barBottom <= 844 && small.send &&
      !small.min && !small.sideways, JSON.stringify(small));
    await page.screenshot({ path: join(output, 'webmail-app-compose-phone.png') });
    check('mail app 390px: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  {
    // Fail-safe: templates that no longer match leave those parts as SOGo has them
    const pageFilter = html => html.replace('type="search" name="folderSearch"', 'type="text" name="folderSearch"').replace('ng-click="viewer.close()"', 'ng-click="viewer.close( )"')
      .replace('ng-switch="mailbox.service.selectedFolder.getLength()"', 'ng-switch="mailbox.service.selectedFolder.getLength( )"');
    const { ctx, page, errors, warnings } = await openMail({ pageFilter });
    const cls = await classes(page);
    check('mail app fail-safe: unmatched changes are skipped with a warning, the rest apply',
      !cls.includes('rt-gmail-search') && !cls.includes('rt-gmail-back') && !cls.includes('rt-gmail-count') && cls.includes('rt-gmail-rows') &&
      warnings.some(w => /"search" skipped/.test(w)) && warnings.some(w => /"back" skipped/.test(w)) && warnings.some(w => /"count" skipped/.test(w)),
      cls.join(' ') + ' ' + warnings.join(' | '));
    check('mail app fail-safe: without "count" the line above the list stays, with the count', await page.locator('#messagesList .md-subheader', { hasText: 'messages' }).isVisible());
    check('mail app fail-safe: search stays in the list toolbar', await page.locator('.view-list form[sg-search]').count() === 1);
    await rows(page).nth(0).click();
    await page.waitForSelector('#detailView:not(.sg-close) .msg-body');
    check('mail app fail-safe: without the back arrow the list stays beside the open message',
      await page.evaluate(() => getComputedStyle(document.querySelector('.view-list')).visibility === 'visible'));
    check('mail app fail-safe: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // Plain-text compose (SOGo's "Compose messages in: Text"): no formatting, the text fills the window
    const { ctx, page, errors } = await openMail();
    await page.evaluate(() => { angular.element(document.body).injector().get('Preferences').defaults.SOGoMailComposeMessageType = 'text'; });
    await openCompose(page);
    const text = await page.evaluate(() => {
      const d = document.querySelector('md-dialog.sg-mail-editor');
      const shown = el => !!el && el.getClientRects().length > 0;
      const area = d.querySelector('md-input-container.sg-mail-editor-content').getBoundingClientRect();
      const box = d.querySelector('md-input-container.sg-mail-editor-content > textarea').getBoundingClientRect();
      return { aa: shown(d.querySelector('.rt-format-toggle')), pill: shown(d.querySelector('.rt-compose-format')), tools: d.querySelectorAll('.rt-compose-tools > *').length,
        send: shown(d.querySelector('.rt-send')), fills: box.height >= area.height - 2 };
    });
    check('mail compose plain text: Send and attach, no Aa, formatting or editor buttons, and the text fills the window',
      !text.aa && !text.pill && text.tools === 0 && text.send && text.fills && errors.length === 0, JSON.stringify(text) + ' ' + errors.join(' | '));
    await ctx.close();
  }
  for (const [name, anchor, broken, kept] of [
    ['composer', 'ng-click="editor.cancel()"', 'ng-click="editor.cancel( )"', 'actions'],
    ['actions', 'for="fileInput"', 'for="fileInput "', 'composer'],
  ]) {
    // Fail-safe for the compose window: an anchor that no longer matches skips that change only,
    // and the window still sends
    const { ctx, page, backend, errors, warnings } = await openMail({ editorFilter: html => html.replace(anchor, broken) });
    await openCompose(page);
    const cls = await classes(page);
    check(`mail compose fail-safe: without its anchor "${name}" is skipped with a warning, "${kept}" applies`,
      !cls.includes('rt-gmail-' + name) && cls.includes('rt-gmail-' + kept) && warnings.some(w => new RegExp(`UIxMailEditor: "${name}" skipped`).test(w)),
      cls.filter(c => /^rt-gmail-(actions|composer)$/.test(c)).join(' ') + ' ' + warnings.join(' | '));
    const to = page.locator('md-dialog.sg-mail-editor md-chips[ng-model="editor.message.editable.to"] input');
    await to.waitFor({ state: 'visible' });
    await to.click();
    await to.pressSequentially('nisha.gurung@everestlogistics.example');
    await page.keyboard.press('Enter');
    await page.locator('md-dialog.sg-mail-editor input[name="subject"]').fill('Fail-safe');
    await page.locator('md-dialog.sg-mail-editor .md-button[ng-click="editor.send()"]').click({ timeout: 5000 }).catch(e => warnings.push(e.message));
    check(`mail compose fail-safe: without "${name}" the window still sends`, await until(() => backend.calls('send').some(c => c.status === 200), 8000) &&
      errors.length === 0, errors.concat(warnings).join(' | '));
    await ctx.close();
  }
  {
    // In other languages the order chip keeps SOGo's own (translated) label, with an arrow
    const pageFilter = html => html.replace("var UserLanguage = 'English';", "var UserLanguage = 'French';");
    const { ctx, page } = await openMail({ pageFilter });
    await sortBy(page, 'Subject');
    const french = () => page.evaluate(() => {
      const chip = [...document.querySelectorAll('.view-list .rt-chip')].find(c => c.querySelector('span[ng-bind^="rtSortText"]') && c.getClientRects().length);
      const arrow = chip && chip.querySelector('md-icon:not(.rt-chip-x)');
      return chip ? chip.querySelector('span').innerText.trim() + ' ' + (arrow ? arrow.textContent.trim() : '') : null;
    });
    check('mail app: in other languages the order chip keeps SOGo\'s own label, with an arrow', (await classes(page)).includes('rt-gmail-count') &&
      await until(async () => (await french()) === 'Subject arrow_downward'), await french());
    await ctx.close();
  }

  // Calendar and Contacts
  const appChanges = ['brand', 'search', 'create', 'listref'].map(c => 'rt-gmail-' + c);
  const textIconsIn = page => page.evaluate(() => [...document.querySelectorAll('md-icon')]
    .filter(i => i.offsetParent && i.getBoundingClientRect().width > 40).map(i => i.textContent.trim()));
  // The Create button's menu, then one of its items
  const createFromMenu = async (page, index) => {
    await page.click('.rt-create');
    await page.locator('.rt-create-menu md-menu-item').nth(index).locator('.md-button').click();
  };

  // ---------------------------------------------------------------- Calendar
  // SOGo's real Calendar app the same way: live.py rendered its page, its event and task
  // dialogs and its day, week and month views; sogo/backend-apps.mjs has a week of events.
  console.log('Webmail: Calendar app');
  const openCalendar = (options = {}) => openApp(CALENDAR_PAGE, '#day20261015 .sg-event.sg-draggable-calendar-block', { clock: CLOCK, ...options });
  // Where an event's block is: the day column it is in and its top and height in the hour grid
  const block = (page, title) => page.evaluate(title => {
    const el = [...document.querySelectorAll('sg-calendar-day .sg-event.sg-draggable-calendar-block')].find(b => b.textContent.includes(title));
    if (!el) return null;
    const day = el.closest('sg-calendar-day'), first = day && day.querySelector('.clickableHourCell');
    if (!first) return null;
    const cell = first.getBoundingClientRect(), box = el.getBoundingClientRect();
    return { day: day.id, hour: Math.round((box.top - cell.top) / cell.height * 4) / 4, hours: Math.round(box.height / cell.height * 4) / 4 };
  }, title);
  {
    const { ctx, page, errors } = await openCalendar({ custom: false });
    check('calendar app: stock SOGo runs against the fake server without errors', errors.length === 0, errors.join(' | '));
    const cutover = await block(page, 'Webmail cut-over');
    check('calendar app: the week shows each event on its day, at its time and length',
      JSON.stringify(cutover) === JSON.stringify({ day: 'day20261015', hour: 10, hours: 1.5 }), JSON.stringify(cutover));
    await ctx.close();
  }
  const calendarChanges = ['brand', 'search', 'create', 'listref', 'colors'].map(c => 'rt-gmail-' + c);
  const listEvents = page => page.locator('[ui-view="calendars"] .view-list sg-calendar-list-event, [ui-view="calendars"] .view-list .sg-event');
  const header = page => page.locator('#detailView md-card > md-card-actions');
  {
    const { ctx, page, backend, errors, warnings } = await openCalendar();
    const cls = await classes(page);
    check('calendar app: every layout change applied, no warnings', calendarChanges.every(c => cls.includes(c)) && warnings.length === 0, cls.join(' ') + ' ' + warnings.join(' | '));
    check('calendar app: search box, Create button and logo, no add button on a wide screen', await page.evaluate(() =>
      !!document.querySelector('md-toolbar.toolbar-main > form.rt-search') && !!document.querySelector('md-sidenav .rt-create:not([disabled])') &&
      getComputedStyle(document.querySelector('.sg-fab-bottom-center')).display === 'none'));
    const head = await header(page).evaluate(bar => {
      const x = sel => bar.querySelector(sel).getBoundingClientRect().x;
      const today = bar.querySelector('.md-button[ng-click="calendar.changeDate($event, null, true)"]');
      return { todayFirst: today.getBoundingClientRect().x < x('[aria-label="Previous Week"]'),
        pill: getComputedStyle(today).borderRadius, current: getComputedStyle(bar.querySelector('a[ng-click*="\'week\'"]')).backgroundColor,
        other: getComputedStyle(bar.querySelector('a[ng-click*="\'month\'"]')).backgroundColor };
    });
    check('calendar app: the header has a Today pill before back and forward, the current view marked',
      head.todayFirst && parseFloat(head.pill) > 100 && head.current !== head.other, JSON.stringify(head));
    // The event list: a dot in the calendar's colour (Personal is #7C3AED) instead of a filled card
    const agenda = await page.evaluate(() => {
      const ev = [...document.querySelectorAll('[ui-view="calendars"] .view-list .sg-event')].find(e => /Webmail cut-over/.test(e.textContent));
      return ev && { bg: getComputedStyle(ev).backgroundColor, dot: getComputedStyle(ev, '::before').backgroundColor };
    });
    check('calendar app: the event list shows each event with a dot in its calendar\'s colour',
      agenda && agenda.bg === 'rgba(0, 0, 0, 0)' && agenda.dot === 'rgb(124, 58, 237)', JSON.stringify(agenda));
    check('calendar app: every visible icon is drawn as an icon, not as its name', (await textIconsIn(page)).length === 0, (await textIconsIn(page)).join(', '));
    await page.screenshot({ path: join(output, 'webmail-calendar-light.png') });

    // Search
    const box = page.locator('form.rt-search input[name="folderSearch"]');
    const all = await listEvents(page).count();
    await box.fill('dentist');
    const found = await until(async () => (await page.locator('[ui-view="calendars"] .view-list .sg-event').count()) === 1);
    check('calendar app: typing in the search box filters the event list', found && backend.calls('eventslist').some(c => c.query.value === 'dentist'),
      String(await page.locator('[ui-view="calendars"] .view-list .sg-event').count()));
    await box.fill('');
    check('calendar app: emptying the search box lists every event again', await until(async () => (await listEvents(page).count()) === all));

    // An event
    await page.click('#day20261015 .sg-event:has-text("Webmail cut-over")');
    await page.waitForSelector('md-dialog .md-toolbar-tools');
    await page.waitForTimeout(400);
    const dialog = await page.evaluate(() => {
      const d = document.querySelector('md-dialog'), bar = d.querySelector('md-toolbar');
      return { title: bar.textContent.replace(/\s+/g, ' ').trim(), bar: getComputedStyle(bar).backgroundColor, radius: getComputedStyle(d).borderRadius };
    });
    check('calendar app: an event opens in a dialog with a white header and its title', /Webmail cut-over/.test(dialog.title) &&
      dialog.bar === 'rgb(255, 255, 255)' && parseFloat(dialog.radius) >= 12, JSON.stringify(dialog));
    await page.screenshot({ path: join(output, 'webmail-calendar-event.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('md-dialog', { state: 'detached' });

    // Create an event and a task
    await createFromMenu(page, 0);
    await page.waitForSelector('md-dialog input[ng-model="editor.component.summary"]');
    await page.fill('md-dialog input[ng-model="editor.component.summary"]', 'Planning session');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(output, 'webmail-calendar-editor.png') });
    await page.click('md-dialog md-dialog-actions .md-button.md-primary[ng-click="editor.save(eventForm)"]');
    check('calendar app: Create → Event saves a new event on the server', await until(() => backend.calls('saveAsAppointment').length === 1));
    check('calendar app: the new event shows in the week', await until(async () => !!(await block(page, 'Planning session'))), JSON.stringify(await block(page, 'Planning session')));
    await createFromMenu(page, 1);
    check('calendar app: Create → Task opens the task editor', await until(() => page.locator('md-dialog [ng-model="editor.component.percentComplete"]').count().then(n => n > 0)));
    await page.keyboard.press('Escape');
    await page.waitForSelector('md-dialog', { state: 'detached' });

    // Back, forward, today and the other views
    await page.click('[aria-label="Next Week"]');
    check('calendar app: forward shows the next week', await until(() => backend.calls('eventsblocks').some(c => c.query.sd === '20261019')) &&
      await until(async () => !!(await block(page, 'Quarterly review'))));
    await page.click('#detailView .md-button[ng-click="calendar.changeDate($event, null, true)"]');
    check('calendar app: Today goes back to this week', await until(async () => !!(await block(page, 'Webmail cut-over'))));
    await page.click('#detailView a[ng-click*="\'month\'"]');
    check('calendar app: the month view loads with its events', await until(() => page.locator('sg-calendar-month-day .sg-event:has-text("Dashain holiday")').count().then(n => n > 0)));
    await page.click('#detailView a[ng-click*="\'day\'"]');
    check('calendar app: the day view loads with its events', await until(async () => (await block(page, 'Dentist') || {}).day === 'day20261015'));

    // Switching a calendar off
    await page.click('md-sidenav md-list-item.sg-calendar-list-item:has-text("Family") md-switch');
    check('calendar app: switching a calendar off saves it and hides its events', await until(() =>
      backend.calls('saveFoldersActivation').some(c => c.body && Number(c.body.family) === 0)) && await until(async () => !(await block(page, 'Dentist'))));
    check('calendar app light: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openCalendar({ theme: 'dark' });
    await page.screenshot({ path: join(output, 'webmail-calendar-dark.png') });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[ui-view="calendars"] #detailView')).backgroundColor);
    check('calendar app dark: dark calendar, no errors', bg === 'rgb(18, 21, 28)' && errors.length === 0, bg + ' ' + errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openApp(CALENDAR_PAGE, '[ui-view="calendars"] .view-list .sg-event', { clock: CLOCK, width: 390, height: 844 });
    const phone = await page.evaluate(() => {
      const form = document.querySelector('form.rt-search').getBoundingClientRect();
      const apps = document.querySelector('.toolbar-main .sg-toolbar-group-last').getBoundingClientRect();
      const fab = document.querySelector('.sg-fab-bottom-center');
      return { sideways: document.documentElement.scrollWidth > innerWidth, searchBelow: form.top >= apps.bottom - 1,
        fab: !!fab && getComputedStyle(fab).display !== 'none' };
    });
    check('calendar app 390px: no sideways scrolling, search on its own row, the add button shows', !phone.sideways && phone.searchBelow && phone.fab, JSON.stringify(phone));
    await page.screenshot({ path: join(output, 'webmail-calendar-phone.png') });
    check('calendar app 390px: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const pageFilter = html => html.replace('type="search" name="folderSearch"', 'type="text" name="folderSearch"');
    const { ctx, page, errors, warnings } = await openCalendar({ pageFilter });
    const cls = await classes(page);
    check('calendar app fail-safe: an unmatched change is skipped with a warning, the rest apply',
      !cls.includes('rt-gmail-search') && cls.includes('rt-gmail-create') && cls.includes('rt-gmail-colors') &&
      warnings.some(w => /RabbitTech calendar layout: .*"search" skipped/.test(w)), cls.join(' ') + ' ' + warnings.join(' | '));
    check('calendar app fail-safe: search stays in the list toolbar', await page.locator('.view-list form[sg-search]').count() === 1);
    check('calendar app fail-safe: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Contacts
  console.log('Webmail: Contacts app');
  const openContacts = (options = {}) => openApp(CONTACTS_PAGE, '#contactsList md-list-item .sg-md-subhead', { clock: CLOCK, ...options });
  const cards = page => page.locator('#contactsList md-list-item:has(.sg-md-subhead)');
  {
    const { ctx, page, errors } = await openContacts({ custom: false });
    check('contacts app: stock SOGo runs against the fake server without errors', errors.length === 0, errors.join(' | '));
    check('contacts app: the address book lists its contacts', await cards(page).count() === 9, String(await cards(page).count()));
    await ctx.close();
  }
  {
    const { ctx, page, backend, errors, warnings } = await openContacts();
    const cls = await classes(page);
    check('contacts app: every layout change applied, no warnings', appChanges.every(c => cls.includes(c)) && warnings.length === 0, cls.join(' ') + ' ' + warnings.join(' | '));
    check('contacts app: search box, Create button and logo, no add button on a wide screen', await page.evaluate(() =>
      !!document.querySelector('md-toolbar.toolbar-main > form.rt-search') && !!document.querySelector('md-sidenav .rt-create:not([disabled])') &&
      getComputedStyle(document.querySelector('.sg-fab-bottom-center')).display === 'none'));
    const height = await cards(page).first().evaluate(el => el.getBoundingClientRect().height);
    check('contacts app: rows are 56px tall', height === 56, String(height));
    check('contacts app: every visible icon is drawn as an icon, not as its name', (await textIconsIn(page)).length === 0, (await textIconsIn(page)).join(', '));
    await page.screenshot({ path: join(output, 'webmail-contacts-light.png') });

    // Search
    const box = page.locator('form.rt-search input[name="folderSearch"]');
    await box.fill('sharma');
    const found = await until(async () => (await cards(page).count()) === 1);
    check('contacts app: typing in the search box filters the address book', found && backend.calls('view').some(c => c.body && c.body.value === 'sharma')
      && /Sita Sharma/.test(await cards(page).first().textContent()), String(await cards(page).count()));
    await box.fill('');
    check('contacts app: emptying the search box lists everyone again', await until(async () => (await cards(page).count()) === 9), String(await cards(page).count()));

    // A contact
    await cards(page).filter({ hasText: 'Sita Sharma' }).click();
    await page.waitForSelector('#detailView .msg-header');
    const card = await page.evaluate(() => ({ name: document.querySelector('#detailView .msg-header .sg-md-display-2--thin').textContent.trim(),
      email: document.querySelector('#detailView .msg-body a[ng-click*="newMessageWithRecipient"]').textContent.trim(),
      avatar: Math.round(document.querySelector('#detailView .msg-header > sg-avatar-image').getBoundingClientRect().width) }));
    check('contacts app: a contact opens as a card with a large avatar, name and email',
      card.name === 'Sita Sharma' && card.email === 'sita@example.com' && card.avatar === 88, JSON.stringify(card));
    await page.screenshot({ path: join(output, 'webmail-contacts-card.png') });

    // Create a contact
    await createFromMenu(page, 0);
    await page.waitForSelector('#detailView input[ng-model="editor.card.c_givenname"]');
    await page.fill('#detailView input[ng-model="editor.card.c_givenname"]', 'Hari');
    await page.fill('#detailView input[ng-model="editor.card.c_sn"]', 'Bahadur');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(output, 'webmail-contacts-editor.png') });
    await page.click('#detailView md-card > md-toolbar .md-button[ng-click^="editor.save"]');
    check('contacts app: Create → Contact saves a new contact on the server', await until(() => backend.calls('saveAsContact').length === 1));
    check('contacts app: the new contact is listed', await until(async () => (await cards(page).filter({ hasText: 'Hari Bahadur' }).count()) === 1));
    await createFromMenu(page, 1);
    check('contacts app: Create → Contact list opens the list editor', await until(() => page.evaluate(() =>
      /\/list\/new$/.test(location.hash) && !!document.querySelector('#detailView form[name="contactForm"]'))), await page.evaluate(() => location.hash));
    // A global address book is read-only: nothing to create there
    await page.click('md-sidenav md-list-item:has-text("Global Address Book")');
    check('contacts app: Create is disabled in a read-only address book', await until(() => page.locator('.rt-create[disabled]').count().then(n => n === 1)));
    check('contacts app light: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openContacts({ theme: 'dark' });
    await page.screenshot({ path: join(output, 'webmail-contacts-dark.png') });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[ui-view="addressbook"] .view-list')).backgroundColor);
    check('contacts app dark: dark list, no errors', bg === 'rgb(18, 21, 28)' && errors.length === 0, bg + ' ' + errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openContacts({ width: 390, height: 844 });
    const phone = await page.evaluate(() => {
      const form = document.querySelector('form.rt-search').getBoundingClientRect();
      const apps = document.querySelector('.toolbar-main .sg-toolbar-group-last').getBoundingClientRect();
      const fab = document.querySelector('.sg-fab-bottom-center');
      return { sideways: document.documentElement.scrollWidth > innerWidth, searchBelow: form.top >= apps.bottom - 1,
        fab: !!fab && getComputedStyle(fab).display !== 'none' };
    });
    check('contacts app 390px: no sideways scrolling, search on its own row, the add button shows', !phone.sideways && phone.searchBelow && phone.fab, JSON.stringify(phone));
    await page.screenshot({ path: join(output, 'webmail-contacts-phone.png') });
    check('contacts app 390px: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // Fail-safe: a search form that no longer matches stays where SOGo puts it
    const pageFilter = html => html.replace('type="search" name="folderSearch"', 'type="text" name="folderSearch"');
    const { ctx, page, errors, warnings } = await openContacts({ pageFilter });
    const cls = await classes(page);
    check('contacts app fail-safe: an unmatched change is skipped with a warning, the rest apply',
      !cls.includes('rt-gmail-search') && cls.includes('rt-gmail-create') && cls.includes('rt-gmail-brand') &&
      warnings.some(w => /RabbitTech contacts layout: .*"search" skipped/.test(w)), cls.join(' ') + ' ' + warnings.join(' | '));
    check('contacts app fail-safe: search stays in the list toolbar', await page.locator('.view-list form[sg-search]').count() === 1);
    check('contacts app fail-safe: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Settings
  // SOGo's real Preferences app (Settings): live.py rendered its page and its account and filter
  // dialogs; sogo/backend-apps.mjs records what Save sends. Settings asks whether another Sieve
  // script is active, and SOGo answers 404 when none is. No pinned clock here: a frozen
  // Date.now() now and then keeps the address fields from turning what is typed into a chip.
  console.log('Webmail: Settings');
  const openPrefs = (hash = '#!/general', options = {}) =>
    openApp(PREFS_PAGE + hash, 'md-tabs md-tab-item', { allow404: /\/activeExternalSieveScripts$/, ...options });
  const prefsChanges = ['toolbar', 'brand', 'save', 'here'].map(c => 'rt-gmail-' + c);
  const openTab = async (page, name) => {
    await page.locator('md-tabs-canvas md-tab-item', { hasText: name }).click();
    await page.waitForTimeout(400);
  };
  const saveBar = page => page.evaluate(() => {
    const bar = document.querySelector('.rt-save-bar');
    return bar && !bar.classList.contains('ng-hide') ? { width: Math.round(bar.getBoundingClientRect().width),
      enabled: !document.querySelector('.rt-save-bar .rt-save').disabled, text: bar.textContent.trim().replace(/\s+/g, ' ') } : null;
  });
  const saved = backend => backend.apps.store.preferences.saved;
  // Save, once SOGo turns it on (an invalid form keeps it off: then the check that follows fails)
  const clickSave = async page => {
    const on = await until(() => page.locator('.rt-save-bar .rt-save:not([disabled])').count().then(n => n === 1));
    if (on) await page.click('.rt-save-bar .rt-save');
    return on;
  };
  {
    const { ctx, page, errors } = await openPrefs('#!/general', { custom: false });
    check('settings: stock SOGo runs against the fake server without errors', errors.length === 0, errors.join(' | '));
    check('settings: the four sections are listed', await page.locator('md-sidenav md-list-item').count() === 4);
    await ctx.close();
  }
  {
    const { ctx, page, backend, errors, warnings } = await openPrefs();
    const cls = await classes(page);
    check('settings: every layout change applied, no warnings', prefsChanges.every(c => cls.includes(c)) && warnings.length === 0, cls.join(' ') + ' ' + warnings.join(' | '));
    const bar = await page.evaluate(() => {
      const el = document.querySelector('form[name="preferencesForm"] > section > md-toolbar');
      const date = el.querySelector('.sg-date-group');
      return { main: el.classList.contains('toolbar-main'), tall: el.classList.contains('md-tall'), height: Math.round(el.getBoundingClientRect().height),
        date: date ? getComputedStyle(date).display : 'none', title: (el.querySelector('.rt-page-title') || {}).textContent,
        brand: (el.querySelector('a.rt-brand') || {}).href, console: el.querySelector('[ng-href="/user"]').getAttribute('aria-label'),
        fab: !!el.querySelector('.md-fab'), here: (() => { const b = document.querySelector('md-sidenav .rt-here');
          return !!b && b.disabled && getComputedStyle(b).display !== 'none'; })() };
    });
    check('settings: the top bar is the other apps\' (no tall bar or date, the title, the logo to Mail, no Save button in it)',
      bar.main && !bar.tall && bar.height <= 64 && bar.date === 'none' && bar.title === 'Settings' && /\/SOGo\/so\/bibek\/Mail$/.test(bar.brand) && !bar.fab,
      JSON.stringify(bar));
    check('settings: the console button says RabbitTech Mail', bar.console === 'RabbitTech Mail Preferences', bar.console);
    check('settings: the settings button by the logo shows as the current place', bar.here, JSON.stringify(bar));
    check('settings: no Save bar while nothing has changed', (await saveBar(page)) === null);
    check('settings: every visible icon is drawn as an icon, not as its name', (await textIconsIn(page)).length === 0, (await textIconsIn(page)).join(', '));
    await page.screenshot({ path: join(output, 'webmail-prefs-light.png') });

    // Sections in the sidebar, as pills
    await page.click('md-sidenav md-list-item:has-text("Mail")');
    await page.waitForSelector('md-tabs-canvas md-tab-item:has-text("Vacation")');
    const pill = await page.evaluate(() => {
      const item = [...document.querySelectorAll('md-sidenav md-list-item')].find(i => /Mail/.test(i.textContent));
      const s = getComputedStyle(item);
      return { selected: item.classList.contains('md-bg'), radius: s.borderTopRightRadius, background: s.backgroundColor, hash: location.hash };
    });
    check('settings: the sidebar opens a section, shown as a tinted pill', pill.selected && pill.hash === '#!/mailer' && pill.radius === '999px' &&
      pill.background !== 'rgba(0, 0, 0, 0)', JSON.stringify(pill));

    // Vacation: turn it on, write the reply, Save
    await openTab(page, 'Vacation');
    await page.click('md-checkbox[ng-model="app.preferences.defaults.Vacation.enabled"]');
    await page.fill('#autoReplyText', 'I am away until Monday.');
    await page.waitForTimeout(300);
    const dirty = await saveBar(page);
    check('settings: a change shows the Save bar, with Save on', !!dirty && dirty.enabled && /Unsaved changes/.test(dirty.text), JSON.stringify(dirty));
    await page.screenshot({ path: join(output, 'webmail-prefs-vacation.png') });
    await clickSave(page);
    check('settings: Save sends the vacation reply to the server', await until(() => saved(backend).length === 1) &&
      saved(backend)[0].defaults.Vacation.enabled === 1 && saved(backend)[0].defaults.Vacation.autoReplyText === 'I am away until Monday.',
      JSON.stringify(saved(backend)[0] && saved(backend)[0].defaults.Vacation));
    check('settings: after saving, the Save bar goes and SOGo says so', await until(async () => (await saveBar(page)) === null) &&
      await until(() => page.locator('md-toast').filter({ hasText: 'Preferences saved' }).count().then(n => n === 1)));

    // Forward: an address, Save
    await openTab(page, 'Forward');
    await page.click('md-checkbox[ng-model="app.preferences.defaults.Forward.enabled"]');
    // SOGo makes the typed address a chip on a comma (Enter is ignored there). The field shows
    // on an animation frame after the box is ticked: typing before that goes nowhere.
    const field = page.locator('#forwardAddress input');
    await field.waitFor({ state: 'visible' });
    await field.pressSequentially('backup@example.com');
    await page.keyboard.press(',');
    const chip = await until(() => page.locator('#forwardAddress md-chip', { hasText: 'backup@example.com' }).count().then(n => n === 1));
    if (chip) await clickSave(page);
    check('settings: Save sends the forwarding address', chip && await until(() => saved(backend).length === 2) &&
      saved(backend)[1].defaults.Forward.enabled === 1 && (saved(backend)[1].defaults.Forward.forwardAddress || []).includes('backup@example.com'),
      chip ? JSON.stringify(saved(backend)[1] && saved(backend)[1].defaults.Forward) : 'the address did not become a chip');

    // The filter and account dialogs SOGo fetches
    await openTab(page, 'Filters');
    await page.click('.md-button[aria-label="Create Filter"]');
    await page.waitForSelector('md-dialog #filterForm');
    await page.waitForTimeout(500);
    const filter = await page.evaluate(() => ({ header: getComputedStyle(document.querySelector('#filterForm > md-toolbar')).backgroundColor,
      ok: getComputedStyle(document.querySelector('#filterForm md-dialog-actions .md-button')).borderRadius }));
    check('settings: Create Filter opens the filter dialog, white header and pill buttons',
      backend.calls('editFilter').some(c => c.query.filter === 'new' && c.status === 200) && filter.header === 'rgb(255, 255, 255)' && filter.ok === '999px',
      JSON.stringify(filter));
    await page.screenshot({ path: join(output, 'webmail-prefs-filter.png') });
    await page.click('#filterForm md-dialog-actions .md-button:has-text("Cancel")');
    await page.waitForSelector('md-dialog', { state: 'detached' });
    await openTab(page, 'IMAP Accounts');
    await page.click('.md-button[aria-label="Edit Account"]');
    await page.waitForSelector('md-dialog #accountForm');
    await page.waitForTimeout(500);
    const account = await page.evaluate(() => ({ name: document.querySelector('#accountForm > md-toolbar input').value,
      identity: document.querySelector('#accountForm md-dialog-content').textContent.includes('Bibek Gupta') }));
    check('settings: Edit opens the account dialog with its identity', backend.calls('editAccount').some(c => c.query.account === '0') &&
      account.name === 'bibek@rabbittech.com.np' && account.identity, JSON.stringify(account));
    await page.screenshot({ path: join(output, 'webmail-prefs-account.png') });
    // A first signature, written in the identity's editor
    await page.locator('#accountForm md-icon', { hasText: 'expand_more' }).first().click();
    await page.locator('#accountForm .ck-editor__editable').first().click();
    await page.keyboard.type('Bibek, RabbitTech');
    await page.waitForTimeout(300);
    await page.click('#accountForm md-dialog-actions .md-button.md-primary');
    await page.waitForSelector('md-dialog', { state: 'detached' });
    const signature = body => body.defaults.AuxiliaryMailAccounts[0].identities[0].signature;
    check('settings: a signature written in the account dialog is saved', await clickSave(page) &&
      await until(() => saved(backend).some(body => signature(body) === '<p>Bibek, RabbitTech</p>')),
      JSON.stringify(saved(backend).map(signature)));
    // SOGo's signature editor logs this for an identity without a signature yet (mailcow's
    // default identity has none); stock SOGo does the same, and the signature saves (above)
    const ours = errors.filter(e => !/CKEditorError: Cannot convert undefined or null to object/.test(e));
    check('settings light: no errors', ours.length === 0, ours.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openPrefs('#!/mailer', { theme: 'dark' });
    await page.screenshot({ path: join(output, 'webmail-prefs-dark.png') });
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[ui-view="module"] md-tabs')).backgroundColor);
    check('settings dark: dark card, no errors', bg === 'rgb(18, 21, 28)' && errors.length === 0, bg + ' ' + errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openPrefs('#!/mailer', { width: 390, height: 844 });
    await page.click('md-checkbox[ng-model="app.preferences.defaults.SOGoMailSortByThreads"]');
    await page.waitForTimeout(300);
    const phone = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > innerWidth, width: innerWidth }));
    const bar = await saveBar(page);
    check('settings 390px: no sideways scrolling, the Save bar spans the screen', !phone.sideways && !!bar && bar.width === phone.width,
      JSON.stringify({ phone, bar }));
    await page.screenshot({ path: join(output, 'webmail-prefs-phone.png') });
    await page.click('.toolbar-main .md-button.hide-gt-md[ng-click="toggleLeft()"]');
    check('settings 390px: the menu button opens the sections', await until(() => page.evaluate(() =>
      !document.querySelector('md-sidenav#left-sidenav').classList.contains('md-closed'))));
    check('settings 390px: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // Fail-safe: a top bar that no longer matches stays SOGo's; the rest apply
    const pageFilter = html => html.replace('layout-align="space-between start" class="md-tall"', 'layout-align="space-between start" class="rt-changed"');
    const { ctx, page, errors, warnings } = await openPrefs('#!/general', { pageFilter });
    const cls = await classes(page);
    check('settings fail-safe: an unmatched change is skipped with a warning, the rest apply',
      !cls.includes('rt-gmail-toolbar') && cls.includes('rt-gmail-save') && cls.includes('rt-gmail-here') &&
      warnings.some(w => /RabbitTech prefs layout: .*"toolbar" skipped/.test(w)), cls.join(' ') + ' ' + warnings.join(' | '));
    check('settings fail-safe: no errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} else {
  console.log('Webmail mock skipped: run tests/ui/sogo/prepare.sh first');
}

await browser.close();
stopAll();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
