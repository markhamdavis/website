// Modus- Commission: puts the first-year comp % from the Brokers Alliance comp
// grid next to every "Apply" button on the term life quoter.
(function () {
  "use strict";
  if (window.__modusCommission) return;
  window.__modusCommission = true;

  // ---------- grid data ----------
  var ROWS = MODUS_GRID.map(function (r, i) {
    return { i: i, grid: r[0], product: r[1], details: r[2], states: r[3], level: r[4], rate: r[5], years: r[6], type: r[7] };
  });

  var STOP = new Set(("term life year years yr yrs level the of and with w a to series sub type policy not applicable ages age issue " +
    "lifetime standard insurance plan name only including").split(" "));
  // Words that describe a variant the quote must explicitly mention to match.
  var VARIANT = ["rider", "riders", "child", "spouse", "substandard", "rop", "return", "heaped", "simplinow", "accidental", "survivor"];

  function norm(s) {
    return (" " + String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9&+]+/g, " ") + " ").replace(/\s+/g, " ");
  }
  function hasWord(normText, word) {
    return normText.indexOf(" " + word + " ") !== -1;
  }

  var familyByGrid = {};
  var FAMILIES = MODUS_CARRIERS.map(function (f) {
    f.normNames = f.names.map(function (n) { return norm(n).trim(); });
    f.grids.forEach(function (g) { familyByGrid[g] = f; });
    return f;
  });
  ROWS.forEach(function (r) {
    r.family = familyByGrid[r.grid] || null;
    var text = norm(r.product + " " + r.details);
    r.tokens = Array.from(new Set(text.trim().split(" "))).filter(function (t) {
      return t && !STOP.has(t) && !/^\d+$/.test(t) && t.length > 1;
    });
    r.variants = VARIANT.filter(function (v) { return hasWord(text, v); });
    r.nyOnly = /(^|[\s-])ny$/i.test(r.grid.trim()) || r.states.trim().toUpperCase() === "NY";
    r.isTerm = r.type === "Term" || /term/i.test(r.product);
  });

  // ---------- settings / overrides ----------
  var settings = { enabled: true, overrides: {}, prefGrids: {} };
  function loadSettings(cb) {
    try {
      chrome.storage.local.get({ enabled: true, overrides: {}, prefGrids: {} }, function (s) {
        settings = s || settings;
        cb();
      });
    } catch (e) { cb(); }
  }
  function saveOverrides() {
    try { chrome.storage.local.set({ overrides: settings.overrides, prefGrids: settings.prefGrids }); } catch (e) {}
  }
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.enabled) settings.enabled = changes.enabled.newValue;
      if (changes.overrides) settings.overrides = changes.overrides.newValue || {};
      if (changes.prefGrids) settings.prefGrids = changes.prefGrids.newValue || {};
      scheduleScan(0);
    });
  } catch (e) {}

  // ---------- page reading ----------
  var OURS = "modus-comm-ui";
  var TERM_RES = [
    /\b(\d{1,2})\s*-?\s*(?:years?|yrs?)\b/i,
    /\bterm\s*-?\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*-?\s*yr\b/i
  ];
  function findTerm(text) {
    for (var k = 0; k < TERM_RES.length; k++) {
      var re = new RegExp(TERM_RES[k].source, "gi"), m;
      while ((m = re.exec(text))) {
        var n = parseInt(m[1], 10);
        if (n >= 5 && n <= 40) return n;
      }
    }
    return null;
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // Term length chosen at page level (selected tab, dropdown, etc).
  function pageTerm() {
    var sel = '[role="tab"][aria-selected="true"], [aria-current="true"], [aria-pressed="true"], .active, .selected, ' +
      '.is-active, .mat-tab-label-active, .mdc-tab--active, .nav-link.active, [class*="active"], [class*="selected"]';
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest("." + OURS) || !isVisible(el)) continue;
      var t = (el.innerText || "").trim();
      if (t.length > 0 && t.length < 40) {
        var n = findTerm(t);
        if (n) return n;
      }
    }
    var selects = document.querySelectorAll("select");
    for (var j = 0; j < selects.length; j++) {
      var o = selects[j].options[selects[j].selectedIndex];
      if (o) {
        var m = findTerm(o.text);
        if (m && /year|yr|term/i.test(o.text)) return m;
      }
    }
    return null;
  }

  function pageIsNY() {
    var selects = document.querySelectorAll("select");
    for (var j = 0; j < selects.length; j++) {
      var o = selects[j].options[selects[j].selectedIndex];
      if (o && (/^new york$/i.test(o.text.trim()) || /^NY$/.test(o.value))) return true;
    }
    return false;
  }

  function findApplyButtons() {
    var found = new Set();
    var cands = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], span, div');
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (el.closest("." + OURS)) continue;
      var txt = el.tagName === "INPUT" ? el.value : (el.childElementCount <= 2 ? el.textContent : "");
      if (!txt || !/^\s*apply(\s+now)?\s*$/i.test(txt)) continue;
      var btn = el.closest('button, a, [role="button"]') || el;
      found.add(btn);
    }
    // Keep only the outermost element for nested matches (e.g. <a><span>Apply</span></a>).
    var list = Array.from(found);
    return list.filter(function (b) {
      return !list.some(function (o) { return o !== b && o.contains(b); });
    });
  }

  // The product's "card" = the largest ancestor containing only this Apply button.
  function findCard(btn, allBtns) {
    var card = btn.parentElement || btn;
    var el = card;
    while (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
      var p = el.parentElement;
      var others = allBtns.some(function (b) { return b !== btn && p.contains(b); });
      if (others || (p.textContent || "").length > 3000) break;
      el = p;
      card = p;
    }
    return card;
  }

  function cardText(card) {
    var parts = [card.innerText || card.textContent || ""];
    card.querySelectorAll("img, svg, [aria-label], [title]").forEach(function (el) {
      if (el.closest("." + OURS)) return;
      ["alt", "title", "aria-label"].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v) parts.push(v);
      });
      if (el.tagName === "IMG") {
        var src = (el.getAttribute("src") || "").split("?")[0];
        if (!/^data:/.test(src)) parts.push(src.split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " "));
      }
    });
    // Background-image logos.
    card.querySelectorAll('[style*="background"]').forEach(function (el) {
      var m = /url\(["']?([^"')]+)/.exec(el.getAttribute("style") || "");
      if (m && !/^data:/.test(m[1])) parts.push(m[1].split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " "));
    });
    return parts.join(" \n ");
  }

  function tabPanelTerm(card) {
    var panel = card.closest('[role="tabpanel"]');
    if (panel) {
      var lbl = panel.getAttribute("aria-labelledby");
      var lblEl = lbl && document.getElementById(lbl.split(" ")[0]);
      var t = lblEl ? findTerm(lblEl.textContent || "") : null;
      if (!t) t = findTerm(panel.getAttribute("aria-label") || "");
      if (t) return t;
    }
    return null;
  }

  function detectFamily(normText) {
    var best = null, bestLen = 0;
    FAMILIES.forEach(function (f) {
      f.normNames.forEach(function (n) {
        if (n.length > bestLen && hasWord(normText, n)) { best = f; bestLen = n.length; }
      });
    });
    if (best) return best;
    // Squashed logo file names like "bannerlife" or "mutualofomaha".
    var squashed = normText.replace(/ /g, "");
    FAMILIES.forEach(function (f) {
      f.normNames.forEach(function (n) {
        var s = n.replace(/ /g, "");
        if (s.length >= 6 && s.length > bestLen && squashed.indexOf(s) !== -1) { best = f; bestLen = s.length; }
      });
    });
    return best;
  }

  // ---------- matching ----------
  function scoreRow(r, ctx) {
    var s = 0;
    var matched = 0;
    r.tokens.forEach(function (t) {
      if (hasWord(ctx.normText, t) || (t.length >= 4 && ctx.squashed.indexOf(t) !== -1)) { s += 2; matched++; }
      else s -= 0.5;
    });
    if (ctx.term && r.years.length) s += r.years.indexOf(ctx.term) !== -1 ? 6 : -8;
    r.variants.forEach(function (v) {
      if (!hasWord(ctx.normText, v)) s -= 4;
    });
    if (r.nyOnly) s += ctx.ny ? 3 : -5;
    if (r.isTerm) s += 1; else s -= 2;
    // Carrier grid the user picked before (e.g. Transamerica Direct vs Family Markets).
    if (r.family && settings.prefGrids[r.family.family] === r.grid) s += 1;
    return { row: r, score: s, matched: matched };
  }

  function rankFamily(family, ctx) {
    return ROWS.filter(function (r) { return r.family === family; })
      .map(function (r) { return scoreRow(r, ctx); })
      .sort(function (a, b) { return b.score - a.score || a.row.i - b.row.i; });
  }

  function signature(familyName, term, normText) {
    var words = Array.from(new Set(normText.trim().split(" ").filter(function (w) {
      return /^[a-z][a-z&+]{2,}$/.test(w) && w !== "apply" && w !== "now";
    }))).sort();
    return familyName + "|" + (term || "") + "|" + words.slice(0, 40).join(" ");
  }

  function analyze(btn, allBtns, ctxTerm, ny) {
    var card = findCard(btn, allBtns);
    var text = cardText(card);
    var normText = norm(text);
    var term = findTerm(text) || tabPanelTerm(card) || ctxTerm;
    var family = detectFamily(normText);
    var ctx = { normText: normText, squashed: normText.replace(/ /g, ""), term: term, ny: ny || hasWord(normText, "new york") };
    var res = { card: card, term: term, family: family, ranked: [], best: null, ambiguous: false, alts: [], key: null, manual: false };
    res.key = signature(family ? family.family : "?", term, normText);
    var ov = settings.overrides[res.key];
    if (family) res.ranked = rankFamily(family, ctx);
    if (ov !== undefined && ROWS[ov]) {
      res.best = ROWS[ov];
      res.manual = true;
      return res;
    }
    if (!res.ranked.length) return res;
    var top = res.ranked[0];
    res.best = top.row;
    res.alts = res.ranked.filter(function (c) { return c.score >= top.score - 0.01 && c.row.rate !== top.row.rate; })
      .map(function (c) { return c.row; });
    res.ambiguous = res.alts.length > 0 || (top.matched === 0 && top.row.tokens.length > 0);
    return res;
  }

  // ---------- UI ----------
  var boxes = new WeakMap();
  var results = new WeakMap();

  function fmtRate(r) { return (Math.round(r * 100) / 100) + "%"; }
  function describe(row) {
    return row.grid + " — " + row.product + (row.details ? " (" + row.details + ")" : "") +
      " · Level " + row.level + " · " + (row.states || "states n/a");
  }

  function render(btn, res) {
    var box = boxes.get(btn);
    if (!box || !box.isConnected || box.previousElementSibling !== btn) {
      if (box) box.remove();
      box = document.createElement("span");
      box.className = OURS + " modus-comm";
      box.setAttribute("role", "button");
      box.tabIndex = 0;
      box.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPanel(btn);
      });
      btn.insertAdjacentElement("afterend", box);
      boxes.set(btn, box);
    }
    results.set(btn, res);
    var label, state, title;
    if (!res.best) {
      label = "—";
      state = "none";
      title = res.family ? "No " + res.family.family + " product in the comp grid matched. Click to pick one."
        : "Couldn't recognize the carrier. Click to pick the product from the comp grid.";
    } else {
      var lo = res.best.rate, hi = res.best.rate;
      res.alts.forEach(function (a) { lo = Math.min(lo, a.rate); hi = Math.max(hi, a.rate); });
      label = lo === hi ? fmtRate(lo) : fmtRate(lo) + "–" + fmtRate(hi);
      state = res.manual ? "manual" : (res.ambiguous ? "unsure" : "ok");
      title = (res.manual ? "Picked by you: " : "Matched: ") + describe(res.best) +
        (res.alts.length ? "\nAlso possible: " + res.alts.map(describe).join("\n") : "") +
        "\nClick to see details or change the match.";
    }
    if (box.getAttribute("data-label") !== label) box.setAttribute("data-label", label);
    if (box.getAttribute("data-state") !== state) box.setAttribute("data-state", state);
    if (box.title !== title) box.title = title;
  }

  var panel = null;
  function closePanel() {
    if (panel) { panel.remove(); panel = null; }
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function rowItem(row, onPick, current) {
    var li = el("li", "modus-row" + (current ? " modus-current" : ""));
    li.appendChild(el("span", "modus-rate", fmtRate(row.rate)));
    var info = el("span", "modus-info");
    info.appendChild(el("strong", null, row.product));
    info.appendChild(el("span", "modus-sub", [row.grid, row.details, "Level " + row.level, row.states].filter(Boolean).join(" · ")));
    li.appendChild(info);
    li.addEventListener("click", function () { onPick(row); });
    return li;
  }

  function openPanel(btn) {
    closePanel();
    var res = results.get(btn);
    if (!res) return;
    panel = el("div", OURS + " modus-panel");
    var head = el("div", "modus-head");
    head.appendChild(el("span", "modus-title", "Modus- Commission"));
    var x = el("button", "modus-x", "×");
    x.addEventListener("click", closePanel);
    head.appendChild(x);
    panel.appendChild(head);

    panel.appendChild(el("div", "modus-detect",
      "Carrier: " + (res.family ? res.family.family : "not recognized") + " · Term: " + (res.term ? res.term + " yr" : "not detected")));

    function pick(row) {
      settings.overrides[res.key] = row.i;
      if (row.family) settings.prefGrids[row.family.family] = row.grid;
      saveOverrides();
      closePanel();
      scheduleScan(0);
    }

    if (res.best) {
      panel.appendChild(el("div", "modus-label", res.manual ? "Your pick" : "Best match"));
      var cur = el("ul", "modus-list");
      cur.appendChild(rowItem(res.best, function () {}, true));
      panel.appendChild(cur);
    }
    if (res.manual) {
      var reset = el("button", "modus-btn", "Reset to automatic match");
      reset.addEventListener("click", function () {
        delete settings.overrides[res.key];
        saveOverrides();
        closePanel();
        scheduleScan(0);
      });
      panel.appendChild(reset);
    }

    var others = res.ranked.filter(function (c) { return !res.best || c.row !== res.best; }).slice(0, 12);
    if (others.length) {
      panel.appendChild(el("div", "modus-label", "Other " + res.family.family + " products (click to use)"));
      var ul = el("ul", "modus-list");
      others.forEach(function (c) { ul.appendChild(rowItem(c.row, pick)); });
      panel.appendChild(ul);
    }

    panel.appendChild(el("div", "modus-label", "Search the whole comp grid"));
    var input = el("input", "modus-search");
    input.placeholder = "e.g. banner opterm 20";
    panel.appendChild(input);
    var results_ = el("ul", "modus-list");
    panel.appendChild(results_);
    input.addEventListener("input", function () {
      results_.textContent = "";
      var q = norm(input.value).trim().split(" ").filter(Boolean);
      if (!q.length) return;
      ROWS.filter(function (r) {
        var t = norm(r.grid + " " + r.product + " " + r.details + " " + (r.family ? r.family.names.join(" ") : ""));
        return q.every(function (w) { return t.indexOf(w) !== -1; });
      }).slice(0, 30).forEach(function (r) { results_.appendChild(rowItem(r, pick)); });
    });
    ["keydown", "keyup", "keypress"].forEach(function (ev) {
      input.addEventListener(ev, function (e) { e.stopPropagation(); });
    });

    document.body.appendChild(panel);
    var rect = boxes.get(btn).getBoundingClientRect();
    var left = Math.min(window.innerWidth - panel.offsetWidth - 12, Math.max(12, rect.right - panel.offsetWidth));
    var top = rect.bottom + 6;
    if (top + panel.offsetHeight > window.innerHeight - 12) top = Math.max(12, rect.top - panel.offsetHeight - 6);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }
  document.addEventListener("mousedown", function (e) {
    if (panel && !panel.contains(e.target) && !(e.target.closest && e.target.closest(".modus-comm"))) closePanel();
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });

  // ---------- scan loop ----------
  function removeAll() {
    document.querySelectorAll(".modus-comm").forEach(function (b) { b.remove(); });
    closePanel();
  }

  function scan() {
    if (!settings.enabled) { removeAll(); return; }
    var btns = findApplyButtons();
    if (!btns.length) return;
    var term = pageTerm();
    var ny = pageIsNY();
    var live = new Set();
    btns.forEach(function (btn) {
      try {
        render(btn, analyze(btn, btns, term, ny));
        live.add(boxes.get(btn));
      } catch (e) {
        console.warn("[Modus- Commission]", e);
      }
    });
    document.querySelectorAll(".modus-comm").forEach(function (b) { if (!live.has(b)) b.remove(); });
  }

  var timer = null;
  function scheduleScan(delay) {
    clearTimeout(timer);
    timer = setTimeout(scan, delay == null ? 300 : delay);
  }

  function isOurs(node) {
    var e = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(e && e.closest && e.closest("." + OURS));
  }
  var observer = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (isOurs(m.target)) continue;
      if (m.type === "childList") {
        var onlyOurs = true;
        m.addedNodes.forEach(function (n) { if (!isOurs(n)) onlyOurs = false; });
        m.removedNodes.forEach(function (n) { if (!(n.classList && n.classList.contains(OURS))) onlyOurs = false; });
        if (onlyOurs) continue;
      }
      scheduleScan();
      return;
    }
  });

  loadSettings(function () {
    scan();
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "aria-selected", "hidden", "value"]
    });
    document.addEventListener("change", function () { scheduleScan(); }, true);
    document.addEventListener("click", function (e) { if (!isOurs(e.target)) scheduleScan(400); }, true);
  });
})();
