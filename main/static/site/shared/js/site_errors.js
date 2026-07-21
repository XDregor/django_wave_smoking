(function () {
  var page = document.querySelector("[data-error-page]");
  if (!page) return;

  page.classList.add("is-ready");

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  var accentGlow = page.querySelector(".error-page__glow--accent");
  var dimGlow = page.querySelector(".error-page__glow--dim");
  if (!accentGlow || !dimGlow) return;

  page.addEventListener("pointermove", function (event) {
    var rect = page.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width - 0.5;
    var y = (event.clientY - rect.top) / rect.height - 0.5;

    accentGlow.style.transform = "translate3d(" + x * 18 + "px, " + y * 18 + "px, 0)";
    dimGlow.style.transform = "translate3d(" + x * -14 + "px, " + y * -14 + "px, 0)";
  }, { passive: true });
})();
