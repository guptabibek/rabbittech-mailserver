<?php
// Tests the pure helpers behind the Overview checks (data/web/inc/functions.rabbittech.inc.php).
// Run: php tests/php/overview-checks.php
require __DIR__ . '/../../data/web/inc/functions.rabbittech.inc.php';

$passed = 0;
$failed = 0;
function check($name, $ok, $detail = '') {
  global $passed, $failed;
  if ($ok) { $passed++; echo "  ok   $name\n"; }
  else { $failed++; echo "  FAIL $name" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

// A message as the ACME container stores it in ACME_LOG (data/Dockerfiles/acme/functions.sh)
function acme($text) {
  return strtr('mail.rabbittech.com.np - ' . $text, array_fill_keys(str_split("%&;\$\"[]{}-\r\n"), ' '));
}
// ACME_LOG lists the newest message first
function newest_first(...$texts) {
  return array_map('acme', array_reverse($texts));
}

echo "ACME log\n";

// The log from mail.rabbittech.com.np on 15 Oct 2026, oldest first
$aaaa_cycle = array(
  'Detecting IP addresses...',
  'OK: 94.136.186.45, 0000:0000:0000:0000:0000:0000:0000:0000',
  'Found AAAA record for mail.rabbittech.com.np: 2400:d321:2286:5738::1 - skipping A record check',
  'Cannot match your IP 0000:0000:0000:0000:0000:0000:0000:0000 against hostname mail.rabbittech.com.np (DNS returned 2400:d321:2286:5738:0000:0000:0000:0001)',
  'Cannot validate any hostnames, skipping Let\'s Encrypt for 1 hour.',
  'Use SKIP_LETS_ENCRYPT=y in mailcow.conf to skip it permanently.',
);
$reason = rabbittech_acme_reason(newest_first(...$aaaa_cycle));
check('an AAAA record mailcow cannot use is named, with its address', $reason === array('aaaa', array('mail.rabbittech.com.np', '2400:d321:2286:5738:0000:0000:0000:0001')), json_encode($reason));

$fixed = array_merge($aaaa_cycle, array(
  'Found A record for mail.rabbittech.com.np: 94.136.186.45',
  'Confirmed A record 94.136.186.45',
  'Certificate /var/lib/acme/mail.rabbittech.com.np/cert.pem missing or changed domains \'mail.rabbittech.com.np\' - start obtaining',
  'Certificate successfully obtained',
  'Reloading or restarting services... (1)',
  'Certificates successfully requested and renewed where required, sleeping one day',
));
check('a later success clears the reason', rabbittech_acme_reason(newest_first(...$fixed)) === null);
check('"Certificates were successfully validated" counts as success', rabbittech_acme_reason(newest_first(...array_merge($aaaa_cycle, array('Certificates were successfully validated, no changes or renewals required, sleeping for another day.')))) === null);

$cases = array(
  'skip' => array(array('SKIP_LETS_ENCRYPT=y, skipping Let\'s Encrypt...'), array()),
  'dns_ip' => array(array('Found A record for mail.rabbittech.com.np: 203.0.113.9', 'Cannot match your IP 94.136.186.45 against hostname mail.rabbittech.com.np (DNS returned 203.0.113.9)', 'Cannot validate any hostnames, skipping Let\'s Encrypt for 1 hour.'), array('mail.rabbittech.com.np', '203.0.113.9', '94.136.186.45')),
  'no_dns' => array(array('No A or AAAA record found for hostname mail.rabbittech.com.np', 'Cannot validate any hostnames, skipping Let\'s Encrypt for 1 hour.'), array('mail.rabbittech.com.np')),
  'http' => array(array('Found A record for mail.rabbittech.com.np: 94.136.186.45', 'Confirmed A record with IP 94.136.186.45, but HTTP validation failed', 'Cannot validate any hostnames, skipping Let\'s Encrypt for 1 hour.'), array('94.136.186.45')),
  'caa' => array(array('Skipping ACME validation for mail.rabbittech.com.np: Lets Encrypt disallowed for mail.rabbittech.com.np by CAA record'), array('mail.rabbittech.com.np')),
  'custom' => array(array('Found certificate with issuer other than mailcow snake-oil CA and Let\'s Encrypt, skipping ACME client...'), array()),
  'error' => array(array('Verifying mail.rabbittech.com.np...', 'Some errors occurred, retrying in 30 minutes...'), array()),
);
foreach ($cases as $key => $case) {
  $reason = rabbittech_acme_reason(newest_first(...$case[0]));
  check("reason: $key", $reason === array($key, $case[1]), json_encode($reason));
}
check('"Use SKIP_LETS_ENCRYPT=y ... to skip it" is not mistaken for SKIP_LETS_ENCRYPT=y', rabbittech_acme_reason(newest_first('Use SKIP_LETS_ENCRYPT=y in mailcow.conf to skip it permanently.')) === null);
check('an empty log gives no reason', rabbittech_acme_reason(array()) === null);

echo "SPF ranges\n";
check('address in a /24', rabbittech_ip_in_cidrs('94.136.186.45', array('94.136.186.0/24')));
check('address outside a /24', !rabbittech_ip_in_cidrs('94.136.187.45', array('94.136.186.0/24')));
check('exact address without a prefix', rabbittech_ip_in_cidrs('94.136.186.45', array('10.0.0.0/8', '94.136.186.45')));
check('/0 matches everything', rabbittech_ip_in_cidrs('8.8.8.8', array('0.0.0.0/0')));
check('IPv6 and junk are ignored', !rabbittech_ip_in_cidrs('94.136.186.45', array('2400::/32', 'mail.example', '1.2.3.4/40')));

echo "Lists\n";
check('up to three items in full', rabbittech_list(array('a.com', 'b.com'), '%s and %d more') === 'a.com, b.com');
check('more are counted', rabbittech_list(array('a', 'b', 'c', 'd', 'e'), '%s and %d more') === 'a, b, c and 2 more');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
