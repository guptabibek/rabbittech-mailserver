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
