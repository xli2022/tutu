/* Renders the app grid on the tutu home page from window.TUTU_APPS. */
(function () {
  "use strict";

  var ICONS = {
    candy:
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M8 28 L30 50 L8 72 Z" fill="rgba(255,255,255,.75)"/>' +
      '<path d="M92 28 L70 50 L92 72 Z" fill="rgba(255,255,255,.75)"/>' +
      '<circle cx="50" cy="50" r="26" fill="#fff"/>' +
      '<circle cx="50" cy="50" r="26" fill="url(#hubGloss)"/>' +
      "</svg>",
    // Layered hills of a stacked area chart: a spending landscape.
    scape:
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><clipPath id="hubScapeClip"><rect x="8" y="16" width="84" height="70" rx="16"/></clipPath></defs>' +
      '<rect x="8" y="16" width="84" height="70" rx="16" fill="rgba(255,255,255,.22)"/>' +
      '<g clip-path="url(#hubScapeClip)">' +
      '<circle cx="30" cy="37" r="8" fill="#fff"/>' +
      '<path d="M8 66 C22 50 34 58 48 46 S74 32 92 40 V90 H8 Z" fill="rgba(255,255,255,.5)"/>' +
      '<path d="M8 74 C24 62 38 68 52 60 S78 54 92 58 V90 H8 Z" fill="rgba(255,255,255,.75)"/>' +
      '<path d="M8 82 C24 76 40 80 56 75 S80 72 92 74 V90 H8 Z" fill="#fff"/>' +
      '<path d="M8 82 C24 76 40 80 56 75 S80 72 92 74 V90 H8 Z" fill="url(#hubGloss)"/>' +
      "</g></svg>",
  };

  function card(app) {
    var el = document.createElement("article");
    el.className = "app-card";
    el.style.setProperty("--a1", app.accent[0]);
    el.style.setProperty("--a2", app.accent[1]);

    var href = "apps/" + app.slug + "/";
    var cta = app.cta || "Play";   // games play; tools open
    var tags = app.tags
      .map(function (t) {
        return '<li class="tag">' + t + "</li>";
      })
      .join("");

    el.innerHTML =
      '<a class="app-thumb" href="' + href + '" aria-label="' + cta + " " + app.name + '">' +
      '<span class="app-thumb-icon">' + (ICONS[app.icon] || "") + "</span>" +
      "</a>" +
      '<div class="app-body">' +
      '<h3 class="app-name"><a href="' + href + '">' + app.name + "</a></h3>" +
      '<p class="app-tagline">' + app.tagline + "</p>" +
      '<p class="app-blurb">' + app.blurb + "</p>" +
      '<ul class="tags">' + tags + "</ul>" +
      '<a class="btn btn-pink app-play" href="' + href + '">' + cta + "</a>" +
      "</div>";
    return el;
  }

  function soonCard() {
    var el = document.createElement("article");
    el.className = "app-card app-card-soon";
    el.innerHTML =
      '<div class="soon-inner">' +
      '<span class="soon-plus" aria-hidden="true">+</span>' +
      "<h3>More on the way</h3>" +
      "<p>tutu is built to hold a whole shelf of small web apps. " +
      "Next one drops in <code>apps/</code>.</p>" +
      "</div>";
    return el;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.getElementById("app-grid");
    var apps = window.TUTU_APPS || [];
    if (!grid) return;

    apps.forEach(function (app) {
      grid.appendChild(card(app));
    });
    grid.appendChild(soonCard());

    var count = document.getElementById("app-count");
    if (count) {
      count.textContent = apps.length === 1 ? "1 app" : apps.length + " apps";
    }
  });
})();
