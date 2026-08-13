(function () {
  "use strict";

  window.__waveMainBannerV2 = true;
  const banner = document.getElementById("mainBanner");
  if (!banner) return;

  let skipInitialReveal = window.__waveHomeIntroShown === true;
  try {
    skipInitialReveal = skipInitialReveal
      || window.sessionStorage.getItem("wave:home-intro-shown") === "1";
  } catch (error) {
    // The in-memory flag still covers seamless navigation in this document.
  }
  if (skipInitialReveal) banner.classList.add("is-intro-skipped");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const AUTO_SLIDE_DURATION = 7000;
  const INITIAL_TIMER_DELAY = 800;
  const SLIDE_REVEAL_DELAY = 700;
  const MANUAL_HOLD_DURATION = 10000;
  const TRANSITION_DELAY = 290;
  const RESIZE_SETTLE_DELAY = 180;
  const RESUME_TIMER_DELAY = 600;
  const IMAGE_LOAD_ATTEMPTS = 3;
  const IMAGE_RETRY_DELAY = 180;
  const assets = banner.dataset;
  const slides = [
    {
      key: "devices",
      label: "Устройства",
      title: ["Вкус, который", "держит ритм."],
      description: "Современные устройства для ровной и контролируемой подачи. Компактный формат, понятное управление и ничего лишнего.",
      primary: assets.devicesProduct,
      primaryAlt: "Современные устройства для вейпинга",
      secondary: "",
      backdrop: assets.devicesBackground,
      backDecor: [assets.devicesRockBase, assets.devicesRockCorner],
      frontDecor: [],
    },
    {
      key: "cartridges",
      label: "Картриджи",
      title: ["Чистая тяга.", "Без компромиссов."],
      description: "Картриджи с содержанием HHC для совместимых устройств. Стабильная подача и чистый вкус в удобном формате.",
      primary: assets.cartridgesProduct,
      primaryAlt: "Картриджи для вейп-устройств",
      secondary: "",
      secondaryAlt: "",
      backdrop: assets.cartridgesBackground,
      backDecor: [assets.cartridgesCornerRight, assets.cartridgesMintSplash, null, assets.cartridgesBranchesLeft],
      frontDecor: [null, assets.cartridgesSoftSmoke],
    },
    {
      key: "tastes",
      label: "Вкусы",
      title: ["Больше вкуса.", "Новые ощущения."],
      description: "Ягодные, фруктовые, шоколадные и десертные сочетания с микродозой ТГК. Знакомые вкусы в новом взрослом формате.",
      primary: assets.tastesProduct,
      primaryAlt: "Ягодный вкус",
      secondary: "",
      secondaryAlt: "",
      backdrop: assets.tastesBackground,
      backDecor: [assets.tastesCornerLeft, assets.tastesSplashBottom, assets.tastesCornerRight],
      frontDecor: [null, null],
    },
  ];

  const nodes = {
    copy: document.getElementById("mainBannerCopy"),
    title: document.getElementById("mainBannerTitle"),
    description: document.getElementById("mainBannerDescription"),
    primary: document.getElementById("mainBannerPrimaryVisual"),
    secondary: document.getElementById("mainBannerSecondaryVisual"),
    backdrop: document.getElementById("mainBannerBackdrop"),
    dots: document.getElementById("mainBannerDots"),
    dotMorph: document.getElementById("mainBannerDotMorph"),
    smokeVertical: document.getElementById("mainBannerSmokeVertical"),
    smokeFloor: document.getElementById("mainBannerSmokeFloor"),
    backDecor: Array.from(document.querySelectorAll("[data-back-decor]")),
    frontDecor: Array.from(document.querySelectorAll("[data-front-decor]")),
  };

  let activeIndex = 0;
  let activeDuration = AUTO_SLIDE_DURATION;
  let timer = null;
  let swapTimer = null;
  let touchStartX = 0;
  let transitionRequestId = 0;
  let isInitialized = false;
  let isInViewport = true;
  let isPageActive = !document.hidden;
  let isResizing = false;
  let resizeTimer = null;

  const imageCache = new Map();

  function preloadSource(source) {
    if (!source) return Promise.resolve(true);
    const cached = imageCache.get(source);
    if (cached?.status === "loaded") return Promise.resolve(true);
    if (cached?.status === "loading") return cached.promise;

    const image = new Image();
    const entry = {
      image,
      status: "loading",
      attempts: (cached?.attempts || 0) + 1,
      promise: null,
    };

    entry.promise = new Promise((resolve) => {
      let settled = false;

      const handleLoad = () => {
        if (settled) return;
        settled = true;
        const decode = typeof image.decode === "function"
          ? image.decode().catch(() => {})
          : Promise.resolve();
        decode.finally(() => {
          entry.status = "loaded";
          resolve(true);
        });
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        entry.status = "error";
        entry.promise = null;
        if (entry.attempts < IMAGE_LOAD_ATTEMPTS) {
          window.setTimeout(() => {
            preloadSource(source).then(resolve);
          }, IMAGE_RETRY_DELAY * entry.attempts);
          return;
        }
        resolve(false);
      };

      image.decoding = "async";
      image.onload = handleLoad;
      image.onerror = handleError;
      image.src = source;
      if (image.complete && image.naturalWidth > 0) handleLoad();
    });
    imageCache.set(source, entry);
    return entry.promise;
  }

  function preloadSlide(index) {
    const slide = slides[(index + slides.length) % slides.length];
    const sources = [
      slide.primary,
      slide.secondary,
      slide.backdrop,
      ...slide.backDecor,
      ...slide.frontDecor,
    ].filter(Boolean);

    return Promise.all(sources.map(preloadSource));
  }

  function preloadCriticalSlide(index) {
    const slide = slides[(index + slides.length) % slides.length];
    return Promise.all([slide.primary, slide.backdrop].filter(Boolean).map(preloadSource))
      .then((results) => results.every(Boolean));
  }

  function scheduleSlidePreload(index) {
    void preloadSlide(index);
  }

  function setImageSource(image, source, alt = "") {
    if (!image) return;
    image.alt = alt;
    if (!source) {
      image.removeAttribute("src");
      return;
    }
    if (image.getAttribute("src") !== source) image.src = source;
  }

  function installImageRecovery(image) {
    if (!image) return;
    image.addEventListener("load", () => {
      delete image.dataset.recoveringSource;
    });
    image.addEventListener("error", () => {
      const source = image.getAttribute("src");
      if (!source || image.dataset.recoveringSource === source) return;
      image.dataset.recoveringSource = source;
      imageCache.delete(source);
      preloadSource(source).then((loaded) => {
        if (!loaded || image.getAttribute("src") !== source) return;
        image.removeAttribute("src");
        requestAnimationFrame(() => {
          image.src = source;
        });
      });
    });
  }

  [
    nodes.primary,
    nodes.secondary,
    nodes.backdrop,
    nodes.smokeVertical,
    nodes.smokeFloor,
    ...nodes.backDecor.map((shell) => shell.querySelector("img")),
    ...nodes.frontDecor.map((shell) => shell.querySelector("img")),
  ].forEach(installImageRecovery);

  slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.className = "wave-campaign__dot";
    button.type = "button";
    button.setAttribute("aria-label", `Показать сцену: ${slide.label}`);
    button.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>';
    button.addEventListener("click", () => selectSlide(index));
    nodes.dots.appendChild(button);
  });

  function getDots() {
    return Array.from(nodes.dots.querySelectorAll(".wave-campaign__dot"));
  }

  function commitArtboardSize() {
    const width = Math.round(banner.getBoundingClientRect().width);
    if (!width) return;
    banner.style.setProperty("--campaign-artboard-width", `${width}px`);
    banner.style.setProperty("--campaign-artboard-height", `${Math.round(width / 2)}px`);
  }

  function isRuntimeActive() {
    return isInitialized && isPageActive && isInViewport && !isResizing;
  }

  function pauseRuntime() {
    clearTimeout(timer);
    clearTimeout(swapTimer);
    timer = null;
    swapTimer = null;
    transitionRequestId += 1;
    banner.classList.add("is-runtime-paused", "is-timer-waiting");
    banner.classList.remove("is-switching", "is-scene-resetting", "is-copy-resetting");
    nodes.dotMorph.getAnimations().forEach((animation) => animation.cancel());
  }

  function resumeRuntime(delay = RESUME_TIMER_DELAY) {
    banner.classList.remove("is-runtime-paused");
    if (!isRuntimeActive()) return;
    startTimerAfterDelay(delay);
  }

  function syncRuntimeState(delay = RESUME_TIMER_DELAY) {
    if (!isRuntimeActive()) {
      pauseRuntime();
      return;
    }
    resumeRuntime(delay);
  }

  function resetDotTimer(index, duration = AUTO_SLIDE_DURATION) {
    activeDuration = duration;
    banner.style.setProperty("--campaign-slide-duration", `${duration}ms`);
    const dots = getDots();
    dots.forEach((dot) => dot.classList.remove("is-active"));
    void nodes.dots.offsetWidth;
    dots.forEach((dot, dotIndex) => {
      const current = dotIndex === index;
      if (current) dot.classList.add("is-active");
      dot.setAttribute("aria-current", current ? "true" : "false");
    });
  }

  function startTimerAfterDelay(delay) {
    clearTimeout(timer);
    banner.classList.add("is-timer-waiting");
    resetDotTimer(activeIndex, AUTO_SLIDE_DURATION);
    if (!isRuntimeActive()) return;
    timer = window.setTimeout(() => {
      if (!isRuntimeActive()) return;
      banner.classList.remove("is-timer-waiting");
      resetDotTimer(activeIndex, AUTO_SLIDE_DURATION);
      scheduleNext(AUTO_SLIDE_DURATION);
    }, delay);
  }

  function renderDecorations(shells, sources) {
    shells.forEach((shell, index) => {
      const image = shell.querySelector("img");
      const source = sources[index];
      if (!image || !source) {
        shell.hidden = true;
        if (image) image.removeAttribute("src");
        return;
      }
      shell.hidden = false;
      setImageSource(image, source);
    });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function renderTitleLine(line, lineIndex) {
    const words = String(line || "").trim().split(/\s+/).filter(Boolean);
    const lastWordIndex = Math.max(0, words.length - 1);
    return `
      <span class="wave-campaign__title-line${lineIndex === 1 ? " wave-campaign__title-line--accent" : ""}" style="--line-index: ${lineIndex}">
        <span class="wave-campaign__title-text">
          ${words.map((word, wordIndex) => `
            <span class="wave-campaign__title-word" style="--word-index: ${wordIndex}; --word-exit-index: ${lastWordIndex - wordIndex}">${escapeHtml(word)}</span>
          `).join(" ")}
        </span>
      </span>
    `;
  }

  function render(index, duration = activeDuration) {
    const slide = slides[index];
    banner.dataset.scene = slide.key;
    nodes.title.innerHTML = slide.title.map(renderTitleLine).join("");
    nodes.description.innerHTML = `<span class="wave-campaign__description-inner">${escapeHtml(slide.description)}</span>`;
    setImageSource(nodes.primary, slide.primary, slide.primaryAlt);
    setImageSource(nodes.backdrop, slide.backdrop);
    renderDecorations(nodes.backDecor, slide.backDecor);
    renderDecorations(nodes.frontDecor, slide.frontDecor);

    if (slide.secondary) {
      setImageSource(nodes.secondary, slide.secondary, slide.secondaryAlt);
      nodes.secondary.hidden = false;
    } else {
      nodes.secondary.hidden = true;
      nodes.secondary.removeAttribute("src");
    }

    resetDotTimer(index, duration);
    scheduleSlidePreload(index + 1);
  }

  function animateDotMorph(fromIndex, toIndex) {
    if (reducedMotion.matches || fromIndex === toIndex || !nodes.dotMorph.animate) return;
    const dots = getDots();
    const fromDot = dots[fromIndex];
    const toDot = dots[toIndex];
    if (!fromDot || !toDot) return;

    const fromX = fromDot.offsetLeft + fromDot.offsetWidth / 2 - 4;
    const toX = toDot.offsetLeft + toDot.offsetWidth / 2 - 4;
    const distance = Math.abs(toX - fromX);
    const movingRight = toX > fromX;
    nodes.dotMorph.getAnimations().forEach((animation) => animation.cancel());
    nodes.dotMorph.style.transformOrigin = movingRight ? "left center" : "right center";
    nodes.dotMorph.animate(
      [
        { opacity: 0.9, transform: `translate3d(${fromX}px, -50%, 0) scaleX(1)` },
        {
          opacity: 1,
          transform: `translate3d(${fromX}px, -50%, 0) scaleX(${Math.max(1, (distance + 8) / 8)})`,
          offset: 0.48,
        },
        { opacity: 0.9, transform: `translate3d(${toX}px, -50%, 0) scaleX(1)` },
        { opacity: 0, transform: `translate3d(${toX}px, -50%, 0) scaleX(0.72)` },
      ],
      { duration: 380, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
    );
  }

  async function show(index, duration = AUTO_SLIDE_DURATION, manualSelection = false) {
    const nextIndex = (index + slides.length) % slides.length;
    if (!isInitialized || nextIndex === activeIndex || banner.classList.contains("is-switching")) return;
    clearTimeout(timer);
    clearTimeout(swapTimer);
    const requestId = ++transitionRequestId;
    if (manualSelection) banner.classList.add("is-timer-waiting");
    const [criticalReady] = await Promise.all([
      preloadCriticalSlide(nextIndex),
      preloadSlide(nextIndex),
    ]);
    if (requestId !== transitionRequestId || !isRuntimeActive()) return;
    if (!criticalReady) {
      startTimerAfterDelay(manualSelection ? MANUAL_HOLD_DURATION : 1400);
      return;
    }

    animateDotMorph(activeIndex, nextIndex);
    banner.classList.add("is-switching");
    swapTimer = window.setTimeout(() => {
      activeIndex = nextIndex;
      banner.classList.add("is-timer-waiting");
      banner.classList.add("is-scene-resetting", "is-copy-resetting");
      render(activeIndex, duration);
      void banner.offsetWidth;
      banner.classList.remove("is-scene-resetting");
      requestAnimationFrame(() => {
        banner.classList.remove("is-switching");
        requestAnimationFrame(() => {
          banner.classList.remove("is-copy-resetting");
          if (manualSelection) startTimerAfterDelay(MANUAL_HOLD_DURATION);
          else startTimerAfterDelay(SLIDE_REVEAL_DELAY);
        });
      });
    }, reducedMotion.matches ? 0 : TRANSITION_DELAY);
  }

  function selectSlide(index) {
    clearTimeout(timer);

    if (index === activeIndex && !banner.classList.contains("is-switching")) {
      transitionRequestId += 1;
      startTimerAfterDelay(MANUAL_HOLD_DURATION);
      return;
    }

    void show(index, AUTO_SLIDE_DURATION, true);
  }

  function scheduleNext(duration = activeDuration) {
    clearTimeout(timer);
    if (reducedMotion.matches || !isRuntimeActive()) return;
    timer = window.setTimeout(() => void show(activeIndex + 1, AUTO_SLIDE_DURATION), duration);
  }
  banner.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
  banner.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 48) {
      void show(activeIndex + (distance < 0 ? 1 : -1), AUTO_SLIDE_DURATION, true);
    }
  }, { passive: true });
  function handleVisibilityChange() {
    isPageActive = !document.hidden;
    document.documentElement.classList.toggle("is-page-inactive", !isPageActive);
    syncRuntimeState();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", () => {
    isPageActive = false;
    document.documentElement.classList.add("is-page-inactive");
    pauseRuntime();
  });
  window.addEventListener("pageshow", () => {
    isPageActive = !document.hidden;
    document.documentElement.classList.toggle("is-page-inactive", !isPageActive);
    syncRuntimeState();
  });

  window.addEventListener("resize", () => {
    if (!isResizing) {
      isResizing = true;
      banner.classList.add("is-resizing");
      pauseRuntime();
    }
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      commitArtboardSize();
      isResizing = false;
      banner.classList.remove("is-resizing");
      syncRuntimeState();
    }, RESIZE_SETTLE_DELAY);
  }, { passive: true });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      isInViewport = Boolean(entry?.isIntersecting);
      syncRuntimeState(350);
    }, { rootMargin: "120px 0px", threshold: 0.01 });
    observer.observe(banner);
  }

  async function initialize() {
    await Promise.all([
      preloadSource(assets.smokeVertical),
      preloadSource(assets.smokeFloor),
      preloadSlide(0),
    ]);
    setImageSource(nodes.smokeVertical, assets.smokeVertical);
    setImageSource(nodes.smokeFloor, assets.smokeFloor);
    banner.classList.add("is-timer-waiting");
    render(0, AUTO_SLIDE_DURATION);
    slides.slice(1).forEach((_, index) => scheduleSlidePreload(index + 1));
    isInitialized = true;
    requestAnimationFrame(() => {
      banner.classList.add("is-ready");
      if (skipInitialReveal) {
        requestAnimationFrame(() => banner.classList.remove("is-intro-skipped"));
      }
      window.dispatchEvent(new CustomEvent("wave:main-banner-ready"));
      startTimerAfterDelay(INITIAL_TIMER_DELAY);
    });
  }

  commitArtboardSize();
  document.documentElement.classList.toggle("is-page-inactive", !isPageActive);
  void initialize();
})();
