<?php
// Writes a test message for tests/reports/test-mail-reports.sh:
//   php message.php <file> dmarc <report id>   Google's DMARC report, zipped, as an attachment
//   php message.php <file> tls <report id>     Google's TLS report, gzipped, as an attachment
//   php message.php <file> hello               an ordinary message
[, $file, $kind] = $argv;
$id = $argv[3] ?? '1';
$b = 'b1_' . md5($id);
$attach = function ($type, $name, $data) use ($b) {
  return "From: noreply@google.com\r\nTo: reports@rabbittech.com.np\r\nSubject: Report $name\r\nMIME-Version: 1.0\r\n"
    . "Content-Type: multipart/mixed; boundary=\"$b\"\r\n\r\n--$b\r\nContent-Type: text/plain\r\n\r\nA report.\r\n--$b\r\n"
    . "Content-Type: $type; name=\"$name\"\r\nContent-Disposition: attachment; filename=\"$name\"\r\nContent-Transfer-Encoding: base64\r\n\r\n"
    . chunk_split(base64_encode($data)) . "--$b--\r\n";
};
if ($kind === 'dmarc') {
  $xml = '<?xml version="1.0"?><feedback><report_metadata><org_name>google.com</org_name><report_id>' . $id . '</report_id>'
    . '<date_range><begin>1792022400</begin><end>1792108799</end></date_range></report_metadata>'
    . '<policy_published><domain>rabbittech.com.np</domain><p>none</p></policy_published>'
    . '<record><row><source_ip>94.136.186.45</source_ip><count>12</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated></row>'
    . '<identifiers><header_from>rabbittech.com.np</header_from></identifiers></record></feedback>';
  $zip = new ZipArchive();
  $tmp = tempnam(sys_get_temp_dir(), 'rt-zip');
  $zip->open($tmp, ZipArchive::OVERWRITE);
  $zip->addFromString("google.com!rabbittech.com.np!$id.xml", $xml);
  $zip->close();
  file_put_contents($file, $attach('application/zip', "google.com!rabbittech.com.np!$id.zip", file_get_contents($tmp)));
  unlink($tmp);
}
elseif ($kind === 'tls') {
  $json = json_encode(array('organization-name' => 'Google Inc.', 'report-id' => $id,
    'date-range' => array('start-datetime' => '2026-10-15T00:00:00Z', 'end-datetime' => '2026-10-15T23:59:59Z'),
    'policies' => array(array('policy' => array('policy-type' => 'sts', 'policy-domain' => 'rabbittech.com.np'),
      'summary' => array('total-successful-session-count' => 40, 'total-failure-session-count' => 1),
      'failure-details' => array(array('result-type' => 'certificate-expired', 'failed-session-count' => 1))))));
  file_put_contents($file, $attach('application/tlsrpt+gzip', "google.com!rabbittech.com.np!$id.json.gz", gzencode($json)));
}
else {
  file_put_contents($file, "From: someone@example.org\r\nTo: reports@rabbittech.com.np\r\nSubject: Hello\r\n\r\nIs this the right address?\r\n");
}
