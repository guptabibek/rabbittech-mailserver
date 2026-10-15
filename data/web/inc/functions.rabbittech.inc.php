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
