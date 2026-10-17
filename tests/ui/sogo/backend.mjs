// A fake SOGo server for the live webmail pages (tests/ui/.cache/sogo-root/live, built by
// prepare.sh → live.py). It answers the Mail app's requests from Playwright route handlers,
// with the JSON shapes SOGo 5.12 sends (UI/MailerUI/UIxMailListActions.m, UIxMailFolderActions.m,
// UIxMailAccountActions.m, UIxMailActions.m, UIxMailEditor.m, UIxMailView.m and the part
// viewers), backed by an in-memory store of folders and messages that moves, flags and deletes
// for real. The static server (python -m http.server on the cache root) serves everything else.
// Calendar, Contacts and Settings requests go to backend-apps.mjs (CALENDAR_PAGE, CONTACTS_PAGE,
// PREFS_PAGE).
//
//   import { mailBackend, PAGE } from './sogo/backend.mjs';
//   const backend = await mailBackend(page, { custom: true });   // options: custom, now, olderMessages, pageFilter, editorFilter
//   await page.goto(origin + PAGE + '#!/Mail/0/INBOX');
//   backend.calls('markMessageFlagged')  // → [{ method, path, action, folder, uid, query, body, status }]
//   backend.folder('Trash').messages     // → messages, see seed() for their shape
//
// Unknown requests get a 404 and a log entry with unknown: true.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appsBackend } from './backend-apps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const live = join(here, '..', '.cache', 'sogo-root', 'live');

export const USER = 'bibek';
export const BASE = `/SOGo/so/${USER}`;
export const PAGE = `${BASE}/Mail/view`;
export const CALENDAR_PAGE = `${BASE}/Calendar/view`;
export const CONTACTS_PAGE = `${BASE}/Contacts/view`;
export const PREFS_PAGE = `${BASE}/Preferences`;

const KiB = 1024;
const QUOTA_KB = 5 * 1024 * 1024;   // a 5 GiB mailbox (Dovecot reports quotas in KiB)
const QUOTA_BASE_KB = 1180000;      // what the user's older mail takes besides the seeded messages

// ------------------------------------------------------------------ public API
export async function mailBackend(target, options = {}) {
  const backend = createBackend(options);
  await target.route('**/SOGo/so/**', route => backend.handle(route));
  return backend;
}

// pageFilter(html) changes the page before it is served, e.g. to break a template on purpose;
// editorFilter(html) does the same for the compose window's template (UIxMailEditor).
// clock: the date the pages show as today (the tests pin the browser's clock to the same date).
export function createBackend({ custom = true, now = new Date(), olderMessages = 0, pageFilter = html => html, editorFilter = html => html, clock = null } = {}) {
  const files = name => readFileSync(join(live, name), 'utf8');
  const data = JSON.parse(files('data.json'));
  const parts = JSON.parse(files('parts.json'));
  const pages = { custom: files('view.html'), plain: files('view-plain.html') };
  const templates = {
    UIxMailEditor: files('UIxMailEditor.html'),
    subscribe: files('UIxMailFolderSubscriptions.html'),
    delegation: files('UIxMailUserDelegationEditor.html'),
    UIxAclEditor: files('UIxAclEditor.html'),
  };
  const store = seed(now, olderMessages);
  const log = [];
  const timeZone = data.timeZone;
  const apps = appsBackend({ apps: JSON.parse(files('apps.json')), files, json, text, empty, html, login: data.login,
    pageFilter, custom, currentDayJSON: () => sogoJSON(currentDay()) });

  const backend = {
    log,
    store,
    custom,
    /** Log entries for one action (last path segment), e.g. 'batchDelete'. */
    calls: action => log.filter(e => e.action === action),
    /** Log entries for requests the fake server doesn't know. */
    unknown: () => log.filter(e => e.unknown),
    folder: path => store.folders[path],
    message: (path, uid) => (store.folders[path] || { messages: [] }).messages.find(m => m.uid === Number(uid)),
    unseen: path => unseenCount(store.folders[path]),
    /** Calendar, Contacts and Settings: store (store.preferences.saved: the bodies Settings saved), event(summary), card(full name) */
    apps,
    handle,
  };

  // ---------------------------------------------------------------- dispatch
  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const entry = {
      time: Date.now(), method: request.method(), path: url.pathname,
      query: Object.fromEntries(url.searchParams), body: parseBody(request), action: null,
    };
    log.push(entry);
    let response;
    try {
      response = dispatch(entry, url);
    } catch (e) {
      response = json(500, { message: String(e && e.stack || e) });
      entry.error = String(e);
    }
    if (!response) {
      entry.unknown = true;
      response = json(404, { message: 'Not handled by the fake SOGo backend: ' + entry.method + ' ' + url.pathname });
    }
    entry.status = response.status;
    await route.fulfill(response);
  }

  function dispatch(entry, url) {
    if (!url.pathname.startsWith(BASE + '/')) return null;
    const segments = url.pathname.slice(BASE.length + 1).split('/').map(decodeURIComponent);
    entry.action = segments[segments.length - 1] || segments[segments.length - 2];
    const [module, ...rest] = segments;
    entry.module = module;
    entry.user = USER;
    if (module === 'Mail') return mail(entry, rest);
    if (module === 'Calendar') return apps.calendar(entry, rest);
    if (module === 'Contacts' && rest[0] === 'allContactSearch') return json(200, { contacts: contactSearch(entry.query.search) }, 'string');
    if (module === 'Contacts') return apps.contacts(entry, rest);
    if (['Preferences', 'activeExternalSieveScripts', 'editAccount', 'editFilter'].includes(module)) return apps.preferences(entry, module, rest);
    if (module === 'freebusy.ifb') return json(200, {});
    if (module === 'labels' && entry.method === 'POST') return labelsFor(entry.body && entry.body.framework);
    if (module === 'date') return json(200, currentDay(), 'string');
    return null;
  }

  function mail(entry, rest) {
    const [first, ...more] = rest;
    if (first === undefined || first === '') return { status: 302, headers: { location: PAGE } };
    if (more.length === 0) {
      switch (first) {
        case 'view': return html(pageFilter(pages[custom ? 'custom' : 'plain'].replace('@@CURRENT_DAY@@', sogoJSON(currentDay()))));
        case 'UIxMailEditor': return html(editorFilter(templates.UIxMailEditor));
        case 'mailAccounts': return text(200, data.mailAccounts);
        case 'unseenCount': return unseenCountAction(entry.body);
        case 'foldersState': return json(200, store.settings.ExpandedFolders || null);
        case 'saveFoldersState': store.settings.ExpandedFolders = entry.body; return empty(204);
        case 'saveDragHandleState':
        case 'saveColumnsState': return empty(204);
      }
      return null;
    }
    if (first !== '0') return null;
    // Account 0: /Mail/0/<action> or /Mail/0/folderA/folderB/<action> or .../<uid>/<action>
    if (more.length === 1) return accountAction(entry, more[0]);
    let i = 0;
    const components = [];
    while (i < more.length && more[i].startsWith('folder')) components.push(fromCSSIdentifier(more[i++].slice(6)));
    const path = components.join('/');
    const folder = store.folders[path];
    entry.folder = path;
    const tail = more.slice(i);
    if (tail.length === 1) return folderAction(entry, folder, tail[0]);
    if (tail.length >= 2) {
      const [id, ...after] = tail;
      if (id.startsWith('newDraft')) return draftAction(entry, folder, id, after[after.length - 1]);
      entry.uid = Number(id);
      return messageAction(entry, folder, Number(id), after);
    }
    return null;
  }

  // ---------------------------------------------------------------- account (UIxMailAccountActions)
  function accountAction(entry, action) {
    switch (action) {
      case 'view': return json(200, { mailboxes: mailboxTree(false), quotas: quota() });
      case 'viewAll': return json(200, { mailboxes: mailboxTree(true) });
      case 'compose': return composeAction(null, null, 'compose');
      case 'subscribe': return html(templates.subscribe);
      case 'delegation': return html(templates.delegation);
      case 'createFolder': {
        const name = entry.body && entry.body.name;
        if (!name) return json(500, { message: 'Missing name parameter' });
        addFolder(name, 'folder');
        return empty(204);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- folders (UIxMailListActions, UIxMailFolderActions)
  function folderAction(entry, folder, action) {
    if (!folder) {
      // SOGo always lists Templates; until it exists on the IMAP server, listing it answers 204
      // (UIxMailListActions getUIDsAction on a special folder) and its labels are empty
      if (entry.folder !== 'Templates') return null;
      if (action === 'view') return empty(204);
      if (action === 'labels') return json(200, []);
      return null;
    }
    const body = entry.body || {};
    switch (action) {
      case 'view': return viewAction(folder, body);
      case 'changes': return changesAction(folder, body);
      case 'headers': {
        if (!Array.isArray(body.uids) || !body.uids.length) return json(404, { message: 'No UID specified' });
        return json(200, headers(folder, body.uids.map(Number)));
      }
      case 'batchDelete': {
        const uids = (body.uids || []).map(Number);
        if (!uids.length) return json(500, { message: "Missing 'uids' parameter." });
        const withTrash = !body.withoutTrash && folder.type !== 'trash';
        if (withTrash) moveUIDs(folder, uids, store.folders.Trash);
        else expunge(folder, uids);
        const out = withTrash ? {} : { quotas: quota() };
        out.unseenCount = unseenCount(folder);
        return text(200, sogoJSON(out));
      }
      case 'moveMessages':
      case 'copyMessages': {
        const uids = (body.uids || []).map(Number);
        const target = folderFromId(body.folder);
        if (!uids.length || !target) return json(500, { message: "Error 'uids' and/or 'folder' parameters." });
        if (action === 'copyMessages') {
          copyUIDs(folder, uids, target);
          return json(200, { quotas: quota() });
        }
        moveUIDs(folder, uids, target);
        return json(200, { unseenCount: unseenCount(folder) });
      }
      case 'addOrRemoveLabel': {
        const flags = typeof body.flags === 'string' ? [fromCSSIdentifier(body.flags)] : null;
        if (!flags || !Array.isArray(body.msgUIDs)) return json(500, { message: "Missing 'flags' and 'msgUIDs' parameters." });
        for (const uid of body.msgUIDs) setFlag(folder, Number(uid), flags[0].toLowerCase(), body.operation === 'add');
        return empty(204);
      }
      case 'labels': return json(200, folderLabels(folder));
      case 'markRead':
        for (const m of folder.messages) setFlag(folder, m.uid, 'seen', true);
        return empty(204);
      case 'expunge': return json(200, { quotas: quota() });
      case 'emptyTrash':
      case 'emptyJunk':
        expunge(folder, folder.messages.map(m => m.uid));
        return json(200, { quotas: quota() });
      case 'markMessagesAsJunk':
      case 'markMessagesAsNotJunk':
      case 'subscribe':
      case 'unsubscribe':
        return empty(204);
      case 'UIxAclEditor': return html(templates.UIxAclEditor);
    }
    return null;
  }

  function viewAction(folder, body) {
    const uids = sortedUIDs(folder, body);
    const out = { syncToken: String(store.modseq) };
    const noHeaders = body.sortingAttributes && Number(body.sortingAttributes.noHeaders);
    if (!noHeaders) {
      const onlyAttachments = (body.filters || []).some(f => f.searchBy === 'attachment');
      out.headers = headers(folder, onlyAttachments ? uids : uids.slice(0, 100));
    }
    out.uids = uids;
    out.threaded = 0;
    out.unseenCount = unseenCount(folder);
    out.quotas = quota();
    return json(200, out);
  }

  function changesAction(folder, body) {
    const token = Number(body.syncToken);
    const current = String(store.modseq);
    if (!body.syncToken || token === store.modseq) return json(200, { syncToken: current });
    const changed = sortedUIDs(folder, { sortingAttributes: body.sortingAttributes })
      .filter(uid => folder.messages.find(m => m.uid === uid).modseq > token);
    const deleted = folder.expunged.filter(e => e.modseq > token).map(e => e.uid);
    if (!changed.length && !deleted.length) return json(200, { syncToken: current });
    return json(200, {
      changed: changed.map(String), deleted: deleted.map(String),
      headers: headers(folder, changed.slice(0, 100)), syncToken: current,
      unseenCount: unseenCount(folder), quotas: quota(),
    });
  }

  function unseenCountAction(body) {
    const out = {};
    for (const id of (body && body.mailboxes) || []) {
      const folder = folderFromId(id);
      out[id] = folder ? unseenCount(folder) : 0;
    }
    return text(200, sogoJSON(out));
  }

  // ---------------------------------------------------------------- messages (UIxMailView, UIxMailActions)
  function messageAction(entry, folder, uid, after) {
    const message = folder && folder.messages.find(m => m.uid === uid);
    const action = after[after.length - 1];
    if (!message) {
      if (action === 'view') return json(404, { message: 'Did not find specified message' });
      return null;
    }
    switch (action) {
      case 'view':
      case 'viewRaw':
        // SOGoMailAutoMarkAsReadDelay is 0: viewing a message marks it read on the server
        setFlag(folder, uid, 'seen', true);
        return json(200, messageView(folder, message));
      case 'markMessageRead': setFlag(folder, uid, 'seen', true); return empty(204);
      case 'markMessageUnread': setFlag(folder, uid, 'seen', false); return empty(204);
      case 'markMessageFlagged': setFlag(folder, uid, 'flagged', true); return empty(204);
      case 'markMessageUnflagged': setFlag(folder, uid, 'flagged', false); return empty(204);
      case 'markMessageCollapse':
      case 'markMessageUncollapse':
        return empty(204);
      case 'viewplain':
        return text(201, sogoJSON({ subject: message.subject, content: (message.text || stripTags(message.html || '')).trim() }));
      case 'reply':
      case 'replyall':
      case 'forward':
      case 'compose':
        return composeAction(folder, message, action);
      case 'edit':
        // A message in Drafts: SOGo copies it to a new draft object
        return text(200, sogoJSON({ draftId: newDraft({ ...draftFromMessage(message), sourceFolder: folder.path, sourceUid: uid }).id }));
    }
    return null;
  }

  function messageView(folder, m) {
    const out = {
      shouldAskReceipt: 0,
      isDraft: folder.type === 'draft' ? 1 : 0,
      isTemplate: folder.type === 'templates' ? 1 : 0,
      parts: renderParts(folder, m),
      date: longDate(m.date),
      subject: m.subject,
      from: m.from,
    };
    for (const key of ['to', 'cc', 'bcc']) if (m[key] && m[key].length) out[key] = m[key];
    out['reply-to'] = m.replyTo || m.from;   // IMAP ENVELOPE repeats From when there is no Reply-To
    out.isRead = m.flags.includes('seen') ? 1 : 0;
    return out;
  }

  // ---------------------------------------------------------------- drafts (UIxMailEditor)
  function composeAction(folder, original, action) {
    const draft = { from: identityFrom(), to: [], cc: [], bcc: [], subject: '', text: '', isHTML: false };
    if (original) {
      const quoted = quote(original);
      if (action === 'reply' || action === 'replyall') {
        draft.to = addressList(original.replyTo || original.from);
        if (action === 'replyall') draft.cc = addressList([...(original.to || []), ...(original.cc || [])].filter(a => a.email !== data.login));
        draft.subject = /^re:/i.test(original.subject) ? original.subject : 'Re: ' + original.subject;
        draft.text = quoted;
        draft.isHTML = true;
      } else if (action === 'forward') {
        draft.subject = '[Fwd: ' + original.subject + ']';
        draft.text = quoted;
        draft.isHTML = true;
        draft.attachments = original.attachments || [];
      } else {
        Object.assign(draft, draftFromMessage(original));
      }
      draft.sourceFolder = folder.path;
      draft.sourceUid = original.uid;
      draft.sourceAction = action;
    }
    const d = newDraft(draft);
    const out = { accountId: '0', mailboxPath: 'Drafts', draftId: d.id };
    if (action === 'forward') {
      // SOGo saves forwards right away, so the draft has an IMAP UID
      saveDraft(d);
      out.uid = d.uid;
    }
    return text(201, sogoJSON(out));
  }

  function draftAction(entry, folder, id, action) {
    const draft = store.drafts[id] || newDraft({ from: identityFrom(), to: [], cc: [], bcc: [], subject: '', text: '', isHTML: false }, id);
    const body = entry.body || {};
    switch (action) {
      case 'edit': {
        const out = { locale: 'en', isHTML: draft.isHTML ? 1 : 0 };
        if (draft.from) out.from = draft.from;
        for (const key of ['to', 'cc', 'bcc']) if (draft[key] && draft[key].length) out[key] = draft[key];
        if (draft.subject) out.subject = draft.subject;
        if (draft.uid && draft.attachments && draft.attachments.length) out.attachmentAttrs = draft.attachments.map(attachmentAttrs);
        out.text = draft.text || '';
        return text(200, sogoJSON(out));
      }
      case 'save':
        updateDraft(draft, body);
        saveDraft(draft);
        return text(200, sogoJSON({ uid: String(draft.uid) }));
      case 'send': {
        updateDraft(draft, body);
        if (!(draft.to.length || draft.cc.length || draft.bcc.length)) {
          return json(405, { status: 'failure', message: label('error_missingrecipients') });
        }
        send(draft);
        const out = { status: 'success' };
        if (draft.sourceFolder) Object.assign(out, { sourceFolder: '/0/' + folderId(draft.sourceFolder), sourceMessageID: draft.sourceUid });
        return json(200, out);
      }
      case 'delete':
        if (draft.uid) expunge(store.folders.Drafts, [draft.uid]);
        delete store.drafts[id];
        return empty(204);
      case 'deleteAttachment': return empty(204);
    }
    return null;
  }

  function newDraft(fields, id) {
    store.draftCount += 1;
    const draft = { ...fields, id: id || `newDraft${Math.floor(Date.now() / 1000)}-${store.draftCount}` };
    store.drafts[draft.id] = draft;
    return draft;
  }

  function updateDraft(draft, body) {
    for (const key of ['from', 'subject', 'text']) if (typeof body[key] === 'string') draft[key] = body[key];
    for (const key of ['to', 'cc', 'bcc']) if (Array.isArray(body[key])) draft[key] = body[key];
    if ('isHTML' in body) draft.isHTML = !!body.isHTML;
  }

  function saveDraft(draft) {
    const drafts = store.folders.Drafts;
    if (draft.uid) expunge(drafts, [draft.uid]);
    const message = messageFromDraft(draft);
    message.flags = ['seen', 'draft'];
    draft.uid = append(drafts, message).uid;
  }

  function send(draft) {
    if (draft.uid) expunge(store.folders.Drafts, [draft.uid]);
    delete store.drafts[draft.id];
    const message = messageFromDraft(draft);
    message.flags = ['seen'];
    append(store.folders.Sent, message);
    const source = draft.sourceFolder && store.folders[draft.sourceFolder];
    if (source && draft.sourceAction && draft.sourceAction.startsWith('reply')) setFlag(source, draft.sourceUid, 'answered', true);
    if (source && draft.sourceAction === 'forward') setFlag(source, draft.sourceUid, '$forwarded', true);
    store.sent.push(message);
  }

  function messageFromDraft(draft) {
    const parse = list => (list || []).map(parseAddress);
    // A new message comes back with isHTML 0 (SOGo only sets it for replies, forwards and
    // signatures) even though CKEditor wrote HTML, so look at the text too
    const isHTML = draft.isHTML || /<\/?[a-z][^>]*>/i.test(draft.text || '');
    const textBody = isHTML ? stripTags(draft.text || '') : draft.text || '';
    return {
      subject: draft.subject || '', from: parse([draft.from]), to: parse(draft.to), cc: parse(draft.cc), bcc: parse(draft.bcc),
      date: new Date(), text: textBody, html: isHTML ? draft.text : null, attachments: draft.attachments || [],
      size: 1800 + (draft.text || '').length,
    };
  }

  function draftFromMessage(m) {
    return {
      from: identityFrom(), to: addressList(m.to), cc: addressList(m.cc), bcc: addressList(m.bcc),
      subject: m.subject, text: m.html || escapeText(m.text || '').replace(/\n/g, '<br />'), isHTML: true,
      attachments: m.attachments || [],
    };
  }

  // ---------------------------------------------------------------- store operations
  function bump() { store.modseq += 1; return store.modseq; }

  function append(folder, message) {
    const m = { flags: [], cc: [], bcc: [], attachments: [], priority: 3, ...message, uid: folder.uidNext++, modseq: bump() };
    folder.messages.push(m);
    return m;
  }

  function expunge(folder, uids) {
    for (const uid of uids) {
      const index = folder.messages.findIndex(m => m.uid === uid);
      if (index < 0) continue;
      folder.messages.splice(index, 1);
      folder.expunged.push({ uid, modseq: bump() });
    }
  }

  function copyUIDs(folder, uids, target) {
    for (const uid of uids) {
      const m = folder.messages.find(x => x.uid === uid);
      if (m) append(target, { ...m, flags: [...m.flags] });
    }
  }

  function moveUIDs(folder, uids, target) {
    copyUIDs(folder, uids, target);
    expunge(folder, uids);
  }

  function setFlag(folder, uid, flag, on) {
    const m = folder && folder.messages.find(x => x.uid === uid);
    if (!m) return;
    const has = m.flags.includes(flag);
    if (on && !has) m.flags.push(flag);
    if (!on && has) m.flags.splice(m.flags.indexOf(flag), 1);
    if (on !== has) m.modseq = bump();
  }

  function addFolder(path, type, flags = ['hasnochildren']) {
    store.folders[path] = { path, type, flags, uidNext: 1, messages: [], expunged: [] };
    const parent = path.includes('/') ? store.folders[path.slice(0, path.lastIndexOf('/'))] : null;
    if (parent) parent.flags = parent.flags.map(f => (f === 'hasnochildren' ? 'haschildren' : f));
    return store.folders[path];
  }

  // ---------------------------------------------------------------- mailbox list (SOGoMailAccount allFoldersMetadata)
  function mailboxTree(subscriptions) {
    // Special folders first, in this order, then the others sorted (SOGoMailAccount allFolderPaths)
    const main = ['INBOX', 'Drafts', 'Sent', 'Trash', 'Junk', 'Templates'];
    const others = Object.keys(store.folders).filter(p => !main.includes(p))
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const roots = [];
    for (const path of [...main, ...others]) {
      const folder = store.folders[path] || { path, type: 'templates', flags: [] };
      const components = path.split('/');
      let siblings = roots;
      for (let i = 0; i < components.length; i++) {
        const sub = components.slice(0, i + 1).join('/');
        let node = siblings.find(n => n.path === sub);
        if (!node) {
          const last = i === components.length - 1;
          node = {
            path: sub, type: last ? folder.type : 'additional', name: components[i], children: [],
            flags: last ? [...folder.flags] : ['noselect'],
            subscribed: subscriptions && store.folders[sub] ? 1 : 0, sievePath: sub,
          };
          siblings.push(node);
        }
        siblings = node.children;
      }
    }
    // UIxMailAccountActions sortChildrenRecursively: special folders, then by name
    const sortChildren = list => {
      for (const node of list) {
        node.children = sortChildren(node.children);
      }
      const special = list.filter(n => n.type !== 'folder');
      const plain = list.filter(n => n.type === 'folder').sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      return [...special, ...plain];
    };
    for (const node of roots) node.children = sortChildren(node.children);
    return roots;
  }

  function quota() {
    let bytes = 0;
    for (const folder of Object.values(store.folders)) for (const m of folder.messages) bytes += m.size;
    // NGImap4 hands the QUOTA numbers over as strings
    return { usedSpace: String(QUOTA_BASE_KB + Math.round(bytes / KiB)), maxQuota: String(QUOTA_KB) };
  }

  function folderLabels(folder) {
    // UIxMailFolderActions getLabelsAction: the folder's keywords, known labels first
    const keywords = new Set(['$forwarded', '$mdnsent']);
    for (const m of folder.messages) for (const f of m.flags) if (f.startsWith('$')) keywords.add(f);
    const known = [], other = [];
    const colors = JSON.parse(data.jsonDefaults).SOGoMailLabelsColors;
    for (const k of [...keywords].sort()) {
      if (colors[k]) known.push({ imapName: k, name: colors[k][0], color: colors[k][1] });
      else other.push({ imapName: k });
    }
    return [...known, ...other];
  }

  // ---------------------------------------------------------------- list, sort and search
  function sortedUIDs(folder, body) {
    const attrs = body.sortingAttributes || {};
    const sort = String(attrs.sort || 'arrival').toLowerCase();
    const asc = attrs.asc === true || attrs.asc === 1 || attrs.asc === '1' || attrs.asc === 'true';
    const list = folder.messages.filter(m => matches(m, body));
    const key = {
      arrival: m => m.uid,
      date: m => m.date.getTime(),
      size: m => m.size,
      subject: m => m.subject.replace(/^((re|fwd?|aw|wg)\s*:\s*|\[fwd:\s*)+/i, '').toLowerCase(),
      from: m => ((m.from[0] || {}).email || '').split('@')[0].toLowerCase(),
    }[sort] || (m => m.uid);
    list.sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : a.uid - b.uid) * (asc ? 1 : -1);
    });
    return list.map(m => m.uid);
  }

  function matches(m, body) {
    // UIxMailListActions searchQualifier
    let unseenOnly = !!Number(body.unseenOnly || 0), flaggedOnly = !!Number(body.flaggedOnly || 0);
    const tests = [];
    const has = (field, words) => {
      const value = fieldText(m, field).toLowerCase();
      return value.includes(String(words).toLowerCase());
    };
    for (const filter of body.filters || []) {
      const by = filter.searchBy, input = filter.searchInput;
      if (!by || input === undefined || input === null) continue;
      let test = null;
      if (by === 'size') {
        const unit = { kb: KiB, mb: KiB * KiB, gb: KiB * KiB * KiB }[String(filter.sizeUnit || '').toLowerCase()] || 1;
        const size = Number(input) * unit;
        test = { '<': m.size < size, '>': m.size > size, '=': m.size === size, '<=': m.size <= size, '>=': m.size >= size }[filter.operator];
      } else if (by === 'date') {
        const day = new Date(input).getTime();
        test = { '<': m.date < day, '>': m.date > day, '=': Math.abs(m.date - day) < 864e5, '<=': m.date <= day, '>=': m.date >= day }[filter.operator];
      } else if (by === 'date_between') {
        test = m.date >= new Date(filter.dateFrom) && m.date <= new Date(filter.dateTo);
      } else if (by === 'attachment') {
        test = m.attachments.length > 0;
      } else if (by === 'favorite') {
        flaggedOnly = true;
      } else if (by === 'unseen') {
        unseenOnly = true;
      } else if (by === 'contains') {
        test = String(input).split(' ').some(w => has('subject', w) || has('body', w) || m.attachments.some(a => a.filename.toLowerCase().includes(w.toLowerCase())));
      } else if (by === 'not_contains') {
        test = String(input).split(' ').every(w => !has('subject', w) && !has('body', w));
      } else if (by === 'flags') {
        if (Array.isArray(filter.flags) && filter.flags.length) test = filter.flags.every(f => m.flags.includes(f.replace('_$', '$')));
      } else {
        test = has(by, input);
      }
      if (test === null || test === undefined) continue;
      tests.push(filter.negative ? !test : test);
    }
    const match = body.sortingAttributes && body.sortingAttributes.match;
    if (tests.length && !(match === 'OR' ? tests.some(Boolean) : tests.every(Boolean))) return false;
    if (unseenOnly && m.flags.includes('seen')) return false;
    if (flaggedOnly && !m.flags.includes('flagged')) return false;
    if (Array.isArray(body.labels) && body.labels.length && !body.labels.some(l => m.flags.includes(l))) return false;
    return true;
  }

  function fieldText(m, field) {
    const addresses = list => (list || []).map(a => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(', ');
    switch (field) {
      case 'subject': return m.subject;
      case 'from': case 'to': case 'cc': case 'bcc': return addresses(m[field]);
      case 'body': return m.text || stripTags(m.html || '');
      default: return '';
    }
  }

  // ---------------------------------------------------------------- headers rows (UIxMailListActions getHeadersForUIDs)
  function headers(folder, uids) {
    const rows = [['To', 'hasAttachment', 'isFlagged', 'Subject', 'From', 'isRead', 'Priority', 'RelativeDate', 'Size', 'Flags', 'uid', 'isAnswered', 'isForwarded']];
    const wanted = new Set(uids);
    // IMAP FETCH answers in mailbox order, whatever order the UIDs were asked in
    for (const m of [...folder.messages].sort((a, b) => a.uid - b.uid)) {
      if (!wanted.has(m.uid)) continue;
      const tags = m.flags.filter(f => !['answered', 'deleted', 'draft', 'flagged', 'recent', 'seen', '$forwarded'].includes(f));
      rows.push([
        m.to && m.to.length ? m.to : '',
        m.attachments.length ? 1 : 0,
        m.flags.includes('flagged') ? 1 : 0,
        m.subject,
        m.from && m.from.length ? m.from : '',
        m.flags.includes('seen') ? 1 : 0,
        priority(m.priority),
        relativeDate(m.date),
        formatSize(m.size),
        tags,
        m.uid,
        m.flags.includes('answered') ? 1 : 0,
        m.flags.includes('$forwarded') ? 1 : 0,
      ]);
    }
    return rows;
  }

  function priority(level = 3) {
    const names = { 1: 'highest', 2: 'high', 3: 'normal', 4: 'low', 5: 'lowest' };
    return { level, name: label(names[level] || 'normal') };
  }

  // ---------------------------------------------------------------- message parts (UI/MailPartViewers)
  function renderParts(folder, m) {
    const base = `${BASE}/Mail/0/${folderId(folder.path)}/${m.uid}/`;
    // Parts without a file name are "untitled-<part path>" (filenameForDisplay) and their URLs
    // end in "Untitled-<part>.txt" (_filenameForAttachment); a one-part message has no path
    const untitled = partPath => (partPath ? 'untitled-' + partPath.replace(/\./g, '-') : 'untitled');
    const textPart = (partPath, size) => partDict('UIxMailPartTextViewer', 'text/plain',
      parts.UIxMailPartTextViewer.replace('@@CONTENT@@', textToHTML(m.text || '')),
      untitled(partPath), 'txt', size, base, partPath, `Untitled-${partPath ? partPath.split('.').pop() : m.uid}.txt`);
    const htmlPart = partPath => partDict('UIxMailPartHTMLViewer', 'text/html',
      parts.UIxMailPartHTMLViewer.replace('@@CSS@@', '').replace('@@CONTENT@@', m.html),
      untitled(partPath), null);
    let body;
    if (m.html) {
      body = { type: 'UIxMailPartAlternativeViewer', preferredPart: 'text/html', content: [textPart(m.attachments.length ? '1.1' : '1', m.text.length), htmlPart(m.attachments.length ? '1.2' : '2')] };
    } else {
      body = textPart(m.attachments.length ? '1' : '', (m.text || '').length);
    }
    if (!m.attachments.length) return body;
    const content = [body];
    m.attachments.forEach((a, i) => {
      const partPath = String(i + 2);
      const ext = extension(a);
      const fileURL = escapeURL(a.filename.replace(/\//g, '-'));
      const viewer = (ext ? parts.UIxMailPartLinkViewer : parts.UIxMailPartLinkViewerNoExtension)
        .replace('@@TITLE@@', escapeText(a.filename.replace(/"/g, '')))
        .replace('@@EXT@@', escapeText(ext || ''))
        .replace('@@FILENAME@@', escapeText(a.filename))
        .replace('@@SIZE@@', escapeText(formatSize(a.size)))
        .replace('@@VIEW_URL@@', escapeText(base + partPath + '/' + fileURL))
        .replace('@@DOWNLOAD_URL@@', escapeText(base + partPath + '/asAttachment/' + fileURL));
      content.push(partDict('UIxMailPartLinkViewer', `${a.type}/${a.subtype}`, viewer, a.filename, ext, a.size, base, partPath, fileURL));
    });
    return { type: 'UIxMailPartMixedViewer', contentType: 'multipart/mixed', content };
  }

  // UIxMailPartViewer renderedPart builds its dictionary with dictionaryWithObjectsAndKeys,
  // which stops at the first nil: no extension → no size, URLs or shouldDisplayAttachment.
  function partDict(type, contentType, content, filename, ext, size, base, partPath, file) {
    const out = { type, contentType, content, filename };
    if (!ext) return out;
    out.extension = ext;
    out.size = formatSize(size);
    const path = partPath ? partPath.replace(/\./g, '/') + '/' : '/';
    out.viewURL = base + path + file;
    out.downloadURL = base + path + 'asAttachment/' + file;
    out.shouldDisplayAttachment = 1;
    return out;
  }

  function extension(a) {
    const t = `${a.type}/${a.subtype}`.toLowerCase();
    return { 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/svg+xml': 'svg', 'text/plain': 'txt',
      'text/xml': 'xml', 'text/calendar': 'ics', 'text/x-vcard': 'vcf', 'message/rfc822': 'eml', 'application/pdf': 'pdf' }[t] || null;
  }

  function attachmentAttrs(a) {
    return { filename: a.filename, mimetype: `${a.type}/${a.subtype}`, size: a.size };
  }

  // ---------------------------------------------------------------- helpers
  function identityFrom() {
    return `${data.fullName} <${data.login}>`;
  }

  function label(key) {
    return data.labels.MailerUI[key] || data.labels.Common[key] || key;
  }

  function labelsFor(framework) {
    const strings = { MailerUI: data.labels.MailerUI, CommonUI: data.labels.Common, PreferencesUI: data.labels.PreferencesUI,
      ...apps.labels }[framework];
    if (!strings) return null;
    return json(200, { labels: { ...strings, _loadedFrameworks: [framework] } });
  }

  function contactSearch(search) {
    if (!search) return [];
    const people = new Map();
    for (const folder of Object.values(store.folders)) {
      for (const m of folder.messages) for (const a of [...m.from, ...m.to]) if (a.email !== data.login) people.set(a.email, a.name || '');
    }
    const q = String(search).toLowerCase();
    return [...people].filter(([email, name]) => email.includes(q) || name.toLowerCase().includes(q))
      .map(([email, name], i) => ({ id: `contact${i}.vcf`, c_name: `contact${i}.vcf`, c_cn: name, c_mail: [email], emails: [{ value: email, type: 'work' }], sourceid: 'personal', c_component: 'vcard', isGroup: 0 }));
  }

  function zoned(date) {
    const fields = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'long', hourCycle: 'h23',
    }).formatToParts(date);
    const get = type => fields.find(p => p.type === type).value;
    const y = Number(get('year')), mo = Number(get('month')), d = Number(get('day'));
    return { y, mo, d, H: get('hour'), M: get('minute'), S: Number(get('second')), weekday: get('weekday'), day: Date.UTC(y, mo - 1, d) / 864e5 };
  }

  function relativeDate(date) {
    // UIxMailListActions messageDate, user time zone, SOGoTimeFormat %H:%M, SOGoShortDateFormat %d-%b-%y
    const now = zoned(new Date()), d = zoned(date);
    const time = `${d.H}:${d.M}`;
    if (now.day === d.day) return time;
    if (now.day - d.day === 1) return `${label('Yesterday')} ${time}`;
    if (now.day - d.day < 7) return `${d.weekday} ${time}`;
    return `${String(d.d).padStart(2, '0')}-${MONTHS[d.mo - 1].slice(0, 3)}-${String(d.y).slice(2)}`;
  }

  function longDate(date) {
    // SOGoDateFormatter formattedDateAndTime: "%A, %B %d, %Y %H:%M %Z"
    const d = zoned(date);
    return `${d.weekday}, ${MONTHS[d.mo - 1]} ${String(d.d).padStart(2, '0')}, ${d.y} ${d.H}:${d.M} +0545`;
  }

  function currentDay() {
    const d = zoned(clock ? new Date(clock) : new Date());
    const seconds = Number(d.H) * 3600 + Number(d.M) * 60 + d.S;
    return {
      weekday: d.weekday, month: MONTHS[d.mo - 1], day: String(d.d).padStart(2, '0'), year: String(d.y),
      abbr: { weekday: d.weekday.slice(0, 3), month: MONTHS[d.mo - 1].slice(0, 3) }, secondsBeforeTomorrow: 86400 - seconds,
    };
  }

  function folderFromId(id) {
    // '/0/folderArchive' (moveMessages) or '0/folderINBOX' (unseenCount)
    const components = String(id || '').split('/').filter(Boolean);
    if (components[0] !== '0') return null;
    return store.folders[components.slice(1).map(c => fromCSSIdentifier(c.replace(/^folder/, ''))).join('/')] || null;
  }

  return backend;
}

// ------------------------------------------------------------------ responses
function json(status, value, kind) {
  // responseWithStatus:andJSONRepresentation: → application/json; andString: → text/plain
  return { status, headers: { 'content-type': kind === 'string' ? 'text/plain; charset=utf-8' : 'application/json' }, body: sogoJSON(value) };
}
function text(status, body) {
  return { status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body };
}
function empty(status) {
  return { status, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: '' };
}
function html(body) {
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
}

function parseBody(request) {
  const raw = request.postData();
  if (raw === null || raw === undefined || raw === '') return null;
  try { return JSON.parse(raw); } catch (e) { /* not JSON */ }
  if (/x-www-form-urlencoded/.test(request.headers()['content-type'] || '')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

/** jsonRepresentation as SOGo writes it: {"k":v} without spaces, [a, b] with one. */
export function sogoJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(sogoJSON).join(', ') + ']';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'object') return '{' + Object.entries(value).map(([k, v]) => JSON.stringify(k) + ':' + sogoJSON(v)).join(',') + '}';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return JSON.stringify(value);
}

// ------------------------------------------------------------------ SOGo string helpers
const CSS_ESCAPES = { _U_: '_', _D_: '.', _H_: '#', _A_: '@', _S_: '*', _C_: ':', _SC_: ';', _CO_: ',', _SP_: ' ', _SQ_: "'",
  _DQ_: '"', _LP_: '(', _RP_: ')', _LS_: '[', _RS_: ']', _LC_: '{', _RC_: '}', _AM_: '&', _P_: '+', _DS_: '$' };
const CSS_RE = new RegExp(Object.keys(CSS_ESCAPES).sort((a, b) => b.length - a.length).join('|'), 'g');

function fromCSSIdentifier(s) {
  return s.replace(/^_(?=\d)/, '').replace(CSS_RE, m => CSS_ESCAPES[m]);
}

function asCSSIdentifier(s) {
  const map = { _: '_U_', '.': '_D_', '#': '_H_', '@': '_A_', '*': '_S_', ':': '_C_', ',': '_CO_', ' ': '_SP_', "'": '_SQ_', '&': '_AM_', '+': '_P_' };
  let out = s.replace(/[_.#@*:, '&+]/g, c => map[c]).replace(/[^\x00-\x7F]/g, '');
  if (/^\d/.test(out)) out = '_' + out;
  return out;
}

function folderId(path) {
  return path.split('/').map(c => 'folder' + asCSSIdentifier(c)).join('/');
}

function escapeText(s) {
  // NSString stringByEscapingHTMLString: & < > and non-ASCII characters
  return String(s).replace(/[&<>]|[^\x00-\x7F]/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || `&#${c.codePointAt(0)};`));
}

function escapeURL(s) {
  return encodeURIComponent(s).replace(/%2F/g, '/');
}

function textToHTML(text) {
  // UIxMailPartTextViewer: escape, link URLs and addresses, then \n → <br />
  let out = escapeText(text);
  out = out.replace(/\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s<>()\[\]]+/g, url => {
    const trimmed = url.replace(/[=,.:;&()>]+$/, '');
    return `<a rel="noopener" href="${trimmed}">${trimmed}</a>` + url.slice(trimmed.length);
  });
  out = out.replace(/(^|[\s(])([a-zA-Z0-9!#$%'*+\-/=?^`{|}~.]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/g,
    (all, before, email) => `${before}<a rel="noopener" href="mailto:${email}">${email}</a>`);
  return out.replace(/\r/g, '').replace(/\n/g, '<br />');
}

function stripTags(s) {
  return String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function formatSize(size) {
  // UIxMailSizeFormatter
  if (size > KiB * KiB) return (size / KiB / KiB).toFixed(1) + ' MiB';
  if (size > KiB * 100) return Math.floor(size / KiB) + ' KiB';
  if (size > KiB) return (size / KiB).toFixed(1) + ' KiB';
  return size + ' B';
}

function parseAddress(s) {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(String(s));
  if (match) return match[1] ? { email: match[2], name: match[1] } : { email: match[2] };
  return { email: String(s).trim() };
}

function addressList(list) {
  return (list || []).map(a => (a.name ? `${a.name} <${a.email}>` : a.email));
}

function quote(m) {
  const from = m.from[0] ? (m.from[0].name || m.from[0].email) : '';
  const body = m.html || escapeText(m.text || '').replace(/\n/g, '<br />');
  return `<p></p><p>On ${m.date.toUTCString()}, ${escapeText(from)} wrote:</p><blockquote type="cite">${body}</blockquote>`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ------------------------------------------------------------------ seed data
const me = { email: 'bibek@rabbittech.com.np', name: 'Bibek Gupta' };
const people = {
  sita: { email: 'sita.sharma@rabbittech.com.np', name: 'Sita Sharma' },
  ramesh: { email: 'ramesh.thapa@rabbittech.com.np', name: 'Ramesh Thapa' },
  anjali: { email: 'anjali.karki@rabbittech.com.np', name: 'Anjali Karki' },
  prakash: { email: 'prakash.adhikari@rabbittech.com.np', name: 'Prakash Adhikari' },
  hr: { email: 'hr@rabbittech.com.np', name: 'RabbitTech HR' },
  alerts: { email: 'alerts@rabbittech.com.np', name: 'RabbitTech Monitoring' },
  ci: { email: 'ci@rabbittech.com.np', name: 'Build Server' },
  weekly: { email: 'news@rabbittech.com.np', name: 'RabbitTech Weekly' },
  nisha: { email: 'nisha.gurung@everestlogistics.example', name: 'Nisha Gurung' },
  bikash: { email: 'bikash@himalayanbrew.example', name: 'Bikash Rai' },
  accounts: { email: 'accounts@ktmcloud.example', name: 'KTM Cloud Billing' },
  pooja: { email: 'pooja.shrestha@lumbinitours.example', name: 'Pooja Shrestha' },
  dev: { email: 'devteam@rabbittech.com.np', name: 'Dev Team' },
};
const pdf = (filename, size) => ({ filename, type: 'application', subtype: 'pdf', size });
const docx = (filename, size) => ({ filename, type: 'application', subtype: 'vnd.openxmlformats-officedocument.wordprocessingml.document', size });
const xlsx = (filename, size) => ({ filename, type: 'application', subtype: 'vnd.openxmlformats-officedocument.spreadsheetml.sheet', size });
const zip = (filename, size) => ({ filename, type: 'application', subtype: 'zip', size });
const min = 60e3, hour = 60 * min, day = 24 * hour;

// Newest first. flags use SOGo's lower-case IMAP names: seen, flagged, answered, $forwarded, $label1...
const INBOX = [
  [12 * min, people.alerts, 'Disk usage on mail.rabbittech.com.np above 80%', ['flagged'], 'The /var/lib/docker volume on mail.rabbittech.com.np is 82% full.\n\nCheck the dashboard: https://status.rabbittech.com.np/disk\n\n-- RabbitTech Monitoring'],
  [48 * min, people.nisha, 'Re: Shipment tracking portal – go-live date', [], 'Hi Bibek,\n\nThanks for the demo yesterday. Our operations team is happy with the tracking page. Can we go live on the 25th?\n\nBest regards,\nNisha Gurung\nEverest Logistics'],
  [2 * hour, people.sita, 'Sprint 42 planning notes', ['$label2'], 'Hi all,\n\nNotes from today\'s planning are attached. Please review the estimates before Friday.\n\nSita', [docx('Sprint-42-planning.docx', 48211)]],
  [3.7 * hour, people.accounts, 'Invoice INV-2026-1043 for October', [], 'Dear customer,\n\nYour invoice INV-2026-1043 (NPR 48,600.00) is attached and due on 30 October 2026.\n\nKTM Cloud Billing', [pdf('INV-2026-1043.pdf', 184320)]],
  [5 * hour, people.ci, '[rabbittech/portal] Pipeline #1287 passed', ['seen'], 'Pipeline #1287 for branch main passed in 6m 12s.\n\nhttps://ci.rabbittech.com.np/rabbittech/portal/pipelines/1287'],
  [day + 2 * hour, people.ramesh, 'Server migration checklist', ['seen', 'flagged', 'answered'], 'Bibek,\n\nHere is the checklist for moving the mail server to the new host. Step 7 (DNS TTL) needs to happen two days before.\n\nRamesh', [xlsx('migration-checklist.xlsx', 22118)]],
  [day + 5 * hour, people.bikash, 'Website quotation request', [], 'Namaste,\n\nWe are looking for a new website for Himalayan Brew with online ordering. Could you send us a quotation?\n\nThanks,\nBikash Rai'],
  [2 * day, people.hr, 'Dashain holiday schedule', ['seen', '$label1'], 'Dear team,\n\nThe office will be closed from 20 to 26 October for Dashain. Happy holidays!\n\nRabbitTech HR'],
  [2 * day + 6 * hour, people.anjali, 'Design review: mobile app onboarding', ['seen'], 'Hi Bibek,\n\nThe new onboarding screens are ready for review. Feedback by Thursday would be great.\n\nAnjali'],
  [3 * day, people.weekly, 'RabbitTech Weekly #37', ['seen'], 'This week at RabbitTech: new office plants, the portal launch and a farewell lunch for Kiran.', null, '<p><strong>This week at RabbitTech</strong></p><ul><li>New office plants</li><li>The portal launch</li><li>A farewell lunch for Kiran</li></ul><p>Read more on the <a href="https://intranet.rabbittech.com.np/weekly/37">intranet</a>.</p>'],
  [4 * day, people.prakash, 'Re: SSL certificate renewal', ['seen', 'answered'], 'The certificate for portal.rabbittech.com.np was renewed this morning. Expiry is now 13 January 2027.\n\nPrakash'],
  [5 * day, people.pooja, 'Booking engine contract', ['seen', 'flagged'], 'Dear Bibek,\n\nPlease find the signed contract for the booking engine project attached.\n\nKind regards,\nPooja Shrestha\nLumbini Tours', [pdf('Lumbini-Tours-contract-signed.pdf', 402115)]],
  [6 * day, people.ci, '[rabbittech/portal] Pipeline #1271 failed', ['seen'], 'Pipeline #1271 for branch feature/payments failed at stage test.\n\nhttps://ci.rabbittech.com.np/rabbittech/portal/pipelines/1271'],
  [7 * day, people.dev, 'Code freeze for release 3.4', ['seen'], 'Reminder: code freeze for release 3.4 starts Monday 09:00.\n\nDev Team'],
  [8 * day, people.nisha, 'Shipment tracking portal – go-live date', ['seen', 'answered'], 'Hi Bibek,\n\nWhen can we expect the tracking portal to go live?\n\nNisha'],
  [9 * day, people.sita, 'Leave request approved', ['seen'], 'Your leave request for 3 November has been approved.\n\nSita'],
  [10 * day, people.accounts, 'Payment received – INV-2026-0988', ['seen'], 'We have received your payment of NPR 48,600.00. Thank you.\n\nKTM Cloud Billing'],
  [12 * day, people.ramesh, 'Backup restore test results', ['seen', '$forwarded'], 'The monthly restore test passed: mail, database and files restored in 41 minutes.\n\nRamesh', [zip('restore-test-logs.zip', 1572864)]],
  [13 * day, people.anjali, 'Icons for the dashboard', ['seen'], 'Attached are the icons for the new dashboard, SVG and PNG.\n\nAnjali'],
  [14 * day, people.weekly, 'RabbitTech Weekly #36', ['seen'], 'This week at RabbitTech: hackathon results and the new coffee machine.', null, '<p><strong>This week at RabbitTech</strong></p><p>Hackathon results and the new coffee machine.</p>'],
  [16 * day, people.bikash, 'Re: Website quotation request', ['seen'], 'Thanks for the call. We will send the menu and photos next week.\n\nBikash'],
  [18 * day, people.prakash, 'VPN access for new interns', ['seen', 'flagged'], 'Can you create VPN accounts for the three new interns starting next week?\n\nPrakash'],
  [20 * day, people.hr, 'Updated travel policy', ['seen', '$label1'], 'The updated travel policy is attached. It applies from 1 October.\n\nRabbitTech HR', [pdf('Travel-policy-2026.pdf', 96000)]],
  [21 * day, people.dev, 'Postmortem: API outage on 22 September', ['seen'], 'Summary: the API was unavailable for 18 minutes because of an expired database password. Action items inside.\n\nDev Team'],
  [23 * day, people.pooja, 'Meeting next Tuesday?', ['seen', 'answered'], 'Would Tuesday 11:00 work for a call about the booking engine?\n\nPooja'],
  [25 * day, people.sita, 'Quarterly goals', ['seen'], 'Please add your quarterly goals to the shared sheet before the end of the month.\n\nSita'],
  [27 * day, people.accounts, 'Invoice INV-2026-0988 for September', ['seen'], 'Your invoice INV-2026-0988 is attached.\n\nKTM Cloud Billing', [pdf('INV-2026-0988.pdf', 181240)]],
  [29 * day, people.ramesh, 'New firewall rules', ['seen'], 'I have opened port 4190 for ManageSieve on the mail server. Let me know if anything breaks.\n\nRamesh'],
  [32 * day, people.alerts, 'Weekly uptime report', ['seen'], 'Uptime last week: mail 99.98%, portal 100%, API 99.91%.'],
  [35 * day, people.nisha, 'Introduction: Everest Logistics', ['seen'], 'Hello Bibek,\n\nI was given your address by Pooja Shrestha. We are looking for a partner to build a shipment tracking portal.\n\nNisha Gurung'],
];

function seed(now, olderMessages) {
  const store = { modseq: 1, folders: {}, drafts: {}, draftCount: 0, settings: {}, sent: [] };
  const folder = (path, type, flags) => (store.folders[path] = { path, type, flags, uidNext: 1, messages: [], expunged: [] });
  const add = (f, ago, from, subject, flags, text, attachments = [], html = null, to = [me], extra = {}) => {
    const size = 2400 + text.length + (html ? html.length : 0) + attachments.reduce((s, a) => s + Math.round(a.size * 1.37), 0);
    const m = { uid: f.uidNext++, modseq: ++store.modseq, subject, from: [from], to, cc: [], bcc: [], date: new Date(now.getTime() - ago),
      size, flags: [...flags], text, html, attachments, priority: 3, ...extra };
    f.messages.push(m);
    return m;
  };
  // Folders as mailcow's Dovecot lists them (special-use flags lower-cased by SOPE)
  const inbox = folder('INBOX', 'inbox', ['hasnochildren']);
  const drafts = folder('Drafts', 'draft', ['hasnochildren', 'drafts']);
  const sent = folder('Sent', 'sent', ['hasnochildren', 'sent']);
  const trash = folder('Trash', 'trash', ['hasnochildren', 'trash']);
  const junk = folder('Junk', 'junk', ['hasnochildren', 'junk']);
  const archive = folder('Archive', 'folder', ['hasnochildren', 'archive']);
  const projects = folder('Projects', 'folder', ['haschildren']);
  const website = folder('Projects/Website', 'folder', ['hasnochildren']);
  const receipts = folder('Receipts', 'folder', ['hasnochildren']);

  // Older messages get lower UIDs (arrival order). olderMessages adds read notifications from
  // before those, so the Inbox has more than the 100 rows SOGo sends with the list and the app
  // asks for the others with "headers" while scrolling.
  const senders = Object.values(people);
  for (let i = olderMessages; i > 0; i--) {
    const from = senders[i % senders.length];
    add(inbox, 36 * day + i * 7 * hour, from, `Older message ${i} from ${from.name}`, ['seen'], `Archived conversation number ${i}.`);
  }
  for (const [ago, from, subject, flags, text, attachments, html] of [...INBOX].reverse()) add(inbox, ago, from, subject, flags, text, attachments || [], html || null);
  inbox.messages[inbox.messages.length - 1].cc = [people.ramesh];
  inbox.messages.find(m => m.subject.startsWith('Sprint 42')).to = [people.dev];
  inbox.messages.find(m => m.subject.startsWith('Sprint 42')).cc = [me, people.anjali];

  add(archive, 60 * day, people.pooja, 'Lumbini Tours – project kickoff', ['seen'], 'Kickoff notes for the booking engine project.');
  add(archive, 52 * day, people.accounts, 'Invoice INV-2026-0911 for August', ['seen'], 'Your invoice INV-2026-0911 is attached.', [pdf('INV-2026-0911.pdf', 179000)]);
  add(archive, 45 * day, people.ramesh, 'Old mail server decommissioned', ['seen'], 'The old server is switched off. Backups are kept for 90 days.');

  const sentTo = (ago, to, subject, text) => add(sent, ago, me, subject, ['seen'], text, [], null, [to]);
  sentTo(day, people.ramesh, 'Re: Server migration checklist', 'Thanks Ramesh, I will lower the TTL on Friday.\n\nBibek');
  sentTo(4 * day, people.prakash, 'Re: SSL certificate renewal', 'Great, thanks for taking care of it.\n\nBibek');
  sentTo(8 * day, people.nisha, 'Re: Shipment tracking portal – go-live date', 'Hi Nisha,\n\nWe are aiming for the week of the 20th. I will confirm after the demo.\n\nBibek');
  sentTo(23 * day, people.pooja, 'Re: Meeting next Tuesday?', 'Tuesday 11:00 works for me.\n\nBibek');

  add(drafts, 3 * hour, me, 'Proposal: Himalayan Brew website', ['seen', 'draft'], 'Hi Bikash,\n\nPlease find our proposal below.\n\n', [], null, [people.bikash]);

  add(junk, 2 * day, { email: 'winner@lottery-prize.example', name: 'Prize Department' }, 'You have WON 1,000,000 USD!!!', [], 'Claim your prize now by sending your bank details.');
  add(junk, 6 * day, { email: 'seo@rank-first.example', name: 'SEO Experts' }, 'Rank #1 on Google in 7 days', [], 'Guaranteed first page results for rabbittech.com.np.');

  add(trash, 9 * day, people.weekly, 'RabbitTech Weekly #35', ['seen'], 'Old newsletter.');
  add(trash, 15 * day, people.ci, '[rabbittech/portal] Pipeline #1190 passed', ['seen'], 'Pipeline #1190 passed.');

  add(projects, 11 * day, people.sita, 'Project budget overview 2026', ['seen'], 'Budget overview for all client projects.', [xlsx('budget-2026.xlsx', 35100)]);
  add(website, 17 * day, people.anjali, 'Homepage mockups v2', ['seen'], 'Second version of the homepage mockups.', [pdf('homepage-v2.pdf', 2304000)]);
  add(website, 4 * day, people.anjali, 'Homepage copy review', [], 'Can you review the homepage copy before Friday?');
  add(receipts, 26 * day, people.accounts, 'Receipt for payment #88231', ['seen'], 'Thank you for your payment.');
  add(receipts, 56 * day, people.accounts, 'Receipt for payment #87110', ['seen'], 'Thank you for your payment.');

  for (const f of [inbox, drafts, sent, trash, junk, archive, projects, website, receipts]) f.messages.sort((a, b) => a.uid - b.uid);
  return store;
}

function unseenCount(folder) {
  return folder ? folder.messages.filter(m => !m.flags.includes('seen')).length : 0;
}
