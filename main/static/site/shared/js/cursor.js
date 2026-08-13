(() => {
    if (window.__waveCursorInitialized) return;
    window.__waveCursorInitialized = true;

    const smallNodes = document.querySelectorAll("[data-site-cursor-small], #cursor_dot_small_variant_id, #cursorSmall");
    const largeNodes = document.querySelectorAll("[data-site-cursor-large], #cursor_dot_large_variant_id, #cursorLarge");
    smallNodes.forEach((node, index) => {
      if (index > 0) node.remove();
    });
    largeNodes.forEach((node, index) => {
      if (index > 0) node.remove();
    });

    const small = smallNodes[0];
    const large = largeNodes[0];
    if (!small || !large) return;

    const mobileCursorMedia = window.matchMedia("(hover: none), (pointer: coarse), (max-width: 768px)");
    const hideCursor = () => {
      small.style.display = "none";
      large.style.display = "none";
      document.documentElement.classList.add("has-no-site-cursor");
    };
    const shouldDisableCursor = () => {
      return mobileCursorMedia.matches || (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
    };

    if (shouldDisableCursor()) {
      hideCursor();
      return;
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let smallX = mouseX;
    let smallY = mouseY;
    let largeX = mouseX;
    let largeY = mouseY;

    document.addEventListener("mousemove", (event) => {
      if (shouldDisableCursor()) {
        hideCursor();
        return;
      }
      mouseX = event.clientX;
      mouseY = event.clientY;
    });

    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") hideCursor();
    }, { passive: true });

    document.addEventListener("touchstart", hideCursor, { passive: true, once: true });

    mobileCursorMedia.addEventListener?.("change", () => {
      if (shouldDisableCursor()) hideCursor();
    });

    document.addEventListener("mouseover", (event) => {
      if (event.target.closest("a, button, input, textarea, select, [role='button']")) {
        large.classList.add("is-hovered");
      }
    });

    document.addEventListener("mouseout", (event) => {
      if (event.target.closest("a, button, input, textarea, select, [role='button']")) {
        large.classList.remove("is-hovered");
      }
    });

    function draw(el, x, y) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }

    function animate() {
      smallX += (mouseX - smallX) * 0.45;
      smallY += (mouseY - smallY) * 0.45;
      largeX += (mouseX - largeX) * 0.24;
      largeY += (mouseY - largeY) * 0.24;
      draw(small, smallX, smallY);
      draw(large, largeX, largeY);
      requestAnimationFrame(animate);
    }

    animate();
  })();
