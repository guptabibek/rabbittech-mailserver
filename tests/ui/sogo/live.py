#!/usr/bin/env python3
"""Builds the "live" webmail page: SOGo's real Mail page (UIxPageFrame.wox wrapped around
MailerUI/UIxMailMainFrame.wox, rendered by wox.py) plus the templates and data the app asks
the server for. tests/ui/sogo/backend.mjs serves these files from Playwright route handlers.

Values mirror what SOGo 5.12 sends a mailcow user with default preferences: data/conf/sogo/
sogo.conf for the system defaults, SoObjects/SOGo/SOGoDefaults.plist for SOGo's own, and the
Objective-C code that turns them into JSON (UIxJSONPreferences.m, SOGoUser.m mailAccounts,
UIxPageFrame.m). See the comments next to each value.

Usage: live.py <SOGo source checkout> <patched templates dir> <output dir>
Output: view.html (the page), view-plain.html (the same without SOGoUIAdditionalJSFiles, i.e.
without our theme.js and custom-sogo.js), UIxMailEditor.html and the other templates fetched
over HTTP, parts.json (mail part viewers with @@...@@ placeholders) and data.json (JSON the
backend answers with). @@CURRENT_DAY@@ in the pages is filled in by the backend per request."""
import json
import os
import sys

from wox import Renderer, read_strings

src, templates, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

# ------------------------------------------------------------------ the user
USER = 'bibek'                      # URL segment: /SOGo/so/bibek/Mail/view
LOGIN = 'bibek@rabbittech.com.np'   # mailcow logs users in with their address
FULL_NAME = 'Bibek Gupta'
TIME_ZONE = 'Asia/Kathmandu'        # SOGoTimeZone = ${TZ} in mailcow's sogod.plist
TZ_OFFSET = 5 * 3600 + 45 * 60
PAGE_TITLE = 'RabbitTech Webmail'   # SOGoPageTitle in data/conf/sogo/sogo.conf
FOLDER_URL = '/SOGo/so/%s/' % USER
RESOURCES = '/SOGo.woa/WebServerResources/'
IMAP_HOST = '172.22.1.250'          # imap://${IPV4_NETWORK}.250:143/?TLS=YES&tlsVerifyMode=none
SMTP_HOST = '172.22.1.253'          # smtp://${IPV4_NETWORK}.253:588/?TLS=YES&tlsVerifyMode=none


def strings(product):
    return read_strings(os.path.join(src, 'UI', product, 'English.lproj', 'Localizable.strings'))


mailer, common, prefs = strings('MailerUI'), strings('Common'), strings('PreferencesUI')


def label(key, *tables):
    for table in tables or (mailer, common):
        if key in table:
            return table[key]
    return key


# ------------------------------------------------------------------ SOGo's JSON
def sogo_json(value):
    """jsonRepresentation as SOGo writes it: {"k":v} without spaces, [a, b] with a space,
    BOOLs as 1/0, strings escaping only quotes, backslashes and control characters."""
    if isinstance(value, dict):
        return '{%s}' % ','.join('%s:%s' % (sogo_json(str(k)), sogo_json(v)) for k, v in value.items())
    if isinstance(value, (list, tuple)):
        return '[%s]' % ', '.join(sogo_json(v) for v in value)
    if value is True or value is False:
        return '1' if value else '0'
    if isinstance(value, (int, float)):
        return str(value)
    out = []
    for ch in str(value):
        if ch in '"\\':
            out.append('\\' + ch)
        elif ch in '\t\n\r\b\f':
            out.append({'\t': '\\t', '\n': '\\n', '\r': '\\r', '\b': '\\b', '\f': '\\f'}[ch])
        elif ord(ch) < 0x20:
            out.append('\\u%04x' % ord(ch))
        else:
            out.append(ch)
    return '"%s"' % ''.join(out)


# ------------------------------------------------------------------ mail account (SOGoUser.m)
# The TLS=YES query key is upper case in mailcow's URLs while SOGo looks up "tls", so SOGo
# reports encryption "none" (it still uses TLS: the IMAP library reads the URL itself).
identity = {'fullName': FULL_NAME, 'email': LOGIN, 'isDefault': True}
account = {
    'userName': LOGIN,
    'serverName': IMAP_HOST,
    'port': 143,
    'encryption': 'none',
    'tlsVerifyMode': 'none',
    'smtpServerName': SMTP_HOST,
    'smtpPort': 588,
    'smtpEncryption': 'none',
    'smtpTlsVerifyMode': 'none',
    'name': LOGIN,
    'identities': [identity],
    'specialMailboxes': {'Drafts': 'Drafts', 'Sent': 'Sent', 'Trash': 'Trash', 'Junk': 'Junk', 'Templates': 'Templates'},
    'delegates': [],
}
mail_accounts = [account]

# ------------------------------------------------------------------ English locale (MainUI/English.lproj/Locale)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
          'October', 'November', 'December']
SHORT_MONTHS = [m[:3] for m in MONTHS]
DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
SHORT_DAYS = [d[:3] for d in DAYS]

# ------------------------------------------------------------------ user defaults (UIxJSONPreferences.m jsonDefaults)
# A user who never saved preferences: jsonDefaults fills in each value from the system defaults
# (sogo.conf, then SOGoDefaults.plist); keys whose default is nil are left out.
calendar_categories = ['Customer', 'Calls', 'Favorites', 'Meeting', 'Ideas', 'Miscellaneous', 'Birthday',
                       'Anniversary', 'Vacation', 'Travel', 'Projects', 'Suppliers', 'Gifts', 'Clients', 'Issues',
                       'Business', 'Holidays', 'Personal', 'Status', 'Competition', 'Follow up', 'Public Holiday']
calendar_colors = {
    'Customer': '#F8D800', 'Calls': '#0396FF', 'Favorites': '#EA5455', 'Meeting': '#7367F0', 'Ideas': '#32CCBC',
    'Miscellaneous': '#F6416C', 'Birthday': '#28C76F', 'Anniversary': '#9F44D3', 'Vacation': '#623AA2',
    'Travel': '#F55555', 'Projects': '#8C1BAB', 'Suppliers': '#9708CC', 'Gifts': '#736EFE', 'Clients': '#E96D71',
    'Issues': '#3677FF', 'Business': '#FA016D', 'Holidays': '#0E197D', 'Personal': '#DE4313', 'Status': '#002661',
    'Competition': '#6018DC', 'Follow up': '#D939CD', 'Public Holiday': '#E80505'}
mail_labels = {'$label1': ['Important', '#FF0000'], '$label2': ['Work', '#FF9900'], '$label3': ['Personal', '#009900'],
               '$label4': ['To Do', '#3333FF'], '$label5': ['Later', '#993399'], '$forwarded': ['Forwarded', '#B01FE3'],
               '$mdnsent': ['Return Receipt Sent', '#006600']}
defaults = {
    'SOGoLanguage': 'English',
    'SOGoTimeZone': TIME_ZONE,
    'SOGoShortDateFormat': '%d-%b-%y',
    'SOGoLongDateFormat': '%A, %B %d, %Y',
    'SOGoTimeFormat': '%H:%M',
    'SOGoLoginModule': 'Mail',
    'SOGoRefreshViewCheck': 'manually',
    'SOGoGravatarEnabled': False,
    'SOGoAlternateAvatar': 'none',
    'SOGoAnimationMode': 'normal',
    'SOGoTOTPEnabled': False,
    'SOGoFirstDayOfWeek': 1,                      # sogo.conf SOGoFirstDayOfWeek = "1"
    'SOGoDayStartTime': '08:00',
    'SOGoDayEndTime': '18:00',
    'SOGoCalendarWeekdays': ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
    'SOGoFirstWeekOfYear': 'January1',
    'SOGoDefaultCalendar': 'selected',
    'SOGoCalendarEventsDefaultClassification': 'PUBLIC',
    'SOGoCalendarTasksDefaultClassification': 'PUBLIC',
    'SOGoCalendarDefaultReminder': 'NONE',
    'SOGoPasswordRecoveryMode': 'Disabled',
    'SOGoPasswordRecoveryQuestion': 'SecretQuestion1',
    'SOGoCalendarCategories': [label(c, prefs) for c in calendar_categories],
    'SOGoCalendarCategoriesColors': calendar_colors,
    'mailJunkIcon': 'thumb_down',
    'SOGoContactsCategories': prefs['contacts_category_labels'].split(','),
    'SOGoMailAddOutgoingAddresses': False,
    'SOGoSelectedAddressBook': 'collected',
    'SOGoMailMessageForwarding': 'inline',
    'SOGoMailReplyPlacement': 'below',
    'SOGoMailUseSignatureOnNew': True,
    'SOGoMailUseSignatureOnReply': True,
    'SOGoMailUseSignatureOnForward': True,
    'SOGoMailDisplayFullEmail': False,
    'SOGoMailComposeMessageType': 'html',
    'SOGoMailComposeFontSize': 0,
    'SOGoMailDisplayRemoteInlineImages': 'never',
    'SOGoMailAutoMarkAsReadDelay': 0,
    'SOGoMailHideInlineAttachments': True,        # sogo.conf
    'SOGoMailAutoSave': '5',
    'SOGoMailLabelsColors': {k: [label(v[0]), v[1]] for k, v in mail_labels.items()},
    'Forward': {},                                # SOGoForwardEnabled = YES and no options saved
    # Not stored, added for the page (end of jsonDefaults)
    'SOGoAppointmentSendEMailNotifications': True,
    'SOGoLDAPGroupExpansionEnabled': False,
    'LocaleCode': 'en',
    'locale': {'months': MONTHS, 'shortMonths': SHORT_MONTHS, 'days': DAYS, 'shortDays': SHORT_DAYS},
    'UserTimeZoneSecondsFromGMT': TZ_OFFSET,
    'AuxiliaryMailAccounts': [dict(account, receipts={
        'receiptAction': 'ignore', 'receiptNonRecipientAction': 'ignore',
        'receiptOutsideDomainAction': 'ignore', 'receiptAnyAction': 'ignore'})],
}
settings = {'Calendar': {}, 'Contact': {}, 'Mail': {}}

# ------------------------------------------------------------------ localizable strings for the page (UIxPageFrame.m)
clabels = dict(common)
clabels.update({'AM': 'AM', 'PM': 'PM'})
clabels.update(zip(MONTHS, MONTHS))
clabels.update(zip(SHORT_MONTHS, SHORT_MONTHS))
labels = dict(mailer, _loadedFrameworks=['MailerUI'])

# ------------------------------------------------------------------ bindings
# Conditions are for a normal user in Chrome: not a super user, no CAS/SAML, proxy
# authentication (mailcow's SSO, so no SOGo logoff URL: the patched toolbar calls mc_logout()),
# vacation off, and SOGo 5.12's defaults for sharing, export and mail cleaning (sogo.conf
# sets SOGoEnableMailCleaning = YES).
js_files = ('vendor/ckeditor/build/ckeditor.js, Common/sgCkeditor.component.js, Common.js, Preferences.services.js, '
            'Contacts.services.js, Scheduler.services.js, Mailer.js, Mailer.services.js, '
            'vendor/angular-file-upload.min.js, vendor/FileSaver.min.js, vendor/punycode.js, vendor/mark.min.js')
bindings = {
    # UIxPageFrame
    'doctype': '<!DOCTYPE html>',
    'hideFrame': False,
    'localeCode': 'en',
    'moduleName': label('Mail', common),
    'buildDate': 'sogo@sogo-mailcow 202510150000',              # SOGO_BUILD_DATE: user@host date
    'siteFavicon': RESOURCES + 'img/sogo.ico',
    'isUIxDebugEnabled': False,
    'hasPageSpecificCSS': False,                                  # no css/UIxMailMainFrame.css
    'additionalCSSFiles': [],
    'bodyClasses': 'main',
    'angularModule': 'SOGo.MailerUI',
    'disableInk': False,                                          # only for IE or animation "limited"/"none"
    'context.applicationURL': '/SOGo/',
    'isCompatibleBrowser': True,
    'singleWindowModeEnabled': False,
    'modulePath': FOLDER_URL + 'Mail/',                           # ends with a slash, like baseURLInContext
    'applicationPath': '/SOGo',
    'minimumSearchLength': 2,                                     # SOGoSearchMinimumWordLength
    'minimumSearchLengthLabel': label('Enter at least %{minimumSearchLength} characters', common)
        .replace('%{minimumSearchLength}', '2'),
    'isSuperUser': False,
    'usesCASAuthentication': False,
    'usesSAML2Authentication': False,
    'shortUserNameForDisplay': LOGIN,
    'userFolderPath': FOLDER_URL,
    'userIdentification.doubleQuotedString': sogo_json(FULL_NAME),
    'userEmail': LOGIN,
    'userLanguage': 'English',
    'userHasCalendarAccess': True,
    'userHasMailAccess': True,
    # Paths relative to the page URL (UIxComponent relativePathToUserFolderSubPath)
    'relativeCalendarPath': '../Calendar',
    'relativeContactsPath': '../Contacts',
    'relativeMailPath': '../Mail',
    'relativePreferencesPath': '../Preferences',
    'relativeAdministrationPath': '../Administration',
    'canLogoff': False,
    'logoffPath': '../logoff',
    'helpURL': '',
    'currentDayDescription': '@@CURRENT_DAY@@',
    'commonLocalizableStrings': 'var clabels = %s;' % sogo_json(clabels),
    'productLocalizableStrings': 'var labels = %s;' % sogo_json(labels),
    'hasProductSpecificJavaScript': False,                        # no js/MailerUI.js
    'hasPageSpecificJavaScript': False,                           # no js/UIxMailMainFrame.js
    'systemAdditionalJSFiles': [RESOURCES + 'js/theme.js', RESOURCES + 'js/custom-sogo.js'],
    # UIxJSONPreferences
    'jsonDefaults': sogo_json(defaults),
    'jsonSettings': sogo_json(settings),
    # UIxMailMainFrame
    'mailAccounts': sogo_json(mail_accounts),
    'userNames': sogo_json([a['userName'] for a in mail_accounts]),
    'unseenCountFolders': sogo_json([]),                          # Sieve on, no fileinto filters
    'isCleanMailboxEnabled': True,
    'isMailExportEnabled': True,
    'isMailSharingEnabled': True,
    # UIxTopnavToolbar
    'userHasVacationEnabled': False,
    'userHasVacationDisabled': True,
    # UIxMailUserRightsEditor (SOGoIMAPAclConformsToIMAPExt = YES)
    'conformsToRFC4314': True,
    # UIxMailEditor and the other MailerUI pages
    'framework': 'MailerUI',
    # UIxAclEditor (a mail folder can't be subscribed to)
    'canSubscribeUsers': False,
}

# Bindings SOGo evaluates to nil in these templates, so their attributes are left out: the
# templates bind var:aria-label to a label key and var:value to Angular expressions.
NIL_BINDINGS = {'Write a new message', 'Write a message in new window', 'navButtonClick'}

# UIxPageFrame.m: the title binding becomes "title | SOGoPageTitle", const:jsFiles the list of
# additional scripts
accessors = {'UIxPageFrame': lambda bound: {
    'title': '%s | %s' % (bound['title'], PAGE_TITLE),
    'additionalJSFiles': [RESOURCES + 'js/' + f.strip() for f in bound.get('jsFiles', '').split(',') if f.strip()],
}}
template_dirs = [templates]
problems = []


def render(component, extra=None):
    renderer = Renderer(template_dirs, [mailer, common], dict(bindings, **(extra or {})), accessors)
    html = renderer.render_component(component)
    unknown = {k for k in renderer.missing if k not in NIL_BINDINGS and not k.startswith('dialogCtrl.')}
    if unknown:
        problems.append('%s: no value for %s' % (component, ', '.join(sorted(unknown))))
    return html


def write(name, text):
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        f.write(text)


write('view.html', render('UIxMailMainFrame'))
write('view-plain.html', render('UIxMailMainFrame', {'systemAdditionalJSFiles': []}))
# Templates the app loads with templateUrl (relative to the page, /SOGo/so/bibek/Mail/...)
write('UIxMailEditor.html', render('UIxMailEditor'))
write('UIxMailFolderSubscriptions.html', render('UIxMailFolderSubscriptions'))
write('UIxMailUserDelegationEditor.html', render('UIxMailUserDelegationEditor'))
write('UIxAclEditor.html', render('UIxAclEditor'))

# Mail part viewers (UI/Templates/MailPartViewers), rendered once with placeholders that the
# backend fills in per message part. A link viewer differs when the file type has no known
# extension (UIxMailPartViewer pathExtensionForType), e.g. .docx.
part = {'flatContentAsString': '@@CONTENT@@', 'cssContent': '@@CSS@@',
        'filenameForTitle': '@@TITLE@@', 'filenameForDisplay': '@@FILENAME@@', 'preferredPathExtension': '@@EXT@@',
        'bodyInfo.size': '@@SIZE@@', 'pathToAttachment': '@@VIEW_URL@@', 'pathForDownload': '@@DOWNLOAD_URL@@',
        'pathToAttachment.length': True}
parts = {
    'UIxMailPartTextViewer': render('UIxMailPartTextViewer', part),
    'UIxMailPartHTMLViewer': render('UIxMailPartHTMLViewer', part),
    'UIxMailPartLinkViewer': render('UIxMailPartLinkViewer', dict(part, **{'preferredPathExtension.length': True})),
    'UIxMailPartLinkViewerNoExtension': render('UIxMailPartLinkViewer', dict(part, **{'preferredPathExtension.length': False})),
}
write('parts.json', json.dumps(parts, indent=1))

# What the backend answers with besides the store: mailAccounts, jsonDefaults, labels, ...
write('data.json', json.dumps({
    'user': USER, 'login': LOGIN, 'fullName': FULL_NAME, 'timeZone': TIME_ZONE,
    'mailAccounts': sogo_json(mail_accounts),
    'jsonDefaults': bindings['jsonDefaults'],
    'jsonSettings': bindings['jsonSettings'],
    'labels': {'MailerUI': mailer, 'Common': common, 'PreferencesUI': prefs},
}, indent=1))

if problems:
    sys.exit('live.py: ' + '; '.join(problems))
print('Live webmail page in %s' % out)
