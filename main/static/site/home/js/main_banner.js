(function () {
  "use strict";

  window.__waveMainBannerV2 = true;
  const banner = document.getElementById("mainBanner");
  if (!banner) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const AUTO_SLIDE_DURATION = 7000;
  const INITIAL_TIMER_DELAY = 800;
  const SLIDE_REVEAL_DELAY = 700;
  const MANUAL_HOLD_DURATION = 10000;
  const TRANSITION_DELAY = 290;
  const assets = banner.dataset;
  const slides = [
    {
      key: "devices",
      label: "Устройства",
      title: 'Вкус, который<br><span>держит ритм.</span>',
      description: "Современные устройства для ровной и контролируемой подачи. Компактный формат, понятное управление и ничего лишнего.",
      cta: "Смотреть устройства",
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
      title: 'Чистая тяга.<br><span>Без компромиссов.</span>',
      description: "Картриджи с содержанием HHC для совместимых устройств. Стабильная подача и чистый вкус в удобном формате.",
      cta: "Выбрать картридж",
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
      title: 'Больше вкуса.<br><span>Новые ощущения.</span>',
      description: "Ягодные, фруктовые, шоколадные и десертные сочетания с микродозой ТГК. Знакомые вкусы в новом взрослом формате.",
      cta: "Выбрать вкус",
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
    ctaText: document.getElementById("mainBannerCtaText"),
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

  const preloadPromises = new Map();

  function preloadSource(source) {
    if (!source) return Promise.resolve();
    if (preloadPromises.has(source)) return preloadPromises.get(source);

    const preloadPromise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (typeof image.decode === "function") {
          image.decode().catch(() => {}).finally(resolve);
        } else {
          resolve();
        }
      };
      image.onerror = resolve;
      image.src = source;
    });
    preloadPromises.set(source, preloadPromise);
    return preloadPromise;
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

  function scheduleSlidePreload(index) {
    const preload = () => void preloadSlide(index);
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(preload, { timeout: 2000 });
    } else {
      window.setTimeout(preload, 600);
    }
  }

  slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.className = "wave_campaign_dot";
    button.type = "button";
    button.setAttribute("aria-label", `Показать сцену: ${slide.label}`);
    button.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>';
    button.addEventListener("click", () => selectSlide(index));
    nodes.dots.appendChild(button);
  });

  function getDots() {
    return Array.from(nodes.dots.querySelectorAll(".wave_campaign_dot"));
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
    timer = window.setTimeout(() => {
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
      image.src = source;
    });
  }

  function render(index, duration = activeDuration) {
    const slide = slides[index];
    banner.dataset.scene = slide.key;
    nodes.title.innerHTML = slide.title;
    nodes.description.textContent = slide.description;
    nodes.ctaText.textContent = slide.cta;
    nodes.primary.src = slide.primary;
    nodes.primary.alt = slide.primaryAlt;
    nodes.backdrop.src = slide.backdrop;
    renderDecorations(nodes.backDecor, slide.backDecor);
    renderDecorations(nodes.frontDecor, slide.frontDecor);

    if (slide.secondary) {
      nodes.secondary.src = slide.secondary;
      nodes.secondary.alt = slide.secondaryAlt;
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
    await preloadSlide(nextIndex);
    if (requestId !== transitionRequestId || document.hidden) return;

    animateDotMorph(activeIndex, nextIndex);
    banner.classList.add("is-switching");
    swapTimer = window.setTimeout(() => {
      activeIndex = nextIndex;
      banner.classList.add("is-timer-waiting");
      banner.classList.add("is-scene-resetting");
      render(activeIndex, duration);
      void banner.offsetWidth;
      banner.classList.remove("is-scene-resetting");
      requestAnimationFrame(() => {
        banner.classList.remove("is-switching");
        if (manualSelection) startTimerAfterDelay(MANUAL_HOLD_DURATION);
        else startTimerAfterDelay(SLIDE_REVEAL_DELAY);
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
    if (reducedMotion.matches || document.hidden) return;
    timer = window.setTimeout(() => void show(activeIndex + 1, AUTO_SLIDE_DURATION), duration);
  }
  banner.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
  banner.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 48) {
      void show(activeIndex + (distance < 0 ? 1 : -1), AUTO_SLIDE_DURATION, true);
    }
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    if (!document.hidden) {
      banner.classList.remove("is-timer-waiting");
      render(activeIndex, AUTO_SLIDE_DURATION);
      scheduleNext(AUTO_SLIDE_DURATION);
    }
  });

  async function initialize() {
    await Promise.all([
      preloadSource(assets.smokeVertical),
      preloadSource(assets.smokeFloor),
      preloadSlide(0),
    ]);
    nodes.smokeVertical.src = assets.smokeVertical;
    nodes.smokeFloor.src = assets.smokeFloor;
    banner.classList.add("is-timer-waiting");
    render(0, AUTO_SLIDE_DURATION);
    isInitialized = true;
    requestAnimationFrame(() => {
      banner.classList.add("is-ready");
      window.dispatchEvent(new CustomEvent("wave:main-banner-ready"));
      startTimerAfterDelay(INITIAL_TIMER_DELAY);
    });
  }

  void initialize();
})();
