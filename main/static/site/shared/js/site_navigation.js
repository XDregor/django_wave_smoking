(function () {
  "use strict";

  if (window.__waveSiteNavigationReady) return;
  window.__waveSiteNavigationReady = true;

  const CONTENT_SELECTOR = "[data-site-content]";
  const DETACHED_PAGE_SELECTORS = [
    "#filter_drawer_panel_id",
    "#filter_drawer_overlay_id",
    "#filter_drawer_arrow_id",
  ];
  const TRANSITION_MS = 180;
  const PAGE_BODY_CLASSES = ["is-catalog-search", "product-detail-page"];
  const scrollPositions = new Map();
  let currentController = null;
  let isNavigating = false;

  if (!("fetch" in window) || !("history" in window) || !("DOMParser" in window)) return;

  function getContent() {
    return document.querySelector(CONTENT_SELECTOR);
  }

  function normalizeUrl(url) {
    const next = new URL(url, window.location.href);
    next.hash = "";
    return next;
  }

  function shouldHandleLink(anchor, event) {
    if (!anchor || event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;
    if (anchor.dataset.noSeamlessNavigation !== undefined) return false;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.startsWith("/admin/")) return false;
    if (url.pathname.startsWith("/api/")) return false;
    if (url.pathname.startsWith("/static/") || url.pathname.startsWith("/media/")) return false;

    const current = normalizeUrl(window.location.href);
    const next = normalizeUrl(url.href);
    if (current.href === next.href && url.hash) return false;

    return true;
  }

  function isSamePageHashLink(anchor) {
    if (!anchor) return false;
    const url = new URL(anchor.href, window.location.href);
    if (!url.hash) return false;
    if (url.origin !== window.location.origin) return false;
    const current = normalizeUrl(window.location.href);
    const next = normalizeUrl(url.href);
    return current.href === next.href;
  }

  function scrollToHash(hash, mode = "push") {
    const id = decodeURIComponent(String(hash || "").replace(/^#/, ""));
    if (!id) return false;
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const nextUrl = `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`;
    if (mode === "replace") history.replaceState({ wave: true }, "", nextUrl);
    else history.pushState({ wave: true }, "", nextUrl);
    return true;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function saveScroll() {
    scrollPositions.set(window.location.href, {
      x: window.scrollX,
      y: window.scrollY,
    });
  }

  function restoreScroll(url, mode) {
    if (mode === "restore") {
      const saved = scrollPositions.get(url);
      window.scrollTo(saved?.x || 0, saved?.y || 0);
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  async function updateHead(nextDocument) {
    const nextTitle = nextDocument.querySelector("title");
    if (nextTitle) document.title = nextTitle.textContent;

    [
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
    ].forEach((selector) => {
      document.head.querySelectorAll(selector).forEach((node) => node.remove());
      nextDocument.head.querySelectorAll(selector).forEach((node) => {
        document.head.appendChild(node.cloneNode(true));
      });
    });

    const isPageStylesheet = (link) => {
      const href = link.getAttribute("href");
      if (!href) return false;
      const url = new URL(href, window.location.href);
      return url.pathname.includes("/static/site/") && !url.pathname.includes("/static/site/shared/");
    };
    const nextStylesheets = [...nextDocument.head.querySelectorAll('link[rel="stylesheet"]')];
    const nextPageStyles = new Set(
      nextStylesheets
        .filter(isPageStylesheet)
        .map((link) => new URL(link.getAttribute("href"), window.location.href).href)
    );
    const pendingStyles = [];

    nextStylesheets.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;
      const absoluteHref = new URL(href, window.location.href).href;
      const alreadyLoaded = [...document.head.querySelectorAll('link[rel="stylesheet"]')]
        .some((item) => new URL(item.getAttribute("href"), window.location.href).href === absoluteHref);
      if (alreadyLoaded) return;
      const clone = link.cloneNode(true);
      pendingStyles.push(new Promise((resolve) => {
        clone.addEventListener("load", resolve, { once: true });
        clone.addEventListener("error", resolve, { once: true });
      }));
      document.head.appendChild(clone);
    });

    await Promise.all(pendingStyles);

    [...document.head.querySelectorAll('link[rel="stylesheet"]')]
      .filter(isPageStylesheet)
      .forEach((link) => {
        const absoluteHref = new URL(link.getAttribute("href"), window.location.href).href;
        if (!nextPageStyles.has(absoluteHref)) link.remove();
      });
  }

  function syncBodyClasses(nextBody) {
    PAGE_BODY_CLASSES.forEach((className) => {
      document.body.classList.toggle(className, nextBody.classList.contains(className));
    });
  }

  function cleanupPageState() {
    window.dispatchEvent(new CustomEvent("wave:page-leave", {
      detail: { page: getContent()?.dataset.wavePage || "" },
    }));
    document.body.classList.remove(
      "is-filter-drawer-open",
      "product_sticky_bar_active",
      "is-product-header-hidden"
    );
    document.body.style.overflow = "";
    removeDetachedPageNodes();
  }

  function removeDetachedPageNodes() {
    DETACHED_PAGE_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!node.closest(CONTENT_SELECTOR)) node.remove();
      });
    });
  }

  function updateActiveNavigation() {
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll(".site-header a[href]").forEach((link) => {
      const url = new URL(link.href, window.location.href);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const isActive = path === currentPath || (path !== "/" && currentPath.startsWith(path + "/"));
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function executeScript(script) {
    return new Promise((resolve, reject) => {
      const type = (script.getAttribute("type") || "").trim().toLowerCase();
      const isExecutable = !type || [
        "text/javascript",
        "application/javascript",
        "application/ecmascript",
        "text/ecmascript",
        "module",
      ].includes(type);
      if (!isExecutable) {
        resolve();
        return;
      }

      const clone = document.createElement("script");
      [...script.attributes].forEach((attr) => clone.setAttribute(attr.name, attr.value));
      clone.dataset.waveDynamicScript = "true";

      if (script.src) {
        clone.async = false;
        clone.onload = resolve;
        clone.onerror = reject;
        clone.src = script.src;
        document.body.appendChild(clone);
        return;
      }

      clone.textContent = script.textContent;
      document.body.appendChild(clone);
      resolve();
    });
  }

  async function executeContentScripts(content) {
    document.querySelectorAll("script[data-wave-dynamic-script]").forEach((script) => script.remove());
    const scripts = [...content.querySelectorAll("script")];
    for (const script of scripts) {
      await executeScript(script);
    }
    window.dispatchEvent(new CustomEvent("wave:page-ready", {
      detail: { url: window.location.href },
    }));
  }

  async function fetchPage(url, signal) {
    const response = await fetch(url, {
      signal,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-WAVE-Seamless": "1",
      },
      credentials: "same-origin",
    });
    const html = await response.text();
    const nextDocument = new DOMParser().parseFromString(html, "text/html");
    if (!nextDocument.querySelector(CONTENT_SELECTOR)) {
      throw new Error(`Navigation response is not replaceable: ${response.status}`);
    }
    return nextDocument;
  }

  function renderNavigationError(url, options = {}) {
    const currentContent = getContent();
    if (!currentContent) {
      window.location.href = url;
      return;
    }

    const fallback = document.createElement("div");
    fallback.id = "site-content";
    fallback.className = "site-content";
    fallback.dataset.siteContent = "";
    fallback.dataset.wavePage = "error";
    fallback.innerHTML = `
      <div class="error-page" data-error-page data-tone="danger">
        <div class="error-page__ambient" aria-hidden="true">
          <span class="error-page__glow error-page__glow--accent"></span>
          <span class="error-page__glow error-page__glow--dim"></span>
          <span class="error-page__glow error-page__glow--danger"></span>
          <span class="error-page__grid"></span>
        </div>
        <main class="error-page__main" aria-labelledby="site-error-title">
          <div class="error-page__content">
            <h1 class="error-page__code" data-code="Ошибка">Ошибка</h1>
            <h2 class="error-page__title" id="site-error-title">Не удалось открыть страницу</h2>
            <p class="error-page__description">Переход не выполнен из-за временной ошибки. Попробуйте обновить страницу или вернуться на главную.</p>
            <hr class="error-page__rule" />
            <div class="error-page__actions">
              <a class="error-page__cta" href="/">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 12H5"></path>
                  <path d="m12 19-7-7 7-7"></path>
                </svg>
                На главную
              </a>
            </div>
          </div>
        </main>
      </div>
    `;
    currentContent.replaceWith(fallback);
    document.title = "Ошибка перехода | WAVE";
    if (options.push !== false) {
      history.pushState({ wave: true }, "", url);
    }
    restoreScroll(window.location.href, options.scrollMode);
    updateActiveNavigation();
  }

  async function navigate(url, options = {}) {
    const currentContent = getContent();
    if (!currentContent || isNavigating) {
      window.location.href = url;
      return;
    }

    isNavigating = true;
    saveScroll();
    currentController?.abort();
    currentController = new AbortController();

    try {
      currentContent.classList.add("is-page-leaving");
      await wait(TRANSITION_MS);
      cleanupPageState();

      const nextDocument = await fetchPage(url, currentController.signal);
      const nextContent = nextDocument.querySelector(CONTENT_SELECTOR);
      if (!nextContent) throw new Error("Missing data-site-content in response");

      await updateHead(nextDocument);
      syncBodyClasses(nextDocument.body);

      nextContent.classList.add("is-page-entering");
      currentContent.replaceWith(nextContent);

      if (options.push !== false) {
        history.pushState({ wave: true }, "", url);
      }

      restoreScroll(window.location.href, options.scrollMode);
      updateActiveNavigation();
      window.dispatchEvent(new CustomEvent("wave:page-mounted", {
        detail: {
          url: window.location.href,
          page: nextContent.dataset.wavePage || "",
        },
      }));
      await executeContentScripts(nextContent);

      requestAnimationFrame(() => {
        nextContent.classList.remove("is-page-entering");
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      renderNavigationError(url, options);
    } finally {
      isNavigating = false;
    }
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");
    if (isSamePageHashLink(anchor)) {
      if (scrollToHash(new URL(anchor.href, window.location.href).hash)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (!shouldHandleLink(anchor, event)) return;
    event.preventDefault();
    navigate(anchor.href);
  }, true);

  window.addEventListener("popstate", () => {
    navigate(window.location.href, { push: false, scrollMode: "restore" });
  });

  window.addEventListener("beforeunload", saveScroll);

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  history.replaceState({ wave: true }, "", window.location.href);
  updateActiveNavigation();
})();
