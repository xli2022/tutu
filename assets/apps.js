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
      "Drop in your bank statements (PDF, CSV, OFX, QFX or QIF) and watch your " +
      "spending sort itself into categories over time. Nothing leaves your browser.",
    tags: ["Finance", "Charts"],
    accent: ["#8ff0e2", "#1878d4"],
    icon: "scape",
    cta: "Open",
    status: "live",
  },
  {
    slug: "honglou",
    name: "还泪记",
    tagline: "A Dream of the Red Chamber visual novel",
    blurb:
      "You are 林黛玉, come down to the world to repay a debt of dew with every " +
      "tear of a lifetime. A paper-cut diorama, a manuscript in vertical script, " +
      "flower lots for choices, four endings. In Chinese.",
    tags: ["Visual novel", "中文"],
    accent: ["#c94450", "#2c3a6b"],
    icon: "pearls",
    status: "live",
  },
];
