<?php
// UI test harness: renders the real Twig templates and CSS/JS bundles from data/web with stub
// data and a stub API, so the console can be checked in a browser without a mail server.
// Run: php -S 127.0.0.1:8088 tests/ui/router.php   (tests/ui/smoke.mjs starts it for you)
// Switches (environment variables):
//   HARNESS_TFA=1                two-factor methods on the account pages
//   HARNESS_LOCALE=de-de         page language; HARNESS_PSEUDO=1 marks every translated string
//   HARNESS_SESSION_LIFETIME=n   session lifetime in seconds (default 3600)
//   HARNESS_STOPPED=name, HARNESS_UNHEALTHY=name, HARNESS_DF=96, HARNESS_CERT_DAYS=6,
//   HARNESS_QUEUE=64             Overview problem states (stopped container, disk, certificate, queue)
$WEB = getenv('MAILCOW_WEB') ?: realpath(__DIR__ . '/../../data/web');
$CACHE = getenv('HARNESS_CACHE') ?: sys_get_temp_dir() . '/rt-ui-cache';
if (!is_dir($CACHE)) mkdir($CACHE, 0777, true);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$_SERVER['DOCUMENT_ROOT'] = $WEB;

$mime = ['css'=>'text/css','js'=>'application/javascript','svg'=>'image/svg+xml','png'=>'image/png','woff2'=>'font/woff2','woff'=>'font/woff','ico'=>'image/x-icon','json'=>'application/json'];
if (preg_match('#^/cache/(.+)$#', $path, $m)) {
  $f = $CACHE . '/' . basename($m[1]);
  header('Content-Type: ' . $mime[pathinfo($f, PATHINFO_EXTENSION)]);
  readfile($f); return true;
}
if (preg_match('#^/(css|fonts|img|js)/#', $path) || $path === '/favicon.png') {
  $f = $WEB . $path;
  if (!is_file($f)) { http_response_code(404); return true; }
  header('Content-Type: ' . ($mime[pathinfo($f, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
  readfile($f); return true;
}

if ($path === '/inc/ajax/update_check.php') {
  header('Content-Type: application/json');
  echo json_encode(['status' => 'no_update']);
  return true;
}

// ---- stub API
if (strpos($path, '/api/') === 0) {
  header('Content-Type: application/json');
  if ($path === '/api/v1/get/status/host') {
    echo json_encode(['system_time'=>date('D, d M Y H:i:s'),'uptime'=>1294000,'cpu'=>['cores'=>4,'usage'=>rand(8,30)],'memory'=>['total'=>8*1024**3,'usage'=>rand(40,60)],'architecture'=>'x86_64']);
  } elseif ($path === '/api/v1/search/domain') {
    $rows = [];
    foreach (['rabbittech.com.np'=>[24,50,12],'mail.rabbittech.com.np'=>[3,10,2],'staging.rabbittech.com.np'=>[1,5,0]] as $d=>$v) {
      $rows[] = ['domain_name'=>$d,'domain_h_name'=>$d,'aliases_in_domain'=>$v[2],'max_num_aliases_for_domain'=>400,'mboxes_in_domain'=>$v[0],'max_num_mboxes_for_domain'=>$v[1],'quota_used_in_domain'=>$v[0]*1024**3,'max_quota_for_domain'=>100*1024**3,'bytes_total'=>$v[0]*812*1024**2,'msgs_total'=>$v[0]*913,'rl'=>false,'def_quota_for_mbox'=>3*1024**3,'max_quota_for_mbox'=>10*1024**3,'tags'=>$v[0]>5?['production']:[],'backupmx'=>0,'active'=>1,'gal'=>1,'relayhost'=>0,'created'=>'2026-09-01 10:00:00','modified'=>'2026-10-10 12:00:00'];
    }
    echo json_encode(['draw'=>1,'recordsTotal'=>3,'recordsFiltered'=>3,'data'=>$rows]);
  } elseif ($path === '/api/v1/search/mailbox') {
    $people = [['bibek', 'Bibek Gupta', 62], ['sita', 'Sita Sharma', 18], ['ram', 'Ram Thapa', 91], ['support', 'Support Team', 34], ['billing', 'Billing', 5]];
    $rows = [];
    foreach ($people as $i => $p) {
      $rows[] = ['username' => $p[0] . '@rabbittech.com.np', 'name' => $p[1], 'domain' => 'rabbittech.com.np', 'quota' => 10 * 1024 ** 3, 'quota_used' => $p[2] / 100 * 10 * 1024 ** 3,
        'percent_in_use' => $p[2], 'percent_class' => $p[2] > 90 ? 'danger' : ($p[2] > 75 ? 'warning' : 'success'), 'messages' => 1200 * ($i + 1), 'active' => $i == 4 ? 0 : 1,
        'max_quota_for_mbox' => 10 * 1024 ** 3, 'last_imap_login' => time() - 3600 * ($i + 1), 'last_pop3_login' => 0, 'last_smtp_login' => time() - 7200, 'last_sso_login' => time() - 86400,
        'created' => '2026-09-01 10:00:00', 'modified' => '2026-10-10 12:00:00', 'tags' => $i == 0 ? ['admin'] : [], 'authsource' => 'mailcow',
        'attributes' => ['imap_access' => 1, 'pop3_access' => 0, 'smtp_access' => 1, 'sieve_access' => 1, 'eas_access' => 1, 'dav_access' => 1, 'tls_enforce_in' => 0, 'tls_enforce_out' => 1,
          'passwd_update' => '2026-10-01 09:00:00', 'quarantine_notification' => 'daily', 'quarantine_category' => 'reject']];
    }
    echo json_encode(['draw' => 1, 'recordsTotal' => count($rows), 'recordsFiltered' => count($rows), 'data' => $rows]);
  } elseif ($path === '/api/v1/get/alias/all') {
    $rows = [];
    foreach ([['info', 'bibek@rabbittech.com.np,sita@rabbittech.com.np'], ['sales', 'ram@rabbittech.com.np'], ['@rabbittech.com.np', 'support@rabbittech.com.np']] as $i => $a) {
      $rows[] = ['id' => $i + 1, 'address' => strpos($a[0], '@') === 0 ? $a[0] : $a[0] . '@rabbittech.com.np', 'goto' => $a[1], 'domain' => 'rabbittech.com.np', 'in_primary_domain' => '',
        'is_catch_all' => strpos($a[0], '@') === 0 ? 1 : 0, 'active' => 1, 'public_comment' => null, 'private_comment' => null, 'sogo_visible' => 1, 'internal' => 0, 'created' => '2026-09-01', 'modified' => '2026-10-01'];
    }
    echo json_encode($rows);
  } elseif ($path === '/api/v1/get/domain/all') {
    echo json_encode([
      ['domain_name' => 'rabbittech.com.np', 'mboxes_in_domain' => 24, 'aliases_in_domain' => 12, 'bytes_total' => 19.4 * 1024 ** 3, 'active' => '1'],
      ['domain_name' => 'mail.rabbittech.com.np', 'mboxes_in_domain' => 3, 'aliases_in_domain' => 2, 'bytes_total' => 2.4 * 1024 ** 3, 'active' => '1'],
      ['domain_name' => 'staging.rabbittech.com.np', 'mboxes_in_domain' => 1, 'aliases_in_domain' => 0, 'bytes_total' => 812 * 1024 ** 2, 'active' => '1'],
    ]);
  } elseif (strpos($path, '/api/v1/get/last-login/') === 0) {
    echo json_encode(['sasl' => [
      ['datetime' => date('Y-m-d H:i:s', time() - 7200), 'service' => 'imap', 'real_rip' => '103.10.28.4', 'location' => 'NP', 'app_password' => null],
      ['datetime' => date('Y-m-d H:i:s', time() - 9000), 'service' => 'smtp', 'real_rip' => '103.10.28.4', 'location' => 'NP', 'app_password' => 3, 'app_password_name' => 'iPhone Mail'],
      ['datetime' => date('Y-m-d H:i:s', time() - 90000), 'service' => 'sso', 'real_rip' => 'Web', 'location' => '', 'app_password' => null],
    ]]);
  } elseif ($path === '/api/v1/get/mailq/all') {
    $n = (int)(getenv('HARNESS_QUEUE') ?: 2);
    echo json_encode(array_map(fn($i) => ['queue_id' => 'Q' . $i, 'sender' => 'a@b.c', 'recipients' => ['x@y.z'], 'queue_name' => 'deferred', 'arrival_time' => time()], range(1, $n)));
  } elseif ($path === '/api/v1/get/quarantine/all') {
    echo json_encode(array_fill(0, 5, ['id' => 1]));
  } else {
    echo json_encode([]);
  }
  return true;
}

require $WEB . '/inc/lib/vendor/autoload.php';
require $WEB . '/inc/lib/CSSminifierExtended.php';
require $WEB . '/inc/lib/JSminifierExtended.php';

require $WEB . '/inc/functions.rabbittech.inc.php';

$lang = $lang_en = json_decode(file_get_contents($WEB . '/lang/lang.en-gb.json'), true);
$rt_locale = getenv('HARNESS_LOCALE') ?: 'en-gb';
if ($rt_locale !== 'en-gb') $lang = array_replace_recursive($lang, json_decode(file_get_contents($WEB . "/lang/lang.$rt_locale.json"), true));
$lang = rabbittech_wording($lang, $lang_en, $rt_locale, $WEB . '/lang');
// Pseudo-localisation: wrap every translatable string so hardcoded text stands out
if (getenv('HARNESS_PSEUDO')) {
  array_walk_recursive($lang, function (&$v) { if (is_string($v) && $v !== '') $v = '⟦' . $v . '⟧'; });
}

$css = new CSSminifierExtended();
$css->add($WEB . '/css/themes/lumen-bootstrap.css');
foreach (array_diff(scandir($WEB . '/css/build'), ['.', '..']) as $f) $css->add($WEB . '/css/build/' . $f);
$js = new JSminifierExtended();
foreach (array_diff(scandir($WEB . '/js/build'), ['.', '..']) as $f) $js->add($WEB . '/js/build/' . $f);

$routes = [
  '/' => ['user_index.twig', null, ['/css/site/index.css'], ['/js/site/index.js']],
  '/admin' => ['admin_index.twig', null, ['/css/site/admin.css'], ['/js/site/index.js']],
  '/admin/dashboard' => ['dashboard.twig', 'admin', ['/css/site/admin.css'], ['/js/site/dashboard.js']],
  '/admin/mailbox' => ['mailbox.twig', 'admin', ['/css/site/mailbox.css', '/css/site/admin.css'], ['/js/site/mailbox.js', '/js/presets/sieveMailbox.js', '/js/site/pwgen.js']],
  '/admin/system' => ['admin.twig', 'admin', ['/css/site/admin.css'], ['/js/site/admin.js', '/js/presets/rspamd.js', '/js/site/pwgen.js']],
  '/user' => ['user.twig', 'user', ['/css/site/user.css'], ['/js/site/user.js', '/js/site/pwgen.js']],
  '/reset-password' => ['reset-password.twig', null, [], []],
  '/domainadmin/mailbox' => ['mailbox.twig', 'domainadmin', ['/css/site/mailbox.css'], ['/js/site/mailbox.js', '/js/site/pwgen.js']],
  '/domainadmin/user' => ['domainadmin.twig', 'domainadmin', ['/css/site/user.css'], ['/js/site/user.js', '/js/site/pwgen.js']],
  '/quarantine' => ['quarantine.twig', 'admin', ['/css/site/quarantine.css'], ['/js/site/quarantine.js']],
  '/admin/queue' => ['queue.twig', 'admin', [], ['/js/site/queue.js']],
  '/qhandler' => ['qhandler.twig', null, ['/css/site/quarantine.css'], []],
];
if (strpos($path, '/edit/mailbox/') === 0) $routes[$path] = ['edit/mailbox.twig', 'admin', ['/css/site/edit.css'], ['/js/site/edit.js', '/js/site/pwgen.js']];
elseif (strpos($path, '/edit/domain/') === 0) $routes[$path] = ['edit/domain.twig', 'admin', ['/css/site/edit.css'], ['/js/site/edit.js']];
elseif (strpos($path, '/edit/') === 0) $routes[$path] = ['edit.twig', 'admin', ['/css/site/edit.css'], []];
if (!isset($routes[$path])) { http_response_code(404); echo "no route"; return true; }
[$template, $role, $page_css, $page_js] = $routes[$path];
foreach ($page_css as $f) $css->add($WEB . $f);
foreach ($page_js as $f) $js->add($WEB . $f);

$cssHash = $css->getDataHash();
if (!file_exists("$CACHE/$cssHash.css")) $css->minify("$CACHE/$cssHash.css");
$jsHash = $js->getDataHash();
if (!file_exists("$CACHE/$jsHash.js")) $js->minify("$CACHE/$jsHash.js");

$loader = new \Twig\Loader\FilesystemLoader($WEB . '/templates');
$twig = new \Twig\Environment($loader, ['debug' => true, 'cache' => false]);
$twig->addFunction(new \Twig\TwigFunction('query_string', fn(array $p = []) => http_build_query($p)));
$twig->addFunction(new \Twig\TwigFunction('is_uri', function (string $uri, ?string $where = null) {
  if (is_null($where)) $where = $_SERVER['REQUEST_URI'];
  return preg_match('/' . $uri . '/i', $where);
}));
$twig->addFilter(new \Twig\TwigFilter('rot13', 'str_rot13'));
$twig->addFilter(new \Twig\TwigFilter('base64_encode', 'base64_encode'));
$twig->addFilter(new \Twig\TwigFilter('formatBytes', function ($size, $precision = 2) {
  if (!is_numeric($size)) return "0";
  if ($size == "0") return "0";
  $base = log($size, 1024); $suffixes = [' Byte', ' KiB', ' MiB', ' GiB', ' TiB'];
  return round(pow(1024, $base - floor($base)), $precision) . $suffixes[floor($base)];
}));

// As in inc/vars.inc.php, but shown in the Apps menu
$apps = [['name' => 'Webmail', 'link' => '/webmail', 'user_link' => '/webmail', 'hide' => false]];
$globals = [
  'mailcow_hostname' => 'mail.rabbittech.com.np',
  'mailcow_locale' => $rt_locale,
  'mailcow_cc_role' => $role,
  'mailcow_cc_username' => $role === 'user' ? 'bibek@rabbittech.com.np' : ($role === 'domainadmin' ? 'ops' : ($role ? 'admin' : null)),
  'is_master' => true,
  'ui_texts' => ['title_name' => 'RabbitTech Mail', 'main_name' => 'RabbitTech Mail', 'apps_name' => 'Apps', 'help_text' => '', 'ui_footer' => ''],
  'css_path' => "/cache/$cssHash.css",
  'js_path' => "/cache/$jsHash.js",
  'logo' => getenv('HARNESS_LOGO') ?: null,
  'logo_dark' => null,
  'available_languages' => ['en-gb' => 'English', 'de-de' => 'Deutsch', 'fr-fr' => 'Français'],
  'lang' => $lang,
  'skip_sogo' => false,
  'hide_mailcow_apps' => false,
  'mailcow_apps' => $apps,
  'mailcow_apps_processed' => $apps,
  'app_links' => [],
  'app_links_processed' => [],
  'is_root_uri' => $path === '/',
  'rt_acl' => ['spam_alias' => 1, 'spam_score' => 1, 'spam_policy' => 1, 'syncjobs' => 1, 'app_passwds' => 1, 'pushover' => 1, 'quarantine' => 1],
  'uri' => $path,
  'mailcow_info' => ['version_tag' => '2026-09a', 'last_version_tag' => '2026-09a', 'git_owner' => 'mailcow', 'git_repo' => 'mailcow-dockerized', 'git_project_url' => 'https://github.com/mailcow/mailcow-dockerized', 'git_commit' => 'abc123', 'git_commit_date' => '2026-09-30', 'mailcow_branch' => 'master', 'updated_at' => ''],
  'lang_footer' => json_encode($lang['footer']), 'lang_acl' => json_encode($lang['acl']), 'lang_tfa' => json_encode($lang['tfa']),
  'lang_fido2' => json_encode($lang['fido2']), 'lang_success' => json_encode($lang['success']), 'lang_danger' => json_encode($lang['danger']),
  'lang_rt' => json_encode($lang['rabbittech'] ?? []),
  'docker_timeout' => 60, 'session_lifetime' => (int)(getenv('HARNESS_SESSION_LIFETIME') ?: 3600), 'csrf_token' => 'harness', 'pagination_size' => 25, 'log_pagination_size' => 30, 'alerts' => [],
];
foreach ($globals as $k => $v) $twig->addGlobal($k, $v);

$rt_tfa = getenv('HARNESS_TFA')
  ? ['additional' => [['id' => 1, 'key_id' => 'Phone', 'authmech' => 'totp'], ['id' => 2, 'key_id' => 'YubiKey 5', 'authmech' => 'webauthn'], ['id' => 3, 'key_id' => 'Laptop', 'authmech' => 'totp']]]
  : ['name' => 'none', 'pretty' => '-', 'additional' => []];
$data = ['return_to' => '/admin/mailbox', 'lang_user' => json_encode($lang['user']), 'lang_admin' => json_encode($lang['admin']), 'lang_debug' => json_encode($lang['debug']), 'lang_datatables' => json_encode($lang['datatables']),
  'lang_mailbox' => json_encode($lang['mailbox']), 'lang_quarantine' => json_encode($lang['quarantine']), 'lang_queue' => json_encode($lang['queue']), 'lang_rl' => json_encode($lang['ratelimit']), 'lang_edit' => json_encode($lang['edit']),
  'lang_user' => json_encode($lang['user']), 'acl' => [], 'acl_json' => '{"login_as":1}', 'role' => $role, 'is_dual' => 'false', 'allow_admin_email_login' => 'false', 'domains' => ['rabbittech.com.np'], 'mailboxes' => []];

if ($template === 'dashboard.twig') {
  $images = ['acme'=>'ghcr.io/mailcow/acme:1.98','clamd'=>'ghcr.io/mailcow/clamd:1.4.6-1','dockerapi'=>'ghcr.io/mailcow/dockerapi:2.12','dovecot'=>'ghcr.io/mailcow/dovecot:2.3.21.1-2','memcached'=>'memcached:alpine','mysql'=>'mariadb:10.11','netfilter'=>'ghcr.io/mailcow/netfilter:1.64','nginx'=>'ghcr.io/mailcow/nginx:1.30.4-1','ofelia'=>'mcuadros/ofelia:latest','olefy'=>'ghcr.io/mailcow/olefy:1.15','php-fpm'=>'ghcr.io/mailcow/phpfpm:8.2.29-3','postfix'=>'ghcr.io/mailcow/postfix:3.10.12-1','postfix-tlspol'=>'ghcr.io/mailcow/postfix-tlspol:1.14.0','redis'=>'redis:7.4.11-alpine','rspamd'=>'ghcr.io/mailcow/rspamd:4.2.1-1','sogo'=>'ghcr.io/mailcow/sogo:5.12.11-1','unbound'=>'ghcr.io/mailcow/unbound:1.26.1-1','watchdog'=>'ghcr.io/mailcow/watchdog:2.11'];
  $containers = [];
  foreach ($images as $n => $img) {
    $running = getenv('HARNESS_STOPPED') === $n ? 0 : 1;
    $containers["$n-mailcow"] = ['Id' => sha1($n), 'Config' => ['Image' => $img], 'State' => ['Running' => $running, 'StartedAt' => '2026-10-14T09:38:08Z', 'StartedAtHR' => 'Wed, 14 Oct 2026 15:23:08 +0545'] + (getenv('HARNESS_UNHEALTHY') === $n ? ['Health' => ['Status' => 'unhealthy']] : [])];
  }
  $df = (int)(getenv('HARNESS_DF') ?: 30);
  $data['quarantine_count'] = getenv('HARNESS_NO_QCOUNT') ? null : 5;
  $data += ['log_lines' => 1000, 'vmail_df' => ['/dev/sda1', '78G', round(78 * $df / 100) . 'G', round(78 * (100 - $df) / 100) . 'G', $df . '%', '/var/vmail'], 'hostname' => 'mail.rabbittech.com.np', 'timezone' => 'Asia/Kathmandu',
    'gal' => ['valid' => false], 'license_guid' => '2d1f0c2e-7a1b-4c5e-9f00-rabbittech', 'clamd_status' => true, 'olefy_status' => true, 'containers' => $containers, 'ip_check' => 1];
  // The alert rules are taken from admin/dashboard.php itself; the certificate check is stubbed
  if (!function_exists('rt_cert_expiry')) {
    function rt_cert_expiry($h) { $d = getenv('HARNESS_CERT_DAYS'); return $d === false ? null : time() + (int)$d * 86400; }
  }
  $src = file_get_contents($WEB . '/admin/dashboard.php');
  $from = strpos($src, '// Overview: problems'); $to = strpos($src, "\$template = 'dashboard.twig';");
  $vmail_df = $data['vmail_df']; $hostname = 'mail.rabbittech.com.np';
  eval(substr($src, $from, $to - $from));
  $data['rt_alerts'] = $rt_alerts;
}
if (strpos($template, 'edit/') === 0) {
  $data['result'] = ['username' => 'bibek@rabbittech.com.np', 'local_part' => 'bibek', 'domain' => 'rabbittech.com.np', 'domain_name' => 'rabbittech.com.np', 'name' => 'Bibek Gupta', 'active' => 1, 'active_int' => 1,
    'quota' => 10 * 1024 ** 3, 'quota_used' => 6.2 * 1024 ** 3, 'percent_in_use' => 62, 'messages' => 1200, 'max_new_quota' => 20 * 1024 ** 3, 'created' => '2026-09-01 10:00:00', 'modified' => '2026-10-10 12:00:00',
    'attributes' => ['imap_access' => 1, 'pop3_access' => 0, 'smtp_access' => 1, 'sieve_access' => 1, 'eas_access' => 1, 'dav_access' => 1, 'sogo_access' => 1, 'tls_enforce_in' => 0, 'tls_enforce_out' => 1, 'force_pw_update' => 0, 'relayhost' => 0, 'recovery_email' => 'bibek@example.com'],
    'description' => 'RabbitTech primary domain', 'max_num_aliases_for_domain' => 400, 'max_num_mboxes_for_domain' => 50, 'def_quota_for_mbox' => 3 * 1024 ** 3, 'max_quota_for_mbox' => 10 * 1024 ** 3, 'max_quota_for_domain' => 100 * 1024 ** 3,
    'backupmx' => 0, 'gal' => 1, 'relay_all_recipients' => 0, 'relay_unknown_only' => 0, 'relayhost' => 0, 'tags' => [],
    'domain_h_name' => 'rabbittech.com.np', 'mboxes_in_domain' => 24, 'aliases_in_domain' => 12, 'quota_used_in_domain' => 72 * 1024 ** 3, 'bytes_total' => 19.4 * 1024 ** 3, 'msgs_total' => 21912,
    'last_imap_login' => time() - 7200, 'last_smtp_login' => time() - 90000, 'last_pop3_login' => 0, 'last_sso_login' => 0, 'authsource' => 'mailcow'];
  $data['mailbox'] = 'bibek@rabbittech.com.np'; $data['domain'] = 'rabbittech.com.np';
  foreach (['rl', 'pushover_data', 'sender_acl_handles', 'user_acls', 'rlyhosts', 'quarantine_notification', 'quarantine_category', 'get_tls_policy', 'get_tagging_options', 'mailbox_details', 'iam_settings', 'dkim', 'domain_details'] as $k) $data[$k] = $data[$k] ?? [];
  $data['acl'] = ['login_as' => 1, 'quarantine' => 1, 'quarantine_notification' => 1, 'quarantine_category' => 1, 'app_passwds' => 1, 'syncjobs' => 1, 'ratelimit' => 1, 'sogo_access' => 1, 'protocol_access' => 1, 'pushover' => 1, 'tls_policy' => 1, 'delimiter_action' => 1, 'spam_alias' => 1, 'extend_sender_acl' => 1, 'smtp_ip_access' => 1];
}
if ($template === 'user.twig') {
  $data['mailboxdata'] = ['username' => 'bibek@rabbittech.com.np', 'name' => 'Bibek Gupta', 'local_part' => 'bibek', 'domain' => 'rabbittech.com.np', 'active' => 1, 'quota' => 10 * 1024 ** 3, 'quota_used' => 6.2 * 1024 ** 3,
    'percent_in_use' => 62, 'percent_class' => 'success', 'messages' => 12480, 'authsource' => 'mailcow', 'created' => '2026-09-01 10:00:00', 'modified' => '2026-10-10 12:00:00',
    'last_imap_login' => time() - 7200, 'last_smtp_login' => time() - 90000, 'last_pop3_login' => 0, 'last_sso_login' => 0, 'spam_aliases' => 2, 'pushover_active' => 0,
    'attributes' => ['imap_access' => 1, 'pop3_access' => 0, 'smtp_access' => 1, 'sieve_access' => 1, 'eas_access' => 1, 'dav_access' => 1, 'sogo_access' => 1, 'force_pw_update' => 0, 'passwd_update' => '2026-10-01 09:00:00', 'tls_enforce_in' => 0, 'tls_enforce_out' => 1]];
  $data['tfa_data'] = $rt_tfa;
  $data['fido2_data'] = [];
  $data['acl'] = $globals['rt_acl'] + ['pw_reset' => 1, 'delimiter_action' => 1, 'tls_policy' => 1, 'quarantine_notification' => 1, 'quarantine_category' => 1, 'quarantine_attachments' => 1];
  $data['acl_json'] = json_encode($data['acl']);
  $data['clientconfigstr'] = 'host=mail.rabbittech.com.np';
  $data['user_get_alias_details'] = ['direct_aliases' => ['info@rabbittech.com.np' => ['public_comment' => '']], 'shared_aliases' => [], 'aliases_also_send_as' => '', 'aliases_send_as_all' => '', 'is_catch_all' => '', 'alias_domains' => []];
  $data['user_domains'] = ['rabbittech.com.np'];
  $data['number_of_app_passwords'] = 1;
  $data['pushover_data'] = ['active' => 0, 'attributes' => ['evaluate_x_prio' => 0, 'only_x_prio' => 0, 'sound' => 'pushover'], 'title' => '', 'text' => '', 'senders' => '', 'senders_regex' => '', 'key' => '', 'token' => ''];
  foreach (['get_tagging_options' => 'subfolder', 'get_tls_policy' => ['tls_enforce_in' => 0, 'tls_enforce_out' => 1], 'quarantine_notification' => 'daily', 'quarantine_category' => 'reject', 'user_spam_score' => '8,15', 'dual_login' => false] as $k => $v) $data[$k] = $v;
}
if ($template === 'domainadmin.twig') { $data['tfa_data'] = $rt_tfa; $data['fido2_data'] = []; }
if ($template === 'admin.twig') { foreach (['fido2_data','api','ro','rw','dkim_domains','dkim_domains_with_keys','dkim_blind_domains','all_domains','f2b_data','q_data','qn_data','pw_reset_data','rsettings_map','rsettings','rspamd_regex_maps','logo_specs','logo_dark_specs','custom_login','password_complexity','cors_settings','iam_settings','mbox_templates'] as $k) $data[$k] = []; $data['dkim_domains'] = ['rabbittech.com.np' => ['dkim' => ['dkim_selector' => 'dkim', 'length' => 2048, 'dkim_txt' => 'v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2k8rP0Nq1tVv7Q9b8Wm3' . str_repeat('aB3', 60), 'privkey' => 'x'], 'alias_domains' => []], 'staging.rabbittech.com.np' => ['dkim' => false, 'alias_domains' => []]]; $data['f2b_banlist_url'] = ''; $data['tfa_data'] = $rt_tfa; }
echo $twig->render($template, $data);
