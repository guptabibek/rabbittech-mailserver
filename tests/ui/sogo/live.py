#!/usr/bin/env python3
"""Builds the "live" webmail pages: SOGo's real Mail, Calendar and Contacts pages
(UIxPageFrame.wox wrapped around UIxMailMainFrame.wox, UIxCalMainView.wox and
UIxContactFoldersView.wox, rendered by wox.py) plus the templates and data the apps ask the
server for. tests/ui/sogo/backend.mjs serves these files from Playwright route handlers.

Values mirror what SOGo 5.12 sends a mailcow user with default preferences: data/conf/sogo/
sogo.conf for the system defaults, SoObjects/SOGo/SOGoDefaults.plist for SOGo's own, and the
Objective-C code that turns them into JSON (UIxJSONPreferences.m, SOGoUser.m mailAccounts,
UIxPageFrame.m). See the comments next to each value.

Usage: live.py <SOGo source checkout> <patched templates dir> <output dir>
Output: view.html (the Mail page), view-plain.html (the same without SOGoUIAdditionalJSFiles, i.e.
without our theme.js and custom-sogo.js), UIxMailEditor.html and the other templates fetched
over HTTP, parts.json (mail part viewers with @@...@@ placeholders) and data.json (JSON the
backend answers with). @@CURRENT_DAY@@ in the pages is filled in by the backend per request.
calendar/ and contacts/ hold the same for those apps; the calendar's day, week and month views
(templates the server renders per date) are rendered for the weeks around TODAY, the date the
tests pin the browser's clock to."""
import datetime
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


def render(component, extra=None, tables=None, base=None, nil=()):
    renderer = Renderer(template_dirs, tables or [mailer, common], dict(base or bindings, **(extra or {})), accessors)
    html = renderer.render_component(component)
    unknown = {k for k in renderer.missing
               if k not in NIL_BINDINGS and k not in nil and not k.startswith('dialogCtrl.')}
    if unknown:
        problems.append('%s: no value for %s' % (component, ', '.join(sorted(unknown))))
    return html


def write(name, text):
    path = os.path.join(out, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
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

# ================================================================== Calendar and Contacts
scheduler, contacts = strings('Scheduler'), strings('Contacts')
TODAY = datetime.date(2026, 10, 15)       # a Thursday; the tests pin the browser's clock to it
FIRST_DAY = 1                             # SOGoFirstDayOfWeek: Monday
CAL_URL = 'https://mail.rabbittech.com.np/SOGo/dav/%s/Calendar/' % LOGIN
CARD_URL = 'https://mail.rabbittech.com.np/SOGo/dav/%s/Contacts/' % LOGIN


def app_bindings(module, folder, framework, product, title, extra):
    """The page bindings of another app: the Mail page's, with that app's module and labels."""
    return dict(bindings, moduleName=label(title, common), angularModule=module, modulePath=FOLDER_URL + folder + '/',
                productLocalizableStrings='var labels = %s;' % sogo_json(dict(product, _loadedFrameworks=[framework])),
                framework=framework, **extra)


# ------------------------------------------------------------------ calendars (UIxCalendarSelector.m calendars)
def calendar(id, name, color, active=1):
    return {
        'id': id, 'name': name, 'color': color, 'active': active, 'owner': LOGIN, 'isWebCalendar': 0,
        'includeInFreeBusy': 1, 'showCalendarAlarms': 1, 'showCalendarTasks': 1,
        'acls': {'objectCreator': 1, 'objectEraser': 1}, 'synchronize': 1,
        'urls': {'calDavURL': CAL_URL + id + '/', 'webDavICSURL': CAL_URL + id + '.ics',
                 'webDavXMLURL': CAL_URL + id + '.xml'},
        'notifications': {'notifyOnPersonalModifications': 0, 'notifyOnExternalModifications': 0,
                          'notifyUserOnPersonalModifications': 0},
    }


calendars = [calendar('personal', 'Personal Calendar', '#7C3AED'),
             calendar('work', 'Work', '#0B8043'),
             calendar('family', 'Family', '#F4511E')]


# ------------------------------------------------------------------ address books (UIxContactFoldersView.m contactFolders)
def address_book(id, name, remote=False):
    owner = 'nobody' if remote else LOGIN
    acl = 0 if remote else 1
    book = {'id': id, 'name': name, 'synchronize': 1 if id == 'personal' else 0, 'owner': owner,
            'isEditable': 0 if remote else 1, 'isRemote': 1 if remote else 0, 'listRequiresDot': 0,
            'acls': {'objectCreator': acl, 'objectEditor': acl, 'objectEraser': acl}}
    if not remote:
        book['urls'] = {'cardDavURL': CARD_URL + id + '/'}
    book['searchFields'] = ['name', 'c_mail', 'c_categories', 'c_o']
    return book


address_books = [address_book('personal', 'Personal Address Book'),
                 address_book('collected', 'Collected Address Book'),
                 address_book('global', 'Global Address Book', remote=True)]

# Bindings both apps' templates use that the Mail page doesn't
app_common = {'isCalendarSharingEnabled': True, 'isCalendarExportEnabled': True,
              'isContactSharingEnabled': True, 'isContactExportEnabled': True,
              'canSubscribeUsers': True, 'objectRights': [], 'showJitsiLinkCreation': False}
calendar_bindings = app_bindings('SOGo.SchedulerUI', 'Calendar', 'SchedulerUI', scheduler, 'Calendar', dict(app_common, **{
    'firstDayOfWeek': FIRST_DAY,
    'dayStartHour': 8,
    'currentView': 'weekview',
    'listIsCollapsed.jsonRepresentation': 'false',
    'calendars.jsonRepresentation': sogo_json(calendars),
}))
contacts_bindings = app_bindings('SOGo.ContactsUI', 'Contacts', 'ContactsUI', contacts, 'Address Book', dict(app_common, **{
    'contactFolders.jsonRepresentation': sogo_json(address_books),
}))
calendar_tables = [scheduler, common]
contacts_tables = [contacts, common]
# Labels SOGo binds with var: (nil, so the attribute is left out)
calendar_nil = {'Create a new event', 'Create a new task'}
contacts_nil = {'Contact', 'List'}


# ------------------------------------------------------------------ the calendar's views (UIxCalDayTable.m, UIxCalMonthView.m, UIxCalView.m)
class Day:
    """An NSCalendarDate as the view templates use it."""

    def __init__(self, date):
        self.date = date
        self.shortDateString = date.strftime('%Y%m%d')
        self.iso8601DateString = date.isoformat()
        self.isToday = date == TODAY
        self.dayOfMonth = date.day
        self.yearOfCommonEra = date.year

    @property
    def day_of_week(self):            # NSCalendarDate dayOfWeek: Sunday is 0
        return (self.date.weekday() + 1) % 7


def first_day_of_week(date):
    return date - datetime.timedelta(days=(date.weekday() + 1 - FIRST_DAY) % 7)


def week_number(date):
    # SOGoFirstWeekOfYear January1: the week holding January 1st is week 1
    start = first_day_of_week(date)
    following = first_day_of_week(datetime.date(start.year + 1, 1, 1))
    if start >= following:
        return 1
    return (start - first_day_of_week(datetime.date(start.year, 1, 1))).days // 7 + 1


def ymd(date):
    return {'day': date.strftime('%Y%m%d')}


def view_bindings(view, selected):
    """Bindings of UIxCal{Day,Week,Month}View for the date the app asked for."""
    days = lambda n: datetime.timedelta(days=n)
    b = {'todayQueryParameters': ymd(TODAY), 'startDate': selected}
    if view == 'dayview':
        b.update(prevDayQueryParameters=ymd(selected - days(1)), nextDayQueryParameters=ymd(selected + days(1)),
                 yesterdayName=DAYS[Day(selected - days(1)).day_of_week], tomorrowName=DAYS[Day(selected + days(1)).day_of_week])
        table = [selected]
    elif view == 'weekview':
        start = first_day_of_week(selected)
        b.update(prevWeekQueryParameters=ymd(start - days(7)), nextWeekQueryParameters=ymd(start + days(7)))
        table = [start + days(i) for i in range(7)]
    else:
        first = selected.replace(day=1)
        prev = (first - days(1)).replace(day=1)
        nxt = (first + days(32)).replace(day=1)
        last = nxt - days(1)
        start = first_day_of_week(first)
        weeks = ((last - start).days + 1 + 6) // 7
        grid = [[Day(start + days(w * 7 + d)) for d in range(7)] for w in range(weeks)]
        b.update(prevMonthQueryParameters=ymd(prev), nextMonthQueryParameters=ymd(nxt),
                 headerDaysToDisplay=grid[0], weeksToDisplay=grid)

        def where(scope):
            week = scope['currentWeek']
            return grid.index(week), week.index(scope['currentTableDay'])

        def classes(scope):
            w, d = where(scope)
            day = scope['currentTableDay']
            out = 'day weekOf%d week%dof%d day%d' % (weeks, w, weeks, d)
            if day.day_of_week in (0, 6):
                out += ' weekEndDay'
            if day.date.month != selected.month:
                out += ' dayOfAnotherMonth'
            if day.isToday:
                out += ' dayOfToday'
            return out

        def header_month(scope):
            day = scope['currentTableDay'].date
            if day.day == 1 or (day + days(1)).day == 1:
                return MONTHS[day.month - 1]
            return None
        b.update(
            currentDayId=lambda sc: 'day' + sc['currentTableDay'].shortDateString,
            currentDayNumber=lambda sc: where(sc)[0] * 7 + where(sc)[1],
            isFirstDayOfWeek=lambda sc: where(sc)[1] == 0,
            currentWeekNumber=lambda sc: week_number(sc['currentTableDay'].date),
            dayCellClasses=classes,
            dayHeaderMonth=header_month,
            labelForCurrentDayToDisplay=lambda sc: DAYS[sc['currentTableDay'].day_of_week])
        return b
    shown_days[:] = [Day(d) for d in table]
    return b


shown_days = []          # the days UIxCalDayTable shows, set by view_bindings


def day_table(bound):
    """UIxCalDayTable's values; it gets currentView and numberOfDays from the view template."""
    view = bound.get('currentView')
    shown = list(shown_days)
    index = lambda sc: shown.index(sc['currentTableDay'])

    def day_classes(scope):
        day = scope['currentTableDay']
        out = 'day'
        if len(shown) > 1:
            if day.day_of_week in (0, 6):
                out += ' weekEndDay'
            if day.isToday:
                out += ' dayOfToday'
        return out

    def month_label(scope):
        day = scope['currentTableDay']
        if view.endswith('dayview'):
            return MONTHS[day.date.month - 1]
        if day.dayOfMonth == 1 or index(scope) == 0:
            return SHORT_MONTHS[day.date.month - 1]
        return None

    def hour_class(scope):
        hour = scope['currentTableHour']
        out = 'clickableHourCell clickableHourCell%d' % hour
        if hour < 8 or hour > 18 - 1:                      # SOGoDayStartTime 08:00, SOGoDayEndTime 18:00
            out += ' outOfDay'
        return out
    return {
        'daysToDisplay': shown,
        'hoursToDisplay': list(range(0, 24)),               # UIxCalView dayStartHour 0, dayEndHour 23
        'isWeekView': view == 'weekview',
        'isMultiColumnView': view == 'multicolumndayview',
        'currentHourId': lambda sc: 'hour%d' % sc['currentTableHour'],
        'currentAllDayId': lambda sc: 'allDay' + sc['currentTableDay'].shortDateString,
        'currentDayId': lambda sc: 'day' + sc['currentTableDay'].shortDateString,
        'currentDayNumber': index,
        'currentAppointmentHour': lambda sc: sc['currentTableHour'],
        'currentYear': lambda sc: str(sc['currentTableDay'].yearOfCommonEra)
            if (sc['currentTableDay'].date.month == 1 and sc['currentTableDay'].dayOfMonth == 1) or index(sc) == 0 else None,
        'currentFormattedHour': lambda sc: '%02d:00' % sc['currentTableHour'],
        'labelForDay': lambda sc: DAYS[sc['currentTableDay'].day_of_week],
        'labelForMonth': month_label,
        'dayClasses': day_classes,
        'clickableHourCellClass': hour_class,
    }


accessors['UIxCalDayTable'] = day_table
ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
# The editors' choice lists (UIxReminderEditor.m, UIxRecurrenceEditor.m, UIxRecurrenceListEditor.m)
accessors['UIxReminderEditor'] = lambda bound: {
    'unitsList': ['MINUTES', 'HOURS', 'DAYS', 'WEEKS'], 'referencesList': ['BEFORE', 'AFTER'],
    'relationsList': ['START', 'END'], 'emailAlarmsEnabled': True,      # sogo.conf SOGoEnableEMailAlarms = YES
    'itemText': lambda sc: label('reminder_' + sc['item'], scheduler)}
monthly_repeat = ['First', 'Second', 'Third', 'Fourth', 'Fift', 'Last']
monthly_days = DAYS + [label('DayOfTheMonth', scheduler)]
accessors['UIxRecurrenceEditor'] = lambda bound: {
    'shortWeekDaysList': SHORT_DAYS, 'monthlyRepeatList': monthly_repeat, 'monthlyDayList': monthly_days,
    'yearlyMonthList': SHORT_MONTHS, 'yearlyDayList': DAYS,
    'itemText': lambda sc: label(sc['item'], scheduler),
    'labelForWeekDay': lambda sc: sc['item'],
    'valueForWeekDay': lambda sc: ICAL_DAYS[SHORT_DAYS.index(sc['item'])],
    'valueForMonthlyRepeat': lambda sc: ['1', '2', '3', '4', '5', '-1'][monthly_repeat.index(sc['item'])],
    'valueForMonthlyDay': lambda sc: 'relative' if monthly_days.index(sc['item']) > 6 else ICAL_DAYS[monthly_days.index(sc['item'])],
    'valueForYearlyMonth': lambda sc: SHORT_MONTHS.index(sc['item']) + 1,
    'valueForYearlyDay': lambda sc: ICAL_DAYS[DAYS.index(sc['item'])]}
accessors['UIxRecurrenceListEditor'] = lambda bound: {
    'repeatFrequenciesKey': ['never', 'daily', 'weekly', 'monthly', 'yearly'],
    'itemText': lambda sc: label('repeat_' + sc['item'].upper(), scheduler)}


def calendar_page(name, component, extra=None):
    write('calendar/' + name, render(component, extra, calendar_tables, calendar_bindings, calendar_nil))


calendar_page('view.html', 'UIxCalMainView')
calendar_page('view-plain.html', 'UIxCalMainView', {'systemAdditionalJSFiles': []})
for template in ('UIxAppointmentEditorTemplate', 'UIxAppointmentViewTemplate', 'UIxTaskEditorTemplate', 'UIxTaskViewTemplate'):
    calendar_page(template + '.html', template, {
        'dayEndHour': 18, 'userDefaults.timeFormat': '%H:%M',
        'replyList': ['ACCEPTED', 'DECLINED', 'TENTATIVE'], 'itemReplyText': lambda sc: label('partStat_' + sc['item'], scheduler),
        'statusList': ['not-specified', 'needs-action', 'in-process', 'completed', 'cancelled'],
        'itemStatusText': lambda sc: label('status_' + sc['item'].upper(), scheduler)})
# The views, for the weeks around TODAY: day views by day, week views by their Monday, month
# views by their first day
window = [datetime.date(2026, 9, 28) + datetime.timedelta(days=i) for i in range(63)]
for name, component, dates in (
        ('dayview', 'UIxCalDayView', window),
        ('weekview', 'UIxCalWeekView', [d for d in window if d.weekday() == 0]),
        ('monthview', 'UIxCalMonthView', sorted({d.replace(day=1) for d in window}))):
    for date in dates:
        calendar_page('%s-%s.html' % (name, date.strftime('%Y%m%d')), component, view_bindings(name, date))


def contacts_page(name, component, extra=None):
    write('contacts/' + name, render(component, extra, contacts_tables, contacts_bindings, contacts_nil))


contacts_page('view.html', 'UIxContactFoldersView')
contacts_page('view-plain.html', 'UIxContactFoldersView', {'systemAdditionalJSFiles': []})
contacts_page('UIxContactEditorTemplate.html', 'UIxContactEditorTemplate')

write('apps.json', json.dumps({
    'today': TODAY.isoformat(),
    'calendars': calendars, 'addressBooks': address_books,
    'labels': {'SchedulerUI': scheduler, 'ContactsUI': contacts},
}, indent=1))

if problems:
    sys.exit('live.py: ' + '; '.join(problems))
print('Live webmail page in %s' % out)
