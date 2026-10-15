<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/triggers.admin.inc.php';

protect_route(['admin']);

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/header.inc.php';
$_SESSION['return_to'] = $_SERVER['REQUEST_URI'];

// Expiry (Unix time) of the TLS certificate nginx serves; the mail services use the same one.
// Cached in Redis, and null when it can't be read, so a failed check never raises an alert.
function rt_cert_expiry($hostname) {
  global $redis;
  try {
    $cached = $redis->Get('RT_CERT_EXPIRY');
  } catch (RedisException $e) {
    $cached = false;
  }
  if ($cached !== false) {
    return $cached === 'unknown' ? null : (int)$cached;
  }
  $expires = null;
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
        $expires = (int)$cert['validTo_time_t'];
      }
    }
  }
  // Check again within the hour once renewal is due, so the alert clears soon after it
  $ttl = ($expires === null || $expires - time() < 14 * 86400) ? 3600 : 21600;
  try {
    $redis->setEx('RT_CERT_EXPIRY', $ttl, $expires === null ? 'unknown' : (string)$expires);
  } catch (RedisException $e) {
  }
  return $expires;
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
$rt_cert_expires = $hostname ? rt_cert_expiry($hostname) : null;
if ($rt_cert_expires !== null) {
  $rt_cert_days = ($rt_cert_expires - time()) / 86400;
  if ($rt_cert_days < 0) {
    $rt_alerts[] = array('level' => 'danger', 'key' => 'cert_expired', 'value' => $rt_cert_expires);
  }
  elseif ($rt_cert_days <= 14) {
    $rt_alerts[] = array('level' => $rt_cert_days <= 3 ? 'danger' : 'warning', 'key' => 'cert_expiring', 'value' => $rt_cert_expires);
  }
}

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
  'ip_check' => customize('get', 'ip_check'),
  'lang_admin' => json_encode($lang['admin']),
  'lang_debug' => json_encode($lang['debug']),
  'lang_datatables' => json_encode($lang['datatables']),
];

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';


