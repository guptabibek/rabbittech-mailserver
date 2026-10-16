// Helpers and cell renderers shared by the RabbitTech UI (also used from js/site/mailbox.js).
// Text arguments of the renderers are expected to be HTML-escaped already.
window.rt = window.rt || {};
(function(rt) {
  'use strict';

  // Translated UI text from lang.*.json "rabbittech" (window.lang_rt, set in base.twig)
  rt.t = function(key, fallback) {
    return (window.lang_rt && window.lang_rt[key]) || fallback || key;
  };
  // "%s" placeholders, e.g. rt.format(rt.t('of'), used, total)
  rt.format = function(text) {
    var args = Array.prototype.slice.call(arguments, 1);
    return String(text).replace(/%s/g, function() { return args.length ? args.shift() : ''; });
  };
  rt.locale = function() {
    return document.documentElement.lang || undefined;
  };
  rt.number = function(value) {
    try { return new Intl.NumberFormat(rt.locale()).format(value); } catch (e) { return String(value); }
  };

  rt.initials = function(text) {
    var words = String(text || '').replace(/&[#a-z0-9]+;/gi, '').replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
    var first = Array.from(words[0] || '?');
    var second = words.length > 1 ? Array.from(words[1]) : first.slice(1);
    return (first[0] + (second[0] || '')).toUpperCase();
  };

  // Avatar or icon, primary line and muted secondary line
  rt.identity = function(primary, secondary, options) {
    options = options || {};
    var badge = options.icon
      ? '<span class="rt-cell-icon" aria-hidden="true"><i class="bi bi-' + options.icon + '"></i></span>'
      : '<span class="rt-avatar rt-avatar-sm" aria-hidden="true">' + rt.initials(options.initials || primary) + '</span>';
    return '<div class="rt-cell-identity' + (options.muted ? ' is-muted' : '') + '">' + badge +
      '<span class="rt-cell-text"><span class="rt-cell-primary">' + primary + '</span>' +
      (secondary ? '<small>' + secondary + '</small>' : '') + '</span></div>';
  };

  // Progress bar with a caption, e.g. "6.2 GiB of 10 GiB". Without a limit (percent is not
  // a number, e.g. mailcow's "- " for unlimited quota) only the caption shows. Over 100%
  // the bar is full and the label keeps the real value.
  rt.usage = function(percent, caption) {
    var value = parseFloat(percent);
    if (!isFinite(value)) {
      return '<div class="rt-usage rt-usage-unlimited"><div class="rt-usage-caption"><span>' + caption + '</span></div></div>';
    }
    var width = Math.max(0, Math.min(100, value));
    var level = value >= 90 ? 'danger' : (value >= 75 ? 'warning' : 'ok');
    return '<div class="rt-usage rt-usage-' + level + '"><div class="rt-usage-caption"><span>' + caption + '</span>' +
      '<span class="rt-usage-pct">' + Math.round(value) + '%</span></div>' +
      '<div class="rt-usage-track" aria-hidden="true"><div class="rt-usage-bar" style="width:' + width + '%"></div></div></div>';
  };

  // "2 hours ago" in the page language
  rt.timeAgo = function(seconds) {
    seconds = Number(seconds);
    if (!seconds) return null;
    var diff = Math.max(0, Date.now() / 1000 - seconds);
    if (diff < 30) return rt.t('just_now', 'just now');
    var units = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400],
      [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
    for (var i = 0; i < units.length; i++) {
      if (diff < units[i][0]) {
        var value = Math.floor(diff / units[i][2]);
        try {
          return new Intl.RelativeTimeFormat(rt.locale(), { numeric: 'always' }).format(-value, units[i][1]);
        } catch (e) {
          return value + ' ' + units[i][1] + (value === 1 ? '' : 's') + ' ago';
        }
      }
    }
  };

  // Most recent of several logins, e.g. [['IMAP', 1760000000], ['SSO', 0]]
  rt.lastActive = function(logins, neverLabel) {
    var never = neverLabel || rt.t('never', 'Never');
    var latest = null;
    var details = [];
    logins.forEach(function(login) {
      var ts = Number(login[1]) || 0;
      details.push(login[0] + ': ' + (ts ? new Date(ts * 1000).toLocaleString(rt.locale()) : never));
      if (ts && (!latest || ts > latest[1])) latest = [login[0], ts];
    });
    if (!latest) return '<span class="rt-cell-muted">' + never + '</span>';
    return '<span class="rt-cell-text" title="' + details.join('&#10;') + '"><span>' + rt.timeAgo(latest[1]) + '</span>' +
      '<small>' + rt.format(rt.t('via', 'via %s'), latest[0]) + '</small></span>';
  };

  // Space-separated addresses as chips, the rest summarised as "+N"
  rt.chips = function(text, max) {
    var items = String(text || '').split(/\s+/).filter(Boolean);
    max = max || 3;
    var html = items.slice(0, max).map(function(item) { return '<span class="rt-chip">' + item + '</span>'; }).join('');
    if (items.length > max) html += '<span class="rt-chip rt-chip-more" title="' + items.slice(max).join('&#10;') + '">+' + (items.length - max) + '</span>';
    return '<div class="rt-chips">' + html + '</div>';
  };

  // Templates print dates (YYYY-MM-DD), numbers and times plainly; format them for the page
  // language. <time data-rt-time="<unix seconds>"> shows a relative time; the exact time stays
  // in the text for assistive technology and on hover. Also used for content loaded later.
  rt.localize = function(root) {
    var dateFormat = null;
    try { dateFormat = new Intl.DateTimeFormat(rt.locale(), { dateStyle: 'medium' }); } catch (e) {}
    $(root).find('time[data-rt-date]').each(function() {
      var parts = (this.getAttribute('datetime') || '').split('-').map(Number);
      if (dateFormat && parts.length === 3 && parts[0]) this.textContent = dateFormat.format(new Date(parts[0], parts[1] - 1, parts[2]));
    });
    $(root).find('[data-rt-number]').each(function() {
      var value = Number(this.textContent.trim());
      if (isFinite(value)) this.textContent = rt.number(value);
    });
    $(root).find('[data-rt-time]').each(function() {
      var text = rt.timeAgo(this.getAttribute('data-rt-time'));
      if (!text) return;
      var exact = this.getAttribute('title') || this.textContent;
      this.textContent = text;
      this.setAttribute('aria-label', text + ' (' + exact + ')');
    });
  };
  $(function() { rt.localize(document); });
})(window.rt);

// RabbitTech app shell: sidebar, tab routing, page header and command palette.
// The sidebar (templates/rabbittech/nav.twig) replaces mailcow's top-level tab strips:
// each entry lists the tab panes it covers, and this script shows the right pane, keeps
// the URL (#/<pane>) in sync and fills the page header from the active entry.
$(document).ready(function() {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  if (!body.classList.contains('rt-has-shell')) return;

  var sidebar = document.getElementById('rt-sidebar');
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.rt-nav-link[href]'));
  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  // ---------------------------------------------------------------- sidebar
  var collapseToggle = document.getElementById('rt-collapse-toggle');
  function syncCollapseToggle() {
    var collapsed = root.classList.contains('rt-sidebar-collapsed');
    var label = collapsed ? rt.t('expand_sidebar', 'Expand sidebar') : rt.t('collapse_sidebar', 'Collapse sidebar');
    collapseToggle.setAttribute('title', label);
    collapseToggle.setAttribute('aria-label', label);
    collapseToggle.querySelector('.rt-nav-label').textContent = collapsed ? rt.t('expand', 'Expand') : rt.t('collapse', 'Collapse');
  }
  function toggleCollapsed() {
    root.classList.toggle('rt-sidebar-collapsed');
    storageSet('rt_sidebar', root.classList.contains('rt-sidebar-collapsed') ? 'collapsed' : 'expanded');
    syncCollapseToggle();
  }
  if (collapseToggle) {
    collapseToggle.addEventListener('click', toggleCollapsed);
    syncCollapseToggle();
  }

  // Mobile drawer. Closed, it is off-canvas: inert keeps its links out of the tab order.
  var menuToggle = document.getElementById('rt-menu-toggle');
  var lastFocus = null;
  var drawerQuery = window.matchMedia('(max-width: 991.98px)');
  function syncDrawerInert() {
    if (!sidebar) return;
    var hidden = drawerQuery.matches && !body.classList.contains('rt-nav-open');
    if (hidden) sidebar.setAttribute('inert', ''); else sidebar.removeAttribute('inert');
  }
  if (drawerQuery.addEventListener) drawerQuery.addEventListener('change', syncDrawerInert);
  function openDrawer() {
    lastFocus = document.activeElement;
    body.classList.add('rt-nav-open');
    syncDrawerInert();
    menuToggle.setAttribute('aria-expanded', 'true');
    var current = sidebar.querySelector('.rt-nav-link.active') || sidebar.querySelector('.rt-nav-link');
    if (current) current.focus();
  }
  function closeDrawer() {
    if (!body.classList.contains('rt-nav-open')) return;
    body.classList.remove('rt-nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    syncDrawerInert();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (menuToggle) menuToggle.addEventListener('click', openDrawer);
  syncDrawerInert();
  $('#rt-sidebar-close, #rt-sidebar-backdrop').on('click', closeDrawer);

  // ------------------------------------------------------------ tab routing
  function linkTabs(link) {
    var tabs = link.getAttribute('data-rt-tabs');
    return tabs ? tabs.split(/\s+/) : [];
  }
  function samePage(link) {
    return (link.getAttribute('data-rt-path') || '').replace(/\/+$/, '') === path;
  }
  function tabTrigger(id) {
    return document.querySelector('[data-bs-toggle="tab"][data-bs-target="#' + id + '"]');
  }

  // tab pane id -> sidebar entry, for entries that live on this page
  var tabLinks = Object.create(null);
  navLinks.forEach(function(link) {
    if (!samePage(link)) return;
    linkTabs(link).forEach(function(id) {
      if (document.getElementById(id) && tabTrigger(id)) tabLinks[id] = link;
    });
  });

  // A managed tab strip whose tabs are not all in the sidebar stays visible, so new
  // upstream tabs remain reachable.
  $('.rt-managed-tabs').each(function() {
    var unmapped = $(this).find('[data-bs-toggle="tab"]').filter(function() {
      var target = (this.getAttribute('data-bs-target') || '').replace(/^#/, '');
      return !tabLinks[target] && !$(this).closest('.d-none').length;
    });
    if (unmapped.length) $(this).addClass('rt-tabs-unmanaged');
  });

  function activePaneId() {
    for (var id in tabLinks) {
      var pane = document.getElementById(id);
      if (pane && pane.classList.contains('active')) return id;
    }
    return null;
  }
  function slugFor(id) {
    return id.replace(/^tab-/, '');
  }
  function paneFromHash() {
    var hash = window.location.hash;
    if (hash.indexOf('#/') !== 0) return null;
    var slug;
    try { slug = decodeURIComponent(hash.slice(2)); } catch (e) { return null; }
    if (tabLinks['tab-' + slug]) return 'tab-' + slug;
    if (tabLinks[slug]) return slug;
    return null;
  }
  function showPane(id) {
    if (activePaneId() === id) return;
    var trigger = tabTrigger(id);
    // A click (not Tab.show) also lets mailcow remember the tab for the next visit.
    if (trigger) trigger.click();
  }

  // --------------------------------------------------- active entry, header
  var header = document.getElementById('rt-page-header');
  var subnav = document.getElementById('rt-subnav');
  var currentLink = null;

  function setActiveLink(link) {
    navLinks.forEach(function(l) {
      var on = l === link;
      l.classList.toggle('active', on);
      if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    currentLink = link;
  }

  function linkLabel(link) {
    var label = link.querySelector('.rt-nav-label');
    return (label ? label.textContent : link.textContent).trim();
  }

  function renderHeader(link) {
    if (!header) return;
    var eyebrow = document.getElementById('rt-page-eyebrow');
    var title = document.getElementById('rt-page-title');
    var desc = document.getElementById('rt-page-desc');
    var actions = document.getElementById('rt-page-actions');
    actions.innerHTML = '';

    var editReturn = document.getElementById('rt-edit-return');
    if (!link) {
      header.hidden = true;
      body.classList.add('rt-no-page-header');
      // Edit pages without a sidebar entry keep mailcow's own back link
      if (editReturn) editReturn.hidden = false;
      return;
    }

    if (path.indexOf('/edit/') === 0) {
      // Edit pages: back link to the list, the edited object as the title
      eyebrow.innerHTML = '<i class="bi bi-arrow-left" aria-hidden="true"></i> ';
      eyebrow.appendChild(document.createTextNode(linkLabel(link)));
      eyebrow.href = editReturn && editReturn.getAttribute('href') ? editReturn.getAttribute('href') : link.getAttribute('href');
      eyebrow.classList.add('is-link');
      var object = path.split('/').slice(3).join('/');
      try { object = decodeURIComponent(object); } catch (e) {}
      // Items without a name (sync jobs, app passwords, filters…) are edited by number
      title.textContent = !object ? linkLabel(link) : (/^\d+$/.test(object) ? linkLabel(link) + ' #' + object : object);
      desc.textContent = '';
    } else {
      eyebrow.textContent = link.getAttribute('data-rt-section') || '';
      eyebrow.removeAttribute('href');
      eyebrow.classList.remove('is-link');
      title.textContent = linkLabel(link);
      desc.textContent = link.getAttribute('data-rt-desc') || '';
    }

    $('.rt-dup-action').removeClass('rt-dup-action');
    var modalId = link.getAttribute('data-rt-action');
    if (modalId && document.getElementById(modalId) && path.indexOf('/edit/') !== 0) {
      $('#rt-content [data-bs-target="#' + modalId + '"]').addClass('rt-dup-action');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary';
      button.setAttribute('data-bs-toggle', 'modal');
      button.setAttribute('data-bs-target', '#' + modalId);
      button.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i> ';
      button.appendChild(document.createTextNode(link.getAttribute('data-rt-action-label') || ''));
      actions.appendChild(button);
    }

    header.hidden = false;
    header.classList.add('is-ready');
    document.title = linkLabel(link) + ' · ' + (document.title.split(' · ').pop());
  }

  function renderSubnav(link, paneId) {
    if (!subnav) return;
    var tabs = link ? linkTabs(link).filter(function(id) { return tabLinks[id]; }) : [];
    if (tabs.length < 2) {
      subnav.hidden = true;
      subnav.innerHTML = '';
      return;
    }
    subnav.innerHTML = '';
    tabs.forEach(function(id) {
      var trigger = tabTrigger(id);
      var item = document.createElement('a');
      item.href = '#/' + slugFor(id);
      item.className = 'rt-subnav-link' + (id === paneId ? ' active' : '');
      if (id === paneId) item.setAttribute('aria-current', 'page');
      item.textContent = trigger.textContent.replace(/\s+/g, ' ').trim();
      item.addEventListener('click', function(e) {
        e.preventDefault();
        navigateToPane(id, true);
      });
      subnav.appendChild(item);
    });
    subnav.hidden = false;
    syncSubnavOverflow();
    var active = subnav.querySelector('.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // A sub-navigation wider than the page scrolls sideways; fade the edge it continues past
  function syncSubnavOverflow() {
    if (!subnav || subnav.hidden) return;
    var overflowing = subnav.scrollWidth > subnav.clientWidth + 1;
    subnav.classList.toggle('is-overflowing', overflowing);
    subnav.classList.toggle('at-end', !overflowing || subnav.scrollLeft + subnav.clientWidth >= subnav.scrollWidth - 1);
  }
  if (subnav) {
    subnav.addEventListener('scroll', syncSubnavOverflow, { passive: true });
    window.addEventListener('resize', syncSubnavOverflow);
  }

  function sync(paneId) {
    var link = (paneId && tabLinks[paneId]) || null;
    if (!link) {
      // Pages without managed tabs: the entry marked active by the server (path or
      // edit-page match), if any.
      link = navLinks.filter(function(l) { return l.classList.contains('active'); })[0] || null;
    }
    setActiveLink(link);
    renderHeader(link);
    renderSubnav(link, paneId);
  }

  function navigateToPane(id, push) {
    showPane(id);
    var url = '#/' + slugFor(id);
    if (window.location.hash !== url) {
      if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
    }
    sync(id);
  }

  // Sidebar clicks on this page switch panes without a reload
  navLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      if (link.getAttribute('data-rt-external')) return;
      var tabs = linkTabs(link).filter(function(id) { return tabLinks[id]; });
      if (!tabs.length || !samePage(link)) return;
      e.preventDefault();
      var current = activePaneId();
      navigateToPane(tabs.indexOf(current) !== -1 && currentLink === link ? current : tabs[0], true);
      closeDrawer();
      window.scrollTo(0, 0);
    });
  });

  // Tabs switched by other means (in-page links, mailcow scripts) keep the shell in sync
  $(document).on('shown.bs.tab', function(e) {
    var id = (e.target.getAttribute('data-bs-target') || '').replace(/^#/, '');
    if (!tabLinks[id]) return;
    // Overlapping tab transitions can leave the previous pane active; keep one visible
    $(document.getElementById(id)).siblings('.tab-pane.active').removeClass('active show');
    var url = '#/' + slugFor(id);
    if (window.location.hash !== url) history.replaceState(null, '', url);
    sync(id);
  });

  window.addEventListener('popstate', function() {
    var id = paneFromHash();
    if (id) {
      showPane(id);
      sync(id);
    }
  });

  // Initial state: the URL wins, then the tab mailcow restored, then the entry's default
  (function() {
    var id = paneFromHash() || activePaneId();
    if (!id) {
      var first = navLinks.filter(function(l) { return samePage(l) && linkTabs(l).some(function(t) { return tabLinks[t]; }); })[0];
      if (first) id = linkTabs(first).filter(function(t) { return tabLinks[t]; })[0];
    }
    if (id) {
      showPane(id);
      history.replaceState(null, '', '#/' + slugFor(id));
    }
    sync(id);
    // The CSS hides mailcow's tab strips and reveals the page header only from here on
    root.classList.add('rt-shell-ready');

    // A palette action may have asked to open a dialog after navigating here
    var pending = null;
    try { pending = sessionStorage.getItem('rt_open_modal'); sessionStorage.removeItem('rt_open_modal'); } catch (e) {}
    if (pending && document.getElementById(pending)) {
      bootstrap.Modal.getOrCreateInstance(document.getElementById(pending)).show();
    }
  })();

  // The skip link moves focus without touching the hash, which the tab routing owns
  $(document).on('click', '.rt-skip-link', function(e) {
    var main = document.getElementById('rt-content');
    if (!main) return;
    e.preventDefault();
    main.focus();
  });

  // Links that open a dialog on the page they lead to (e.g. Overview quick actions)
  $(document).on('click', '[data-rt-open-modal]', function(e) {
    // Ctrl/Cmd/Shift-clicks open another tab; this one must not pop the dialog later
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    try { sessionStorage.setItem('rt_open_modal', this.getAttribute('data-rt-open-modal')); } catch (err) {}
  });

  // --------------------------------------------------------- overview KPIs
  var kpis = document.getElementById('rt-kpis');
  if (kpis) {
    var number = { format: rt.number };
    var setKpi = function(key, value, sub, attention) {
      var card = kpis.querySelector('[data-rt-kpi="' + key + '"]');
      if (!card) return;
      card.querySelector('.rt-kpi-value').textContent = value;
      card.querySelector('.rt-kpi-sub').textContent = sub || ' ';
      card.classList.add('is-loaded');
      card.classList.toggle('is-attention', !!attention);
    };
    var unavailable = function(keys) {
      return function() {
        keys.forEach(function(key) { setKpi(key, '—', rt.t('unavailable', 'Unavailable')); });
      };
    };
    var getJSON = function(url) {
      return fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function(response) {
        if (!response.ok) throw new Error(response.status);
        return response.json();
      });
    };
    // Binary units, like mailcow's tables (1 GiB = 1024 MiB)
    var bytes = function(value) {
      var units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
      var i = 0;
      while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
      return (i ? rt.number(Math.round(value * 10) / 10) : value) + ' ' + units[i];
    };

    getJSON('/api/v1/get/domain/all').then(function(domains) {
      if (!Array.isArray(domains)) domains = [];
      var mailboxes = 0, aliases = 0, stored = 0;
      domains.forEach(function(domain) {
        mailboxes += parseInt(domain.mboxes_in_domain, 10) || 0;
        aliases += parseInt(domain.aliases_in_domain, 10) || 0;
        stored += parseInt(domain.bytes_total, 10) || 0;
      });
      setKpi('domains', number.format(domains.length), rt.format(rt.t('kpi_stored', '%s stored'), bytes(stored)));
      setKpi('mailboxes', number.format(mailboxes), domains.length === 1 ? rt.t('kpi_across_one_domain', 'In 1 domain')
        : rt.format(rt.t('kpi_across_domains', 'Across %s domains'), number.format(domains.length)));
      setKpi('aliases', number.format(aliases), rt.t('kpi_aliases', 'Forwarding addresses'));
    }).catch(unavailable(['domains', 'mailboxes', 'aliases']));

    getJSON('/api/v1/get/mailq/all').then(function(queue) {
      var count = Array.isArray(queue) ? queue.length : 0;
      setKpi('queue', number.format(count), count ? rt.t('kpi_queue_waiting', 'Waiting for delivery') : rt.t('kpi_queue_empty', 'Nothing waiting'), count > 0);
      if (count >= 50) queueAlert(count);
    }).catch(unavailable(['queue']));

    // A long mail queue joins the server's alerts above the counts
    function queueAlert(count) {
      var section = document.getElementById('rt-alerts');
      if (!section) return;
      var item = document.createElement('li');
      item.className = 'rt-alert rt-alert-warning';
      var text = document.createElement('span');
      text.className = 'rt-alert-text';
      text.textContent = rt.format(rt.t('alert_queue', '%s messages are waiting in the mail queue'), number.format(count));
      var hint = document.createElement('span');
      hint.className = 'rt-alert-hint';
      hint.textContent = rt.t('alert_queue_hint', 'A long queue usually means a delivery problem.') + ' ';
      var link = document.createElement('a');
      link.href = '/admin/queue';
      link.textContent = rt.t('alert_queue_link', 'Open the mail queue');
      hint.appendChild(link);
      item.appendChild(text);
      item.appendChild(hint);
      section.querySelector('.rt-alerts-list').appendChild(item);
      section.hidden = false;
    }

    // The page counts the quarantine itself; the API would send every held message
    var held = kpis.getAttribute('data-quarantine-count');
    (held !== null ? Promise.resolve(parseInt(held, 10) || 0) : getJSON('/api/v1/get/quarantine/all').then(function(items) {
      return Array.isArray(items) ? items.length : 0;
    })).then(function(count) {
      setKpi('quarantine', number.format(count), count ? rt.t('kpi_quarantine_held', 'Held for review') : rt.t('kpi_quarantine_empty', 'Nothing held'));
    }).catch(unavailable(['quarantine']));
  }

  // -------------------------------------------------------- command palette
  var palette = document.getElementById('rt-palette');
  var searchTrigger = document.getElementById('rt-search-trigger');
  if (!palette) return;

  var input = document.getElementById('rt-palette-input');
  var list = document.getElementById('rt-palette-list');
  var shortcut = document.querySelector('[data-rt-shortcut]');
  if (shortcut && isMac) shortcut.textContent = '⌘K';

  function commands() {
    var items = [];
    navLinks.forEach(function(link) {
      var icon = link.querySelector('.bi');
      items.push({
        label: linkLabel(link),
        hint: link.getAttribute('data-rt-external') ? rt.t('palette_open_app', 'Open app') : (link.getAttribute('data-rt-section') || rt.t('palette_go_to', 'Go to')),
        icon: icon ? icon.className.replace(/\s*bi\s+/, ' ').trim() : 'bi-arrow-right',
        run: function() {
          if (link.getAttribute('data-rt-external')) { window.location.href = link.href; return; }
          link.click();
        }
      });
      var modalId = link.getAttribute('data-rt-action');
      if (modalId) {
        items.push({
          label: link.getAttribute('data-rt-action-label') || '',
          hint: rt.t('palette_action', 'Action'),
          icon: 'bi-plus-lg',
          run: function() {
            var modal = document.getElementById(modalId);
            if (modal && samePage(link)) {
              link.click();
              bootstrap.Modal.getOrCreateInstance(modal).show();
            } else {
              try { sessionStorage.setItem('rt_open_modal', modalId); } catch (e) {}
              window.location.href = link.href;
            }
          }
        });
      }
    });
    items.push({
      label: rt.t('toggle_dark_mode', 'Toggle dark mode'), hint: rt.t('palette_appearance', 'Appearance'), icon: 'bi-circle-half',
      run: function() { document.getElementById('dark-mode-toggle').click(); }
    });
    if (collapseToggle) {
      items.push({
        label: root.classList.contains('rt-sidebar-collapsed') ? rt.t('expand_sidebar', 'Expand sidebar') : rt.t('collapse_sidebar', 'Collapse sidebar'),
        hint: rt.t('palette_appearance', 'Appearance'), icon: 'bi-layout-sidebar',
        run: toggleCollapsed
      });
    }
    var restart = document.querySelector('.rt-user [data-bs-target="#RestartContainer"]');
    if (restart) {
      items.push({
        label: restart.textContent.trim(), hint: rt.t('palette_system', 'System'), icon: 'bi-arrow-repeat',
        run: function() { restart.click(); }
      });
    }
    if (document.getElementById('logout')) {
      items.push({
        label: rt.t('sign_out', 'Sign out'), hint: rt.t('palette_account', 'Account'), icon: 'bi-box-arrow-right',
        run: function() { document.getElementById('logout').submit(); }
      });
    }
    return items;
  }

  var allCommands = [];
  var results = [];
  var cursor = 0;
  var paletteReturnFocus = null;

  // Labels only: matching section names ("E-Mail") would list every entry of a section
  function score(command, query) {
    if (!query) return 1;
    var label = command.label.toLowerCase();
    if (label.indexOf(query) === 0) return 3;
    if (label.split(/\s+/).some(function(w) { return w.indexOf(query) === 0; })) return 2;
    if (label.indexOf(query) !== -1) return 1;
    return 0;
  }

  function renderResults() {
    var query = input.value.trim().toLowerCase();
    results = allCommands
      .map(function(c, i) { return { c: c, s: score(c, query), i: i }; })
      .filter(function(r) { return r.s > 0; })
      .sort(function(a, b) { return b.s - a.s || a.i - b.i; })
      .map(function(r) { return r.c; });
    cursor = Math.min(cursor, Math.max(results.length - 1, 0));
    list.innerHTML = '';
    if (!results.length) {
      var empty = document.createElement('li');
      empty.className = 'rt-palette-empty';
      empty.textContent = rt.t('palette_no_matches', 'No matches');
      list.appendChild(empty);
      input.removeAttribute('aria-activedescendant');
      return;
    }
    results.forEach(function(command, i) {
      var li = document.createElement('li');
      li.id = 'rt-palette-option-' + i;
      li.className = 'rt-palette-item' + (i === cursor ? ' active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === cursor ? 'true' : 'false');
      var icon = document.createElement('i');
      icon.className = 'bi ' + command.icon;
      icon.setAttribute('aria-hidden', 'true');
      var label = document.createElement('span');
      label.className = 'rt-palette-label';
      label.textContent = command.label;
      var hint = document.createElement('span');
      hint.className = 'rt-palette-hint';
      hint.textContent = command.hint;
      li.appendChild(icon);
      li.appendChild(label);
      li.appendChild(hint);
      li.addEventListener('mousemove', function() {
        if (cursor !== i) { cursor = i; highlight(); }
      });
      li.addEventListener('click', function() { runCommand(i); });
      list.appendChild(li);
    });
    input.setAttribute('aria-activedescendant', 'rt-palette-option-' + cursor);
  }

  function highlight() {
    Array.prototype.forEach.call(list.querySelectorAll('.rt-palette-item'), function(li, i) {
      li.classList.toggle('active', i === cursor);
      li.setAttribute('aria-selected', i === cursor ? 'true' : 'false');
    });
    var active = list.querySelector('.rt-palette-item.active');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', active.id);
    }
  }

  function openPalette() {
    if (!palette.hidden) return;
    paletteReturnFocus = document.activeElement;
    allCommands = commands();
    input.value = '';
    cursor = 0;
    renderResults();
    palette.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    body.classList.add('rt-palette-open');
    input.focus();
  }

  function closePalette() {
    if (palette.hidden) return;
    palette.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    body.classList.remove('rt-palette-open');
    if (paletteReturnFocus && paletteReturnFocus.focus) paletteReturnFocus.focus();
  }

  function runCommand(i) {
    var command = results[i];
    if (!command) return;
    closePalette();
    command.run();
  }

  if (searchTrigger) searchTrigger.addEventListener('click', openPalette);
  $(palette).on('click', '[data-rt-palette-close]', closePalette);
  input.addEventListener('input', function() { cursor = 0; renderResults(); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, results.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); runCommand(cursor); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });

  document.addEventListener('keydown', function(e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      if (palette.hidden && document.querySelector('.modal.show')) return;
      e.preventDefault();
      if (palette.hidden) openPalette(); else closePalette();
    } else if (e.key === '/' && !typing && !document.querySelector('.modal.show')) {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      closeDrawer();
    }
  });
});

// ------------------------------------------------------------ data tables
// Applies the RabbitTech table design to every DataTable: search and page-size controls
// without label clutter, a select-all checkbox in the header with a selection counter,
// icon-only row actions with tooltips and an emphasised primary column.
$(document).ready(function() {
  'use strict';
  if (!$.fn.dataTable) return;

  // Set while the header checkbox changes every row, so the counter is updated once
  var bulkChange = false;

  function textNodes(el) {
    return $(el).contents().filter(function() { return this.nodeType === 3; });
  }

  // The toolbar that belongs to a table: the one right before it, else the one right after it
  function selectionBar(table) {
    var wrapper = table.closest('.dataTables_wrapper');
    var bar = wrapper.prevAll('[class*="mass-actions"]').first();
    if (!bar.length) bar = wrapper.nextAll('[class*="mass-actions"]').first();
    return bar;
  }

  function updateSelection(table) {
    var boxes = table.find('tbody input[name="multi_select"]:enabled');
    var checked = boxes.filter(':checked').length;
    var header = table.find('thead .rt-select-all');
    header.prop('checked', checked > 0 && checked === boxes.length);
    header.prop('indeterminate', checked > 0 && checked < boxes.length);
    var bar = selectionBar(table);
    var counter = bar.find('.rt-selection-count');
    if (!counter.length) {
      counter = $('<span class="rt-selection-count" aria-live="polite"></span>');
      bar.find('.btn-group').first().before(counter);
    }
    counter.text(rt.format(rt.t('n_selected', '%s selected'), rt.number(checked))).toggleClass('is-visible', checked > 0);
    table.closest('.card').toggleClass('rt-has-selection', checked > 0);
  }

  function setup(settings) {
    var api = new $.fn.dataTable.Api(settings);
    var wrapper = $(api.table().container());
    if (wrapper.data('rtReady')) return;
    wrapper.data('rtReady', true);

    // With a toolbar above the table, the copy below it is only needed on phones
    if (wrapper.prevAll('[class*="mass-actions"]').length) {
      wrapper.nextAll('[class*="mass-actions"]').first().addClass('rt-toolbar-repeat');
    }

    wrapper.find('.dataTables_filter label').each(function() {
      var label = (textNodes(this).text() || '').replace(/[:：]\s*$/, '').trim() || rt.t('search', 'Search');
      $(this).find('input').attr({ placeholder: label + '…', 'aria-label': label });
      textNodes(this).remove();
    });
    wrapper.find('.dataTables_length label').each(function() {
      textNodes(this).remove();
      var rows = rt.t('rows_per_page', 'Rows per page');
      $(this).find('select').attr({ title: rows, 'aria-label': rows });
    });
  }

  // Column metadata is the same on every draw; work it out once per table
  function columnInfo(api) {
    var table = $(api.table().node());
    var info = table.data('rtColumns');
    if (info) return info;
    var columns = api.settings()[0].aoColumns;
    info = { select: null, primary: null };
    columns.forEach(function(col, i) {
      // mailcow names the selection column "chkbox"
      if (info.select === null && col.mData === 'chkbox') info.select = i;
      if (/(^|\s)rt-col-primary(\s|$)/.test(col.sClass || col.className || '')) info.primary = i;
    });
    if (info.primary === null) {
      // otherwise the first titled content column carries the row's name
      columns.forEach(function(col, i) {
        if (info.primary !== null || i === info.select || col.mData === null || col.mData === 'chkbox') return;
        if ($('<div>').html(col.sTitle || '').text().trim()) info.primary = i;
      });
    }
    table.data('rtColumns', info);
    return info;
  }

  function addSelectAll(api, table, index) {
    var box = $('<input type="checkbox" class="form-check-input rt-select-all">').attr('aria-label', rt.t('select_all_rows', 'Select all rows'));
    $(api.column(index).header()).empty().append(box);
    box.on('click', function(e) { e.stopPropagation(); });
    box.on('change', function() {
      // mailcow builds its list of selected items from change events (011-api.js) and
      // doesn't de-duplicate it. Do what its own "Toggle all" does: mass_action makes the
      // first event start the list afresh, then every row reports its new state once.
      window.mass_action = true;
      bulkChange = true;
      table.find('tbody input[name="multi_select"]:enabled').prop('checked', this.checked).trigger('change');
      bulkChange = false;
      updateSelection(table);
    });
    // the header checkbox replaces mailcow's "Toggle all" buttons for this table
    var wrapper = table.closest('.dataTables_wrapper');
    wrapper.prevAll('[class*="mass-actions"]').first().add(wrapper.nextAll('[class*="mass-actions"]').first())
      .find('[id="toggle_multi_select_all"]').addClass('rt-hidden');
  }

  function decorate(settings) {
    var api = new $.fn.dataTable.Api(settings);
    var table = $(api.table().node());
    var info = columnInfo(api);

    // Select-all checkbox in the header of the selection column. Tables whose selection
    // column isn't called "chkbox" are recognised by a row checkbox on the current page.
    if (!table.find('thead .rt-select-all').length) {
      var index = info.select;
      if (index === null) {
        var cell = table.find('tbody input[name="multi_select"]').first().closest('td');
        if (cell.length && api.cell(cell).index()) index = api.cell(cell).index().column;
      }
      if (index !== null) addSelectAll(api, table, index);
    }
    // Only offer select-all when the page has something selectable
    var selectable = table.find('tbody input[name="multi_select"]:enabled').length > 0;
    table.find('thead .rt-select-all').prop('disabled', !selectable);
    updateSelection(table);

    // Row actions on this page: icon buttons, the label moves to the tooltip
    var narrowed = false;
    table.find('tbody .btn').each(function() {
      var button = $(this);
      if (button.hasClass('rt-icon-only') || !button.find('.bi').length) return;
      var label = button.text().replace(/\s+/g, ' ').trim();
      if (!label) return;
      button.addClass('rt-icon-only').attr({ title: label, 'aria-label': label });
      button.closest('.btn-group').addClass('rt-row-actions');
      narrowed = true;
    });
    // Responsive measured the columns with the wide text buttons; measure again so the
    // freed space shows more columns. recalc() doesn't redraw, so this can't loop.
    if (narrowed && api.responsive) api.responsive.recalc();

    if (info.primary !== null) $(api.column(info.primary, { page: 'current' }).nodes()).addClass('rt-col-primary');
  }

  $(document).on('init.dt', function(e, settings) { setup(settings); });
  $(document).on('draw.dt', function(e, settings) { setup(settings); decorate(settings); });
  $(document).on('change', 'table.dataTable tbody input[name="multi_select"]', function() {
    if (bulkChange) return;
    updateSelection($(this).closest('table'));
  });

  // Refresh buttons become icon buttons
  $('.refresh_table').each(function() {
    var button = $(this);
    var label = button.text().trim();
    if (!button.find('.bi').length) button.prepend('<i class="bi bi-arrow-clockwise"></i> ');
    button.addClass('rt-icon-only rt-refresh').attr({ title: label, 'aria-label': label });
  });
});

// ------------------------------------------------------------ mail security
// A domain's Mail security tab (templates/rabbittech/mail-security-tab.twig) loads its checks
// when it opens, since they look up DNS and fetch the MTA-STS policy, which takes a moment.
// /edit/domain/<domain>#mail-security opens it (the Overview's alerts link there).
$(function() {
  'use strict';
  var panel = document.querySelector('[data-rt-mail-security]');

  // A tab on this page: the tab on wide screens, its card on phones
  function openTab(id) {
    var trigger = document.querySelector('[data-bs-toggle="tab"][data-bs-target="#' + id + '"]');
    if (trigger && trigger.offsetParent !== null) {
      trigger.click();
      return;
    }
    var body = document.querySelector('#' + id + ' .card-body.collapse');
    if (body) {
      bootstrap.Collapse.getOrCreateInstance(body, { toggle: false }).show();
      body.closest('.card').scrollIntoView({ block: 'start' });
    }
  }
  $(document).on('click', '[data-rt-open-tab]', function() {
    openTab(this.getAttribute('data-rt-open-tab'));
  });

  $(document).on('click', '[data-rt-copy]', function() {
    var button = this;
    var text = button.getAttribute('data-rt-copy');
    var label = button.getAttribute('aria-label');
    function done() {
      button.querySelector('i').className = 'bi bi-check2';
      button.setAttribute('aria-label', rt.t('ms_copied'));
      button.classList.add('is-copied');
      setTimeout(function() {
        button.querySelector('i').className = 'bi bi-clipboard';
        button.setAttribute('aria-label', label);
        button.classList.remove('is-copied');
      }, 1500);
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { if (document.execCommand('copy')) done(); } catch (e) {}
      area.remove();
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  });

  if (!panel) return;
  var content = panel.querySelector('.rt-security-content');
  var pane = panel.closest('.tab-pane');
  var collapse = panel.closest('.collapse');
  var loading = false;
  var loaded = false;

  function load() {
    if (loading) return;
    loading = true;
    panel.setAttribute('aria-busy', 'true');
    content.innerHTML = '<p class="rt-security-loading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ' + rt.t('ms_loading') + '</p>';
    fetch('/inc/ajax/rt_mail_security.php?domain=' + encodeURIComponent(panel.getAttribute('data-rt-mail-security')), { credentials: 'same-origin', cache: 'no-cache' })
      .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function(html) {
        content.innerHTML = html;
        rt.localize(content);
      })
      .catch(function() {
        content.innerHTML = '<p class="rt-security-failed">' + rt.t('ms_failed') + '</p>';
      })
      .then(function() {
        panel.removeAttribute('aria-busy');
        loading = false;
        loaded = true;
      });
  }
  // Wide screens show the active tab; phones show every tab as a card that opens (015-responsive.css)
  function shown() {
    return window.matchMedia('(min-width: 768px)').matches ? pane.classList.contains('active') : collapse.classList.contains('show');
  }
  function loadOnce() {
    if (!loaded && shown()) load();
  }
  $(document).on('shown.bs.tab', '[data-bs-target="#' + pane.id + '"]', loadOnce);
  $(collapse).on('shown.bs.collapse', function(e) { if (e.target === collapse) loadOnce(); });
  panel.querySelector('[data-rt-security-recheck]').addEventListener('click', load);

  if (window.location.hash === '#mail-security') openTab(pane.id);
  // mailcow reopens the tab that was open last time
  loadOnce();
});
