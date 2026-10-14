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
    var label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    collapseToggle.setAttribute('title', label);
    collapseToggle.setAttribute('aria-label', label);
    collapseToggle.querySelector('.rt-nav-label').textContent = collapsed ? 'Expand' : 'Collapse';
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

  // Mobile drawer
  var menuToggle = document.getElementById('rt-menu-toggle');
  var lastFocus = null;
  function openDrawer() {
    lastFocus = document.activeElement;
    body.classList.add('rt-nav-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    var current = sidebar.querySelector('.rt-nav-link.active') || sidebar.querySelector('.rt-nav-link');
    if (current) current.focus();
  }
  function closeDrawer() {
    if (!body.classList.contains('rt-nav-open')) return;
    body.classList.remove('rt-nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (menuToggle) menuToggle.addEventListener('click', openDrawer);
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
  var tabLinks = {};
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
    var slug = decodeURIComponent(hash.slice(2));
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

    if (!link) {
      header.hidden = true;
      body.classList.add('rt-no-page-header');
      return;
    }

    var editReturn = document.getElementById('rt-edit-return');
    if (path.indexOf('/edit/') === 0) {
      // Edit pages: back link to the list, the edited object as the title
      eyebrow.innerHTML = '<i class="bi bi-arrow-left"></i> ';
      eyebrow.appendChild(document.createTextNode(linkLabel(link)));
      eyebrow.href = editReturn && editReturn.getAttribute('href') ? editReturn.getAttribute('href') : link.getAttribute('href');
      eyebrow.classList.add('is-link');
      var object = path.split('/').slice(3).join('/');
      try { object = decodeURIComponent(object); } catch (e) {}
      title.textContent = object || linkLabel(link);
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
      button.innerHTML = '<i class="bi bi-plus-lg"></i> ';
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

    // A palette action may have asked to open a dialog after navigating here
    var pending = null;
    try { pending = sessionStorage.getItem('rt_open_modal'); sessionStorage.removeItem('rt_open_modal'); } catch (e) {}
    if (pending && document.getElementById(pending)) {
      bootstrap.Modal.getOrCreateInstance(document.getElementById(pending)).show();
    }
  })();

  // Links that open a dialog on the page they lead to (e.g. Overview quick actions)
  $(document).on('click', '[data-rt-open-modal]', function() {
    try { sessionStorage.setItem('rt_open_modal', this.getAttribute('data-rt-open-modal')); } catch (e) {}
  });

  // --------------------------------------------------------- overview KPIs
  var kpis = document.getElementById('rt-kpis');
  if (kpis) {
    var number = new Intl.NumberFormat();
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
        keys.forEach(function(key) { setKpi(key, '—', 'Unavailable'); });
      };
    };
    var getJSON = function(url) {
      return fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function(response) {
        if (!response.ok) throw new Error(response.status);
        return response.json();
      });
    };
    var bytes = function(value) {
      var units = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = 0;
      while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
      return (i ? value.toFixed(1) : value) + ' ' + units[i];
    };

    getJSON('/api/v1/get/domain/all').then(function(domains) {
      if (!Array.isArray(domains)) domains = [];
      var mailboxes = 0, aliases = 0, stored = 0;
      domains.forEach(function(domain) {
        mailboxes += parseInt(domain.mboxes_in_domain, 10) || 0;
        aliases += parseInt(domain.aliases_in_domain, 10) || 0;
        stored += parseInt(domain.bytes_total, 10) || 0;
      });
      setKpi('domains', number.format(domains.length), bytes(stored) + ' stored');
      setKpi('mailboxes', number.format(mailboxes), 'Across ' + number.format(domains.length) + (domains.length === 1 ? ' domain' : ' domains'));
      setKpi('aliases', number.format(aliases), 'Forwarding addresses');
    }).catch(unavailable(['domains', 'mailboxes', 'aliases']));

    getJSON('/api/v1/get/mailq/all').then(function(queue) {
      var count = Array.isArray(queue) ? queue.length : 0;
      setKpi('queue', number.format(count), count ? 'Waiting for delivery' : 'Nothing waiting', count > 0);
    }).catch(unavailable(['queue']));

    getJSON('/api/v1/get/quarantine/all').then(function(items) {
      var count = Array.isArray(items) ? items.length : 0;
      setKpi('quarantine', number.format(count), count ? 'Held for review' : 'Nothing held');
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
        hint: link.getAttribute('data-rt-external') ? 'Open app' : (link.getAttribute('data-rt-section') || 'Go to'),
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
          hint: 'Action',
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
      label: 'Toggle dark mode', hint: 'Appearance', icon: 'bi-circle-half',
      run: function() { document.getElementById('dark-mode-toggle').click(); }
    });
    if (collapseToggle) {
      items.push({
        label: root.classList.contains('rt-sidebar-collapsed') ? 'Expand sidebar' : 'Collapse sidebar',
        hint: 'Appearance', icon: 'bi-layout-sidebar',
        run: toggleCollapsed
      });
    }
    var restart = document.querySelector('.rt-user [data-bs-target="#RestartContainer"]');
    if (restart) {
      items.push({
        label: restart.textContent.trim(), hint: 'System', icon: 'bi-arrow-repeat',
        run: function() { restart.click(); }
      });
    }
    if (document.getElementById('logout')) {
      items.push({
        label: 'Sign out', hint: 'Account', icon: 'bi-box-arrow-right',
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
      empty.textContent = 'No matches';
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
    body.classList.add('rt-palette-open');
    input.focus();
  }

  function closePalette() {
    if (palette.hidden) return;
    palette.hidden = true;
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
