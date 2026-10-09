/* global document, localStorage */
(function () {
  var storageKey = "clinic.appearance";
  var legacyThemes = {
    default: "clinical-teal",
    blue: "dental-blue",
    orange: "warm-amber",
    purple: "soft-violet",
    "aqua-blue": "ocean-cyan",
    "aqua-green": "fresh-emerald",
  };
  var validThemes = {
    "clinical-teal": true,
    "dental-blue": true,
    "warm-amber": true,
    "soft-violet": true,
    "ocean-cyan": true,
    "fresh-emerald": true,
  };
  var color = "clinical-teal";
  var mode = "light";

  try {
    var saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    var mappedColor = saved && (legacyThemes[saved.color] || saved.color);
    if (validThemes[mappedColor] && (saved.mode === "light" || saved.mode === "dark")) {
      color = mappedColor;
      mode = saved.mode;
    }
  } catch {
    // Device storage can be unavailable; the default remains usable.
  }

  document.documentElement.dataset.color = color;
  document.documentElement.dataset.mode = mode;
})();
