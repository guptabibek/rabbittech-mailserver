<?php
// The PHP side of scripts/mail-reports.sh, run in the php-fpm container:
//   php /web/inc/lib/rabbittech-mail-reports.php read <mailbox>
//       reads messages (doveadm's JSON fetch output) from stdin, keeps the DMARC and TLS reports
//       in them and prints the uids of the messages that had reports
//   php /web/inc/lib/rabbittech-mail-reports.php failed <mailbox> <error>
//   php /web/inc/lib/rabbittech-mail-reports.php off
// The reports and the last run's status are kept in Redis (RT_MAIL_REPORTS) for the Overview.
// tests/reports/test-mail-reports.sh keeps them in a file instead (RT_REPORTS_STATE_FILE).
// nginx denies /inc/lib/, so this is never reachable over HTTP.
if (PHP_SAPI !== 'cli') {
  http_response_code(404);
  exit;
}
require __DIR__ . '/../functions.rabbittech.inc.php';

$file = getenv('RT_REPORTS_STATE_FILE');
if ($file) {
  $state = is_file($file) ? json_decode(file_get_contents($file), true) : null;
}
else {
  // The same Redis as the console (inc/prerequisites.inc.php)
  $redis = new Redis();
  if (!empty(getenv('REDIS_SLAVEOF_IP'))) {
    $redis->connect(getenv('REDIS_SLAVEOF_IP'), getenv('REDIS_SLAVEOF_PORT'));
  }
  else {
    $redis->connect('redis-mailcow', 6379);
  }
  $redis->auth(getenv('REDISPASS'));
  $state = json_decode((string)$redis->get('RT_MAIL_REPORTS'), true);
}
$state = is_array($state) ? $state : array();
$now = (int)(getenv('RT_REPORTS_CLOCK') ?: time());
$mailbox = strtolower($argv[2] ?? '');
$last = $state['status'] ?? array();

switch ($argv[1] ?? '') {
  case 'off':
    $state['status'] = array('enabled' => false, 'time' => $now);
    break;
  case 'failed':
    $state['status'] = array('enabled' => true, 'mailbox' => $mailbox, 'time' => $now, 'ok' => false, 'error' => (string)($argv[3] ?? ''),
      'last_success' => ($last['mailbox'] ?? '') === $mailbox ? (int)($last['last_success'] ?? 0) : 0);
    break;
  case 'read':
    $messages = json_decode(stream_get_contents(STDIN), true, 512, JSON_INVALID_UTF8_SUBSTITUTE);
    if (!is_array($messages)) {
      fwrite(STDERR, "Expected the messages as doveadm's JSON fetch output\n");
      exit(1);
    }
    $found = array('dmarc' => array(), 'tls' => array());
    $uids = array();
    foreach ($messages as $message) {
      $reports = rabbittech_message_reports((string)($message['text'] ?? ''));
      if ($reports['dmarc'] || $reports['tls']) {
        $uids[] = (int)$message['uid'];
        $found['dmarc'] = array_merge($found['dmarc'], $reports['dmarc']);
        $found['tls'] = array_merge($found['tls'], $reports['tls']);
      }
    }
    $resolve = getenv('RT_REPORTS_NO_PTR') ? function ($ip) { return ''; } : function ($ip) { return @gethostbyaddr($ip); };
    $state = rabbittech_reports_add($state, $found, $now, $resolve);
    $state['status'] = array('enabled' => true, 'mailbox' => $mailbox, 'time' => $now, 'ok' => true, 'error' => '', 'last_success' => $now);
    echo implode(' ', $uids);
    break;
  default:
    fwrite(STDERR, "Usage: rabbittech-mail-reports.php read|failed|off [mailbox] [error]\n");
    exit(2);
}

$json = json_encode($state, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
if ($file) {
  file_put_contents($file, $json);
}
else {
  $redis->set('RT_MAIL_REPORTS', $json);
}
