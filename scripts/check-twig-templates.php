<?php
// Parse every mailcow Twig template so syntax errors fail CI instead of the live UI.
// Usage: php scripts/check-twig-templates.php [path/to/data/web]

$web = rtrim($argv[1] ?? __DIR__ . '/../data/web', '/');
require $web . '/inc/lib/vendor/autoload.php';

$templates = $web . '/templates';
$twig = new \Twig\Environment(new \Twig\Loader\FilesystemLoader($templates));

// Mirror the functions and filters registered in data/web/inc/twig.inc.php
foreach (['query_string', 'is_uri'] as $function) {
  $twig->addFunction(new \Twig\TwigFunction($function, fn() => null));
}
foreach (['rot13', 'base64_encode', 'formatBytes'] as $filter) {
  $twig->addFilter(new \Twig\TwigFilter($filter, fn($value) => $value));
}

$parsed = 0;
$failed = 0;
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($templates, FilesystemIterator::SKIP_DOTS));
foreach ($files as $file) {
  $name = substr($file->getPathname(), strlen($templates) + 1);
  if ($file->getExtension() !== 'twig' || strpos($name, 'cache/') === 0) {
    continue;
  }
  try {
    $twig->parse($twig->tokenize($twig->getLoader()->getSourceContext($name)));
    $parsed++;
  } catch (\Twig\Error\Error $e) {
    fwrite(STDERR, "FAIL {$name}: {$e->getMessage()}\n");
    $failed++;
  }
}

echo "Parsed {$parsed} templates, {$failed} failed\n";
exit($failed > 0 ? 1 : 0);
