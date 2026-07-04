(function () {
  "use strict";

  window.__waveMainBannerV2 = true;
  const banner = document.getElementById("mainBanner");
  if (!banner) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const assets = banner.dataset;
  const slides = [
    {
      key: "devices",
      label: "Устройства",
      title: 'Вкус, который<br><span>держит ритм.</span>',
      description: "Современные устройства для ровной и контролируемой подачи. Компактный формат, понятное управление и ничего лишнего.",
      cta: "Смотреть устройства",
      primary: assets.devices,
      primaryAlt: "Современные устройства для вейпинга",
      secondary: "",
      backdrop: assets.devices,
    },
    {
      key: "cartridges",
      label: "Картриджи",
      title: 'Чистая тяга.<br><span>Без компромиссов.</span>',
      description: "Картриджи с содержанием HHC для совместимых устройств. Стабильная подача и чистый вкус в удобном формате.",
      cta: "Выбрать картридж",
      primary: assets.cartridges,
      primaryAlt: "Картриджи для вейп-устройств",
      secondary: assets.cartridgeSingle,
      secondaryAlt: "Сменный картридж",
      backdrop: assets.cartridgeBackdrop,
    },
    {
      key: "tastes",
      label: "Вкусы",
      title: 'Больше вкуса.<br><span>Новые ощущения.</span>',
      description: "Ягодные, фруктовые, шоколадные и десертные сочетания с микродозой ТГК. Знакомые вкусы в новом взрослом формате.",
      cta: "Выбрать вкус",
      primary: assets.tastes,
      primaryAlt: "Ягодный вкус",
      secondary: assets.tasteSecondary,
      secondaryAlt: "Фруктовое сочетание",
      backdrop: assets.tastes,
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
    smokeVertical: document.getElementById("mainBannerSmokeVertical"),
    smokeFloor: document.getElementById("mainBannerSmokeFloor"),
  };

  let activeIndex = 0;
  let timer = null;
  let swapTimer = null;
  let touchStartX = 0;

  nodes.smokeVertical.src = assets.smokeVertical;
  nodes.smokeFloor.src = assets.smokeFloor;

  slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.className = "wave_campaign_dot";
    button.type = "button";
    button.setAttribute("aria-label", `Показать сцену: ${slide.label}`);
    button.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>';
    button.addEventListener("click", () => show(index, true));
    nodes.dots.appendChild(button);
  });

  function render(index) {
    const slide = slides[index];
    banner.dataset.scene = slide.key;
    nodes.title.innerHTML = slide.title;
    nodes.description.textContent = slide.description;
    nodes.ctaText.textContent = slide.cta;
    nodes.primary.src = slide.primary;
    nodes.primary.alt = slide.primaryAlt;
    nodes.backdrop.src = slide.backdrop;

    if (slide.secondary) {
      nodes.secondary.src = slide.secondary;
      nodes.secondary.alt = slide.secondaryAlt;
      nodes.secondary.hidden = false;
    } else {
      nodes.secondary.hidden = true;
      nodes.secondary.removeAttribute("src");
    }

    const dots = Array.from(nodes.dots.children);
    dots.forEach((dot) => dot.classList.remove("is-active"));
    void nodes.dots.offsetWidth;
    dots.forEach((dot, dotIndex) => {
      const current = dotIndex === index;
      if (current) dot.classList.add("is-active");
      dot.setAttribute("aria-current", current ? "true" : "false");
    });

  }

  function show(index, manual) {
    const nextIndex = (index + slides.length) % slides.length;
    clearTimeout(swapTimer);
    banner.classList.add("is-switching");
    swapTimer = window.setTimeout(() => {
      activeIndex = nextIndex;
      render(activeIndex);
      requestAnimationFrame(() => banner.classList.remove("is-switching"));
    }, reducedMotion.matches ? 0 : 220);
    if (manual) restart();
  }

  function restart() {
    clearInterval(timer);
    if (!reducedMotion.matches) timer = window.setInterval(() => show(activeIndex + 1, false), 7000);
  }

  banner.addEventListener("pointerenter", () => {
    banner.classList.add("is-paused");
    clearInterval(timer);
  });
  banner.addEventListener("pointerleave", () => {
    banner.classList.remove("is-paused");
    render(activeIndex);
    restart();
  });
  banner.addEventListener("focusin", () => {
    banner.classList.add("is-paused");
    clearInterval(timer);
  });
  banner.addEventListener("focusout", () => {
    banner.classList.remove("is-paused");
    render(activeIndex);
    restart();
  });
  banner.addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
  banner.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 48) show(activeIndex + (distance < 0 ? 1 : -1), true);
  }, { passive: true });

  render(0);
  requestAnimationFrame(() => banner.classList.add("is-ready"));
  restart();
})();
