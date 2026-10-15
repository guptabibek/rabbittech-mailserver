<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/triggers.admin.inc.php';

protect_route(['admin']);

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/header.inc.php';
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

// DNS of the mail domains, as other mail servers see it. Returns the domains failing each check
// and the server's reverse DNS problem, if any.
function rt_mail_dns_problems($hostname) {
  global $pdo;
  $cached = rt_cache_get('RT_DNS_HEALTH');
  if ($cached !== false) {
    return $cached;
  }
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/spf.inc.php';
  $host = strtolower($hostname);
  $a = @dns_get_record($hostname, DNS_A);
  if (empty($a[0]['ip'])) {
    return null;
  }
  $ip = $a[0]['ip'];
  $problems = array('ip' => $ip, 'ptr' => null, 'mx' => array(), 'spf' => array(), 'dkim_key' => array(), 'dkim' => array(), 'dmarc' => array());

  $ptr = @gethostbyaddr($ip);
  if ($ptr === false || $ptr === $ip) {
    $problems['ptr'] = array('missing', '');
  }
  elseif (strtolower(rtrim($ptr, '.')) !== $host) {
    $problems['ptr'] = array('other', $ptr);
  }

  // TXT records of a name; null when the lookup itself failed, so it isn't reported as missing
  $txt = function ($name) {
    $records = @dns_get_record($name, DNS_TXT);
    if ($records === false) {
      return null;
    }
    $texts = array();
    foreach ($records as $record) {
      $texts[] = isset($record['entries']) ? implode('', $record['entries']) : ($record['txt'] ?? '');
    }
    return $texts;
  };

  try {
    $domains = $pdo->query("SELECT `domain` FROM `domain` WHERE `active` = '1' AND `backupmx` = '0' ORDER BY `domain` LIMIT 50")->fetchAll(PDO::FETCH_COLUMN);
  } catch (PDOException $e) {
    return null;
  }
  foreach ($domains as $domain) {
    $mx = @dns_get_record($domain, DNS_MX);
    if ($mx !== false) {
      $targets = array_map(function ($record) { return strtolower(rtrim($record['target'], '.')); }, $mx);
      if (!in_array($host, $targets, true)) {
        $problems['mx'][] = $domain;
      }
    }

    $texts = $txt($domain);
    if ($texts !== null) {
      $spf = null;
      foreach ($texts as $text) {
        if (stripos($text, 'v=spf1') === 0) {
          $spf = $text;
        }
      }
      // get_spf_allowed_hosts() follows include, a, mx and redirect but drops CIDR sizes,
      // so ip4: ranges are checked here as well
      preg_match_all('/\bip4:([0-9.\/]+)/i', (string)$spf, $ranges);
      if ($spf === null || (!in_array($ip, (array)@get_spf_allowed_hosts($domain), true) && !rabbittech_ip_in_cidrs($ip, $ranges[1]))) {
        $problems['spf'][] = $domain;
      }
    }

    $dkim = dkim('details', $domain);
    if (empty($dkim['dkim_txt'])) {
      $problems['dkim_key'][] = $domain;
    }
    else {
      $published = $txt($dkim['dkim_selector'] . '._domainkey.' . $domain);
      if ($published !== null) {
        // dkim_txt is split into quoted 255-character strings when SPLIT_DKIM_255 is set
        preg_match('/\bp=([^;]+)/', str_replace(array('"', ' '), '', $dkim['dkim_txt']), $want);
        $found = false;
        foreach ($published as $text) {
          if (preg_match('/\bp=([^;]+)/', str_replace(array('"', ' '), '', $text), $have) && isset($want[1]) && $have[1] === $want[1]) {
            $found = true;
          }
        }
        if (!$found) {
          $problems['dkim'][] = $domain;
        }
      }
    }

    $dmarc = $txt('_dmarc.' . $domain);
    if ($dmarc !== null) {
      $found = false;
      foreach ($dmarc as $text) {
        if (stripos($text, 'v=DMARC1') === 0) {
          $found = true;
        }
      }
      if (!$found) {
        $problems['dmarc'][] = $domain;
      }
    }
  }

  $fine = $problems['ptr'] === null && !$problems['mx'] && !$problems['spf'] && !$problems['dkim_key'] && !$problems['dkim'] && !$problems['dmarc'];
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

// DNS of the mail domains: what decides whether mail arrives and isn't marked as spam
$rt_dns = $hostname ? rt_mail_dns_problems($hostname) : null;
if ($rt_dns !== null) {
  $rt_domains_link = array('href' => '/admin/mailbox#/domains', 'text' => $rt_text['alert_link_domains']);
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
  $rt_dns_checks = array(
    'mx' => array($hostname, $rt_domains_link),
    'spf' => array($rt_dns['ip'], $rt_domains_link),
    'dkim_key' => array('', $rt_dkim_link),
    'dkim' => array('', $rt_dkim_link),
    'dmarc' => array('', $rt_domains_link),
  );
  foreach ($rt_dns_checks as $rt_check => $rt_how) {
    if (!empty($rt_dns[$rt_check])) {
      $rt_alerts[] = array('level' => 'warning', 'key' => 'dns_' . $rt_check,
        'value' => rabbittech_list($rt_dns[$rt_check], $rt_text['list_more']),
        'hint' => sprintf($rt_text['alert_dns_' . $rt_check . '_hint'], $rt_how[0]),
        'links' => array($rt_how[1], $rt_recheck));
    }
  }
}

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
  'ip_check' => customize('get', 'ip_check'),
  'lang_admin' => json_encode($lang['admin']),
  'lang_debug' => json_encode($lang['debug']),
  'lang_datatables' => json_encode($lang['datatables']),
];

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';


