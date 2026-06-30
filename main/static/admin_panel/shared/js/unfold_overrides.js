(function () {
  "use strict";

  function forceDarkTheme() {
    try {
      localStorage.setItem("adminTheme", JSON.stringify("dark"));
    } catch (error) {
      // Ignore storage restrictions; the DOM class below still keeps the UI dark.
    }
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  }

  forceDarkTheme();

  if (typeof window.theme === "function") {
    const baseThemeFactory = window.theme;
    window.theme = function () {
      const config = baseThemeFactory("dark");
      return {
        ...config,
        adminTheme: Alpine.$persist("dark").as("adminTheme"),
        switchTheme() {
          this.adminTheme = "dark";
          forceDarkTheme();
        },
        themeBindings: {
          ...config.themeBindings,
          ["x-bind:class"]() {
            this.adminTheme = "dark";
            forceDarkTheme();
            return "dark";
          },
          ["x-on:keydown.window"](event) {
            if (
              event.key === "[" &&
              document.activeElement.tagName.toLowerCase() !== "input" &&
              document.activeElement.tagName.toLowerCase() !== "textarea" &&
              !document.activeElement.isContentEditable
            ) {
              event.preventDefault();
              this.sidebarToggle();
            }

            if ((event.metaKey || event.ctrlKey) && event.key === "e") {
              event.preventDefault();
              this.adminTheme = "dark";
              forceDarkTheme();
            }
          },
        },
      };
    };
  }

  document.addEventListener("alpine:init", forceDarkTheme);
  document.addEventListener("DOMContentLoaded", forceDarkTheme);

  document.addEventListener(
    "change",
    function (event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      if (!input.closest(".wave-admin-product-sku, .wave-admin-media")) return;

      // Unfold expects every file input to have its generated text placeholder.
      // Our custom upload controls render their own preview, so bypass that handler.
      event.stopImmediatePropagation();

      if (typeof input.onchange === "function") {
        input.onchange.call(input, event);
      }
    },
    true
  );
})();
