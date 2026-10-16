<?php
// RabbitTech wording: lang/rabbittech.<locale>.json replaces the mailcow, SOGo and Rspamd names in
// text people see. The English replacements apply wherever the page shows the English text, so a
// language that hasn't translated a string gets them too; real translations are kept.
// Used by inc/prerequisites.inc.php and by the UI test harness (tests/ui/router.php).
function rabbittech_wording($lang, $lang_en, $locale, $lang_dir) {
  $file = $lang_dir . '/rabbittech.en-gb.json';
  if (file_exists($file)) {
    foreach (json_decode(file_get_contents($file), true) as $section => $strings) {
      foreach ($strings as $key => $text) {
        if (($lang[$section][$key] ?? null) === ($lang_en[$section][$key] ?? null)) {
          $lang[$section][$key] = $text;
        }
      }
    }
  }
  $file = $lang_dir . '/rabbittech.' . $locale . '.json';
  if ($locale != 'en-gb' && file_exists($file)) {
    $lang = array_replace_recursive($lang, json_decode(file_get_contents($file), true));
  }
  return $lang;
}

// Why the ACME container has no certificate for us, from its log (ACME_LOG in Redis, newest
// message first). Returns [reason, values] for lang.rabbittech.acme_<reason>, or null when the
// newest outcome is a success or nothing explains it. The container replaces - [ ] { } " $ ; & %
// in messages with spaces before logging them.
function rabbittech_acme_reason($messages) {
  $fallback = null;
  foreach ($messages as $message) {
    $message = preg_replace('/^base64,/', '', (string)$message);
    if (preg_match('/Certificates? (were )?success|Certificate successfully obtained/i', $message)) {
      break;
    }
    if (preg_match('/SKIP_LETS_ENCRYPT=y, skipping/', $message)) {
      return array('skip', array());
    }
    if (preg_match('/Cannot match your IP (\S+) against hostname (\S+) \(DNS returned (\S+?)\)/', $message, $m)) {
      return strpos($m[3], ':') !== false
        ? array('aaaa', array($m[2], $m[3]))
        : array('dns_ip', array($m[2], $m[3], $m[1]));
    }
    if (preg_match('/No A or AAAA record found for hostname (\S+)/', $message, $m)) {
      return array('no_dns', array($m[1]));
    }
    if (preg_match('/record with IP (\S+), but HTTP validation failed/', $message, $m)) {
      return array('http', array($m[1]));
    }
    if (preg_match('/disallowed for (\S+) by CAA record/', $message, $m)) {
      return array('caa', array($m[1]));
    }
    if (strpos($message, 'issuer other than mailcow') !== false) {
      return array('custom', array());
    }
    if ($fallback === null && preg_match('/Cannot validate any hostnames|Some errors occurred/', $message)) {
      $fallback = array('error', array());
    }
  }
  return $fallback;
}

// Whether an IPv4 address lies in any of the given addresses or CIDR ranges (ip4: in SPF)
function rabbittech_ip_in_cidrs($ip, $cidrs) {
  $address = ip2long($ip);
  if ($address === false) {
    return false;
  }
  foreach ($cidrs as $cidr) {
    $parts = explode('/', $cidr, 2);
    $network = ip2long($parts[0]);
    $bits = isset($parts[1]) ? (int)$parts[1] : 32;
    if ($network === false || $bits < 0 || $bits > 32) {
      continue;
    }
    $mask = $bits === 0 ? 0 : (~0 << (32 - $bits)) & 0xFFFFFFFF;
    if (($address & $mask) === ($network & $mask)) {
      return true;
    }
  }
  return false;
}

// "a, b, c and 2 more": the first $show items, then $more (a "%s and %d more" string)
function rabbittech_list($items, $more, $show = 3) {
  $items = array_values($items);
  if (count($items) <= $show) {
    return implode(', ', $items);
  }
  return sprintf($more, implode(', ', array_slice($items, 0, $show)), count($items) - $show);
}

// ---- Mail security: SPF, DKIM, DMARC (RFC 7489), MTA-STS (RFC 8461) and TLS reporting (RFC 8460)

// Tags of a "v=..." record (DMARC, MTA-STS, TLS reporting) as lower-case name => value, or null
// when the text is not a record of that version
function rabbittech_record_tags($text, $version) {
  $tags = array();
  foreach (explode(';', (string)$text) as $part) {
    $pair = explode('=', $part, 2);
    if (count($pair) === 2 && trim($pair[0]) !== '') {
      $tags[strtolower(trim($pair[0]))] = trim($pair[1]);
    }
  }
  return strcasecmp($tags['v'] ?? '', $version) === 0 ? $tags : null;
}

// The texts among a name's TXT records that are records of that version. Senders ignore all of
// them when there is more than one.
function rabbittech_records($texts, $version) {
  return array_values(array_filter((array)$texts, function ($text) use ($version) {
    return rabbittech_record_tags($text, $version) !== null;
  }));
}

// The mailto: addresses of a rua= tag, e.g. "mailto:a@x.org!10m, mailto:b@y.org", lower-case
function rabbittech_rua_addresses($rua) {
  $addresses = array();
  foreach (explode(',', (string)$rua) as $uri) {
    if (preg_match('/^\s*mailto:([^!?\s]+)/i', $uri, $m)) {
      $addresses[] = strtolower(rawurldecode($m[1]));
    }
  }
  return $addresses;
}

// A record ("v=DMARC1; p=none" or "v=TLSRPTv1") with mailto:$address added to its rua= tag,
// after the addresses already there
function rabbittech_with_rua($record, $address) {
  $parts = array_values(array_filter(array_map('trim', explode(';', $record)), 'strlen'));
  foreach ($parts as $i => $part) {
    if (preg_match('/^rua\s*=\s*(.*)$/i', $part, $m)) {
      if (!in_array(strtolower($address), rabbittech_rua_addresses($m[1]), true)) {
        $parts[$i] = 'rua=' . ($m[1] === '' ? '' : $m[1] . ',') . 'mailto:' . $address;
      }
      return implode('; ', $parts);
    }
  }
  // rua= goes after p= in DMARC records; DMARC requires v= and p= to come first
  $at = 1;
  foreach ($parts as $i => $part) {
    if (preg_match('/^p\s*=/i', $part)) {
      $at = $i + 1;
    }
  }
  array_splice($parts, $at, 0, 'rua=mailto:' . $address);
  return implode('; ', $parts);
}

// The SPF record with $mechanism added before its "all" or redirect=, or a new record
function rabbittech_spf_with($record, $mechanism) {
  if ($record === null) {
    return 'v=spf1 ' . $mechanism . ' ~all';
  }
  $terms = preg_split('/\s+/', trim($record));
  foreach ($terms as $i => $term) {
    if (preg_match('/^[-~+?]?all$|^redirect=/i', $term)) {
      array_splice($terms, $i, 0, $mechanism);
      return implode(' ', $terms);
    }
  }
  $terms[] = $mechanism;
  return implode(' ', $terms);
}

// An MTA-STS policy file (RFC 8461 section 3.2): version, mode, max_age and mx patterns, or null
// when the text is not one
function rabbittech_sts_policy($text) {
  $policy = array('version' => '', 'mode' => '', 'max_age' => 0, 'mx' => array());
  foreach (preg_split('/\r?\n/', (string)$text) as $line) {
    $pair = explode(':', $line, 2);
    if (count($pair) !== 2) {
      continue;
    }
    $key = strtolower(trim($pair[0]));
    $value = trim($pair[1]);
    if ($key === 'mx') {
      $policy['mx'][] = strtolower(rtrim($value, '.'));
    }
    elseif ($key === 'max_age') {
      $policy['max_age'] = (int)$value;
    }
    elseif ($key === 'version' || $key === 'mode') {
      $policy[$key] = $value;
    }
  }
  return $policy['version'] === 'STSv1' && in_array($policy['mode'], array('enforce', 'testing', 'none'), true) ? $policy : null;
}

// Whether a host name matches one of an MTA-STS policy's mx patterns; "*.example.org" stands for
// exactly one more label on the left
function rabbittech_sts_mx_match($host, $patterns) {
  $host = strtolower(rtrim($host, '.'));
  foreach ($patterns as $pattern) {
    $pattern = strtolower(rtrim(trim($pattern), '.'));
    if ($pattern === $host) {
      return true;
    }
    $dot = strpos($host, '.');
    if (strpos($pattern, '*.') === 0 && $dot !== false && substr($host, $dot + 1) === substr($pattern, 2)) {
      return true;
    }
  }
  return false;
}

// Mail security of one domain as other mail servers see it. For each check: its state ('ok',
// 'missing', 'wrong', 'off': not set up, 'unknown': the lookup failed), the records to publish,
// what is published now ('found') and what exactly is wrong ('detail'). Lookups are passed in,
// so the tests can use their own DNS:
//   $dns($name, $type)   'MX': host names, 'TXT': texts; null when the lookup itself failed
//   $fetch($url)         ['status' => code, 'body' => text], or ['error' => 'dns'|'cert'|'connect']
//   $spf_hosts($domain)  the addresses the domain's SPF record allows, includes followed
// $server: hostname, ip, reports (the address DMARC and TLS reports go to; '' when not collected)
// $info: dkim (['selector' =>, 'txt' =>] or null: no key yet), sts (the domain's MTA-STS policy
// from the console, or null)
function rabbittech_domain_checks($domain, $server, $info, $dns, $fetch, $spf_hosts) {
  $host = strtolower($server['hostname']);
  $reports = strtolower((string)($server['reports'] ?? ''));
  $checks = array();
  $check = function ($state, $records = array(), $found = null, $detail = null) {
    return array('state' => $state, 'records' => $records, 'found' => $found, 'detail' => $detail);
  };
  $record = function ($name, $type, $value) {
    return array('name' => $name, 'type' => $type, 'value' => $value);
  };

  // MX: other servers deliver the domain's mail here
  $mx = $dns($domain, 'MX');
  $targets = $mx === null ? null : array_map(function ($target) { return strtolower(rtrim($target, '.')); }, $mx);
  $publish = array($record($domain, 'MX', '10 ' . $host));
  $checks['mx'] = $targets === null ? $check('unknown', $publish)
    : $check(in_array($host, $targets, true) ? 'ok' : ($targets ? 'wrong' : 'missing'), $publish, implode(', ', $targets));

  // SPF: this server may send the domain's mail. get_spf_allowed_hosts() drops CIDR sizes, so
  // ip4: ranges are checked here as well. Without the server's address there is nothing to check.
  $texts = (string)$server['ip'] === '' ? null : $dns($domain, 'TXT');
  if ($texts === null) {
    $checks['spf'] = $check('unknown', array($record($domain, 'TXT', rabbittech_spf_with(null, 'a:' . $host))));
  }
  else {
    $spf = array_values(array_filter($texts, function ($text) { return stripos(trim($text), 'v=spf1') === 0; }));
    $current = $spf ? $spf[0] : null;
    preg_match_all('/\bip4:([0-9.\/]+)/i', (string)$current, $ranges);
    $allowed = $current !== null && (in_array($server['ip'], (array)$spf_hosts($domain), true) || rabbittech_ip_in_cidrs($server['ip'], $ranges[1]));
    $state = !$spf ? 'missing' : (count($spf) > 1 ? 'wrong' : ($allowed ? 'ok' : 'wrong'));
    $checks['spf'] = $check($state, array($record($domain, 'TXT', $allowed ? $current : rabbittech_spf_with($current, 'a:' . $host))),
      $spf ? implode(' | ', $spf) : null, count($spf) > 1 ? 'several' : null);
  }

  // DKIM: the published key is the one mail is signed with
  if (empty($info['dkim']['txt'])) {
    $checks['dkim'] = $check('off');
  }
  else {
    $name = $info['dkim']['selector'] . '._domainkey.' . $domain;
    $publish = array($record($name, 'TXT', $info['dkim']['txt']));
    $published = $dns($name, 'TXT');
    if ($published === null) {
      $checks['dkim'] = $check('unknown', $publish);
    }
    else {
      // dkim_txt is split into quoted 255-character strings when SPLIT_DKIM_255 is set
      preg_match('/\bp=([^;]+)/', str_replace(array('"', ' '), '', $info['dkim']['txt']), $want);
      $state = 'missing';
      foreach ($published as $text) {
        if (preg_match('/\bp=([^;]+)/', str_replace(array('"', ' '), '', $text), $have)) {
          $state = isset($want[1]) && $have[1] === $want[1] ? 'ok' : ($state === 'ok' ? 'ok' : 'wrong');
        }
      }
      $checks['dkim'] = $check($state, $publish);
    }
  }

  // DMARC: what receivers do with mail that fails SPF and DKIM, and where they send reports
  $name = '_dmarc.' . $domain;
  $texts = $dns($name, 'TXT');
  $dmarc = $texts === null ? array() : rabbittech_records($texts, 'DMARC1');
  $current = count($dmarc) === 1 ? $dmarc[0] : null;
  $suggest = $current ?? 'v=DMARC1; p=none';
  if ($reports !== '') {
    $suggest = rabbittech_with_rua($suggest, $reports);
  }
  $publish = array($record($name, 'TXT', $suggest));
  $checks['dmarc'] = $texts === null ? $check('unknown', $publish)
    : $check(!$dmarc ? 'missing' : (count($dmarc) > 1 ? 'wrong' : 'ok'), $publish, $dmarc ? implode(' | ', $dmarc) : null, count($dmarc) > 1 ? 'several' : null);

  // DMARC reports reach the reports mailbox. An address at another domain also needs that
  // domain's consent (RFC 7489 section 7.1); a parent or subdomain doesn't.
  if ($reports !== '' && $current !== null) {
    $tags = rabbittech_record_tags($current, 'DMARC1');
    $report_domain = substr(strrchr($reports, '@'), 1);
    $related = $report_domain === $domain || substr('.' . $domain, -strlen('.' . $report_domain)) === '.' . $report_domain
      || substr('.' . $report_domain, -strlen('.' . $domain)) === '.' . $domain;
    $auth = $related ? null : $record($domain . '._report._dmarc.' . $report_domain, 'TXT', 'v=DMARC1');
    $publish = array($record($name, 'TXT', $suggest));
    if (!in_array($reports, rabbittech_rua_addresses($tags['rua'] ?? ''), true)) {
      $checks['dmarc_reports'] = $check(isset($tags['rua']) ? 'wrong' : 'missing', $auth ? array_merge($publish, array($auth)) : $publish, $tags['rua'] ?? null);
    }
    else {
      $checks['dmarc_reports'] = $check('ok', $publish, $tags['rua']);
      if ($auth) {
        $texts = $dns($auth['name'], 'TXT');
        $checks['dmarc_auth'] = $texts === null ? $check('unknown', array($auth))
          : $check(rabbittech_records($texts, 'DMARC1') ? 'ok' : 'missing', array($auth));
      }
    }
  }

  // MTA-STS: senders fetch the policy announced in DNS and then only deliver over TLS to the MX
  // hosts it names
  $sts = $info['sts'] ?? null;
  if (empty($sts) || (string)$sts['active'] !== '1' || !in_array($sts['mode'], array('testing', 'enforce'), true)) {
    $checks['mta_sts'] = $check('off');
  }
  else {
    $name = '_mta-sts.' . $domain;
    $publish = array($record($name, 'TXT', 'v=STSv1; id=' . $sts['id']));
    $texts = $dns($name, 'TXT');
    if ($texts === null) {
      $checks['mta_sts_txt'] = $check('unknown', $publish);
    }
    else {
      $found = rabbittech_records($texts, 'STSv1');
      $tags = $found ? rabbittech_record_tags($found[0], 'STSv1') : array();
      $state = !$found ? 'missing' : (count($found) > 1 ? 'wrong' : (($tags['id'] ?? '') === (string)$sts['id'] ? 'ok' : 'wrong'));
      $detail = count($found) > 1 ? 'several' : ($state === 'wrong' ? 'old_id' : null);
      $checks['mta_sts_txt'] = $check($state, $publish, $found ? implode(' | ', $found) : null, $detail);
    }

    $publish = array($record('mta-sts.' . $domain, 'CNAME', $host));
    $answer = $fetch('https://mta-sts.' . $domain . '/.well-known/mta-sts.txt');
    if (isset($answer['error'])) {
      $state = array('dns' => 'missing', 'cert' => 'wrong')[$answer['error']] ?? 'unknown';
      $checks['mta_sts_policy'] = $check($state, $publish, null, $answer['error']);
    }
    elseif ((int)$answer['status'] !== 200) {
      $checks['mta_sts_policy'] = $check('wrong', $publish, 'HTTP ' . (int)$answer['status'], 'http');
    }
    else {
      // mailcow serves the policy from the console's settings; a different one means another
      // server answers for mta-sts.<domain>
      $policy = rabbittech_sts_policy($answer['body']);
      $want = array_map(function ($mx) { return strtolower(rtrim(trim($mx), '.')); }, (array)$sts['mx']);
      $same = $policy !== null && $policy['mode'] === $sts['mode'] && !array_diff($want, $policy['mx']) && !array_diff($policy['mx'], $want);
      $checks['mta_sts_policy'] = $check($same ? 'ok' : 'wrong', $publish, null, $same ? null : 'content');
    }

    if ($targets) {
      $uncovered = array_values(array_filter($targets, function ($target) use ($sts) { return !rabbittech_sts_mx_match($target, (array)$sts['mx']); }));
      $checks['mta_sts_mx'] = $check($uncovered ? 'wrong' : 'ok', array(), implode(', ', array_map('trim', (array)$sts['mx'])), $uncovered ? implode(', ', $uncovered) : null)
        + array('enforce' => $sts['mode'] === 'enforce');
    }
  }

  // TLS reporting: senders say when they couldn't deliver over TLS
  $name = '_smtp._tls.' . $domain;
  $texts = $dns($name, 'TXT');
  $found = $texts === null ? array() : rabbittech_records($texts, 'TLSRPTv1');
  $publish = $reports === '' ? array() : array($record($name, 'TXT', rabbittech_with_rua(count($found) === 1 ? $found[0] : 'v=TLSRPTv1', $reports)));
  if ($texts === null) {
    $checks['tls_reports'] = $check('unknown', $publish);
  }
  elseif (!$found) {
    $checks['tls_reports'] = $check($reports === '' ? 'off' : 'missing', $publish);
  }
  else {
    $tags = rabbittech_record_tags($found[0], 'TLSRPTv1');
    $state = count($found) > 1 ? 'wrong' : ($reports !== '' && !in_array($reports, rabbittech_rua_addresses($tags['rua'] ?? ''), true) ? 'wrong' : 'ok');
    $checks['tls_reports'] = $check($state, $publish, implode(' | ', $found), count($found) > 1 ? 'several' : null);
  }
  return $checks;
}

// ---- DMARC aggregate reports and TLS reports, read by scripts/mail-reports.sh

// The leaf parts of a MIME message, depth-first: type, file name and decoded content. Enough for
// the reports mail providers send (a zip or gzip attachment, or the whole message body).
function rabbittech_mime_parts($raw, $depth = 0) {
  $split = preg_split("/^\r?\n|\r?\n\r?\n/", $raw, 2);
  $head = preg_replace("/\r?\n[ \t]+/", ' ', $split[0]);
  $body = $split[1] ?? '';
  $headers = array();
  foreach (preg_split("/\r?\n/", $head) as $line) {
    $pair = explode(':', $line, 2);
    if (count($pair) === 2 && !isset($headers[strtolower(trim($pair[0]))])) {
      $headers[strtolower(trim($pair[0]))] = trim($pair[1]);
    }
  }
  // A parameter of a header: name="x.zip", name=x.zip, or RFC 2231's name*=utf-8''x.zip
  $param = function ($header, $key) {
    if (preg_match('/;\s*' . $key . '\*=(?:[^\';]*\'[^\';]*\')?"?([^";]+)/i', ';' . $header, $m)) {
      return rawurldecode($m[1]);
    }
    return preg_match('/;\s*' . $key . '\s*=\s*(?:"([^"]*)"|([^;\s]+))/i', ';' . $header, $m) ? ($m[2] ?? '') . $m[1] : '';
  };
  $content_type = $headers['content-type'] ?? 'text/plain';
  $type = strtolower(trim(explode(';', $content_type)[0]));
  $boundary = $param($content_type, 'boundary');
  if (strpos($type, 'multipart/') === 0 && $boundary !== '' && $depth < 5) {
    $parts = array();
    $current = null;
    foreach (preg_split("/\r?\n/", $body) as $line) {
      $trimmed = rtrim($line);
      if ($trimmed === '--' . $boundary || $trimmed === '--' . $boundary . '--') {
        if ($current !== null) {
          $parts = array_merge($parts, rabbittech_mime_parts(implode("\n", $current), $depth + 1));
        }
        $current = $trimmed === '--' . $boundary ? array() : null;
        if ($current === null) {
          break;
        }
      }
      elseif ($current !== null) {
        $current[] = $line;
      }
    }
    if ($current) {
      $parts = array_merge($parts, rabbittech_mime_parts(implode("\n", $current), $depth + 1));
    }
    return $parts;
  }
  $encoding = strtolower(trim($headers['content-transfer-encoding'] ?? ''));
  if ($encoding === 'base64') {
    $body = (string)base64_decode(preg_replace('/[^A-Za-z0-9+\/=]/', '', $body));
  }
  elseif ($encoding === 'quoted-printable') {
    $body = quoted_printable_decode($body);
  }
  $name = $param($headers['content-disposition'] ?? '', 'filename');
  return array(array('type' => $type, 'name' => $name !== '' ? $name : $param($content_type, 'name'), 'body' => $body));
}

// The content of a gzip file or of a zip file's first file, or the data itself; null when it
// can't be unpacked or would be over $limit bytes
function rabbittech_unpack($data, $limit = 20971520) {
  if (strncmp($data, "\x1f\x8b", 2) === 0) {
    $out = @gzdecode($data, $limit + 1);
    return $out === false || strlen($out) > $limit ? null : $out;
  }
  if (strncmp($data, "PK\x03\x04", 4) === 0) {
    if (!class_exists('ZipArchive')) {
      return null;
    }
    $file = tempnam(sys_get_temp_dir(), 'rt-report');
    file_put_contents($file, $data);
    $zip = new ZipArchive();
    $out = null;
    if ($zip->open($file) === true) {
      for ($i = 0; $i < $zip->numFiles && $out === null; $i++) {
        if (substr((string)$zip->getNameIndex($i), -1) !== '/') {
          $out = $zip->getFromIndex($i, $limit + 1);
          $out = $out === false || strlen($out) > $limit ? false : $out;
        }
      }
      $zip->close();
    }
    unlink($file);
    return is_string($out) ? $out : null;
  }
  return strlen($data) <= $limit ? $data : null;
}

// A DMARC aggregate report (RFC 7489 appendix C): reporter, report id, period, domain, policy
// and per sending address the message count and DMARC results; null when the XML isn't one
function rabbittech_dmarc_report($xml) {
  $previous = libxml_use_internal_errors(true);
  $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET);
  libxml_clear_errors();
  libxml_use_internal_errors($previous);
  if ($doc === false || $doc->getName() !== 'feedback') {
    return null;
  }
  $meta = $doc->report_metadata;
  $report = array(
    'org' => trim((string)$meta->org_name),
    'id' => trim((string)$meta->report_id),
    'begin' => (int)$meta->date_range->begin,
    'end' => (int)$meta->date_range->end,
    'domain' => strtolower(trim((string)$doc->policy_published->domain)),
    'p' => strtolower(trim((string)$doc->policy_published->p)),
    'rows' => array(),
  );
  if ($report['id'] === '' || $report['domain'] === '' || $report['end'] <= 0) {
    return null;
  }
  foreach ($doc->record as $record) {
    $ip = trim((string)$record->row->source_ip);
    if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
      continue;
    }
    $evaluated = $record->row->policy_evaluated;
    $report['rows'][] = array(
      'ip' => $ip,
      'count' => max(0, (int)$record->row->count),
      'disposition' => strtolower(trim((string)$evaluated->disposition)),
      'dkim' => strtolower(trim((string)$evaluated->dkim)) === 'pass',
      'spf' => strtolower(trim((string)$evaluated->spf)) === 'pass',
    );
  }
  // A big sender's report can list thousands of addresses; the busiest 500 are plenty
  usort($report['rows'], function ($a, $b) { return $b['count'] - $a['count']; });
  $report['rows'] = array_slice($report['rows'], 0, 500);
  return $report;
}

// A TLS report (RFC 8460 section 4): reporter, report id, period, and per policy the successful
// and failed TLS sessions with the failure types; null when the JSON isn't one
function rabbittech_tls_report($json) {
  $data = json_decode($json, true);
  if (!is_array($data) || !isset($data['policies']) || !is_array($data['policies'])) {
    return null;
  }
  $report = array(
    'org' => trim((string)($data['organization-name'] ?? '')),
    'id' => trim((string)($data['report-id'] ?? '')),
    'begin' => (int)strtotime((string)($data['date-range']['start-datetime'] ?? '')),
    'end' => (int)strtotime((string)($data['date-range']['end-datetime'] ?? '')),
    'policies' => array(),
  );
  if ($report['id'] === '' || $report['end'] <= 0) {
    return null;
  }
  foreach ($data['policies'] as $item) {
    $failures = array();
    foreach ((array)($item['failure-details'] ?? array()) as $failure) {
      $type = strtolower((string)($failure['result-type'] ?? 'unknown'));
      $failures[$type] = ($failures[$type] ?? 0) + (int)($failure['failed-session-count'] ?? 0);
    }
    $report['policies'][] = array(
      'domain' => strtolower(trim((string)($item['policy']['policy-domain'] ?? ''))),
      'type' => (string)($item['policy']['policy-type'] ?? ''),
      'ok' => (int)($item['summary']['total-successful-session-count'] ?? 0),
      'failed' => (int)($item['summary']['total-failure-session-count'] ?? 0),
      'failures' => $failures,
    );
  }
  return $report;
}

// The DMARC and TLS reports in one message, in any of its parts
function rabbittech_message_reports($raw) {
  $found = array('dmarc' => array(), 'tls' => array());
  foreach (rabbittech_mime_parts($raw) as $part) {
    $data = rabbittech_unpack($part['body']);
    $data = $data === null ? '' : ltrim($data, "\xEF\xBB\xBF \t\r\n");
    if ($data !== '' && $data[0] === '<' && ($report = rabbittech_dmarc_report($data)) !== null) {
      $found['dmarc'][] = $report;
    }
    elseif ($data !== '' && $data[0] === '{' && ($report = rabbittech_tls_report($data)) !== null) {
      $found['tls'][] = $report;
    }
  }
  return $found;
}

// Adds reports to the kept ones: a report sent twice is kept once, and reports that ended more
// than $days ago are dropped. $resolve($ip) gives the reverse DNS name of a new sending address,
// at most 50 lookups per call; the rest are looked up next time.
function rabbittech_reports_add($state, $found, $now, $resolve, $days = 31) {
  $state = (array)$state + array('dmarc' => array(), 'tls' => array(), 'hosts' => array());
  foreach (array('dmarc', 'tls') as $kind) {
    foreach ($found[$kind] ?? array() as $report) {
      $state[$kind][strtolower($report['org']) . '|' . $report['id']] = $report;
    }
    $state[$kind] = array_filter((array)$state[$kind], function ($report) use ($now, $days) {
      return $report['end'] >= $now - $days * 86400;
    });
    if (count($state[$kind]) > 3000) {
      uasort($state[$kind], function ($a, $b) { return $b['end'] - $a['end']; });
      $state[$kind] = array_slice($state[$kind], 0, 3000, true);
    }
  }
  $ips = array();
  foreach ($state['dmarc'] as $report) {
    foreach ($report['rows'] as $row) {
      $ips[$row['ip']] = true;
    }
  }
  $state['hosts'] = array_intersect_key((array)$state['hosts'], $ips);
  $lookups = 0;
  foreach (array_keys($ips) as $ip) {
    if (!isset($state['hosts'][$ip]) && $lookups++ < 50) {
      $name = $resolve((string)$ip);
      $state['hosts'][$ip] = is_string($name) && $name !== $ip ? strtolower(rtrim($name, '.')) : '';
    }
  }
  return $state;
}

// What the kept reports say about the last $days days: per domain the messages receivers saw,
// how many passed DMARC (aligned SPF or DKIM), and the TLS sessions that succeeded and failed;
// the $top sending addresses with the most messages; the reporters; and the domains whose mail
// from this server ($server_ip) failed DMARC. Anyone can send a report, so only reports about
// $domains (the server's own; null: any) count.
function rabbittech_reports_summary($state, $now, $server_ip, $days = 30, $top = 8, $domains = null) {
  $since = $now - $days * 86400;
  $ours = $domains === null ? null : array_flip(array_map('strtolower', $domains));
  $domains = array();
  $senders = array();
  $reporters = array();
  $self_failed = array();
  $count = 0;
  $blank = array('messages' => 0, 'passed' => 0, 'tls_ok' => 0, 'tls_failed' => 0, 'tls_failures' => array());
  foreach (($state['dmarc'] ?? array()) as $report) {
    if ($report['end'] < $since || ($ours !== null && !isset($ours[$report['domain']]))) {
      continue;
    }
    $count++;
    $reporters[$report['org']] = true;
    $domain = $report['domain'];
    $domains[$domain] = ($domains[$domain] ?? array()) + $blank;
    foreach ($report['rows'] as $row) {
      $pass = $row['dkim'] || $row['spf'];
      $domains[$domain]['messages'] += $row['count'];
      $domains[$domain]['passed'] += $pass ? $row['count'] : 0;
      $sender = $senders[$row['ip']] ?? array('ip' => $row['ip'], 'host' => $state['hosts'][$row['ip']] ?? '', 'server' => $row['ip'] === $server_ip,
        'messages' => 0, 'passed' => 0, 'domains' => array());
      $sender['messages'] += $row['count'];
      $sender['passed'] += $pass ? $row['count'] : 0;
      $sender['domains'][$domain] = true;
      $senders[$row['ip']] = $sender;
      if ($row['ip'] === $server_ip && !$pass && $row['count'] > 0) {
        $self_failed[$domain] = ($self_failed[$domain] ?? 0) + $row['count'];
      }
    }
  }
  foreach (($state['tls'] ?? array()) as $report) {
    $policies = array_filter($report['policies'], function ($policy) use ($ours) { return $ours === null || isset($ours[$policy['domain']]); });
    if ($report['end'] < $since || !$policies) {
      continue;
    }
    $count++;
    $reporters[$report['org']] = true;
    foreach ($policies as $policy) {
      $domain = $policy['domain'];
      $domains[$domain] = ($domains[$domain] ?? array()) + $blank;
      $domains[$domain]['tls_ok'] += $policy['ok'];
      $domains[$domain]['tls_failed'] += $policy['failed'];
      foreach ($policy['failures'] as $type => $failed) {
        $domains[$domain]['tls_failures'][$type] = ($domains[$domain]['tls_failures'][$type] ?? 0) + $failed;
      }
    }
  }
  ksort($domains);
  foreach ($domains as $domain => $totals) {
    arsort($domains[$domain]['tls_failures']);
  }
  usort($senders, function ($a, $b) { return $b['messages'] - $a['messages'] ?: strcmp($a['ip'], $b['ip']); });
  foreach ($senders as $i => $sender) {
    $senders[$i]['domains'] = array_keys($sender['domains']);
  }
  $reporters = array_keys($reporters);
  sort($reporters);
  ksort($self_failed);
  return array('reports' => $count, 'domains' => $domains, 'senders' => array_slice($senders, 0, $top),
    'more_senders' => max(0, count($senders) - $top), 'reporters' => $reporters, 'self_failed' => $self_failed);
}
