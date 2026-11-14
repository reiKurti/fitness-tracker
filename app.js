(() => {
  "use strict";

  const STORAGE_KEY = "ironlog.sessions.v1";
  const DEFAULT_SETS = 3;               // empty sets created for each new exercise

  const { GROUPS, NAMES, TEMPLATES, guessGroup } = window.Catalog;
  const Stats = window.Stats;

  /* ---------------- State ---------------- */
  let sessions = loadSessions();
  let currentSessionId = null;
  let templateTarget = null;            // session id while browsing templates from inside a session
  let currentTemplateId = null;
  let statsMode = "week";               // "week" | "month"
  const expandedProgress = new Set();
  let sheetGroup = null;
  let sheetGroupManual = false;
  let toastTimer = null;

  /* ---------------- Persistence ---------------- */
  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) return [];
      return data.filter(s => s && Array.isArray(s.exercises)).map(s => {
        s.exercises.forEach(ex => { if (!Array.isArray(ex.sets)) ex.sets = []; });
        return s;
      });
    } catch (e) {
      console.error("Failed to load sessions", e);
      return [];
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save sessions", e);
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /* ---------------- DOM refs ---------------- */
  const $ = (id) => document.getElementById(id);
  const views = {
    home: $("view-home"),
    templates: $("view-templates"),
    detail: $("view-detail"),
    stats: $("view-stats"),
    session: $("view-session")
  };
  const tabbar = $("tabbar");
  const tabButtons = tabbar.querySelectorAll(".tab");

  const homeList = $("home-list");
  const exerciseList = $("exercise-list");
  const sessionNameInput = $("session-name-input");
  const sessionDateEl = $("session-date");

  const sheetBackdrop = $("sheet-backdrop");
  const exerciseNameInput = $("exercise-name-input");
  const groupChips = $("group-chips");

  /* ---------------- Navigation ---------------- */
  function show(name, tabs, activeTab) {
    Object.keys(views).forEach(k => views[k].classList.toggle("hidden", k !== name));
    tabbar.classList.toggle("hidden", !tabs);
    tabButtons.forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
  }

  function showHome() {
    currentSessionId = null;
    templateTarget = null;
    show("home", true, "workouts");
    renderHome();
  }

  function showSession(id) {
    currentSessionId = id;
    templateTarget = null;
    show("session", false);
    renderSession();
  }

  function showTemplates(targetSessionId) {
    templateTarget = targetSessionId || null;
    show("templates", !templateTarget, "templates");
    renderTemplates();
  }

  function showTemplateDetail(id) {
    currentTemplateId = id;
    show("detail", false);
    renderDetail();
  }

  function showStats() {
    show("stats", true, "stats");
    renderStats();
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 1500);
  }

  /* ---------------- Formatting ---------------- */
  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatShortDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /* ---------------- Shared session helpers ---------------- */
  function getCurrentSession() {
    return sessions.find(s => s.id === currentSessionId);
  }

  function newSets() {
    return Array.from({ length: DEFAULT_SETS }, () => ({ reps: "", weight: "" }));
  }

  function addExerciseToSession(session, name, group) {
    session.exercises.push({
      id: uid(),
      name,
      group: group || guessGroup(name) || "Other",
      sets: newSets()
    });
  }

  function sessionHasExercise(session, name) {
    const key = name.trim().toLowerCase();
    return session.exercises.some(ex => ex.name.trim().toLowerCase() === key);
  }

  function createSession(name) {
    const session = {
      id: uid(),
      name: name || "",
      dateCreated: new Date().toISOString(),
      exercises: []
    };
    sessions.push(session);
    return session;
  }

  /* ================= HOME ================= */
  function renderHome() {
    const sorted = [...sessions].sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

    if (sorted.length === 0) {
      homeList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24"><path d="M3 12h2m14 0h2M7 7v10M17 7v10M5 9v6M19 9v6M7 12h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          <div class="empty-title">No workouts yet</div>
          <div class="empty-sub">Tap + for a blank workout, or pick a template</div>
        </div>`;
      return;
    }

    homeList.innerHTML = sorted.map(s => {
      const sum = Stats.sessionSummary(s);
      return `
        <div class="session-card" data-id="${esc(s.id)}">
          <div class="session-card-top">
            <div class="session-card-name">${esc(s.name || "Untitled workout")}</div>
            <div class="session-card-date">${formatDate(s.dateCreated)}</div>
          </div>
          <div class="session-card-stats">
            <div class="stat"><span class="stat-value">${sum.exercises}</span><span class="stat-label">Exercises</span></div>
            <div class="stat"><span class="stat-value">${sum.sets}</span><span class="stat-label">Sets</span></div>
            <div class="stat"><span class="stat-value">${Math.round(sum.volume).toLocaleString()}</span><span class="stat-label">Volume</span></div>
          </div>
        </div>`;
    }).join("");

    homeList.querySelectorAll(".session-card").forEach(card => {
      card.addEventListener("click", () => showSession(card.dataset.id));
    });
  }

  /* ================= SESSION ================= */
  function groupOptions(selected) {
    return GROUPS.map(g => `<option value="${g}"${g === selected ? " selected" : ""}>${g}</option>`).join("");
  }

  function renderSession() {
    const session = getCurrentSession();
    if (!session) { showHome(); return; }

    sessionNameInput.value = session.name || "";
    sessionDateEl.textContent = formatDate(session.dateCreated);

    if (session.exercises.length === 0) {
      exerciseList.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24"><path d="M3 12h2m14 0h2M7 7v10M17 7v10M5 9v6M19 9v6M7 12h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          <div class="empty-title">No exercises yet</div>
          <div class="empty-sub">Add one, or load a template</div>
        </div>`;
      return;
    }

    exerciseList.innerHTML = session.exercises.map((ex, exIdx) => {
      const group = ex.group || guessGroup(ex.name) || "Other";
      const setsHtml = ex.sets.map((set, setIdx) => `
        <div class="set-row" data-ex="${exIdx}" data-set="${setIdx}">
          <div class="set-index">${setIdx + 1}</div>
          <input class="set-input reps-input" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="reps" value="${esc(set.reps)}" />
          <input class="set-input weight-input" type="number" inputmode="decimal" placeholder="kg" value="${esc(set.weight)}" />
          <button class="set-remove" aria-label="Remove set">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>`).join("");

      return `
        <div class="exercise-card" data-ex="${exIdx}">
          <div class="exercise-header">
            <div class="exercise-head-main">
              <div class="exercise-title">${esc(ex.name)}</div>
              <select class="group-select" aria-label="Muscle group">${groupOptions(group)}</select>
            </div>
            <button class="exercise-remove" aria-label="Remove exercise">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
          </div>
          <div class="sets-table">
            <div class="set-row-header">
              <div style="text-align:center">#</div><div>Reps</div><div>Weight</div><div></div>
            </div>
            ${setsHtml}
          </div>
          <button class="add-set-btn" data-ex="${exIdx}">
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            Add set
          </button>
        </div>`;
    }).join("");

    wireExerciseListEvents();
  }

  function wireExerciseListEvents() {
    const session = getCurrentSession();

    exerciseList.querySelectorAll(".reps-input").forEach(input => {
      input.addEventListener("input", (e) => {
        const row = e.target.closest(".set-row");
        session.exercises[+row.dataset.ex].sets[+row.dataset.set].reps = e.target.value;
        saveSessions();
      });
    });

    exerciseList.querySelectorAll(".weight-input").forEach(input => {
      input.addEventListener("input", (e) => {
        const row = e.target.closest(".set-row");
        session.exercises[+row.dataset.ex].sets[+row.dataset.set].weight = e.target.value;
        saveSessions();
      });
    });

    exerciseList.querySelectorAll(".group-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const card = e.target.closest(".exercise-card");
        session.exercises[+card.dataset.ex].group = e.target.value;
        saveSessions();
      });
    });

    exerciseList.querySelectorAll(".set-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const row = e.target.closest(".set-row");
        session.exercises[+row.dataset.ex].sets.splice(+row.dataset.set, 1);
        saveSessions();
        renderSession();
      });
    });

    exerciseList.querySelectorAll(".exercise-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".exercise-card");
        session.exercises.splice(+card.dataset.ex, 1);
        saveSessions();
        renderSession();
      });
    });

    exerciseList.querySelectorAll(".add-set-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const sets = session.exercises[+e.currentTarget.dataset.ex].sets;
        const last = sets[sets.length - 1];
        sets.push({ reps: last ? last.reps : "", weight: last ? last.weight : "" });
        saveSessions();
        renderSession();
      });
    });
  }

  function deleteCurrentSession() {
    if (!currentSessionId) return;
    if (!confirm("Delete this workout? This can't be undone.")) return;
    sessions = sessions.filter(s => s.id !== currentSessionId);
    saveSessions();
    showHome();
  }

  /* ---------- Add-exercise sheet ---------- */
  function renderGroupChips() {
    groupChips.innerHTML = GROUPS.map(g =>
      `<button type="button" class="chip${g === sheetGroup ? " active" : ""}" data-group="${g}">${g}</button>`
    ).join("");
  }

  function fillSuggestions() {
    const seen = {};
    const names = [];
    NAMES.concat(sessions.flatMap(s => s.exercises.map(ex => ex.name))).forEach(n => {
      const key = (n || "").trim().toLowerCase();
      if (key && !seen[key]) { seen[key] = true; names.push(n.trim()); }
    });
    names.sort((a, b) => a.localeCompare(b));
    $("exercise-suggestions").innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join("");
  }

  function openExerciseSheet() {
    exerciseNameInput.value = "";
    sheetGroup = null;
    sheetGroupManual = false;
    renderGroupChips();
    fillSuggestions();
    sheetBackdrop.classList.remove("hidden");
    setTimeout(() => exerciseNameInput.focus(), 50);
  }

  function closeExerciseSheet() {
    sheetBackdrop.classList.add("hidden");
  }

  function confirmAddExercise() {
    const name = exerciseNameInput.value.trim();
    if (!name) { exerciseNameInput.focus(); return; }
    const session = getCurrentSession();
    addExerciseToSession(session, name, sheetGroup || "Other");
    saveSessions();
    closeExerciseSheet();
    renderSession();
  }

  /* ================= TEMPLATES ================= */
  // Flatten a template's numbered slots into exercises: slot 3 with two names -> "3a", "3b"
  function flattenTemplate(t) {
    const out = [];
    t.slots.forEach((slot, i) => slot.forEach((name, j) => out.push({
      name,
      group: guessGroup(name) || "Other",
      label: slot.length > 1 ? (i + 1) + String.fromCharCode(97 + j) : String(i + 1)
    })));
    return out;
  }

  function renderTemplates() {
    $("btn-templates-back").classList.toggle("hidden", !templateTarget);
    $("templates-sub").textContent = templateTarget
      ? "Pick a template to add to this workout"
      : "Start a workout from a template";

    $("templates-list").innerHTML = TEMPLATES.map(t => {
      const items = flattenTemplate(t);
      const preview = items.slice(0, 3).map(i => i.name).join(" · ") + (items.length > 3 ? " …" : "");
      return `
        <div class="template-card" data-id="${esc(t.id)}">
          <div class="template-card-top">
            <div class="template-card-name">${esc(t.name)}</div>
            <div class="template-card-count">${items.length} exercises</div>
          </div>
          <div class="template-card-preview">${esc(preview)}</div>
        </div>`;
    }).join("");

    $("templates-list").querySelectorAll(".template-card").forEach(card => {
      card.addEventListener("click", () => showTemplateDetail(card.dataset.id));
    });
  }

  function currentTemplate() {
    return TEMPLATES.find(t => t.id === currentTemplateId);
  }

  function renderDetail() {
    const t = currentTemplate();
    if (!t) { showTemplates(templateTarget); return; }
    const items = flattenTemplate(t);
    const session = templateTarget ? sessions.find(s => s.id === templateTarget) : null;

    $("detail-title").textContent = t.name;
    $("detail-sub").textContent = session
      ? "Tap + to add a single exercise"
      : items.length + " exercises";

    $("detail-list").innerHTML = items.map((item, idx) => {
      const added = session && sessionHasExercise(session, item.name);
      const action = !session ? "" : added
        ? `<div class="tpl-added" aria-label="Already in workout"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>`
        : `<button class="tpl-add" data-idx="${idx}" aria-label="Add ${esc(item.name)}"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`;
      return `
        <div class="tpl-row">
          <div class="tpl-num">${item.label}</div>
          <div class="tpl-info">
            <div class="tpl-name">${esc(item.name)}</div>
            <div class="tag">${item.group}</div>
          </div>
          ${action}
        </div>`;
    }).join("");

    const primary = $("btn-detail-primary");
    if (!session) {
      primary.textContent = "Start workout";
    } else {
      const remaining = items.filter(i => !sessionHasExercise(session, i.name)).length;
      primary.textContent = remaining === 0 ? "Back to workout" : "Add all to workout";
    }

    $("detail-list").querySelectorAll(".tpl-add").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = items[+btn.dataset.idx];
        addExerciseToSession(session, item.name, item.group);
        saveSessions();
        renderDetail();
        toast("Added " + item.name);
      });
    });
  }

  function onDetailPrimary() {
    const t = currentTemplate();
    if (!t) return;
    const items = flattenTemplate(t);

    if (!templateTarget) {                      // clone template into a brand-new workout
      const session = createSession(t.name);
      items.forEach(i => addExerciseToSession(session, i.name, i.group));
      saveSessions();
      showSession(session.id);
      return;
    }

    const session = sessions.find(s => s.id === templateTarget);
    if (!session) { showHome(); return; }
    let added = 0;
    items.forEach(i => {
      if (!sessionHasExercise(session, i.name)) { addExerciseToSession(session, i.name, i.group); added++; }
    });
    saveSessions();
    showSession(session.id);
    if (added) toast(added + (added === 1 ? " exercise added" : " exercises added"));
  }

  /* ================= STATS ================= */
  function renderStats() {
    const el = $("stats-content");
    const totals = Stats.totals(sessions);
    const exMap = Stats.collect(sessions, guessGroup);
    const prs = Stats.personalRecords(exMap);
    const prGroups = GROUPS.filter(g => prs[g]);

    if (totals.sets === 0 && prGroups.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24"><path d="M5 20V12M12 20V5M19 20v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>
          <div class="empty-title">No stats yet</div>
          <div class="empty-sub">Log a workout with reps and weight and your records and progress will show up here</div>
        </div>`;
      return;
    }

    const prHtml = prGroups.length === 0
      ? `<div class="hint">Add weight and reps to a set to start recording PRs.</div>`
      : `<div class="pr-grid">${prGroups.map(g => {
          const p = prs[g];
          return `
            <div class="pr-card">
              <div class="pr-group">${g}</div>
              <div class="pr-weight">${Stats.fmt(p.weight)}<span>kg</span></div>
              <div class="pr-exercise">${esc(p.exercise)}</div>
              <div class="pr-meta">${Stats.fmt(p.reps)} reps · ${formatShortDate(p.date)}</div>
            </div>`;
        }).join("")}</div>`;

    const progress = Stats.progression(exMap, statsMode);
    const hasDelta = progress.some(p => p.delta !== null);
    const unit = statsMode === "month" ? "month" : "week";

    const progHtml = progress.length === 0
      ? `<div class="hint">Nothing to compare yet.</div>`
      : progress.map((p, i) => {
          let chip, sub;
          if (p.delta === null) {
            chip = `<div class="delta flat">Baseline</div>`;
            sub = `Best ${Stats.fmt(p.last.weight)} kg · ${esc(p.last.label)}`;
          } else {
            const cls = p.delta > 0 ? "up" : p.delta < 0 ? "down" : "flat";
            const sign = p.delta > 0 ? "+" : "";
            chip = `<div class="delta ${cls}">${sign}${Stats.fmt(p.delta)} kg</div>`;
            sub = `${esc(p.first.label)}: ${Stats.fmt(p.first.weight)} → ${esc(p.last.label)}: ${Stats.fmt(p.last.weight)} kg`;
          }
          const open = expandedProgress.has(p.key);
          const detail = open ? `
            <div class="prog-detail">${p.periods.map((per, k) => {
              const prev = k > 0 ? Number((per.weight - p.periods[k - 1].weight).toFixed(2)) : null;
              const change = prev === null ? "" : `<span class="${prev > 0 ? "up" : prev < 0 ? "down" : "flat"}">${prev > 0 ? "+" : ""}${Stats.fmt(prev)}</span>`;
              return `<div class="prog-period"><span>${esc(per.label)}</span><span>${Stats.fmt(per.weight)} kg × ${Stats.fmt(per.reps)} ${change}</span></div>`;
            }).join("")}</div>` : "";
          return `
            <div class="prog-item">
              <div class="prog-row" data-i="${i}">
                <div class="prog-main">
                  <div class="prog-name">${esc(p.name)} <span class="tag">${p.group}</span></div>
                  <div class="prog-sub">${sub}</div>
                </div>
                ${chip}
              </div>
              ${detail}
            </div>`;
        }).join("");

    el.innerHTML = `
      <div class="tiles">
        <div class="tile"><span class="stat-value">${totals.workouts}</span><span class="stat-label">Workouts</span></div>
        <div class="tile"><span class="stat-value">${totals.sets}</span><span class="stat-label">Sets</span></div>
        <div class="tile"><span class="stat-value">${Math.round(totals.volume).toLocaleString()}</span><span class="stat-label">Volume kg</span></div>
      </div>

      <h2 class="section-title">Personal records</h2>
      <div class="section-sub">Heaviest set per muscle group</div>
      ${prHtml}

      <h2 class="section-title">Progress</h2>
      <div class="seg">
        <button class="seg-btn${statsMode === "week" ? " active" : ""}" data-mode="week">Weekly</button>
        <button class="seg-btn${statsMode === "month" ? " active" : ""}" data-mode="month">Monthly</button>
      </div>
      <div class="section-sub">Heaviest set per ${unit}, first ${unit} vs latest. Tap an exercise for the full history.</div>
      ${!hasDelta && progress.length ? `<div class="hint">Keep logging: a change appears once an exercise has results in 2 different ${unit}s.</div>` : ""}
      ${progHtml}`;

    el.querySelectorAll(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => { statsMode = btn.dataset.mode; renderStats(); });
    });
    el.querySelectorAll(".prog-row").forEach(row => {
      row.addEventListener("click", () => {
        const key = progress[+row.dataset.i].key;
        if (expandedProgress.has(key)) expandedProgress.delete(key); else expandedProgress.add(key);
        renderStats();
      });
    });
  }

  /* ================= Event wiring ================= */
  $("btn-new-session").addEventListener("click", () => {
    const session = createSession("");
    saveSessions();
    showSession(session.id);
    setTimeout(() => sessionNameInput.focus(), 100);
  });

  $("btn-back-home").addEventListener("click", showHome);
  $("btn-delete-session").addEventListener("click", deleteCurrentSession);
  $("btn-add-exercise").addEventListener("click", openExerciseSheet);
  $("btn-open-templates").addEventListener("click", () => showTemplates(currentSessionId));

  $("btn-templates-back").addEventListener("click", () => {
    const target = templateTarget;
    if (target && sessions.some(s => s.id === target)) showSession(target); else showHome();
  });
  $("btn-detail-back").addEventListener("click", () => showTemplates(templateTarget));
  $("btn-detail-primary").addEventListener("click", onDetailPrimary);

  tabButtons.forEach(btn => btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "workouts") showHome();
    else if (tab === "templates") showTemplates(null);
    else showStats();
  }));

  $("btn-cancel-exercise").addEventListener("click", closeExerciseSheet);
  $("btn-save-exercise").addEventListener("click", confirmAddExercise);
  sheetBackdrop.addEventListener("click", (e) => { if (e.target === sheetBackdrop) closeExerciseSheet(); });
  exerciseNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmAddExercise(); });
  exerciseNameInput.addEventListener("input", () => {
    if (!sheetGroupManual) {
      sheetGroup = guessGroup(exerciseNameInput.value);
      renderGroupChips();
    }
  });
  groupChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    sheetGroup = chip.dataset.group;
    sheetGroupManual = true;
    renderGroupChips();
  });

  sessionNameInput.addEventListener("input", (e) => {
    const session = getCurrentSession();
    if (session) { session.name = e.target.value; saveSessions(); }
  });

  /* ---------------- Service worker (offline support) ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  /* ---------------- Init ---------------- */
  showHome();
})();
