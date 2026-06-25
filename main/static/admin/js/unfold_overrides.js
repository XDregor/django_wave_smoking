(function () {
  "use strict";

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
