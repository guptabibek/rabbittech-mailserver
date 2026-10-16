// The Calendar and Contacts part of the fake SOGo server (backend.mjs routes /Calendar/ and
// /Contacts/ requests here). Answers with the JSON shapes SOGo 5.12 sends:
//   Calendar: UI/Scheduler/UIxCalListingActions.m (eventslist, eventsblocks, taskslist),
//             UIxCalMainActions.m, UIxAppointmentEditor.m / UIxTaskEditor.m (view, save)
//   Contacts: UI/Contacts/UIxContactFoldersView.m, UIxContactsListActions.m (view, headers),
//             UIxContactView.m / UIxContactEditor.m (card view, save)
// backed by an in-memory store of calendars, events, tasks, address books and cards. The day,
// week and month views are rendered by live.py for the weeks around TODAY (apps.json), the date
// the tests pin the browser's clock to; the store's events sit in that week.

const OFFSET = (5 * 60 + 45) * 60;              // Asia/Kathmandu, no daylight saving
const DAY = 86400;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const EVENT_FIELDS = ['c_name', 'c_folder', 'calendarName', 'c_status', 'c_isopaque', 'c_title', 'c_startdate', 'startHour',
  'c_enddate', 'c_location', 'c_isallday', 'c_classification', 'c_category', 'c_priority', 'c_partmails', 'c_partstates',
  'c_owner', 'c_iscycle', 'c_nextalarm', 'c_recurrence_id', 'isException', 'viewable', 'editable', 'erasable',
  'ownerIsOrganizer', 'c_description'];
const TASK_FIELDS = ['c_name', 'c_folder', 'calendarName', 'c_status', 'c_title', 'c_startdate', 'c_enddate',
  'c_classification', 'c_location', 'c_category', 'viewable', 'editable', 'erasable', 'c_priority', 'c_owner',
  'c_iscycle', 'c_nextalarm', 'c_recurrence_id', 'isException', 'c_description'];
const HEADER_FIELDS = ['id', 'c_name', 'c_component', 'c_cn', 'c_givenname', 'c_sn', 'c_screenname', 'c_o', 'emails',
  'c_mail', 'phones', 'c_telephonenumber', 'c_categories'];

// ------------------------------------------------------------------ local time (user time zone)
/** Seconds since 1970 of a local date and time: at('2026-10-15', '10:00') */
export function at(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number);
  const [H, M] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, H, M) / 1000 - OFFSET;
}
function local(seconds) {
  const d = new Date((seconds + OFFSET) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(),
    weekday: d.getUTCDay(), day: Math.floor((seconds + OFFSET) / DAY) };
}
const pad = n => String(n).padStart(2, '0');
const ymd = seconds => { const l = local(seconds); return `${l.y}${pad(l.m)}${pad(l.d)}`; };
const isoDay = seconds => { const l = local(seconds); return `${l.y}-${pad(l.m)}-${pad(l.d)}`; };
const hhmm = seconds => { const l = local(seconds); return `${pad(l.H)}:${pad(l.M)}`; };
const fromYMD = s => at(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
const iso8601 = seconds => `${isoDay(seconds)}T${hhmm(seconds)}:00+0545`;
// SOGoDateFormatter formattedDate (SOGoLongDateFormat "%A, %B %d, %Y")
const longDate = seconds => { const l = local(seconds); return `${DAYS[l.weekday]}, ${MONTHS[l.m - 1]} ${pad(l.d)}, ${l.y}`; };

// ------------------------------------------------------------------ seed
function seedCalendar(today, calendars) {
  // today: 'YYYY-MM-DD', a Thursday; Monday of that week is `week`
  const base = at(today);
  const dayOf = offset => isoDay(base + offset * DAY);
  const ev = (id, pid, offset, start, end, summary, extra = {}) => ({
    id: id + '.ics', pid, summary, start: at(dayOf(offset), start), end: at(dayOf(offset), end), allDay: false,
    location: '', description: '', categories: [], ...extra,
  });
  const events = [
    ev('backup-drill', 'work', -8, '10:00', '11:00', 'Backup restore drill'),
    ev('standup-1', 'work', -3, '09:00', '09:30', 'Team standup', { location: 'Huddle room' }),
    ev('design-review', 'work', -2, '14:00', '15:00', 'Design review', { location: 'Meeting room 2', categories: ['Meeting'] }),
    ev('relay-migration', 'work', -1, '10:00', '11:30', 'Relay migration'),
    ev('lunch-nabin', 'personal', -1, '11:00', '12:00', 'Lunch with Nabin', { location: 'Thamel' }),
    ev('cutover', 'personal', 0, '10:00', '11:30', 'Webmail cut-over', { description: 'Move everyone to the new webmail.' }),
    ev('dentist', 'family', 0, '16:00', '17:00', 'Dentist'),
    { ...ev('dashain', 'family', 1, '00:00', '00:00', 'Dashain holiday'), allDay: true, end: at(dayOf(2)) },
    ev('family-dinner', 'family', 2, '18:00', '21:00', 'Family dinner'),
    ev('standup-2', 'work', 4, '09:00', '09:30', 'Team standup', { location: 'Huddle room' }),
    ev('quarterly', 'work', 7, '15:00', '16:00', 'Quarterly review'),
  ];
  const task = (id, pid, summary, due, status = 'needs-action') => ({ id: id + '.ics', pid, summary, due, status, start: null });
  const tasks = [
    task('renew-tls', 'work', 'Renew TLS certificate', at(dayOf(5), '17:00')),
    task('tickets', 'personal', 'Book Dashain tickets', at(dayOf(1), '12:00')),
    task('invoices', 'work', 'Send invoices', at(dayOf(-2), '17:00'), 'completed'),
  ];
  return { calendars: calendars.map(c => ({ ...c })), events, tasks, settings: {} };
}

function seedContacts(books) {
  const card = (id, givenname, sn, email, extra = {}) => ({
    id: id + '.vcf', c_component: 'vcard', c_givenname: givenname, c_sn: sn, c_fn: `${givenname} ${sn}`,
    emails: email ? [{ type: 'work', value: email }] : [], phones: [], categories: [], org: '', ...extra,
  });
  return {
    books: books.map(b => ({ ...b })),
    cards: {
      personal: [
        card('sita', 'Sita', 'Sharma', 'sita@example.com', { phones: [{ type: 'cell', value: '+977 980-1234567' }],
          birthday: '1994-03-21', categories: [{ value: 'Colleague' }], org: 'RabbitTech', title: 'Designer' }),
        card('ram', 'Ram', 'Thapa', 'ram@example.net', { org: 'Himal Traders' }),
        card('nabin', 'Nabin', 'Karki', 'nabin@example.org', { phones: [{ type: 'work', value: '+977 1-4412345' }] }),
        card('anita', 'Anita', 'Gurung', 'anita@example.com'),
        card('bikash', 'Bikash', 'Shrestha', 'bikash@example.com', { org: 'Everest Bank' }),
        card('maya', 'Maya', 'Rai', 'maya@example.com'),
        card('prakash', 'Prakash', 'Adhikari', 'prakash@example.com'),
        card('suman', 'Suman', 'Lama', 'suman@example.com'),
        { id: 'team.vcf', c_component: 'vlist', c_fn: 'Design team', nickname: '', description: 'Everyone in design',
          refs: [{ reference: 'sita.vcf', email: 'sita@example.com', fn: 'Sita Sharma' },
            { reference: 'anita.vcf', email: 'anita@example.com', fn: 'Anita Gurung' }] },
      ],
      collected: [card('support', 'Support', 'Desk', 'support@vendor.example')],
      global: [card('admin', 'Postmaster', '', 'postmaster@rabbittech.com.np')],
    },
  };
}

// ------------------------------------------------------------------ handlers
export function appsBackend({ apps, files, json, text, empty, html, login, pageFilter, custom, currentDayJSON }) {
  const today = apps.today;
  const cal = seedCalendar(today, apps.calendars);
  const con = seedContacts(apps.addressBooks);
  const calendarFile = name => files('calendar/' + name);
  const contactsFile = name => files('contacts/' + name);
  const label = key => apps.labels.SchedulerUI[key] || apps.labels.ContactsUI[key] || key;
  let guid = 0;

  // ---------------------------------------------------------------- Calendar
  const calendarById = id => cal.calendars.find(c => c.id === id);
  const active = () => new Set(cal.calendars.filter(c => Number(c.active)).map(c => c.id));
  const eventById = (pid, id) => cal.events.find(e => e.pid === pid && e.id === id);
  const taskById = (pid, id) => cal.tasks.find(t => t.pid === pid && t.id === id);

  function eventRow(e) {
    const c = calendarById(e.pid);
    return [e.id, e.pid, c ? c.name : e.pid, 1, 1, e.summary, e.start, e.allDay ? '' : hhmm(e.start), e.end,
      e.location || '', e.allDay ? 1 : 0, 0, e.categories && e.categories.length ? e.categories : null, 0, null, null,
      login, 0, 0, null, 0, 1, 1, 1, 1, e.description || ''];
  }

  function relativeDay(seconds, allDay) {
    // UIxCalListingActions _formattedDateForSeconds
    const delta = local(seconds).day - local(at(today)).day;
    if (delta === 0) return allDay ? label('Today') : hhmm(seconds);
    if (delta === -1) return label('Yesterday');
    if (delta === 1) return label('Tomorrow');
    const weekday = DAYS[local(seconds).weekday];
    if (Math.abs(delta) < 7) return delta > 0 ? weekday : label('Last %@').replace('%@', weekday);
    const l = local(seconds);
    return `${pad(l.d)}-${MONTHS[l.m - 1].slice(0, 3)}-${String(l.y).slice(2)}`;
  }

  function range(query) {
    // UIxCalListingActions _setupDatesWithPopup:andUserTZ: for the list's filters
    const day = query.day ? fromYMD(query.day) : at(today);
    const start = at(today);
    switch (query.filterpopup) {
      case 'view_selectedday': return [day, day + DAY];
      case 'view_today': return [start, start + DAY];
      case 'view_next14': return [start, start + 15 * DAY];
      case 'view_next31': return [start, start + 32 * DAY];
      case 'view_all': return [-Infinity, Infinity];
      case 'view_future': return [start, Infinity];
      default: return [start, start + 8 * DAY];        // view_next7
    }
  }

  function matches(e, query) {
    const value = String(query.value || '').toLowerCase();
    if (!value) return true;
    const haystack = query.search === 'entireContent'
      ? [e.summary, e.location, e.description, ...(e.categories || [])] : [e.summary, e.location, ...(e.categories || [])];
    return haystack.some(s => String(s || '').toLowerCase().includes(value));
  }

  function eventsList(query) {
    const [from, to] = range(query);
    const shown = active();
    const events = {};
    cal.events.filter(e => shown.has(e.pid) && e.end > from && e.start < to && matches(e, query))
      .sort((a, b) => a.start - b.start)
      .forEach(e => {
        const l = local(e.start), month = `${l.y}${pad(l.m)}`, day = ymd(e.start);
        const monthData = events[month] || (events[month] = { month: `${MONTHS[l.m - 1]} ${l.y}`, days: {} });
        const dayData = monthData.days[day] || (monthData.days[day] = {
          month: MONTHS[l.m - 1].slice(0, 3), monthDay: String(l.d).padStart(2, ' '), weekDay: DAYS[l.weekday].slice(0, 3), events: [] });
        dayData.events.push([...eventRow(e), relativeDay(e.start, e.allDay), relativeDay(e.end, e.allDay)]);
      });
    return { fields: [...EVENT_FIELDS, 'formatted_startdate', 'formatted_enddate', 'userState'], events };
  }

  function tasksList(query) {
    const shown = active();
    const showCompleted = Number(query.show_completed) === 1;
    const now = at(today);
    const tasks = cal.tasks.filter(t => shown.has(t.pid) && (showCompleted || t.status !== 'completed') && matches(t, query))
      .map(t => {
        const c = calendarById(t.pid);
        let flag = 'noduedate';
        if (t.status === 'completed') flag = 'completed';
        else if (t.due && t.due < now) flag = 'overdue';
        else if (t.due && local(t.due).day === local(now).day) flag = 'duetoday';
        else if (t.due) flag = 'duelater';
        return [t.id, t.pid, c ? c.name : t.pid, t.status, t.summary, t.start || 0, t.due || 0, 0, '', null, 1, 1, 1, 0,
          login, 0, 0, null, 0, '', flag, t.due ? relativeDay(t.due, false) : null];
      });
    return { fields: [...TASK_FIELDS, 'status', 'formatted_enddate'], tasks };
  }

  function eventsBlocks(query) {
    // UIxCalListingActions eventsBlocksAction: one list of blocks per day, a block per event and day
    const start = fromYMD(query.sd), end = fromYMD(query.ed) + DAY - 1;
    const dayBased = query.view !== 'monthview';
    const shown = active();
    const events = cal.events.filter(e => shown.has(e.pid) && e.end > start && e.start <= end).sort((a, b) => a.start - b.start);
    const nbrDays = 1 + Math.floor((end - start) / DAY);
    const blocks = Array.from({ length: nbrDays }, () => []);
    const allDayBlocks = Array.from({ length: nbrDays }, () => []);
    events.forEach((e, nbr) => {
      const target = dayBased && e.allDay ? allDayBlocks : blocks;
      let current = Math.max(e.start, start);
      let offset = Math.floor((current - start) / DAY);
      let dayStart = start + offset * DAY;
      const eventEnd = Math.min(e.end, end);
      const block = (from, to) => {
        const b = { nbr };
        if (dayBased) {
          const quarterStart = Math.floor((from - dayStart) / 900);
          let delta = Math.min(to - dayStart, DAY);
          if (delta % 900) delta += 900;
          b.start = quarterStart;
          b.length = Math.max(1, Math.floor(delta / 900) - quarterStart);
        }
        return b;
      };
      while (dayStart + DAY < eventEnd) {
        target[offset].push(block(current, dayStart + DAY - 1));
        dayStart += DAY; current = dayStart; offset++;
      }
      target[offset].push(block(current, eventEnd <= current ? current + 300 : eventEnd));
    });
    if (dayBased) blocks.forEach(addBlocksWidth);
    return [{ eventsFields: EVENT_FIELDS, events: events.map(eventRow), allDayBlocks, blocks,
      days: blocks.map((_, i) => ({ date: ymd(start + i * DAY), number: i })) }];
  }

  function addBlocksWidth(day) {
    // _horizontalBlocks, _computeBlocksSiblings (twice), _computeBlocksPosition
    day.sort((a, b) => a.start - b.start);
    const quarters = [], groups = [];
    for (const event of day) {
      for (let q = event.start; q < event.start + event.length; q++) {
        if (!quarters[q]) { quarters[q] = []; groups.push(quarters[q]); }
        quarters[q].push(event);
      }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const group of groups) {
        const max = Math.max(group.length, ...group.map(e => e.siblings || 0));
        group.forEach(e => { e.siblings = max; e.realSiblings = group.length; });
      }
    }
    for (const group of groups) {
      const taken = [];
      group.forEach(e => { if (e.position !== undefined) taken[e.position] = e; });
      group.forEach(e => {
        if (e.position !== undefined) return;
        let j = 0;
        while (j < group.length && taken[j]) j++;
        taken[j] = e; e.position = j;
      });
    }
  }

  function componentView(c, type) {
    const calendarName = (calendarById(c.pid) || {}).name || c.pid;
    if (type === 'vtodo') {
      return { pid: c.pid, calendar: calendarName, id: c.id, component: 'vtodo', summary: c.summary, status: c.status,
        isEditable: 1, isErasable: 1, classification: 'public', priority: 0, percentComplete: c.status === 'completed' ? 100 : 0,
        ...(c.due ? { dueDate: iso8601(c.due), localizedDueDate: longDate(c.due), localizedDueTime: hhmm(c.due) } : {}) };
    }
    return {
      pid: c.pid, calendar: calendarName, isAllDay: c.allDay ? 1 : 0, isEditable: 1, isErasable: 1, userHasRSVP: 0,
      startDate: iso8601(c.start), endDate: iso8601(c.end), localizedStartDate: longDate(c.start),
      localizedEndDate: longDate(c.allDay ? c.end - DAY : c.end), id: c.id,
      ...(c.allDay ? {} : { localizedStartTime: hhmm(c.start), localizedEndTime: hhmm(c.end) }),
      component: 'vevent', summary: c.summary, ...(c.location ? { location: c.location } : {}),
      ...(c.description ? { comment: c.description } : {}), ...(c.categories.length ? { categories: c.categories } : {}),
      classification: 'public', priority: 0, isTransparent: 0, sendAppointmentNotifications: 1, status: 'confirmed',
    };
  }

  function saveComponent(pid, id, body, type) {
    // UIxAppointmentEditor / UIxTaskEditor saveAction: startDate/startTime... from the form
    if (type === 'vtodo') {
      const existing = taskById(pid, id);
      const task = existing || { id, pid, start: null };
      Object.assign(task, { summary: body.summary || '', status: body.status || 'needs-action',
        due: body.dueDate ? at(body.dueDate, body.dueTime || '00:00') : null });
      if (!existing) cal.tasks.push(task);
      return task;
    }
    const existing = eventById(pid, id);
    const event = existing || { id, pid };
    const allDay = Number(body.isAllDay) === 1 || body.isAllDay === true;
    Object.assign(event, {
      pid: body.destinationCalendar || pid, summary: body.summary || '', location: body.location || '',
      description: body.comment || '', categories: body.categories || [], allDay,
      start: at(body.startDate, allDay ? '00:00' : body.startTime),
      end: allDay ? at(body.endDate) + DAY : at(body.endDate, body.endTime),
    });
    if (!existing) cal.events.push(event);
    return event;
  }

  function calendar(entry, rest) {
    const [first, ...more] = rest;
    const q = entry.query;
    if (more.length === 0) {
      switch (first) {
        case undefined: case '': return { status: 302, headers: { location: '/SOGo/so/' + entry.user + '/Calendar/view' } };
        case 'view': return html(pageFilter(calendarFile(custom ? 'view.html' : 'view-plain.html')).replace('@@CURRENT_DAY@@', currentDayJSON()));
        case 'calendarslist': return json(200, { calendars: cal.calendars });
        case 'alarmslist': return json(200, { fields: ['c_folder', 'c_name', 'c_nextalarm'], alarms: [] }, 'string');
        case 'eventslist': return json(200, eventsList(q));
        case 'taskslist': return json(200, tasksList(q));
        case 'eventsblocks': return json(200, eventsBlocks(q));
        case 'saveFoldersActivation':
          for (const [id, value] of Object.entries(entry.body || {})) { const c = calendarById(id); if (c) c.active = Number(value); }
          return empty(204);
        case 'saveSelectedList': case 'saveListState': case 'saveFoldersOrder': return empty(204);
        case 'dayview': case 'weekview': case 'monthview': return calendarView(first, q.day);
        case 'UIxAppointmentEditorTemplate': case 'UIxAppointmentViewTemplate':
        case 'UIxTaskEditorTemplate': case 'UIxTaskViewTemplate': return html(calendarFile(first + '.html'));
      }
      return null;
    }
    const pid = first;
    entry.folder = pid;
    if (!calendarById(pid)) return null;
    if (more.length === 1) {
      switch (more[0]) {
        case 'newguid': return json(200, { pid, id: `rt-new-${++guid}.ics` });
        case 'batchDelete': {
          const uids = new Set((entry.body && entry.body.uids) || []);
          cal.events = cal.events.filter(e => !(e.pid === pid && uids.has(e.id)));
          cal.tasks = cal.tasks.filter(t => !(t.pid === pid && uids.has(t.id)));
          return empty(204);
        }
      }
      return null;
    }
    const [id, action] = more;
    entry.uid = id;
    const event = eventById(pid, id), task = taskById(pid, id);
    switch (action) {
      case 'view':
        if (event) return json(200, componentView(event, 'vevent'));
        if (task) return json(200, componentView(task, 'vtodo'));
        return null;
      case 'saveAsAppointment': saveComponent(pid, id, entry.body || {}, 'vevent'); return json(200, {});
      case 'saveAsTask': saveComponent(pid, id, entry.body || {}, 'vtodo'); return json(200, {});
      case 'save':
        if (event) saveComponent(pid, id, entry.body || {}, 'vevent');
        else if (task) saveComponent(pid, id, entry.body || {}, 'vtodo');
        else return null;
        return json(200, {});
      case 'delete':
        cal.events = cal.events.filter(e => e !== event);
        cal.tasks = cal.tasks.filter(t => t !== task);
        return empty(204);
    }
    return null;
  }

  function calendarView(view, day) {
    // live.py rendered the views by day (dayview), Monday (weekview) or first of the month (monthview)
    if (!/^\d{8}$/.test(day || '')) return null;
    let key = fromYMD(day);
    if (view === 'weekview') key -= ((local(key).weekday + 6) % 7) * DAY;
    if (view === 'monthview') key = fromYMD(day.slice(0, 6) + '01');
    try {
      return html(calendarFile(`${view}-${ymd(key)}.html`));
    } catch (e) {
      return null;            // outside the weeks live.py rendered
    }
  }

  // ---------------------------------------------------------------- Contacts
  const book = id => con.books.find(b => b.id === id);
  const cardsOf = id => con.cards[id] || (con.cards[id] = []);
  const cardById = (bookId, id) => cardsOf(bookId).find(c => c.id === id);
  const fullName = c => c.c_component === 'vlist' ? c.c_fn : (c.c_fn || [c.c_givenname, c.c_sn].filter(Boolean).join(' '));

  function header(c) {
    const email = c.emails && c.emails[0];
    const phone = c.phones && c.phones[0];
    return [c.id, c.id, c.c_component, fullName(c), c.c_givenname || '', c.c_sn || '', '', c.org || '',
      email ? [email] : [], email ? email.value : '', phone ? [phone] : [], phone ? phone.value : '',
      (c.categories || []).map(x => x.value).join(',')];
  }

  function cardMatches(c, value, fields) {
    if (!value) return true;
    const v = value.toLowerCase();
    const has = s => String(s || '').toLowerCase().includes(v);
    const all = !fields || !fields.length;
    return ((all || fields.includes('name')) && (has(fullName(c)) || has(c.c_givenname) || has(c.c_sn)))
      || ((all || fields.includes('c_mail')) && (c.emails || []).some(e => has(e.value)))
      || ((all || fields.includes('c_o')) && has(c.org))
      || ((all || fields.includes('c_categories')) && (c.categories || []).some(x => has(x.value)));
  }

  function bookView(id, body) {
    // UIxContactsListActions: all matching IDs, sorted, and the headers of the first ones
    const b = body || {};
    const cards = cardsOf(id).filter(c => cardMatches(c, b.value, b.search))
      .sort((x, y) => fullName(x).localeCompare(fullName(y)) * (Number(b.asc) === 0 ? -1 : 1));
    const result = { id, cardDavURL: (book(id).urls || {}).cardDavURL, ids: cards.map(c => c.id) };
    if (Number(b.partial) === 1) result.headers = [HEADER_FIELDS, ...cards.slice(0, 100).map(header)];
    else result.headers = [HEADER_FIELDS, ...cards.map(header)];
    return result;
  }

  function cardView(bookId, c) {
    if (c.c_component === 'vlist') {
      return { id: c.id, pid: bookId, c_component: 'vlist', c_fn: c.c_fn, nickname: c.nickname, description: c.description,
        refs: c.refs };
    }
    const out = { id: c.id, pid: bookId, c_component: 'vcard', c_givenname: c.c_givenname, c_sn: c.c_sn, c_fn: fullName(c),
      emails: c.emails, phones: c.phones, hasCertificate: 0 };
    if (c.org) out.orgs = [{ value: c.org }];
    if (c.title) out.title = c.title;
    if (c.birthday) out.birthday = c.birthday;
    if (c.categories && c.categories.length) out.categories = c.categories;
    return out;
  }

  function saveCard(bookId, id, body, list) {
    const existing = cardById(bookId, id);
    const c = existing || { id, c_component: list ? 'vlist' : 'vcard' };
    if (list) Object.assign(c, { c_fn: body.c_fn || '', nickname: body.nickname || '', description: body.description || '', refs: body.refs || [] });
    else {
      Object.assign(c, { c_givenname: body.c_givenname || '', c_sn: body.c_sn || '', c_fn: body.c_fn || '',
        emails: (body.emails || []).filter(e => e.value), phones: (body.phones || []).filter(p => p.value),
        categories: body.categories || [], org: (body.orgs && body.orgs[0] && body.orgs[0].value) || '' });
    }
    if (!existing) cardsOf(bookId).push(c);
    return c;
  }

  function contacts(entry, rest) {
    const [first, ...more] = rest;
    if (more.length === 0) {
      switch (first) {
        case undefined: case '': return { status: 302, headers: { location: '/SOGo/so/' + entry.user + '/Contacts/view' } };
        case 'view': return html(pageFilter(contactsFile(custom ? 'view.html' : 'view-plain.html')).replace('@@CURRENT_DAY@@', currentDayJSON()));
        case 'addressbooksList': return json(200, { addressbooks: con.books });
        case 'UIxContactEditorTemplate': return html(contactsFile('UIxContactEditorTemplate.html'));
      }
      return null;
    }
    const bookId = first;
    entry.folder = bookId;
    if (!book(bookId)) return null;
    if (more.length === 1) {
      switch (more[0]) {
        case 'view': return json(200, bookView(bookId, entry.body));
        case 'headers': {
          const ids = new Set((entry.body && entry.body.ids) || []);
          return json(200, [HEADER_FIELDS, ...cardsOf(bookId).filter(c => ids.has(c.id)).map(header)]);
        }
        case 'newguid': return json(200, { pid: bookId, id: `rt-new-${++guid}.vcf` });
        case 'batchDelete': {
          const uids = new Set((entry.body && entry.body.uids) || []);
          con.cards[bookId] = cardsOf(bookId).filter(c => !uids.has(c.id));
          return empty(204);
        }
      }
      return null;
    }
    const [id, action] = more;
    entry.uid = id;
    const c = cardById(bookId, id);
    switch (action) {
      case 'view': return c ? json(200, cardView(bookId, c)) : null;
      case 'members': return c ? json(200, { members: (c.refs || []).map(r => ({ id: r.reference, c_cn: r.fn, c_mail: r.email })) }) : null;
      case 'saveAsContact': return json(200, { id: saveCard(bookId, id, entry.body || {}, false).id });
      case 'saveAsList': return json(200, { id: saveCard(bookId, id, entry.body || {}, true).id });
      case 'save': return c ? json(200, { id: saveCard(bookId, id, entry.body || {}, c.c_component === 'vlist').id }) : null;
    }
    return null;
  }

  return {
    calendar, contacts,
    labels: apps.labels,
    store: { calendar: cal, contacts: con },
    event: summary => cal.events.find(e => e.summary === summary),
    card: name => Object.values(con.cards).flat().find(c => fullName(c) === name),
  };
}
