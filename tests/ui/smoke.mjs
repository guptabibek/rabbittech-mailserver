// UI smoke tests for the RabbitTech console and webmail.
// Starts the harness (router.php) and the webmail mock (sogo/prepare.sh must have run), then
// checks every main page in light, dark and phone width, plus the behaviour that broke before.
// Screenshots go to tests/ui/output. Run: cd tests/ui && npm ci && node smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mailBackend, PAGE, CALENDAR_PAGE, CONTACTS_PAGE } from './sogo/backend.mjs';

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
  // One of SOGo's apps against the fake server: errors, failed requests and the layout's
  // warnings are collected. Calendar and Contacts run on a pinned clock (Thursday 15 October
  // 2026, 10:20 in Kathmandu), the date their seeded events and views are built around.
  const CLOCK = '2026-10-15T10:20:00+05:45';
  const openApp = async (path, ready, { theme = 'light', width = 1366, height = 900, custom = true, pageFilter, clock } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Kathmandu' });
    const page = await ctx.newPage();
    if (clock) await page.clock.setFixedTime(new Date(clock));
    const errors = [], warnings = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (/^RabbitTech .*layout/.test(m.text())) warnings.push(m.text());
      else if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
    });
    page.on('response', r => { if (r.status() >= 400 && !fonts.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
    await page.addInitScript(t => { try { localStorage.setItem('mailcow_theme', t); } catch (e) {} }, theme);
    const backend = await mailBackend(ctx, { custom, pageFilter, clock });
    await page.goto(webmail + path, { waitUntil: 'load' });
    await page.waitForSelector(ready, { timeout: 20000 });
    await page.waitForTimeout(500);
    return { ctx, page, backend, errors, warnings };
  };
  const openMail = (options = {}) => openApp(PAGE, 'md-list-item.sg-message-list-item .sg-tile-subject', options);
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

  // Calendar and Contacts
  const appChanges = ['layout', 'brand', 'search', 'create', 'listref'].map(c => 'rt-gmail-' + c);
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
  const calendarChanges = ['layout', 'brand', 'search', 'create', 'listref', 'colors'].map(c => 'rt-gmail-' + c);
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

    // Classic layout and back
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('[ui-view="calendars"] .view-list .sg-event');
    const classic = await page.evaluate(() => ({ gmail: document.documentElement.classList.contains('rt-gmail'),
      search: !!document.querySelector('.view-list form[sg-search]'), button: !!document.querySelector('.rt-layout-switch') }));
    check('calendar app: the switch gives the classic layout, with a way back', !classic.gmail && classic.search && classic.button, JSON.stringify(classic));
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('[ui-view="calendars"] .view-list .sg-event');
    check('calendar app: switching back restores the new layout', (await classes(page)).includes('rt-gmail-create'));
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

    // Classic layout and back
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('#contactsList md-list-item .sg-md-subhead');
    const classic = await page.evaluate(() => ({ gmail: document.documentElement.classList.contains('rt-gmail'),
      search: !!document.querySelector('.view-list form[sg-search]'), button: !!document.querySelector('.rt-layout-switch') }));
    check('contacts app: the switch gives the classic layout, with a way back', !classic.gmail && classic.search && classic.button, JSON.stringify(classic));
    await Promise.all([page.waitForEvent('load'), page.click('.rt-layout-switch')]);
    await page.waitForSelector('#contactsList md-list-item .sg-md-subhead');
    check('contacts app: switching back restores the new layout', (await classes(page)).includes('rt-gmail-create'));
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
} else {
  console.log('Webmail mock skipped: run tests/ui/sogo/prepare.sh first');
}

await browser.close();
stopAll();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
