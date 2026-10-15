<?php
// Check the RabbitTech UI strings: every language file must be valid JSON, every key in the
// RabbitTech wording files must exist in lang.en-gb.json, and every "rabbittech" key the
// templates and scripts use must exist there too.
// Twig runs with strict_variables off, so a missing key would silently render as nothing.
// Usage: php scripts/check-rabbittech-lang.php [path/to/data/web]

$web = rtrim($argv[1] ?? __DIR__ . '/../data/web', '/');
$failed = 0;

foreach (glob($web . '/lang/lang.*.json') as $file) {
  json_decode(file_get_contents($file), true);
  if (json_last_error() !== JSON_ERROR_NONE) {
    fwrite(STDERR, basename($file) . ': ' . json_last_error_msg() . PHP_EOL);
    $failed++;
  }
}

$english = json_decode(file_get_contents($web . '/lang/lang.en-gb.json'), true);
$keys = $english['rabbittech'] ?? [];
if (!$keys) {
  fwrite(STDERR, 'lang.en-gb.json has no "rabbittech" section' . PHP_EOL);
  exit(1);
}

// The RabbitTech wording files (rabbittech.<locale>.json) replace existing mailcow strings, so each
// of their keys has to be one the English file has; a typo would leave the old wording on screen
foreach (glob($web . '/lang/rabbittech.*.json') as $file) {
  $wording = json_decode(file_get_contents($file), true);
  if (!is_array($wording)) {
    fwrite(STDERR, basename($file) . ': ' . (json_last_error() !== JSON_ERROR_NONE ? json_last_error_msg() : 'not a JSON object') . PHP_EOL);
    $failed++;
    continue;
  }
  foreach ($wording as $section => $strings) {
    foreach ((array) $strings as $key => $text) {
      if (!isset($english[$section][$key]) || !is_string($text)) {
        fwrite(STDERR, basename($file) . ': ' . $section . '.' . $key . ' is not a string in lang.en-gb.json' . PHP_EOL);
        $failed++;
      }
    }
  }
}

$used = [];
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($web . '/templates', FilesystemIterator::SKIP_DOTS));
foreach ($files as $file) {
  if ($file->getExtension() !== 'twig' || strpos($file->getPathname(), '/templates/cache/') !== false) {
    continue;
  }
  $source = file_get_contents($file->getPathname());
  // Templates alias the section as "t"; only look inside Twig tags, not inline JavaScript
  $alias = preg_match('/set t = lang\.rabbittech\b/', $source);
  preg_match_all('/\{\{.*?\}\}|\{%.*?%\}/s', $source, $tags);
  foreach ($tags[0] as $tag) {
    preg_match_all('/lang\.rabbittech\.(\w+)/', $tag, $m);
    foreach ($m[1] as $key) $used[$key][] = $file->getPathname();
    if ($alias) {
      preg_match_all('/(?<![\w.])t\.(\w+)/', $tag, $m);
      foreach ($m[1] as $key) $used[$key][] = $file->getPathname();
    }
  }
  // Inline scripts read the same strings from the lang_rt object
  preg_match_all('/lang_rt\.(\w+)/', $source, $m);
  foreach ($m[1] as $key) $used[$key][] = $file->getPathname();
}
foreach (array_merge(glob($web . '/js/build/*.js'), glob($web . '/js/site/*.js')) as $file) {
  preg_match_all("/rt\.t\('(\w+)'/", file_get_contents($file), $m);
  foreach ($m[1] as $key) $used[$key][] = $file;
}

// The Overview's alerts are built in PHP: $rt_text['key'], and each alert key needs a title
// (alert_<key>) and a hint (alert_<key>_hint); ACME reasons need acme_<reason>
$dashboard = file_get_contents($web . '/admin/dashboard.php');
preg_match_all("/\\\$rt_text\\['(\\w+)'\\]/", $dashboard, $m);
foreach ($m[1] as $key) $used[$key][] = 'admin/dashboard.php';
preg_match_all("/'key' => '(\\w+)'(?!\\s*\\.)/", $dashboard, $m);
$alert_keys = $m[1];
// The DNS alerts are named dns_<check> after the keys of $rt_dns_checks
if (preg_match('/\$rt_dns_checks = array\((.*?)\);/s', $dashboard, $checks)) {
  preg_match_all("/'(\\w+)' => array/", $checks[1], $m);
  foreach ($m[1] as $check) $alert_keys[] = 'dns_' . $check;
}
foreach ($alert_keys as $key) {
  $used['alert_' . $key][] = 'admin/dashboard.php';
  $used['alert_' . $key . '_hint'][] = 'admin/dashboard.php';
}
$helpers = file_get_contents($web . '/inc/functions.rabbittech.inc.php');
preg_match_all("/array\\('(\\w+)', array\\(/", $helpers, $m);
foreach ($m[1] as $key) $used['acme_' . $key][] = 'inc/functions.rabbittech.inc.php';

foreach ($used as $key => $where) {
  if (!array_key_exists($key, $keys)) {
    fwrite(STDERR, 'Missing rabbittech.' . $key . ' (used in ' . implode(', ', array_unique(array_map('basename', $where))) . ')' . PHP_EOL);
    $failed++;
  }
}

echo 'Checked ' . count($used) . ' RabbitTech strings, ' . $failed . ' problems' . PHP_EOL;
exit($failed ? 1 : 0);
