<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/triggers.admin.inc.php';

protect_route(['admin']);

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/header.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/functions.rabbittech-mail.inc.php';
$_SESSION['return_to'] = $_SERVER['REQUEST_URI'];

// Overview checks. Each result is cached in Redis, and a check that can't run (Redis, nginx or DNS
// unreachable) returns null or skips that item, so it never raises an alert of its own.
// "Check again" on the Overview (?recheck=1) clears the cached certificate and DNS results.
if (isset($_GET['recheck'])) {
  try {
    $redis->del('RT_CERT_INFO', 'RT_DNS_HEALTH');
  } catch (RedisException $e) {
  }
  header('Location: /admin/dashboard');
  exit;
}

function rt_cache_get($key) {
  global $redis;
  try {
    $cached = $redis->Get($key);
  } catch (RedisException $e) {
    return false;
  }
  return $cached === false ? false : json_decode($cached, true);
}

function rt_cache_set($key, $ttl, $value) {
  global $redis;
  try {
    $redis->setEx($key, $ttl, json_encode($value));
  } catch (RedisException $e) {
  }
}

// The TLS certificate nginx serves (the mail services use the same one): when it expires, and
// whether it is still mailcow's built-in placeholder (issued by "mailcow" for mail.example.org)
function rt_cert_info($hostname) {
  $cached = rt_cache_get('RT_CERT_INFO');
  if ($cached !== false) {
    return $cached;
  }
  $info = null;
  $context = stream_context_create(array('ssl' => array(
    'capture_peer_cert' => true,
    'verify_peer' => false,
    'verify_peer_name' => false,
    'SNI_enabled' => true,
    'peer_name' => $hostname,
  )));
  $port = (int)(getenv('HTTPS_PORT') ?: 443);
  $client = @stream_socket_client('ssl://nginx:' . $port, $errno, $errstr, 3, STREAM_CLIENT_CONNECT, $context);
  if ($client) {
    $params = stream_context_get_params($client);
    fclose($client);
    if (!empty($params['options']['ssl']['peer_certificate'])) {
      $cert = openssl_x509_parse($params['options']['ssl']['peer_certificate']);
      if (!empty($cert['validTo_time_t'])) {
        $info = array(
          'expires' => (int)$cert['validTo_time_t'],
          'placeholder' => ($cert['issuer']['O'] ?? '') === 'mailcow',
        );
      }
    }
  }
  // Check again within the hour while there is a problem, so the alert clears soon after a fix
  $fine = $info !== null && !$info['placeholder'] && $info['expires'] - time() > 14 * 86400;
  rt_cache_set('RT_CERT_INFO', $fine ? 21600 : 3600, $info);
  return $info;
}

// Why the ACME container hasn't issued a certificate, from its log: [reason, values] or null
function rt_acme_reason() {
  global $redis;
  try {
    $lines = (array)$redis->lRange('ACME_LOG', 0, 99);
  } catch (RedisException $e) {
    return null;
  }
  $messages = array();
  foreach ($lines as $line) {
    $entry = json_decode($line, true);
    if (isset($entry['message'])) {
      $messages[] = $entry['message'];
    }
  }
  return rabbittech_acme_reason($messages);
}

// What scripts/backup-mail.sh reported last (null: it has never run)
function rt_backup_status() {
  global $redis;
  try {
    $status = $redis->Get('RT_BACKUP_STATUS');
  } catch (RedisException $e) {
    return null;
  }
  return $status === false ? null : json_decode($status, true);
}

// What scripts/restore-test.sh found last (null: no restore test yet)
function rt_restore_status() {
  global $redis;
  try {
    $status = $redis->Get('RT_RESTORE_TEST');
  } catch (RedisException $e) {
    return null;
  }
  return $status === false ? null : json_decode($status, true);
}

// DNS of the mail domains, as other mail servers see it (rabbittech_domain_checks). Returns the
// domains failing each check and the server's reverse DNS problem, if any. $reports is the
// address DMARC and TLS reports are read from ('' when they aren't).
function rt_mail_dns_problems($hostname, $reports) {
  global $pdo;
  $cached = rt_cache_get('RT_DNS_HEALTH');
  if ($cached !== false) {
    return $cached;
  }
  $host = strtolower($hostname);
  $ip = rt_server_ip($hostname);
  if ($ip === null) {
    return null;
  }
  $problems = array('ip' => $ip, 'ptr' => null, 'mta_sts_enforced' => false);

  $ptr = @gethostbyaddr($ip);
  if ($ptr === false || $ptr === $ip) {
    $problems['ptr'] = array('missing', '');
  }
  elseif (strtolower(rtrim($ptr, '.')) !== $host) {
    $problems['ptr'] = array('other', $ptr);
  }

  try {
    $domains = $pdo->query("SELECT `domain` FROM `domain` WHERE `active` = '1' AND `backupmx` = '0' ORDER BY `domain` LIMIT 50")->fetchAll(PDO::FETCH_COLUMN);
  } catch (PDOException $e) {
    return null;
  }
  foreach ($domains as $domain) {
    $checks = rt_domain_security($domain, $host, $ip, $reports);
    foreach ($checks as $check => $result) {
      if ($check === 'dkim' && $result['state'] === 'off') {
        $problems['dkim_key'][] = $domain;
      }
      // A failed lookup is not a problem; MTA-STS and TLS reporting not being set up is a
      // choice, except that TLS reports matter once an MTA-STS policy can stop mail
      if (!in_array($result['state'], array('missing', 'wrong'), true) || ($check === 'tls_reports' && isset($checks['mta_sts']))) {
        continue;
      }
      $problems[$check][] = $domain;
      if ($check === 'mta_sts_mx' && $result['enforce']) {
        $problems['mta_sts_enforced'] = true;
      }
    }
  }

  $fine = $problems['ptr'] === null && count($problems) === 3;
  rt_cache_set('RT_DNS_HEALTH', $fine ? 21600 : 3600, $problems);
  return $problems;
}

$clamd_status = (preg_match("/^([yY][eE][sS]|[yY])+$/", $_ENV["SKIP_CLAMD"])) ? false : true;
$olefy_status = (preg_match("/^([yY][eE][sS]|[yY])+$/", $_ENV["SKIP_OLEFY"])) ? false : true;


if (!isset($_SESSION['gal']) && $license_cache = $redis->Get('LICENSE_STATUS_CACHE')) {
  $_SESSION['gal'] = json_decode($license_cache, true);
}

$js_minifier->add('/web/js/site/dashboard.js');

// vmail df
$exec_fields = array('cmd' => 'system', 'task' => 'df', 'dir' => '/var/vmail');
$vmail_df = explode(',', (string)json_decode(docker('post', 'dovecot-mailcow', 'exec', $exec_fields), true));

// containers
$containers_info = (array) docker('info');
if ($clamd_status === false) unset($containers_info['clamd-mailcow']);
if ($olefy_status === false) unset($containers_info['olefy-mailcow']);
ksort($containers_info);
$containers = array();
foreach ($containers_info as $container => $container_info) {
  if (!isset($container_info['State']) || !is_array($container_info['State']) || !isset($container_info['State']['StartedAt'])){
    continue;
  }
  date_default_timezone_set('UTC');
  $StartedAt = date_parse($container_info['State']['StartedAt']);
  if ($StartedAt['hour'] !== false) {
    $date = new \DateTime();
    $date->setTimestamp(mktime(
      $StartedAt['hour'],
      $StartedAt['minute'],
      $StartedAt['second'],
      $StartedAt['month'],
      $StartedAt['day'],
      $StartedAt['year']));
    try {
      $user_tz = new DateTimeZone(getenv('TZ'));
      $date->setTimezone($user_tz);
      $container_info['State']['StartedAtHR'] = $date->format('r');
    } catch(Exception $e) {
      $container_info['State']['StartedAtHR'] = '?';
    }
  }
  else {
    $container_info['State']['StartedAtHR'] = '?';
  }
  $containers[$container] = $container_info;
}

// Overview: quarantine size, counted here instead of loading every item through the API
try {
  $quarantine_count = (int)$pdo->query('SELECT COUNT(*) FROM `quarantine`')->fetchColumn();
} catch (PDOException $e) {
  $quarantine_count = null;
}

// get mailcow data
$hostname = getenv('MAILCOW_HOSTNAME');
$timezone = getenv('TZ');

// Overview: problems that need the admin's attention (014-rabbittech.js adds the mail queue)
$rt_alerts = array();
foreach ($containers as $container => $container_info) {
  $service = preg_replace('/-mailcow$/', '', $container);
  if (empty($container_info['State']['Running'])) {
    $rt_alerts[] = array('level' => 'danger', 'key' => 'container_stopped', 'value' => $service);
  }
  elseif (($container_info['State']['Health']['Status'] ?? '') === 'unhealthy') {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'container_unhealthy', 'value' => $service);
  }
}
$rt_disk_used = isset($vmail_df[4]) ? (int)$vmail_df[4] : 0;
if ($rt_disk_used >= 85) {
  $rt_alerts[] = array('level' => $rt_disk_used >= 95 ? 'danger' : 'warning', 'key' => 'disk', 'value' => $rt_disk_used . '%');
}
$rt_text = $lang['rabbittech'];
$rt_recheck = array('href' => '?recheck=1', 'text' => $rt_text['alert_link_recheck']);

// TLS certificate: missing (still the placeholder), expired or expiring, with the reason from
// the ACME log when there is one
$rt_cert = $hostname ? rt_cert_info($hostname) : null;
if ($rt_cert !== null) {
  $rt_cert_days = ($rt_cert['expires'] - time()) / 86400;
  if ($rt_cert['placeholder'] || $rt_cert_days <= 14) {
    $rt_acme = rt_acme_reason();
    $rt_cert_alert = array(
      'links' => array(array('href' => '#/acme-logs', 'text' => $rt_text['alert_link_acme']), $rt_recheck),
    );
    if ($rt_acme !== null) {
      $rt_cert_alert['hint'] = vsprintf($rt_text['acme_' . $rt_acme[0]], $rt_acme[1]);
    }
    if ($rt_cert['placeholder']) {
      $rt_alerts[] = $rt_cert_alert + array('level' => 'danger', 'key' => 'cert_missing', 'value' => $hostname);
    }
    elseif ($rt_cert_days < 0) {
      $rt_alerts[] = $rt_cert_alert + array('level' => 'danger', 'key' => 'cert_expired', 'date' => $rt_cert['expires']);
    }
    else {
      $rt_alerts[] = $rt_cert_alert + array('level' => $rt_cert_days <= 3 ? 'danger' : 'warning', 'key' => 'cert_expiring', 'date' => $rt_cert['expires']);
    }
  }
}

// Backups (scripts/backup-mail.sh reports to Redis)
$rt_backup = rt_backup_status();
$rt_backup_last = (int)($rt_backup['last_success'] ?? 0);
if ($rt_backup === null) {
  $rt_alerts[] = array('level' => 'warning', 'key' => 'backup_never');
}
elseif (empty($rt_backup['enabled'])) {
  $rt_alerts[] = array('level' => 'warning', 'key' => 'backup_off');
}
else {
  $rt_backup_age = (time() - $rt_backup_last) / 3600;
  if (empty($rt_backup['ok'])) {
    $rt_alerts[] = array('level' => 'danger', 'key' => 'backup_failed', 'date' => (int)$rt_backup['time'],
      'hint' => sprintf($rt_text['alert_backup_failed_hint'], $rt_backup['error'] ?? ''));
  }
  elseif ($rt_backup_age > 36) {
    $rt_alerts[] = array('level' => $rt_backup_age > 72 ? 'danger' : 'warning', 'key' => 'backup_old', 'date' => $rt_backup_last);
  }
  if (($rt_backup['offsite'] ?? '') === 'failed') {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'backup_offsite');
  }
}

// Restore tests: scripts/backup-mail.sh runs scripts/restore-test.sh after a backup every
// restore_days days (0: turned off; a status from before restore tests: the default, 7)
$rt_restore_days = $rt_backup === null ? 7 : (empty($rt_backup['enabled']) ? 0 : (int)($rt_backup['restore_days'] ?? 7));
$rt_restore = $rt_restore_days > 0 ? rt_restore_status() : null;
if ($rt_restore !== null) {
  if (empty($rt_restore['ok'])) {
    $rt_alerts[] = array('level' => 'danger', 'key' => 'restore_failed', 'date' => (int)$rt_restore['time'],
      'hint' => sprintf($rt_text['alert_restore_failed_hint'], $rt_restore['error'] ?? ''));
  }
  // Only while backups run; otherwise the backup alerts say what is wrong
  elseif (time() - (int)$rt_restore['time'] > ($rt_restore_days + 3) * 86400 && time() - $rt_backup_last < 36 * 3600) {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'restore_old', 'date' => (int)$rt_restore['time']);
  }
}

// What scripts/mail-reports.sh keeps: the DMARC and TLS reports, and whether it reads them
$rt_mail_reports = rt_mail_reports();
$rt_reports_status = $rt_mail_reports['status'] ?? null;
$rt_reports_address = rt_reports_address($rt_mail_reports);

// DNS of the mail domains: what decides whether mail arrives and isn't marked as spam
$rt_dns = $hostname ? rt_mail_dns_problems($hostname, $rt_reports_address) : null;
// One domain: straight to its Mail security tab; several: the domain list
$rt_security_link = function ($domains) use ($rt_text) {
  return count($domains) === 1
    ? array('href' => '/edit/domain/' . rawurlencode($domains[0]) . '#mail-security', 'text' => $rt_text['alert_link_security'])
    : array('href' => '/admin/mailbox#/domains', 'text' => $rt_text['alert_link_domains']);
};
if ($rt_dns !== null) {
  $rt_dkim_link = array('href' => '/admin/system#/config-dkim', 'text' => $rt_text['alert_link_dkim']);
  if ($rt_dns['ptr'] !== null) {
    if ($rt_dns['ptr'][0] === 'missing') {
      $rt_alerts[] = array('level' => 'danger', 'key' => 'dns_ptr_missing', 'value' => $rt_dns['ip'],
        'hint' => sprintf($rt_text['alert_dns_ptr_missing_hint'], $rt_dns['ip'], $hostname), 'links' => array($rt_recheck));
    }
    else {
      $rt_alerts[] = array('level' => 'warning', 'key' => 'dns_ptr_other', 'value' => $rt_dns['ptr'][1],
        'hint' => sprintf($rt_text['alert_dns_ptr_other_hint'], $hostname, $rt_dns['ip']), 'links' => array($rt_recheck));
    }
  }
  // check => [value for the hint, link, level]. An MX host missing from an enforced MTA-STS
  // policy stops mail, so that one is a danger.
  $rt_dns_checks = array(
    'mx' => array($hostname, $rt_security_link),
    'spf' => array($rt_dns['ip'], $rt_security_link),
    'dkim_key' => array('', $rt_dkim_link),
    'dkim' => array('', $rt_dkim_link),
    'dmarc' => array('', $rt_security_link),
    'dmarc_reports' => array($rt_reports_address, $rt_security_link),
    'dmarc_auth' => array(substr(strrchr($rt_reports_address, '@') ?: '@', 1), $rt_security_link),
    'mta_sts_txt' => array('', $rt_security_link),
    'mta_sts_policy' => array($hostname, $rt_security_link),
    'mta_sts_mx' => array($hostname, $rt_security_link, empty($rt_dns['mta_sts_enforced']) ? 'warning' : 'danger'),
    'tls_reports' => array($rt_reports_address, $rt_security_link),
  );
  foreach ($rt_dns_checks as $rt_check => $rt_how) {
    if (!empty($rt_dns[$rt_check])) {
      $rt_alerts[] = array('level' => $rt_how[2] ?? 'warning', 'key' => 'dns_' . $rt_check,
        'value' => rabbittech_list($rt_dns[$rt_check], $rt_text['list_more']),
        'hint' => sprintf($rt_text['alert_dns_' . $rt_check . '_hint'], $rt_how[0]),
        'links' => array($rt_how[1] instanceof Closure ? $rt_how[1]($rt_dns[$rt_check]) : $rt_how[1], $rt_recheck));
    }
  }
}

// Mail reports: whether they are read, and what the last week's reports say
$rt_server_ip = $rt_dns['ip'] ?? '';
$rt_mail_domains = $rt_mail_reports ? rt_mail_domains() : null;
if (!empty($rt_reports_status['enabled'])) {
  if (empty($rt_reports_status['ok'])) {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'reports_failed', 'value' => $rt_reports_address,
      'hint' => sprintf($rt_text['alert_reports_failed_hint'], $rt_reports_status['error'] ?? ''));
  }
  elseif (time() - (int)$rt_reports_status['time'] > 86400) {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'reports_old', 'date' => (int)$rt_reports_status['time']);
  }
  $rt_week = rabbittech_reports_summary($rt_mail_reports, time(), $rt_server_ip, 7, 8, $rt_mail_domains);
  if ($rt_week['self_failed']) {
    $rt_alerts[] = array('level' => 'warning', 'key' => 'reports_dmarc', 'value' => rabbittech_list(array_keys($rt_week['self_failed']), $rt_text['list_more']),
      'hint' => sprintf($rt_text['alert_reports_dmarc_hint'], array_sum($rt_week['self_failed']), $rt_server_ip),
      'links' => array($rt_security_link(array_keys($rt_week['self_failed']))));
  }
  $rt_tls_failed = array_filter($rt_week['domains'], function ($totals) { return $totals['tls_failed'] > 0; });
  if ($rt_tls_failed) {
    $rt_tls_types = array();
    foreach ($rt_tls_failed as $rt_totals) {
      foreach ($rt_totals['tls_failures'] as $rt_type => $rt_count) {
        $rt_tls_types[$rt_type] = ($rt_tls_types[$rt_type] ?? 0) + $rt_count;
      }
    }
    arsort($rt_tls_types);
    $rt_alerts[] = array('level' => 'warning', 'key' => 'reports_tls', 'value' => rabbittech_list(array_keys($rt_tls_failed), $rt_text['list_more']),
      'hint' => sprintf($rt_text['alert_reports_tls_hint'], array_sum(array_column($rt_tls_failed, 'tls_failed')), $rt_tls_types ? key($rt_tls_types) : '?'),
      'links' => array($rt_security_link(array_keys($rt_tls_failed))));
  }
}
// The Mail reports card: the last 30 days
$rt_reports = array(
  'status' => $rt_reports_status,
  'summary' => $rt_mail_reports ? rabbittech_reports_summary($rt_mail_reports, time(), $rt_server_ip, 30, 8, $rt_mail_domains) : null,
);

// Most severe first; the order within a level stays as above
usort($rt_alerts, function ($a, $b) {
  return ($a['level'] === 'danger' ? 0 : 1) - ($b['level'] === 'danger' ? 0 : 1);
});

$template = 'dashboard.twig';
$template_data = [
  'log_lines' => getenv('LOG_LINES'),
  'vmail_df' => $vmail_df,
  'hostname' => $hostname,
  'timezone' => $timezone,
  'gal' => @$_SESSION['gal'],
  'license_guid' => license('guid'),
  'clamd_status' => $clamd_status,
  'olefy_status' => $olefy_status,
  'containers' => $containers,
  'quarantine_count' => $quarantine_count,
  'rt_alerts' => $rt_alerts,
  'rt_backup_last' => $rt_backup_last,
  'rt_restore' => $rt_restore,
  'rt_restore_days' => $rt_restore_days,
  'rt_reports' => $rt_reports,
  'ip_check' => customize('get', 'ip_check'),
  'lang_admin' => json_encode($lang['admin']),
  'lang_debug' => json_encode($lang['debug']),
  'lang_datatables' => json_encode($lang['datatables']),
];

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';


