/* ------------------------------------------------------------------
   Exercise catalog + templates.
   - To add a template: add an entry to TEMPLATES below.
   - Each "slot" is one numbered line of the template. A slot with two
     names (e.g. squat + split squat) becomes two exercises, labelled 3a, 3b.
------------------------------------------------------------------- */
(function () {
  "use strict";

  const GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Other"];

  // Known exercises -> muscle group (also feeds the name autocomplete)
  const BY_GROUP = {
    Chest: [
      "Barbell bench press", "Incline dumbbell press", "Machine chest press",
      "Dumbbell bench press", "Incline barbell bench press", "Cable fly", "Pec deck", "Push-ups"
    ],
    Back: [
      "Lat pulldown", "Seated cable row", "Single-arm dumbbell row", "Conventional deadlift",
      "Pull-ups", "Barbell row", "T-bar row"
    ],
    Shoulders: [
      "Seated dumbbell shoulder press", "Dumbbell lateral raises", "Bent-over reverse flyes",
      "Barbell overhead press", "Face pulls"
    ],
    Biceps: ["Dumbbell biceps curls", "EZ-bar preacher curls", "Hammer curls", "Barbell curl"],
    Triceps: [
      "Cable triceps pushdowns", "Overhead dumbbell triceps extensions",
      "Lying EZ-bar triceps extensions", "Close-grip bench press"
    ],
    Legs: [
      "Barbell squat", "Bulgarian split squat", "Romanian deadlift", "Leg press", "Walking lunges",
      "Goblet squat", "Reverse lunges", "Barbell hip thrust", "Leg extension", "Leg curl", "Calf raise"
    ],
    Core: ["Hanging knee raises", "Cable crunches", "Plank", "Ab wheel"]
  };

  const CATALOG = {};   // lowercase name -> group
  const NAMES = [];
  Object.keys(BY_GROUP).forEach(g => BY_GROUP[g].forEach(n => {
    CATALOG[n.toLowerCase()] = g;
    NAMES.push(n);
  }));

  // Keyword fallback for custom exercise names. Order matters (first match wins).
  const RULES = [
    [/romanian|\brdl\b|stiff.?leg/, "Legs"],
    [/reverse fly|reverse flye|rear delt|face pull|lateral raise|shoulder press|overhead press|military press|arnold|upright row|shrug/, "Shoulders"],
    [/tricep|pushdown|skull|close.?grip bench|\bdips?\b/, "Triceps"],
    [/leg curl|hamstring|leg press|leg extension|squat|lunge|calf|hip thrust|glute|step.?up|hack/, "Legs"],
    [/bicep|curl/, "Biceps"],
    [/bench|chest|pec deck|\bfly\b|flye|push.?up|incline|decline/, "Chest"],
    [/pulldown|pull.?down|pull.?up|chin.?up|\brow\b|deadlift|\blat\b|back extension|good morning/, "Back"],
    [/crunch|plank|knee raise|leg raise|sit.?up|\babs?\b|russian twist|woodchop/, "Core"]
  ];

  function guessGroup(name) {
    const n = (name || "").toLowerCase().trim();
    if (!n) return null;
    if (CATALOG[n]) return CATALOG[n];
    for (const [re, group] of RULES) if (re.test(n)) return group;
    return null;
  }

  const TEMPLATES = [
    {
      id: "full-body-a",
      name: "Full Body A",
      slots: [
        ["Lat pulldown"],
        ["Barbell bench press"],
        ["Barbell squat", "Bulgarian split squat"],
        ["Seated dumbbell shoulder press"],
        ["Dumbbell biceps curls", "Cable triceps pushdowns"],
        ["Romanian deadlift"],
        ["Hanging knee raises"]
      ]
    },
    {
      id: "full-body-b",
      name: "Full Body B",
      slots: [
        ["Seated cable row"],
        ["Incline dumbbell press"],
        ["Leg press", "Walking lunges"],
        ["Dumbbell lateral raises"],
        ["EZ-bar preacher curls", "Overhead dumbbell triceps extensions"],
        ["Conventional deadlift"],
        ["Cable crunches"]
      ]
    },
    {
      id: "full-body-c",
      name: "Full Body C",
      slots: [
        ["Single-arm dumbbell row"],
        ["Machine chest press"],
        ["Goblet squat", "Reverse lunges"],
        ["Bent-over reverse flyes"],
        ["Hammer curls", "Lying EZ-bar triceps extensions"],
        ["Barbell hip thrust"],
        ["Plank"]
      ]
    }
  ];

  window.Catalog = { GROUPS, NAMES, TEMPLATES, guessGroup };
})();
