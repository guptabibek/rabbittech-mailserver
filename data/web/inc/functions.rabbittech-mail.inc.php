<?php
// Mail security lookups shared by the Overview (admin/dashboard.php) and a domain's Mail security
// tab (inc/ajax/rt_mail_security.php). The checks themselves are rabbittech_domain_checks() in
// functions.rabbittech.inc.php; these are the real DNS, HTTPS and console lookups it is given.

// TXT texts or MX host names of a name; null when the lookup itself failed
function rt_dns_lookup($name, $type) {
  $records = @dns_get_record($name, $type === 'MX' ? DNS_MX : DNS_TXT);
  if ($records === false) {
    return null;
  }
  $values = array();
  foreach ($records as $record) {
    // An answer can also carry the CNAME records that led to it
    if (($record['type'] ?? '') !== $type) {
      continue;
    }
    $values[] = $type === 'MX' ? $record['target'] : (isset($record['entries']) ? implode('', $record['entries']) : ($record['txt'] ?? ''));
  }
  return $values;
}

// A URL fetched the way senders fetch an MTA-STS policy: HTTPS with a valid certificate for the
// name, no redirects. Not being able to connect from here ('connect') says nothing about whether
// senders can, so it doesn't count as a problem.
function rt_https_fetch($url) {
  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 5,
    CURLOPT_MAXFILESIZE => 65536,
  ));
  $body = curl_exec($ch);
  $error = curl_errno($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  // 6: the name doesn't resolve; 51 and 60: the certificate isn't valid for the name
  if ($error === 6) {
    return array('error' => 'dns');
  }
  if ($error === 51 || $error === 60) {
    return array('error' => 'cert');
  }
  return $error ? array('error' => 'connect') : array('status' => $status, 'body' => (string)$body);
}

// The addresses a domain's SPF record allows, includes followed
function rt_spf_hosts($domain) {
  require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/spf.inc.php';
  return (array)@get_spf_allowed_hosts($domain);
}

// This server's IPv4 address, as the mail hostname resolves; null when it doesn't
function rt_server_ip($hostname) {
  $a = @dns_get_record($hostname, DNS_A);
  return empty($a[0]['ip']) ? null : $a[0]['ip'];
}

// What scripts/mail-reports.sh keeps: the DMARC and TLS reports and its last run's status
// (null: it has never run)
function rt_mail_reports() {
  global $redis;
  try {
    $state = $redis->Get('RT_MAIL_REPORTS');
  } catch (RedisException $e) {
    return null;
  }
  return $state === false ? null : json_decode($state, true);
}

// The address DMARC and TLS reports are read from; '' when they aren't read
function rt_reports_address($reports) {
  return !empty($reports['status']['enabled']) ? (string)($reports['status']['mailbox'] ?? '') : '';
}

// Mail security of one of the server's domains (rabbittech_domain_checks)
function rt_domain_security($domain, $hostname, $ip, $reports) {
  $dkim = dkim('details', $domain);
  $sts = mailbox('get', 'mta_sts', $domain);
  $info = array(
    'dkim' => empty($dkim['dkim_txt']) ? null : array('selector' => $dkim['dkim_selector'], 'txt' => $dkim['dkim_txt']),
    'sts' => $sts ?: null,
  );
  $server = array('hostname' => strtolower($hostname), 'ip' => (string)$ip, 'reports' => $reports);
  return rabbittech_domain_checks($domain, $server, $info, 'rt_dns_lookup', 'rt_https_fetch', 'rt_spf_hosts');
}

// The server's active domains and alias domains, the ones reports may be about
function rt_mail_domains() {
  global $pdo;
  try {
    return $pdo->query("SELECT `domain` FROM `domain` WHERE `active` = '1' UNION SELECT `alias_domain` FROM `alias_domain` WHERE `active` = '1'")->fetchAll(PDO::FETCH_COLUMN);
  } catch (PDOException $e) {
    return null;
  }
}
