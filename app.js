(() => {
  "use strict";

  const STORAGE_KEY = "ironlog.sessions.v1";

  /* ---------------- State ---------------- */
  let sessions = loadSessions();
  let currentSessionId = null;
  let pendingExerciseCallback = null;

  /* ---------------- Persistence ---------------- */
  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
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

  /* ---------------- DOM refs ---------------- */
  const viewHome = document.getElementById("view-home");
  const viewSession = document.getElementById("view-session");
  const homeList = document.getElementById("home-list");
  const exerciseList = document.getElementById("exercise-list");
  const sessionNameInput = document.getElementById("session-name-input");
  const sessionDateEl = document.getElementById("session-date");

  const btnNewSession = document.getElementById("btn-new-session");
  const btnBackHome = document.getElementById("btn-back-home");
  const btnDeleteSession = document.getElementById("btn-delete-session");
  const btnAddExercise = document.getElementById("btn-add-exercise");

  const sheetBackdrop = document.getElementById("sheet-backdrop");
  const exerciseNameInput = document.getElementById("exercise-name-input");
  const btnCancelExercise = document.getElementById("btn-cancel-exercise");
  const btnSaveExercise = document.getElementById("btn-save-exercise");

  /* ---------------- Navigation ---------------- */
  function showHome() {
    currentSessionId = null;
    viewSession.classList.add("hidden");
    viewHome.classList.remove("hidden");
    renderHome();
  }

  function showSession(id) {
    currentSessionId = id;
    viewHome.classList.add("hidden");
    viewSession.classList.remove("hidden");
    renderSession();
  }

  /* ---------------- Formatting helpers ---------------- */
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function sessionStats(session) {
    let setCount = 0;
    let volume = 0;
    session.exercises.forEach(ex => {
      ex.sets.forEach(s => {
        setCount++;
        const r = parseFloat(s.reps) || 0;
        const w = parseFloat(s.weight) || 0;
        volume += r * w;
      });
    });
    return {
      exerciseCount: session.exercises.length,
      setCount,
      volume
    };
  }

  /* ---------------- Home rendering ---------------- */
  function renderHome() {
    const sorted = [...sessions].sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

    if (sorted.length === 0) {
      homeList.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          <div class="empty-title">No workouts yet</div>
          <div class="empty-sub">Tap + to log your first session</div>
        </div>`;
      return;
    }

    homeList.innerHTML = sorted.map(s => {
      const stats = sessionStats(s);
      const name = escapeHtml(s.name || "Untitled workout");
      return `
        <div class="session-card" data-id="${s.id}">
          <div class="session-card-top">
            <div class="session-card-name">${name}</div>
            <div class="session-card-date">${formatDate(s.dateCreated)}</div>
          </div>
          <div class="session-card-stats">
            <div class="stat">
              <span class="stat-value">${stats.exerciseCount}</span>
              <span class="stat-label">Exercises</span>
            </div>
            <div class="stat">
              <span class="stat-value">${stats.setCount}</span>
              <span class="stat-label">Sets</span>
            </div>
            <div class="stat">
              <span class="stat-value">${Math.round(stats.volume).toLocaleString()}</span>
              <span class="stat-label">Volume</span>
            </div>
          </div>
        </div>`;
    }).join("");

    homeList.querySelectorAll(".session-card").forEach(card => {
      card.addEventListener("click", () => showSession(card.dataset.id));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Session rendering ---------------- */
  function getCurrentSession() {
    return sessions.find(s => s.id === currentSessionId);
  }

  function renderSession() {
    const session = getCurrentSession();
    if (!session) { showHome(); return; }

    sessionNameInput.value = session.name || "";
    sessionDateEl.textContent = formatDate(session.dateCreated);

    if (session.exercises.length === 0) {
      exerciseList.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M2 8l3-3 4 1-1 4-3 3-4-1zM22 16l-3 3-4-1 1-4 3-3 4 1z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          <div class="empty-title">No exercises yet</div>
          <div class="empty-sub">Tap "Add exercise" to get started</div>
        </div>`;
      return;
    }

    exerciseList.innerHTML = session.exercises.map((ex, exIdx) => {
      const setsHtml = ex.sets.map((set, setIdx) => `
        <div class="set-row" data-ex="${exIdx}" data-set="${setIdx}">
          <div class="set-index">${setIdx + 1}</div>
          <input class="set-input reps-input" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="reps" value="${set.reps ?? ""}" />
          <input class="set-input weight-input" type="number" inputmode="decimal" placeholder="kg" value="${set.weight ?? ""}" />
          <button class="set-remove" aria-label="Remove set">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      `).join("");

      return `
        <div class="exercise-card" data-ex="${exIdx}">
          <div class="exercise-header">
            <div class="exercise-title">${escapeHtml(ex.name)}</div>
            <button class="exercise-remove" aria-label="Remove exercise">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
          </div>
          <div class="sets-table">
            <div class="set-row-header">
              <div style="text-align:center">#</div>
              <div>Reps</div>
              <div>Weight</div>
              <div></div>
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
        const exIdx = +row.dataset.ex, setIdx = +row.dataset.set;
        session.exercises[exIdx].sets[setIdx].reps = e.target.value;
        saveSessions();
      });
    });

    exerciseList.querySelectorAll(".weight-input").forEach(input => {
      input.addEventListener("input", (e) => {
        const row = e.target.closest(".set-row");
        const exIdx = +row.dataset.ex, setIdx = +row.dataset.set;
        session.exercises[exIdx].sets[setIdx].weight = e.target.value;
        saveSessions();
      });
    });

    exerciseList.querySelectorAll(".set-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const row = e.target.closest(".set-row");
        const exIdx = +row.dataset.ex, setIdx = +row.dataset.set;
        session.exercises[exIdx].sets.splice(setIdx, 1);
        saveSessions();
        renderSession();
      });
    });

    exerciseList.querySelectorAll(".exercise-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".exercise-card");
        const exIdx = +card.dataset.ex;
        session.exercises.splice(exIdx, 1);
        saveSessions();
        renderSession();
      });
    });

    exerciseList.querySelectorAll(".add-set-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const exIdx = +e.currentTarget.dataset.ex;
        const sets = session.exercises[exIdx].sets;
        const last = sets[sets.length - 1];
        sets.push({
          reps: last ? last.reps : "",
          weight: last ? last.weight : ""
        });
        saveSessions();
        renderSession();
      });
    });
  }

  /* ---------------- Session sheet: add exercise ---------------- */
  function openExerciseSheet() {
    exerciseNameInput.value = "";
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
    session.exercises.push({
      id: uid(),
      name,
      sets: [{ reps: "", weight: "" }]
    });
    saveSessions();
    closeExerciseSheet();
    renderSession();
  }

  /* ---------------- Session lifecycle ---------------- */
  function createSession() {
    const session = {
      id: uid(),
      name: "",
      dateCreated: new Date().toISOString(),
      exercises: []
    };
    sessions.push(session);
    saveSessions();
    showSession(session.id);
    setTimeout(() => sessionNameInput.focus(), 100);
  }

  function deleteCurrentSession() {
    if (!currentSessionId) return;
    if (!confirm("Delete this workout? This can't be undone.")) return;
    sessions = sessions.filter(s => s.id !== currentSessionId);
    saveSessions();
    showHome();
  }

  /* ---------------- Event wiring ---------------- */
  btnNewSession.addEventListener("click", createSession);
  btnBackHome.addEventListener("click", showHome);
  btnDeleteSession.addEventListener("click", deleteCurrentSession);
  btnAddExercise.addEventListener("click", openExerciseSheet);
  btnCancelExercise.addEventListener("click", closeExerciseSheet);
  btnSaveExercise.addEventListener("click", confirmAddExercise);
  sheetBackdrop.addEventListener("click", (e) => {
    if (e.target === sheetBackdrop) closeExerciseSheet();
  });
  exerciseNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAddExercise();
  });

  sessionNameInput.addEventListener("input", (e) => {
    const session = getCurrentSession();
    if (session) {
      session.name = e.target.value;
      saveSessions();
    }
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
