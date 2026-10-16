<?php
// The checks on a domain's Mail security tab (templates/rabbittech/mail-security.twig), loaded by
// 014-rabbittech.js when the tab opens. For admins, and domain admins of that domain.
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/functions.rabbittech-mail.inc.php';

$role = $_SESSION['mailcow_cc_role'] ?? '';
$domain = strtolower(trim((string)($_GET['domain'] ?? '')));
if (!in_array($role, array('admin', 'domainadmin'), true) || !is_valid_domain_name($domain) || mailbox('get', 'domain_details', $domain) === false) {
  http_response_code(403);
  exit;
}

$hostname = strtolower(getenv('MAILCOW_HOSTNAME'));
$reports = rt_reports_address(rt_mail_reports());
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo $twig->render('rabbittech/mail-security.twig', array(
  'lang' => $lang,
  'domain' => $domain,
  'hostname' => $hostname,
  'reports' => $reports,
  'is_admin' => $role === 'admin',
  'checks' => rt_domain_security($domain, $hostname, rt_server_ip($hostname), $reports),
));
