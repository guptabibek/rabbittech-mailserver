$rootScope.noop = function() {};
$rootScope.multi = /multi/.test(location.search);
$rootScope.tags = ['Work', 'Important']; $rootScope.attachments = ['migration-plan.pdf'];
$rootScope.folders = [
  { name: 'Inbox', icon: 'inbox', unseen: 12, selected: true },
  { name: 'Drafts', icon: 'drafts' },
  { name: 'Sent', icon: 'send' },
  { name: 'Junk', icon: 'thumb_down', unseen: 3 },
  { name: 'Trash', icon: 'delete' },
  { name: 'Archive', icon: 'folder', children: true, expanded: true },
  { name: '2025', icon: 'folder', level: 1 },
  { name: 'Projects', icon: 'folder', level: 1, unseen: 2 }
];
$rootScope.messages = [
  { from: 'Sita Sharma', email: 'sita@rabbittech.com.np', date: '09:42', subject: 'Q4 infrastructure review and migration timeline', size: '312 KB', open: true, attach: true, tags: ['#7c3aed'] },
  { from: 'Ram Thapa', email: 'ram@rabbittech.com.np', date: '08:15', subject: 'Relays are ready for the cut-over', size: '18 KB', unread: true, priority: true },
  { from: 'GitHub', email: 'noreply@github.com', date: 'Yesterday', subject: '[rabbittech-mailserver] CI passed on main', size: '9 KB', unread: true },
  { from: 'Support Team', email: 'support@rabbittech.com.np', date: 'Yesterday', subject: 'Ticket #4821: customer cannot sign in to webmail', size: '22 KB', flagged: true, answered: true, selected: $rootScope.multi },
  { from: 'Billing', email: 'billing@rabbittech.com.np', date: 'Oct 12', subject: 'Invoice 2026-0912 for September', size: '64 KB', attach: true, selected: $rootScope.multi },
  { from: 'Nabin Karki', email: 'nabin@example.com', date: 'Oct 11', subject: 'Lunch on Friday?', size: '4 KB', answered: true },
  { from: 'Let\'s Encrypt', email: 'expiry@letsencrypt.org', date: 'Oct 10', subject: 'Certificate renewed for mail.rabbittech.com.np', size: '6 KB' },
  { from: 'Anita Rai', email: 'anita@example.org', date: 'Oct 9', subject: 'Design review notes for the new console', size: '1.2 MB', attach: true, tags: ['#16a34a', '#f59e0b'] }
];
$rootScope.editor = { message: { editable: { to: [{ name: 'Sita Sharma', email: 'sita@rabbittech.com.np', toString: function() { return 'Sita Sharma'; } }, 'ram@rabbittech.com.np'], subject: 'Re: Q4 infrastructure review', text: '<p>Thanks Sita, the timeline works for us.</p><p>Bibek</p>' } }, identity: 'Bibek Gupta <bibek@rabbittech.com.np>', send: function() {}, save: function() {}, cancel: function() {} };
$timeout(function() {
  $mdDialog.show({
    parent: angular.element(document.body),
    clickOutsideToClose: false,
    escapeToClose: false,
    scope: $rootScope, preserveScope: true,
    template: document.getElementById('compose-tpl').innerHTML
  });
}, 200);
