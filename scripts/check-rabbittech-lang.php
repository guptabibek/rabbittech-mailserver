<?php
// Check the RabbitTech UI strings: every language file must be valid JSON, and every
// "rabbittech" key the templates and scripts use must exist in lang.en-gb.json.
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

foreach ($used as $key => $where) {
  if (!array_key_exists($key, $keys)) {
    fwrite(STDERR, 'Missing rabbittech.' . $key . ' (used in ' . implode(', ', array_unique(array_map('basename', $where))) . ')' . PHP_EOL);
    $failed++;
  }
}

echo 'Checked ' . count($used) . ' RabbitTech strings, ' . $failed . ' problems' . PHP_EOL;
exit($failed ? 1 : 0);
