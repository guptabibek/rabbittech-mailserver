<?php
// Tests the mail security helpers (data/web/inc/functions.rabbittech.inc.php): the DNS checks
// behind the Overview and a domain's Mail security panel, and the reading of DMARC and TLS reports
// for scripts/mail-reports.sh. Run: php tests/php/mail-security.php
require __DIR__ . '/../../data/web/inc/functions.rabbittech.inc.php';

$passed = 0;
$failed = 0;
function check($name, $ok, $detail = '') {
  global $passed, $failed;
  if ($ok) { $passed++; echo "  ok   $name\n"; }
  else { $failed++; echo "  FAIL $name" . ($detail !== '' ? " — $detail" : '') . "\n"; }
}

echo "Records\n";
check('DMARC tags, any case and spacing', rabbittech_record_tags(' v=DMARC1 ;p=reject; RUA = mailto:a@x.org ', 'DMARC1') === array('v' => 'DMARC1', 'p' => 'reject', 'rua' => 'mailto:a@x.org'));
check('another version is not a record of this one', rabbittech_record_tags('v=spf1 -all', 'DMARC1') === null && rabbittech_record_tags('p=none', 'DMARC1') === null);
check('only the records of that version', rabbittech_records(array('v=spf1 -all', 'v=STSv1; id=1', 'google-site-verification=x'), 'STSv1') === array('v=STSv1; id=1'));
check('rua addresses: size limits dropped, lower-case', rabbittech_rua_addresses('mailto:Reports@X.org!10m, mailto:b%40y@z.org,https://r.example/tls') === array('reports@x.org', 'b@y@z.org'));
check('rua added after p=', rabbittech_with_rua('v=DMARC1; p=reject; sp=none; pct=100;', 'r@x.org') === 'v=DMARC1; p=reject; rua=mailto:r@x.org; sp=none; pct=100');
check('rua address added to the ones already there', rabbittech_with_rua('v=DMARC1; p=none; rua=mailto:dmarc@vendor.example', 'r@x.org') === 'v=DMARC1; p=none; rua=mailto:dmarc@vendor.example,mailto:r@x.org');
check('rua that already has the address stays as it is', rabbittech_with_rua('v=DMARC1; p=none; rua=mailto:R@x.org', 'r@x.org') === 'v=DMARC1; p=none; rua=mailto:R@x.org');
check('TLS reporting record gets rua= after v=', rabbittech_with_rua('v=TLSRPTv1', 'r@x.org') === 'v=TLSRPTv1; rua=mailto:r@x.org');
check('SPF mechanism goes before all', rabbittech_spf_with('v=spf1 include:_spf.google.com ~all', 'a:mail.x.org') === 'v=spf1 include:_spf.google.com a:mail.x.org ~all');
check('SPF mechanism goes before redirect=', rabbittech_spf_with('v=spf1 redirect=_spf.x.org', 'a:mail.x.org') === 'v=spf1 a:mail.x.org redirect=_spf.x.org');
check('SPF record for a domain without one', rabbittech_spf_with(null, 'a:mail.x.org') === 'v=spf1 a:mail.x.org ~all');

echo "MTA-STS policies\n";
$policy = rabbittech_sts_policy("version: STSv1\r\nmode: enforce\r\nmx: mail.x.org\r\nmx: *.backup.x.org.\r\nmax_age: 604800\r\n");
check('policy file read', $policy === array('version' => 'STSv1', 'mode' => 'enforce', 'max_age' => 604800, 'mx' => array('mail.x.org', '*.backup.x.org')), json_encode($policy));
check('not a policy: HTML error page, unknown mode', rabbittech_sts_policy('<html>404</html>') === null && rabbittech_sts_policy("version: STSv1\nmode: strict\n") === null);
check('mx pattern: exact host, any case, trailing dot', rabbittech_sts_mx_match('Mail.X.org.', array('mail.x.org')));
check('mx pattern: a wildcard covers one label', rabbittech_sts_mx_match('mx1.backup.x.org', array('*.backup.x.org')) && !rabbittech_sts_mx_match('a.mx1.backup.x.org', array('*.backup.x.org')));
check('mx pattern: the wildcard does not cover the bare domain', !rabbittech_sts_mx_match('backup.x.org', array('*.backup.x.org')));

echo "Domain checks\n";
// A domain set up completely: rabbittech.com.np on mail.rabbittech.com.np, reports to
// reports@rabbittech.com.np, MTA-STS in enforce mode
$server = array('hostname' => 'mail.rabbittech.com.np', 'ip' => '94.136.186.45', 'reports' => 'reports@rabbittech.com.np');
$dkim_txt = 'v=DKIM1;k=rsa;t=s;s=email;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2k8';
$sts = array('id' => '20261016120000', 'mode' => 'enforce', 'mx' => array('mail.rabbittech.com.np'), 'active' => '1', 'max_age' => 604800, 'version' => 'STSv1');
$info = array('dkim' => array('selector' => 'dkim', 'txt' => $dkim_txt), 'sts' => $sts);
function zone($changes = array()) {
  return $changes + array(
    'MX rabbittech.com.np' => array('mail.rabbittech.com.np'),
    'TXT rabbittech.com.np' => array('v=spf1 mx a:mail.rabbittech.com.np -all', 'google-site-verification=abc'),
    'TXT dkim._domainkey.rabbittech.com.np' => array('v=DKIM1; k=rsa; t=s; s=email; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2k8'),
    'TXT _dmarc.rabbittech.com.np' => array('v=DMARC1; p=quarantine; rua=mailto:reports@rabbittech.com.np'),
    'TXT _mta-sts.rabbittech.com.np' => array('v=STSv1; id=20261016120000'),
    'TXT _smtp._tls.rabbittech.com.np' => array('v=TLSRPTv1; rua=mailto:reports@rabbittech.com.np'),
    'https://mta-sts.rabbittech.com.np/.well-known/mta-sts.txt' => array('status' => 200, 'body' => "version: STSv1\nmode: enforce\nmx: mail.rabbittech.com.np\nmax_age: 604800\n"),
  );
}
function checks($domain, $zone, $server, $info) {
  $dns = function ($name, $type) use ($zone) {
    $records = $zone["$type $name"] ?? array();
    return $records === false ? null : $records;
  };
  $fetch = function ($url) use ($zone) { return $zone[$url] ?? array('error' => 'dns'); };
  $spf_hosts = function ($domain) use ($zone, $server) {
    return strpos(implode(' ', $zone["TXT $domain"] ?? array()), 'a:' . $server['hostname']) !== false ? array($server['ip']) : array();
  };
  global $seen;
  $result = rabbittech_domain_checks($domain, $server, $info, $dns, $fetch, $spf_hosts);
  // The texts templates/rabbittech/mail-security.twig looks up for these results
  foreach ($result as $key => $check) {
    $seen["ms_$key"] = $seen["ms_{$key}_why"] = $seen["ms_state_{$check['state']}"] = true;
    if ($check['detail'] !== null) {
      $seen[$key === 'mta_sts_mx' ? 'ms_detail_uncovered' : "ms_detail_{$check['detail']}"] = true;
    }
  }
  return $result;
}
function states($checks) {
  return array_map(function ($check) { return $check['state']; }, $checks);
}
function record_values($check) {
  return array_map(function ($record) { return $record['name'] . ' ' . $record['type'] . ' ' . $record['value']; }, $check['records']);
}

$all = checks('rabbittech.com.np', zone(), $server, $info);
check('a domain set up completely passes every check', states($all) === array('mx' => 'ok', 'spf' => 'ok', 'dkim' => 'ok', 'dmarc' => 'ok', 'dmarc_reports' => 'ok',
  'mta_sts_txt' => 'ok', 'mta_sts_policy' => 'ok', 'mta_sts_mx' => 'ok', 'tls_reports' => 'ok'), json_encode(states($all)));
check('MTA-STS MX check notes enforce mode', $all['mta_sts_mx']['enforce'] === true);

$c = checks('rabbittech.com.np', zone(array('MX rabbittech.com.np' => false, 'TXT _dmarc.rabbittech.com.np' => false, 'https://mta-sts.rabbittech.com.np/.well-known/mta-sts.txt' => array('error' => 'connect'))), $server, $info);
check('a failed lookup is "unknown", never a problem', $c['mx']['state'] === 'unknown' && $c['dmarc']['state'] === 'unknown' && $c['mta_sts_policy']['state'] === 'unknown'
  && !isset($c['mta_sts_mx']) && !isset($c['dmarc_reports']), json_encode(states($c)));

$c = checks('rabbittech.com.np', zone(array('MX rabbittech.com.np' => array('mx.other.example'))), $server, $info);
check('MX elsewhere is wrong and says where', $c['mx']['state'] === 'wrong' && $c['mx']['found'] === 'mx.other.example'
  && record_values($c['mx']) === array('rabbittech.com.np MX 10 mail.rabbittech.com.np'));

$c = checks('rabbittech.com.np', zone(array('TXT rabbittech.com.np' => array('v=spf1 include:_spf.google.com ~all'))), $server, $info);
check('SPF without this server: the record to publish adds it', $c['spf']['state'] === 'wrong'
  && record_values($c['spf']) === array('rabbittech.com.np TXT v=spf1 include:_spf.google.com a:mail.rabbittech.com.np ~all'));
$c = checks('rabbittech.com.np', zone(array('TXT rabbittech.com.np' => array('v=spf1 ip4:94.136.186.0/24 -all'))), $server, $info);
check('SPF ip4: range with this server is fine', $c['spf']['state'] === 'ok');
$c = checks('rabbittech.com.np', zone(array('TXT rabbittech.com.np' => array('v=spf1 a:mail.rabbittech.com.np -all', 'v=spf1 mx -all'))), $server, $info);
check('two SPF records are wrong, even when one is right', $c['spf']['state'] === 'wrong' && $c['spf']['detail'] === 'several');
$c = checks('rabbittech.com.np', zone(array('TXT rabbittech.com.np' => array())), $server, $info);
check('no SPF record', $c['spf']['state'] === 'missing' && record_values($c['spf']) === array('rabbittech.com.np TXT v=spf1 a:mail.rabbittech.com.np ~all'));
$c = checks('rabbittech.com.np', zone(), array('ip' => '') + $server, $info);
check('without the server\'s address SPF can\'t be checked', $c['spf']['state'] === 'unknown');

$c = checks('rabbittech.com.np', zone(), $server, array('dkim' => null) + $info);
check('no DKIM key yet is "off"', $c['dkim']['state'] === 'off');
$c = checks('rabbittech.com.np', zone(array('TXT dkim._domainkey.rabbittech.com.np' => array('v=DKIM1; k=rsa; p=OLDKEY'))), $server, $info);
check('an old DKIM key in DNS is wrong', $c['dkim']['state'] === 'wrong');
$c = checks('rabbittech.com.np', zone(array('TXT dkim._domainkey.rabbittech.com.np' => array('"v=DKIM1; k=rsa; t=s; s=email; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB" "CgKCAQEAx2k8"'))), $server, $info);
check('a DKIM key split into quoted strings matches', $c['dkim']['state'] === 'ok');

$c = checks('rabbittech.com.np', zone(array('TXT _dmarc.rabbittech.com.np' => array())), $server, $info);
check('no DMARC record: publish one that only monitors and sends reports here', $c['dmarc']['state'] === 'missing' && !isset($c['dmarc_reports'])
  && record_values($c['dmarc']) === array('_dmarc.rabbittech.com.np TXT v=DMARC1; p=none; rua=mailto:reports@rabbittech.com.np'));
$c = checks('rabbittech.com.np', zone(array('TXT _dmarc.rabbittech.com.np' => array('v=DMARC1; p=reject'))), $server, $info);
check('DMARC without rua: keep the policy, add the reports address', $c['dmarc']['state'] === 'ok' && $c['dmarc_reports']['state'] === 'missing'
  && record_values($c['dmarc_reports']) === array('_dmarc.rabbittech.com.np TXT v=DMARC1; p=reject; rua=mailto:reports@rabbittech.com.np'));
$c = checks('rabbittech.com.np', zone(array('TXT _dmarc.rabbittech.com.np' => array('v=DMARC1; p=none; rua=mailto:x@vendor.example'))), $server, $info);
check('DMARC reports going elsewhere are "wrong", and ours is added', $c['dmarc_reports']['state'] === 'wrong'
  && record_values($c['dmarc_reports']) === array('_dmarc.rabbittech.com.np TXT v=DMARC1; p=none; rua=mailto:x@vendor.example,mailto:reports@rabbittech.com.np'));
$c = checks('rabbittech.com.np', zone(array('TXT _dmarc.rabbittech.com.np' => array('v=DMARC1; p=none', 'v=DMARC1; p=reject'))), $server, $info);
check('two DMARC records are wrong', $c['dmarc']['state'] === 'wrong' && $c['dmarc']['detail'] === 'several');

// Another domain sending its reports to reports@rabbittech.com.np needs rabbittech.com.np's consent
$shop = array('MX shop.example' => array('mail.rabbittech.com.np'), 'TXT shop.example' => array('v=spf1 a:mail.rabbittech.com.np -all'),
  'TXT _dmarc.shop.example' => array('v=DMARC1; p=none'), 'TXT _smtp._tls.shop.example' => array());
$c = checks('shop.example', $shop, $server, array('dkim' => null, 'sts' => null));
check('another domain: the reports record comes with the consent record', $c['dmarc_reports']['state'] === 'missing' && record_values($c['dmarc_reports']) === array(
  '_dmarc.shop.example TXT v=DMARC1; p=none; rua=mailto:reports@rabbittech.com.np', 'shop.example._report._dmarc.rabbittech.com.np TXT v=DMARC1'), json_encode(record_values($c['dmarc_reports'])));
$shop['TXT _dmarc.shop.example'] = array('v=DMARC1; p=none; rua=mailto:reports@rabbittech.com.np');
$c = checks('shop.example', $shop, $server, array('dkim' => null, 'sts' => null));
check('another domain: a missing consent record is found', $c['dmarc_reports']['state'] === 'ok' && $c['dmarc_auth']['state'] === 'missing');
$shop['TXT shop.example._report._dmarc.rabbittech.com.np'] = array('v=DMARC1');
$c = checks('shop.example', $shop, $server, array('dkim' => null, 'sts' => null));
check('another domain: with the consent record all is fine', $c['dmarc_auth']['state'] === 'ok');
$c = checks('lists.rabbittech.com.np', array('TXT _dmarc.lists.rabbittech.com.np' => array('v=DMARC1; p=none; rua=mailto:reports@rabbittech.com.np')), $server, array('dkim' => null, 'sts' => null));
check('a subdomain needs no consent record', $c['dmarc_reports']['state'] === 'ok' && !isset($c['dmarc_auth']));

$c = checks('rabbittech.com.np', zone(), $server, array('sts' => null) + $info);
check('no MTA-STS policy is "off", with nothing else checked', $c['mta_sts']['state'] === 'off' && !isset($c['mta_sts_txt']) && !isset($c['mta_sts_policy']));
$c = checks('rabbittech.com.np', zone(), $server, array('sts' => array('active' => '0') + $sts) + $info);
check('an inactive policy is "off"', $c['mta_sts']['state'] === 'off');
$c = checks('rabbittech.com.np', zone(), $server, array('sts' => array('mode' => 'none') + $sts) + $info);
check('a policy in mode none is "off"', $c['mta_sts']['state'] === 'off');
$c = checks('rabbittech.com.np', zone(array('TXT _mta-sts.rabbittech.com.np' => array())), $server, $info);
check('no _mta-sts record: senders never look for the policy', $c['mta_sts_txt']['state'] === 'missing'
  && record_values($c['mta_sts_txt']) === array('_mta-sts.rabbittech.com.np TXT v=STSv1; id=20261016120000'));
$c = checks('rabbittech.com.np', zone(array('TXT _mta-sts.rabbittech.com.np' => array('v=STSv1;id=20250101000000;'))), $server, $info);
check('an _mta-sts id from an older policy is wrong', $c['mta_sts_txt']['state'] === 'wrong' && $c['mta_sts_txt']['detail'] === 'old_id');
$c = checks('rabbittech.com.np', zone(array('TXT _mta-sts.rabbittech.com.np' => array('v=STSv1;id=20261016120000;'))), $server, $info);
check('the _mta-sts record as mailcow shows it (no spaces) is fine', $c['mta_sts_txt']['state'] === 'ok');
foreach (array('dns' => 'missing', 'cert' => 'wrong') as $error => $state) {
  $c = checks('rabbittech.com.np', zone(array('https://mta-sts.rabbittech.com.np/.well-known/mta-sts.txt' => array('error' => $error))), $server, $info);
  check("policy unreachable ($error)", $c['mta_sts_policy']['state'] === $state && $c['mta_sts_policy']['detail'] === $error
    && record_values($c['mta_sts_policy']) === array('mta-sts.rabbittech.com.np CNAME mail.rabbittech.com.np'));
}
$c = checks('rabbittech.com.np', zone(array('https://mta-sts.rabbittech.com.np/.well-known/mta-sts.txt' => array('status' => 404, 'body' => 'Not found'))), $server, $info);
check('policy answered with an error page', $c['mta_sts_policy']['state'] === 'wrong' && $c['mta_sts_policy']['detail'] === 'http' && $c['mta_sts_policy']['found'] === 'HTTP 404');
$c = checks('rabbittech.com.np', zone(array('https://mta-sts.rabbittech.com.np/.well-known/mta-sts.txt' => array('status' => 200, 'body' => "version: STSv1\nmode: testing\nmx: mail.rabbittech.com.np\nmax_age: 86400\n"))), $server, $info);
check('a policy that differs from the console is wrong (another server answers)', $c['mta_sts_policy']['state'] === 'wrong' && $c['mta_sts_policy']['detail'] === 'content');
$c = checks('rabbittech.com.np', zone(array('MX rabbittech.com.np' => array('mail.rabbittech.com.np', 'backup-mx.example.net'))), $server, $info);
check('an MX host the policy doesn\'t list is named', $c['mta_sts_mx']['state'] === 'wrong' && $c['mta_sts_mx']['detail'] === 'backup-mx.example.net'
  && $c['mta_sts_mx']['found'] === 'mail.rabbittech.com.np');

$c = checks('rabbittech.com.np', zone(array('TXT _smtp._tls.rabbittech.com.np' => array())), $server, $info);
check('no TLS reporting record', $c['tls_reports']['state'] === 'missing'
  && record_values($c['tls_reports']) === array('_smtp._tls.rabbittech.com.np TXT v=TLSRPTv1; rua=mailto:reports@rabbittech.com.np'));
$c = checks('rabbittech.com.np', zone(array('TXT _smtp._tls.rabbittech.com.np' => array('v=TLSRPTv1; rua=mailto:tls@vendor.example'))), $server, $info);
check('TLS reports going elsewhere', $c['tls_reports']['state'] === 'wrong'
  && record_values($c['tls_reports']) === array('_smtp._tls.rabbittech.com.np TXT v=TLSRPTv1; rua=mailto:tls@vendor.example,mailto:reports@rabbittech.com.np'));
$none = array('reports' => '') + $server;
$c = checks('rabbittech.com.np', zone(array('TXT _smtp._tls.rabbittech.com.np' => array(), 'TXT _dmarc.rabbittech.com.np' => array())), $none, $info);
check('without a reports mailbox: TLS reporting is "off" and DMARC suggests no rua', $c['tls_reports']['state'] === 'off' && $c['tls_reports']['records'] === array()
  && !isset($c['dmarc_reports']) && record_values($c['dmarc']) === array('_dmarc.rabbittech.com.np TXT v=DMARC1; p=none'));
$c = checks('rabbittech.com.np', zone(array('TXT _smtp._tls.rabbittech.com.np' => array('v=TLSRPTv1; rua=mailto:tls@vendor.example'))), $none, $info);
check('without a reports mailbox: any TLS reporting address is fine', $c['tls_reports']['state'] === 'ok');

$lang = json_decode(file_get_contents(__DIR__ . '/../../data/web/lang/lang.en-gb.json'), true)['rabbittech'];
$missing = array_keys(array_diff_key($seen, $lang));
check('every check, state and detail above has its text in lang.en-gb.json', !$missing && count($seen) > 25, implode(', ', $missing));

echo "Report messages\n";
$google_xml = <<<XML
<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>4271520983447207164</report_id>
    <date_range><begin>1792022400</begin><end>1792108799</end></date_range>
  </report_metadata>
  <policy_published><domain>rabbittech.com.np</domain><adkim>r</adkim><aspf>r</aspf><p>quarantine</p><sp>quarantine</sp><pct>100</pct></policy_published>
  <record>
    <row><source_ip>94.136.186.45</source_ip><count>41</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row>
    <identifiers><header_from>rabbittech.com.np</header_from></identifiers>
    <auth_results><dkim><domain>rabbittech.com.np</domain><result>pass</result><selector>dkim</selector></dkim><spf><domain>rabbittech.com.np</domain><result>pass</result></spf></auth_results>
  </record>
  <record>
    <row><source_ip>203.0.113.66</source_ip><count>3</count><policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row>
    <identifiers><header_from>rabbittech.com.np</header_from></identifiers>
    <auth_results><spf><domain>spoof.example</domain><result>pass</result></spf></auth_results>
  </record>
</feedback>
XML;
// Outlook's: the DMARC 2.0 namespace, a forwarded message that kept its DKIM signature
$outlook_xml = <<<XML
<?xml version="1.0"?>
<feedback xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="urn:ietf:params:xml:ns:dmarc-2.0">
  <version>1.0</version>
  <report_metadata><org_name>Enterprise Outlook</org_name><email>dmarcreport@microsoft.com</email><report_id>0b5c8a4e9f3d4f0c9a1e2b3c4d5e6f70</report_id>
    <date_range><begin>1792022400</begin><end>1792108800</end></date_range></report_metadata>
  <policy_published><domain>rabbittech.com.np</domain><p>quarantine</p></policy_published>
  <record><row><source_ip>2001:db8::25</source_ip><count>2</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated></row>
    <identifiers><envelope_to>outlook.com</envelope_to><header_from>rabbittech.com.np</header_from></identifiers></record>
  <record><row><source_ip>94.136.186.45</source_ip><count>5</count><policy_evaluated><disposition>none</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated></row>
    <identifiers><header_from>rabbittech.com.np</header_from></identifiers></record>
</feedback>
XML;
$tls_json = json_encode(array(
  'organization-name' => 'Google Inc.',
  'date-range' => array('start-datetime' => '2026-10-15T00:00:00Z', 'end-datetime' => '2026-10-15T23:59:59Z'),
  'contact-info' => 'smtp-tls-reporting@google.com',
  'report-id' => '2026-10-15T00:00:00Z_rabbittech.com.np',
  'policies' => array(array(
    'policy' => array('policy-type' => 'sts', 'policy-string' => array('version: STSv1', 'mode: enforce', 'mx: mail.rabbittech.com.np', 'max_age: 604800'),
      'policy-domain' => 'rabbittech.com.np', 'mx-host' => array('mail.rabbittech.com.np')),
    'summary' => array('total-successful-session-count' => 120, 'total-failure-session-count' => 3),
    'failure-details' => array(
      array('result-type' => 'certificate-expired', 'sending-mta-ip' => '209.85.220.41', 'receiving-mx-hostname' => 'mail.rabbittech.com.np', 'failed-session-count' => 2),
      array('result-type' => 'validation-failure', 'sending-mta-ip' => '209.85.220.42', 'receiving-mx-hostname' => 'mail.rabbittech.com.np', 'failed-session-count' => 1),
    ),
  )),
));
function zipped($name, $content) {
  $file = tempnam(sys_get_temp_dir(), 'rt-test');
  $zip = new ZipArchive();
  $zip->open($file, ZipArchive::OVERWRITE);
  $zip->addFromString($name, $content);
  $zip->close();
  $data = file_get_contents($file);
  unlink($file);
  return $data;
}
function message($headers, $body) {
  return implode("\r\n", $headers) . "\r\n\r\n" . $body;
}
function attachment_message($type, $name, $data, $disposition = null) {
  $b = '----=_Part_123_456.789';
  return message(array('From: noreply-dmarc-support@google.com', 'To: reports@rabbittech.com.np', 'Subject: Report domain: rabbittech.com.np Submitter: google.com',
    'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="' . $b . '"'),
    "This is a multi-part message.\r\n--$b\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThis is an aggregate report from google.com.\r\n--$b\r\n"
    . "Content-Type: $type; name=\"$name\"\r\nContent-Disposition: " . ($disposition ?? "attachment; filename=\"$name\"") . "\r\nContent-Transfer-Encoding: base64\r\n\r\n"
    . chunk_split(base64_encode($data), 76, "\r\n") . "--$b--\r\n");
}

$found = rabbittech_message_reports(attachment_message('application/zip', 'google.com!rabbittech.com.np!1792022400!1792108799.zip',
  zipped('google.com!rabbittech.com.np!1792022400!1792108799.xml', $google_xml)));
$google = $found['dmarc'][0] ?? null;
check('Google: zip attachment read', count($found['dmarc']) === 1 && !$found['tls'] && $google['org'] === 'google.com' && $google['id'] === '4271520983447207164'
  && $google['domain'] === 'rabbittech.com.np' && $google['p'] === 'quarantine' && $google['begin'] === 1792022400 && $google['end'] === 1792108799, json_encode($google));
check('Google: one row per sending address with its DMARC results', ($google['rows'] ?? null) === array(
  array('ip' => '94.136.186.45', 'count' => 41, 'disposition' => 'none', 'dkim' => true, 'spf' => true),
  array('ip' => '203.0.113.66', 'count' => 3, 'disposition' => 'quarantine', 'dkim' => false, 'spf' => false)), json_encode($google['rows'] ?? null));

$found = rabbittech_message_reports(attachment_message('application/gzip', 'enterprise.protection.outlook.com!rabbittech.com.np!1792022400!1792108800.xml.gz',
  gzencode($outlook_xml), "attachment; filename*=utf-8''enterprise.protection.outlook.com%21rabbittech.com.np.xml.gz"));
$outlook = $found['dmarc'][0] ?? null;
check('Outlook: gzip attachment with the DMARC 2.0 namespace and an IPv6 sender', $outlook && $outlook['org'] === 'Enterprise Outlook' && count($outlook['rows']) === 2
  && $outlook['rows'][0]['ip'] === '94.136.186.45' && $outlook['rows'][1]['ip'] === '2001:db8::25' && $outlook['rows'][1]['dkim'] === true, json_encode($outlook));

$found = rabbittech_message_reports(message(array('From: dmarc@yahoo.com', 'Subject: Report Domain: rabbittech.com.np', 'Content-Type: application/gzip',
  'Content-Transfer-Encoding: base64'), chunk_split(base64_encode(gzencode(str_replace(array('google.com', '4271520983447207164'), array('Yahoo', '1792108800.123456'), $google_xml))))));
check('a report as the whole message body', ($found['dmarc'][0]['org'] ?? '') === 'Yahoo');

$found = rabbittech_message_reports(message(array('From: x@y.example', 'Content-Type: multipart/mixed; boundary=b1'),
  "--b1\r\nContent-Type: multipart/alternative; boundary=b2\r\n\r\n--b2\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b2--\r\n--b1\r\nContent-Type: text/xml\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
  . quoted_printable_encode($google_xml) . "\r\n--b1--\r\n"));
check('nested multipart with a quoted-printable XML part', ($found['dmarc'][0]['id'] ?? '') === '4271520983447207164');

$found = rabbittech_message_reports(message(array('From: noreply-smtp-tls-reporting@google.com', 'Subject: Report Domain: rabbittech.com.np Submitter: google.com Report-ID: <2026-10-15T00:00:00Z_rabbittech.com.np>',
  'Content-Type: multipart/report; report-type="tlsrpt"; boundary="tls"'),
  "--tls\r\nContent-Type: text/plain\r\n\r\nThis is an aggregate TLS report from google.com\r\n--tls\r\nContent-Type: application/tlsrpt+gzip; name=\"google.com!rabbittech.com.np!1792022400!1792108799!001.json.gz\"\r\n"
  . "Content-Transfer-Encoding: base64\r\n\r\n" . base64_encode(gzencode($tls_json)) . "\r\n--tls--\r\n"));
$tls = $found['tls'][0] ?? null;
check('Google TLS report: sessions and failure types per policy', !$found['dmarc'] && $tls && $tls['org'] === 'Google Inc.' && $tls['end'] === strtotime('2026-10-15T23:59:59Z')
  && $tls['policies'] === array(array('domain' => 'rabbittech.com.np', 'type' => 'sts', 'ok' => 120, 'failed' => 3, 'failures' => array('certificate-expired' => 2, 'validation-failure' => 1))), json_encode($tls));

check('an ordinary message has no reports', rabbittech_message_reports(message(array('From: a@b.example', 'Subject: Hello'), "Is this the reports address?\r\n")) === array('dmarc' => array(), 'tls' => array()));
check('broken XML and other XML are not reports', rabbittech_dmarc_report('<feedback><report_metadata>') === null && rabbittech_dmarc_report('<rss><channel/></rss>') === null
  && rabbittech_dmarc_report(str_replace('<report_id>4271520983447207164</report_id>', '', $google_xml)) === null);
check('JSON that isn\'t a TLS report', rabbittech_tls_report('{"hello": "world"}') === null && rabbittech_tls_report('[1,2]') === null);
check('unpacking stops at the size limit', rabbittech_unpack(gzencode(str_repeat('x', 5000)), 4096) === null && rabbittech_unpack(gzencode(str_repeat('x', 4000)), 4096) === str_repeat('x', 4000)
  && rabbittech_unpack(zipped('big.xml', str_repeat('x', 5000)), 4096) === null && rabbittech_unpack('not a zip, not a gzip') === 'not a zip, not a gzip');
check('a corrupt gzip or zip is skipped', rabbittech_unpack("\x1f\x8b\x08\x00broken") === null && rabbittech_unpack("PK\x03\x04broken") === null);
$xxe = '<?xml version="1.0"?><!DOCTYPE feedback [<!ENTITY x SYSTEM "file:///etc/passwd">]><feedback><report_metadata><org_name>&x;</org_name><report_id>1</report_id>'
  . '<date_range><begin>1</begin><end>2</end></date_range></report_metadata><policy_published><domain>x.org</domain></policy_published></feedback>';
check('external entities are not loaded', strpos((string)(rabbittech_dmarc_report($xxe)['org'] ?? ''), 'root:') === false);

echo "Kept reports\n";
$now = strtotime('2026-10-16 06:00:00 UTC');
$lookups = array();
$resolve = function ($ip) use (&$lookups) { $lookups[] = $ip; return $ip === '94.136.186.45' ? 'mail.rabbittech.com.np.' : $ip; };
$state = rabbittech_reports_add(null, array('dmarc' => array($google, $outlook), 'tls' => array($tls)), $now, $resolve);
check('reports kept by reporter and id', array_keys($state['dmarc']) === array('google.com|4271520983447207164', 'enterprise outlook|0b5c8a4e9f3d4f0c9a1e2b3c4d5e6f70') && count($state['tls']) === 1);
check('senders named by reverse DNS, once each', $state['hosts'] === array('94.136.186.45' => 'mail.rabbittech.com.np', '203.0.113.66' => '', '2001:db8::25' => '')
  && count($lookups) === 3, json_encode($state['hosts']));
$state = rabbittech_reports_add(json_decode(json_encode($state), true), array('dmarc' => array($google), 'tls' => array()), $now + 3600, $resolve);
check('a report sent twice is kept once, and known senders are not looked up again', count($state['dmarc']) === 2 && count($lookups) === 3);
$old = array('id' => 'old', 'begin' => $now - 40 * 86400, 'end' => $now - 39 * 86400) + $google;
$state = rabbittech_reports_add($state, array('dmarc' => array($old), 'tls' => array()), $now, $resolve);
check('reports older than 31 days are dropped', count($state['dmarc']) === 2 && !isset($state['dmarc']['google.com|old']));
$many = array();
for ($i = 0; $i < 120; $i++) {
  $many[] = array('id' => "r$i", 'rows' => array(array('ip' => "198.51.100.$i", 'count' => 1, 'disposition' => 'none', 'dkim' => false, 'spf' => false))) + $google;
}
$lookups = array();
$state = rabbittech_reports_add($state, array('dmarc' => $many, 'tls' => array()), $now, $resolve);
check('at most 50 reverse DNS lookups per run; the rest wait', count($lookups) === 50 && count($state['hosts']) === 53);
$state = rabbittech_reports_add($state, array('dmarc' => array(), 'tls' => array()), $now + 40 * 86400, $resolve);
check('names of senders no longer in any report are forgotten', $state['dmarc'] === array() && $state['hosts'] === array());

echo "Summary\n";
$state = rabbittech_reports_add(null, array('dmarc' => array($google, $outlook), 'tls' => array($tls)), $now, $resolve);
$summary = rabbittech_reports_summary($state, $now, '94.136.186.45');
$domain = $summary['domains']['rabbittech.com.np'] ?? array();
check('per domain: messages seen and passed DMARC', ($domain['messages'] ?? 0) === 51 && ($domain['passed'] ?? 0) === 43, json_encode($domain));
check('per domain: TLS sessions, failures most common first', ($domain['tls_ok'] ?? 0) === 120 && ($domain['tls_failed'] ?? 0) === 3
  && array_keys($domain['tls_failures'] ?? array()) === array('certificate-expired', 'validation-failure'));
check('senders, busiest first, this server marked and named', array_map(function ($s) { return array($s['ip'], $s['host'], $s['server'], $s['messages'], $s['passed']); }, $summary['senders']) === array(
  array('94.136.186.45', 'mail.rabbittech.com.np', true, 46, 41), array('203.0.113.66', '', false, 3, 0), array('2001:db8::25', '', false, 2, 2)), json_encode($summary['senders']));
check('reporters and report count', $summary['reporters'] === array('Enterprise Outlook', 'Google Inc.', 'google.com') && $summary['reports'] === 3);
check('mail from this server that failed DMARC, per domain', $summary['self_failed'] === array('rabbittech.com.np' => 5));
$fake_tls = array('org' => 'Fake Inc.', 'id' => 'fake', 'policies' => array(array('domain' => 'not-ours.example') + $tls['policies'][0])) + $tls;
$spoofed = rabbittech_reports_add($state, array('dmarc' => array(array('id' => 'fake', 'domain' => 'not-ours.example') + $google), 'tls' => array($fake_tls)), $now, $resolve);
$ours = rabbittech_reports_summary($spoofed, $now, '94.136.186.45', 30, 8, array('RabbitTech.com.np'));
check('reports about other domains are left out, DMARC and TLS', array_keys($ours['domains']) === array('rabbittech.com.np') && $ours['reports'] === 3
  && !in_array('Fake Inc.', $ours['reporters'], true) && $ours['domains']['rabbittech.com.np']['tls_failed'] === 3
  && array_keys(rabbittech_reports_summary($spoofed, $now, '94.136.186.45')['domains']) === array('not-ours.example', 'rabbittech.com.np'), json_encode(array_keys($ours['domains'])));
check('only the last N days count', rabbittech_reports_summary($state, $now + 9 * 86400, '94.136.186.45', 7)['reports'] === 0);
$top = rabbittech_reports_summary(rabbittech_reports_add(null, array('dmarc' => $many, 'tls' => array()), $now, function ($ip) { return $ip; }), $now, '94.136.186.45', 30, 8);
check('top senders only, with how many more', count($top['senders']) === 8 && $top['more_senders'] === 112);

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
