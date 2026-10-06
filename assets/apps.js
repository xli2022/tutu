/* The app registry. Adding an app to tutu = drop a folder under
   apps/<slug>/ and add one entry here. Nothing else to wire up. */
window.TUTU_APPS = [
  {
    slug: "sugarsnap",
    name: "Sugarsnap",
    tagline: "Match three, pop, repeat",
    blurb:
      "Tap candies off the pile into your tray. Collect three of a kind and " +
      "they pop. Fill all seven slots and it's over — clear the board to win.",
    tags: ["Puzzle", "Single player"],
    accent: ["#ff8a9b", "#e0328f"],
    icon: "candy",
    status: "live",
  },
  {
    slug: "spendscape",
    name: "Spendscape",
    tagline: "See where your money goes",
    blurb:
      "Drop in your bank statements (CSV, OFX, QFX or QIF) and watch your " +
      "spending sort itself into categories over time. Nothing leaves your browser.",
    tags: ["Finance", "Charts"],
    accent: ["#8ff0e2", "#1878d4"],
    icon: "scape",
    cta: "Open",
    status: "live",
  },
];
