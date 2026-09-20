/* The app registry. Adding an app to tutu = drop a folder under
   site/apps/<slug>/ and add one entry here. Nothing else to wire up. */
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
];
