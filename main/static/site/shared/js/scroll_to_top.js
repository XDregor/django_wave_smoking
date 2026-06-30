(function () {
    function scrollToTop(smooth = true) {
      window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
    }

    const topBtn = document.getElementById("scroll_to_top_button_id");
    if (!topBtn) return;

    window.addEventListener(
      "scroll",
      () => {
        topBtn.classList.toggle("scroll_to_top_button_visible_state", window.scrollY > 400);
      },
      { passive: true },
    );

    topBtn.addEventListener("click", () => scrollToTop(true));
  })();
