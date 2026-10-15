<?php
// RabbitTech: branded entry to webmail (/webmail, via the @strip-ext rule in nginx).
// A signed-in mailbox user goes straight in through the same single sign-on as the Webmail
// button; everyone else is sent to sign in first.
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';

if (getenv('SKIP_SOGO') != 'y' && isset($_SESSION['mailcow_cc_role']) && $_SESSION['mailcow_cc_role'] == 'user') {
  header('Location: /sogo-auth.php?login=' . rawurlencode($_SESSION['mailcow_cc_username']));
}
else {
  header('Location: /');
}
exit;
