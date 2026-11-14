/* ------------------------------------------------------------------
   Stats: pure functions, no DOM. Everything is computed from the saved
   sessions, so nothing extra is stored.
   A set only counts toward PRs/progress if it has weight > 0 and reps > 0.
------------------------------------------------------------------- */
(function () {
  "use strict";

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function fmt(n) {
    return Number(n.toFixed(2)).toString();
  }

  function isBetter(a, b) {            // is set a better than set b?
    return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
  }

  // Counts for the session cards on the home screen (only logged sets)
  function sessionSummary(session) {
    let sets = 0, volume = 0;
    session.exercises.forEach(ex => ex.sets.forEach(s => {
      const r = num(s.reps);
      if (r > 0) { sets++; volume += r * num(s.weight); }
    }));
    return { exercises: session.exercises.length, sets, volume };
  }

  function totals(sessions) {
    let workouts = 0, sets = 0, volume = 0;
    sessions.forEach(s => {
      const sum = sessionSummary(s);
      if (sum.sets > 0) workouts++;
      sets += sum.sets;
      volume += sum.volume;
    });
    return { workouts, sets, volume };
  }

  // exercise key -> { name, group, sets: [{date, weight, reps}] }
  function collect(sessions, guessGroup) {
    const sorted = [...sessions].sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated));
    const map = {};
    sorted.forEach(s => s.exercises.forEach(ex => {
      const name = (ex.name || "").trim();
      const key = name.toLowerCase();
      if (!key) return;
      const group = ex.group || guessGroup(name) || "Other";
      ex.sets.forEach(set => {
        const weight = num(set.weight), reps = num(set.reps);
        if (weight <= 0 || reps <= 0) return;
        if (!map[key]) map[key] = { key, name, group, sets: [] };
        map[key].name = name;          // latest spelling / group wins
        map[key].group = group;
        map[key].sets.push({ date: s.dateCreated, weight, reps });
      });
    }));
    return map;
  }

  // Best set per muscle group: { Chest: {weight, reps, exercise, date}, ... }
  function personalRecords(exMap) {
    const prs = {};
    Object.values(exMap).forEach(ex => ex.sets.forEach(set => {
      const cur = prs[ex.group];
      if (!cur || isBetter(set, cur)) {
        prs[ex.group] = { weight: set.weight, reps: set.reps, exercise: ex.name, date: set.date };
      }
    }));
    return prs;
  }

  function period(iso, mode) {
    const d = new Date(iso);
    if (mode === "month") {
      const m = d.getMonth(), y = d.getFullYear();
      return { sort: y + "-" + String(m + 1).padStart(2, "0"), label: MONTHS[m] + " " + y };
    }
    // week, starting Monday
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const sort = start.getFullYear() + "-" + String(start.getMonth() + 1).padStart(2, "0") + "-" + String(start.getDate()).padStart(2, "0");
    return { sort, label: "Week of " + MONTHS[start.getMonth()] + " " + start.getDate() };
  }

  // Heaviest set per week/month for each exercise, plus change first -> latest period
  function progression(exMap, mode) {
    const list = Object.values(exMap).map(ex => {
      const buckets = {};
      ex.sets.forEach(set => {
        const p = period(set.date, mode);
        if (!buckets[p.sort] || isBetter(set, buckets[p.sort])) {
          buckets[p.sort] = { sort: p.sort, label: p.label, weight: set.weight, reps: set.reps };
        }
      });
      const periods = Object.values(buckets).sort((a, b) => (a.sort < b.sort ? -1 : 1));
      const first = periods[0], last = periods[periods.length - 1];
      const delta = periods.length >= 2 ? Number((last.weight - first.weight).toFixed(2)) : null;
      return { key: ex.key, name: ex.name, group: ex.group, periods, first, last, delta };
    });

    // exercises with a measurable change first (biggest gain on top), then baselines
    list.sort((a, b) => {
      if ((a.delta === null) !== (b.delta === null)) return a.delta === null ? 1 : -1;
      if (a.delta !== null) return b.delta - a.delta;
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  window.Stats = { fmt, sessionSummary, totals, collect, personalRecords, progression };
})();
