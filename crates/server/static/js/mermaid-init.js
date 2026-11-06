// Draws ```mermaid diagrams. Loaded only on pages that contain one.
(function () {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "neutral",
  });
  window.mermaid.run({ querySelector: "pre.mermaid" });
})();
