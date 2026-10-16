<?php
// doveadm for tests/reports/test-mail-reports.sh. A user's inbox is the folder $FAKE_MAIL/<user>:
// <uid>.eml is a message, <uid>.flags its flags. Only the calls scripts/mail-reports.sh makes are
// known; anything else fails the test. FAKE_FAIL=<command> makes that command fail.
$args = array_slice($argv, 1);
$json = false;
if (($args[0] ?? '') === '-f') {
  $json = $args[1] === 'json';
  $args = array_slice($args, 2);
}
$command = array_shift($args);
if ($command === 'flags') {
  $command .= ' ' . array_shift($args);
}
function usage() {
  global $argv;
  fwrite(STDERR, 'fake doveadm: unexpected call: ' . implode(' ', array_slice($argv, 1)) . "\n");
  exit(99);
}
if (($args[0] ?? '') !== '-u' || !isset($args[1])) {
  usage();
}
$dir = getenv('FAKE_MAIL') . '/' . $args[1];
if (!is_dir($dir)) {
  fwrite(STDERR, "Error: User doesn't exist\n");
  exit(67);
}
if (getenv('FAKE_FAIL') === $command) {
  fwrite(STDERR, "Error: Internal error occurred. Refer to server log for more information.\n");
  exit(75);
}
$uids = array_map(function ($file) { return (int)basename($file, '.eml'); }, glob("$dir/*.eml"));
sort($uids);
$flags = function ($uid) use ($dir) {
  return is_file("$dir/$uid.flags") ? explode(' ', trim(file_get_contents("$dir/$uid.flags"))) : array();
};
$set = function ($text) use ($uids) {
  $chosen = array();
  foreach (explode(',', $text) as $uid) {
    if (!ctype_digit($uid)) usage();
    if (in_array((int)$uid, $uids, true)) $chosen[] = (int)$uid;
  }
  return $chosen;
};
switch ($command) {
  case 'search':
    if (array_slice($args, 2) !== array('mailbox', 'INBOX', 'NOT', 'KEYWORD', 'rtreport')) usage();
    foreach ($uids as $uid) {
      if (!in_array('rtreport', $flags($uid), true)) echo "0e567f1374d3d16a19000000757af9fe $uid\n";
    }
    break;
  case 'fetch':
    if (!$json || count($args) !== 7 || array_slice($args, 2, 4) !== array('uid text', 'mailbox', 'INBOX', 'uid')) usage();
    $messages = array();
    foreach ($set($args[6]) as $uid) {
      // Dovecot hands out messages with LF line ends
      $messages[] = array('uid' => (string)$uid, 'text' => str_replace("\r\n", "\n", file_get_contents("$dir/$uid.eml")));
    }
    echo json_encode($messages);
    break;
  case 'flags add':
    if (count($args) !== 7 || array_slice($args, 3, 3) !== array('mailbox', 'INBOX', 'uid')) usage();
    foreach ($set($args[6]) as $uid) {
      file_put_contents("$dir/$uid.flags", implode(' ', array_unique(array_merge($flags($uid), explode(' ', $args[2])))));
    }
    break;
  default:
    usage();
}
