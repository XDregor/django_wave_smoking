(() => {
  window.__waveProductDetailMobileCleanup?.();

  const root = document.querySelector("[data-product-mobile-v3]");
  if (!root) return;

  const controller = new AbortController();
  const { signal } = controller;
  const productDetailPage = document.querySelector("[data-product-detail-id]");
  const mobileBreakpoint = Number.parseInt(productDetailPage?.dataset.productDetailMobileBreakpoint, 10) || 640;
  const mobileMedia = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`);
  const gallery = root.querySelector("[data-mobile-product-gallery]");
  const galleryFrame = root.querySelector(".gallery-frame");
  const galleryDots = root.querySelector("[data-mobile-product-gallery-dots]");
  const gallerySlides = [...(gallery?.querySelectorAll(".gallery-slide") || [])];
  const primaryGalleryImage = root.querySelector("[data-mobile-gallery-primary] img");
  const desktopQuantity = document.getElementById("input-quantity");
  const desktopPriceCurrent = document.getElementById("js_product_price_current");
  const desktopPriceOld = document.getElementById("js_product_price_old");
  const desktopPrice = document.getElementById("js_product_price");
  const desktopCartButton = document.getElementById("js_add_to_cart");
  const sharedProductState = window.waveProductDetailState;
  const mobilePurchaseDock = root.querySelector("[data-mobile-product-purchase]");
  const mobilePurchaseSurface = mobilePurchaseDock?.querySelector(".purchase-dock__surface");
  const mobileBuyButton = root.querySelector("[data-mobile-product-buy]");
  const mobileHint = root.querySelector("[data-mobile-product-hint]");
  const mobilePriceCurrent = root.querySelector("[data-mobile-price-current]");
  const mobilePriceOld = root.querySelector("[data-mobile-price-old]");
  const mobilePriceBadge = root.querySelector("[data-mobile-price-badge]");
  const mobilePrice = root.querySelector(".buy-price");
  const mobileCartButton = root.querySelector("[data-mobile-product-cart]");
  const cartBadge = root.querySelector("[data-mobile-product-cart-badge]");
  const productPage = document.body;
  const observers = [];
  const horizontalRows = [];
  let activeGalleryIndex = 0;
  let verticalScrollFrame = 0;
  let verticalScrollTarget = window.scrollY;
  let topControlsLastScrollY = Math.max(0, window.scrollY);
  let topControlsDirection = 0;
  let topControlsTravel = 0;
  let topControlsFrame = 0;
  let cookieLayoutFrame = 0;
  let discountHideTimer = 0;
  const priceTextTimers = new Map();

  galleryFrame?.classList.toggle("has-multiple-slides", gallerySlides.length > 1);

  function syncCookieBannerLayout() {
    cookieLayoutFrame = 0;

    if (!mobileMedia.matches) {
      productPage.style.removeProperty("--product-mobile-cookie-bottom");
      return;
    }

    const purchaseIsVisible = Boolean(
      mobilePurchaseDock?.classList.contains("is-buy") ||
      mobilePurchaseDock?.classList.contains("is-hint")
    );
    if (!purchaseIsVisible || !mobilePurchaseSurface) {
      productPage.style.removeProperty("--product-mobile-cookie-bottom");
      return;
    }

    const surfaceHeight = mobilePurchaseDock.classList.contains("is-buy") ? 64 : 46;
    const containerPaddingBottom = Number.parseFloat(
      window.getComputedStyle(mobilePurchaseDock).paddingBottom
    ) || 0;
    const bottom = Math.max(14, Math.ceil(surfaceHeight + containerPaddingBottom + 10));
    productPage.style.setProperty("--product-mobile-cookie-bottom", `${bottom}px`);
  }

  function scheduleCookieBannerLayout() {
    if (cookieLayoutFrame) return;
    cookieLayoutFrame = requestAnimationFrame(syncCookieBannerLayout);
  }

  function stopSmoothVerticalScroll() {
    if (verticalScrollFrame) cancelAnimationFrame(verticalScrollFrame);
    verticalScrollFrame = 0;
    verticalScrollTarget = window.scrollY;
  }

  function cleanup() {
    controller.abort();
    observers.forEach((observer) => observer.disconnect());
    if (topControlsFrame) cancelAnimationFrame(topControlsFrame);
    if (cookieLayoutFrame) cancelAnimationFrame(cookieLayoutFrame);
    window.clearTimeout(discountHideTimer);
    priceTextTimers.forEach((timers) => timers.forEach((timer) => window.clearTimeout(timer)));
    priceTextTimers.clear();
    stopSmoothVerticalScroll();
    stopSheetScrollAnimation();
    window.clearTimeout(sheetCloseTimer);
    document.body.classList.remove("is-mobile-product-sheet-open");
    productPage.style.removeProperty("--product-mobile-cookie-bottom");
    if (window.__waveProductDetailMobileCleanup === cleanup) {
      window.__waveProductDetailMobileCleanup = null;
    }
  }

  window.__waveProductDetailMobileCleanup = cleanup;
  window.addEventListener("wave:page-leave", cleanup, { once: true, signal });

  function syncTopControlsVisibility() {
    topControlsFrame = 0;
    const scrollY = Math.max(0, window.scrollY);
    const delta = scrollY - topControlsLastScrollY;
    topControlsLastScrollY = scrollY;

    if (scrollY <= 60) {
      root.classList.remove("is-top-controls-hidden");
      topControlsDirection = 0;
      topControlsTravel = 0;
      return;
    }

    if (Math.abs(delta) < 1) return;

    const direction = delta > 0 ? 1 : -1;
    if (direction !== topControlsDirection) {
      topControlsDirection = direction;
      topControlsTravel = 0;
    }
    topControlsTravel += Math.abs(delta);

    if (direction > 0 && scrollY > 110 && topControlsTravel >= 28) {
      root.classList.add("is-top-controls-hidden");
      topControlsTravel = 0;
    } else if (direction < 0 && topControlsTravel >= 10) {
      root.classList.remove("is-top-controls-hidden");
      topControlsTravel = 0;
    }
  }

  window.addEventListener("scroll", () => {
    if (topControlsFrame) return;
    topControlsFrame = requestAnimationFrame(syncTopControlsVisibility);
  }, { passive: true, signal });

  function smoothVerticalScroll(delta) {
    const currentScroll = window.scrollY;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    if (!verticalScrollFrame || Math.abs(verticalScrollTarget - currentScroll) > window.innerHeight * 2) {
      verticalScrollTarget = currentScroll;
    }
    verticalScrollTarget = Math.max(0, Math.min(maxScroll, verticalScrollTarget + delta));

    if (verticalScrollFrame) return;

    const animate = () => {
      const current = window.scrollY;
      const distance = verticalScrollTarget - current;

      if (Math.abs(distance) < 0.5) {
        window.scrollTo(0, verticalScrollTarget);
        verticalScrollFrame = 0;
        return;
      }

      window.scrollTo(0, current + distance * 0.2);
      verticalScrollFrame = requestAnimationFrame(animate);
    };

    verticalScrollFrame = requestAnimationFrame(animate);
  }

  function attachHorizontalScroll(element) {
    if (!element) return;
    let isDown = false;
    let isDragging = false;
    let moved = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;

    function updateOverflowState() {
      const scrollable = mobileMedia.matches && element.scrollWidth > element.clientWidth + 2;
      element.classList.toggle("is-scrollable", scrollable);
      if (!scrollable && element.scrollLeft) element.scrollLeft = 0;
      return scrollable;
    }

    horizontalRows.push(updateOverflowState);
    requestAnimationFrame(updateOverflowState);

    element.addEventListener("pointerdown", (event) => {
      if (!mobileMedia.matches || event.pointerType !== "mouse" || event.button !== 0 || !updateOverflowState()) return;
      isDown = true;
      isDragging = false;
      moved = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScroll = element.scrollLeft;
    }, { signal });

    element.addEventListener("pointermove", (event) => {
      if (!isDown || event.pointerId !== pointerId) return;
      const distanceX = event.clientX - startX;
      const distanceY = event.clientY - startY;
      if (!isDragging) {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < 6) return;
        if (Math.abs(distanceY) >= Math.abs(distanceX)) {
          isDown = false;
          pointerId = null;
          return;
        }
        isDragging = true;
        moved = true;
        element.classList.add("is-dragging");
        element.setPointerCapture(event.pointerId);
      }
      element.scrollLeft = startScroll - distanceX;
    }, { signal });

    function finishDrag(event) {
      if (!isDown || event.pointerId !== pointerId) return;
      isDown = false;
      element.classList.remove("is-dragging");
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      pointerId = null;
      isDragging = false;
    }

    element.addEventListener("pointerup", finishDrag, { signal });
    element.addEventListener("pointercancel", finishDrag, { signal });
    element.addEventListener("pointerleave", (event) => {
      if (isDown && !isDragging && event.pointerId === pointerId) {
        isDown = false;
        pointerId = null;
      }
    }, { signal });
    element.addEventListener("click", (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }, { capture: true, signal });

    element.addEventListener("wheel", (event) => {
      if (!mobileMedia.matches || !updateOverflowState()) return;

      // A normal mouse wheel must always keep scrolling the page vertically.
      // Only an explicitly horizontal trackpad/Shift+wheel gesture belongs to
      // the variants and recommendation rails.
      const horizontalDelta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!horizontalDelta || (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX))) return;

      const maxScroll = element.scrollWidth - element.clientWidth;
      const nextScroll = Math.max(0, Math.min(maxScroll, element.scrollLeft + horizontalDelta));
      if (nextScroll === element.scrollLeft) return;

      event.preventDefault();
      element.scrollLeft = nextScroll;
    }, { passive: false, signal });

  }

  function renderGalleryDots() {
    if (!galleryDots) return;
    galleryDots.replaceChildren(...gallerySlides.map((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "gallery-dot";
      dot.setAttribute("aria-label", `Показать изображение ${index + 1} из ${gallerySlides.length}`);
      dot.addEventListener("click", () => setActiveGalleryIndex(index), { signal });
      dot.classList.toggle("active", index === activeGalleryIndex);
      dot.setAttribute("aria-pressed", index === activeGalleryIndex ? "true" : "false");
      return dot;
    }));
  }

  function positionGalleryTrack(offset = 0) {
    if (!gallery) return;
    gallery.style.transform = `translate3d(calc(${-activeGalleryIndex * 100}% + ${offset}px), 0, 0)`;
  }

  function setActiveGalleryIndex(index) {
    activeGalleryIndex = Math.max(0, Math.min(gallerySlides.length - 1, index));
    positionGalleryTrack();
    galleryDots?.querySelectorAll(".gallery-dot").forEach((dot, dotIndex) => {
      const active = dotIndex === activeGalleryIndex;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gallerySlides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeGalleryIndex;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      const video = slide.querySelector("video");
      if (!video) return;
      if (slideIndex === activeGalleryIndex && mobileMedia.matches) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }

  function moveGallery(direction) {
    if (gallerySlides.length < 2) return;
    const nextIndex = Math.max(0, Math.min(gallerySlides.length - 1, activeGalleryIndex + direction));
    setActiveGalleryIndex(nextIndex);
  }

  renderGalleryDots();
  root.querySelectorAll(".chip-scroll").forEach((row) => attachHorizontalScroll(row));

  document.addEventListener("wheel", (event) => {
    if (
      !mobileMedia.matches
      || event.shiftKey
      || Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) return;

    if (event.target.closest?.(".sheet-backdrop.open, .shop_panel")) return;

    // Keep every surface in the mobile product page transparent to vertical
    // wheel input, including recommendation rails rendered outside mobile-v3.
    // Some nested overflow/media surfaces otherwise prevent the event from
    // reaching the document scroll root.
    event.preventDefault();
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    smoothVerticalScroll(event.deltaY * deltaScale);
  }, { passive: false, capture: true, signal });

  root.addEventListener("dragstart", (event) => {
    if (event.target.closest("img, video")) event.preventDefault();
  }, { signal });

  window.addEventListener("load", () => {
    horizontalRows.forEach((update) => update());
    scheduleCookieBannerLayout();
  }, { once: true, signal });
  window.addEventListener("resize", () => {
    horizontalRows.forEach((update) => update());
    scheduleCookieBannerLayout();
  }, { passive: true, signal });

  if (galleryFrame && gallerySlides.length > 1) {
    let galleryPointerId = null;
    let galleryStartX = 0;
    let galleryStartY = 0;
    let galleryStartTime = 0;
    let galleryDragging = false;
    let suppressGalleryClick = false;

    galleryFrame.addEventListener("pointerdown", (event) => {
      if (!mobileMedia.matches || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      galleryPointerId = event.pointerId;
      galleryStartX = event.clientX;
      galleryStartY = event.clientY;
      galleryStartTime = performance.now();
      galleryDragging = false;
    }, { passive: true, signal });

    galleryFrame.addEventListener("pointermove", (event) => {
      if (event.pointerId !== galleryPointerId) return;
      const distanceX = event.clientX - galleryStartX;
      const distanceY = event.clientY - galleryStartY;

      if (!galleryDragging) {
        if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < 7) return;
        if (Math.abs(distanceY) >= Math.abs(distanceX)) {
          galleryPointerId = null;
          return;
        }
        galleryDragging = true;
        suppressGalleryClick = true;
        galleryFrame.classList.add("is-dragging");
        gallery.classList.add("is-dragging");
        galleryFrame.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      const pullingPastStart = activeGalleryIndex === 0 && distanceX > 0;
      const pullingPastEnd = activeGalleryIndex === gallerySlides.length - 1 && distanceX < 0;
      const dragOffset = (pullingPastStart || pullingPastEnd) ? distanceX * 0.22 : distanceX;
      positionGalleryTrack(dragOffset);
    }, { passive: false, signal });

    function finishGalleryDrag(event, cancelled = false) {
      if (event.pointerId !== galleryPointerId) return;
      const distanceX = event.clientX - galleryStartX;
      const elapsed = Math.max(1, performance.now() - galleryStartTime);
      const velocity = Math.abs(distanceX) / elapsed;
      const shouldMove = !cancelled && galleryDragging && (Math.abs(distanceX) >= 44 || velocity > 0.35);

      if (galleryFrame.hasPointerCapture(event.pointerId)) {
        galleryFrame.releasePointerCapture(event.pointerId);
      }
      galleryFrame.classList.remove("is-dragging");
      gallery.classList.remove("is-dragging");
      if (galleryDragging) {
        window.setTimeout(() => {
          suppressGalleryClick = false;
        }, 350);
      }
      galleryPointerId = null;
      galleryDragging = false;

      if (shouldMove) {
        moveGallery(distanceX < 0 ? 1 : -1);
      } else {
        positionGalleryTrack();
      }
    }

    galleryFrame.addEventListener("pointerup", (event) => finishGalleryDrag(event), { signal });
    galleryFrame.addEventListener("pointercancel", (event) => finishGalleryDrag(event, true), { signal });

    galleryFrame.addEventListener("click", (event) => {
      if (suppressGalleryClick) {
        suppressGalleryClick = false;
        return;
      }
      if (!mobileMedia.matches || event.target.closest("button")) return;
      const bounds = galleryFrame.getBoundingClientRect();
      moveGallery(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
    }, { signal });
  }

  function syncVariantState() {
    const snapshot = sharedProductState?.getSnapshot();
    const selectedVariantIds = new Set(snapshot?.selectedVariantIds || []);
    const unavailableVariantIds = new Set(snapshot?.unavailableVariantIds || []);
    root.querySelectorAll("[data-mobile-variant-group]").forEach((group) => {
      let selectedName = "не выбрано";
      group.querySelectorAll("[data-mobile-variant-id]").forEach((mobileButton) => {
        const desktopButton = document.querySelector(
          `.product-info__variant[data-variant-id="${CSS.escape(mobileButton.dataset.mobileVariantId || "")}"]`
        );
        const variantId = mobileButton.dataset.mobileVariantId || "";
        const selected = snapshot
          ? selectedVariantIds.has(variantId)
          : Boolean(desktopButton?.classList.contains("is-active"));
        mobileButton.classList.toggle("selected", selected);
        mobileButton.setAttribute("aria-pressed", selected ? "true" : "false");
        mobileButton.disabled = snapshot
          ? unavailableVariantIds.has(variantId)
          : Boolean(desktopButton?.disabled);
        if (selected) selectedName = mobileButton.dataset.mobileVariantName || mobileButton.textContent.trim();
      });
      const label = group.querySelector("[data-mobile-selected-variant]");
      if (label) label.textContent = selectedName;
    });
  }

  root.addEventListener("click", (event) => {
    const mobileVariant = event.target.closest("[data-mobile-variant-id]");
    if (!mobileVariant || mobileVariant.disabled) return;
    const desktopVariant = document.querySelector(
      `.product-info__variant[data-variant-id="${CSS.escape(mobileVariant.dataset.mobileVariantId || "")}"]`
    );
    if (!sharedProductState?.selectVariant(mobileVariant.dataset.mobileVariantId || "")) {
      desktopVariant?.click();
    }

    const imageUrl = mobileVariant.dataset.mobileVariantImage || "";
    if (imageUrl && primaryGalleryImage) {
      primaryGalleryImage.src = imageUrl;
      primaryGalleryImage.alt = mobileVariant.dataset.mobileVariantName || "";
      const primarySlide = primaryGalleryImage.closest(".gallery-slide");
      const index = gallerySlides.indexOf(primarySlide);
      if (index >= 0) {
        setActiveGalleryIndex(index);
      }
    }
    requestAnimationFrame(syncProductState);
  }, { signal });

  function syncQuantity() {
    const quantity = sharedProductState?.getSnapshot().quantity
      || Math.max(1, Number.parseInt(desktopQuantity?.value, 10) || 1);
    const target = root.querySelector("[data-mobile-quantity-value]");
    if (target) target.textContent = `${quantity}`;
  }

  function updatePriceText(element, nextText, { animate = true } = {}) {
    if (!element) return;
    const text = `${nextText || ""}`.trim();
    if (!text || element.dataset.pendingPriceText === text) return;

    const previousTimers = priceTextTimers.get(element) || [];
    previousTimers.forEach((timer) => window.clearTimeout(timer));
    priceTextTimers.delete(element);
    element.classList.remove("is-price-leaving", "is-price-entering");

    if (element.textContent.trim() === text) {
      delete element.dataset.pendingPriceText;
      return;
    }

    if (!animate || !mobileMedia.matches) {
      element.textContent = text;
      delete element.dataset.pendingPriceText;
      return;
    }

    element.dataset.pendingPriceText = text;
    element.classList.add("is-price-leaving");
    const swapTimer = window.setTimeout(() => {
      element.textContent = text;
      element.classList.remove("is-price-leaving");
      element.classList.add("is-price-entering");
    }, 110);
    const finishTimer = window.setTimeout(() => {
      element.classList.remove("is-price-entering");
      delete element.dataset.pendingPriceText;
      priceTextTimers.delete(element);
    }, 330);
    priceTextTimers.set(element, [swapTimer, finishTimer]);
  }

  function syncPrice() {
    const snapshot = sharedProductState?.getSnapshot();
    const currentPriceText = snapshot?.currentPriceText || desktopPriceCurrent?.textContent || "";
    if (mobilePriceCurrent && currentPriceText) {
      updatePriceText(mobilePriceCurrent, currentPriceText);
    }

    const oldPriceText = snapshot?.oldPriceText || desktopPriceOld?.textContent.trim() || "";
    const hasDiscount = Boolean(
      (snapshot ? snapshot.hasDiscount : desktopPrice?.classList.contains("product-info__price--discount"))
      && oldPriceText
    );
    const discount = snapshot?.discountText
      || document.querySelector(".product-info__price-percent")?.textContent.trim()
      || "";
    const showDiscount = hasDiscount && Boolean(discount);
    const discountWasVisible = Boolean(mobilePrice?.classList.contains("has-discount"));
    window.clearTimeout(discountHideTimer);

    if (showDiscount) {
      const isEntering = !discountWasVisible;
      updatePriceText(mobilePriceOld, oldPriceText, { animate: !isEntering });
      updatePriceText(mobilePriceBadge, discount, { animate: !isEntering });
      if (mobilePriceOld) {
        mobilePriceOld.hidden = false;
        mobilePriceOld.setAttribute("aria-hidden", "false");
      }
      if (mobilePriceBadge) {
        mobilePriceBadge.hidden = false;
        mobilePriceBadge.setAttribute("aria-hidden", "false");
      }
      if (isEntering && mobilePrice) void mobilePrice.offsetWidth;
      mobilePrice?.classList.add("has-discount");
    } else {
      mobilePrice?.classList.remove("has-discount");
      mobilePriceOld?.setAttribute("aria-hidden", "true");
      mobilePriceBadge?.setAttribute("aria-hidden", "true");
      discountHideTimer = window.setTimeout(() => {
        if (mobilePrice?.classList.contains("has-discount")) return;
        if (mobilePriceOld) mobilePriceOld.hidden = true;
        if (mobilePriceBadge) mobilePriceBadge.hidden = true;
      }, 280);
    }
  }

  function syncAvailability() {
    if (!mobileBuyButton || !desktopCartButton) return;
    const snapshot = sharedProductState?.getSnapshot();
    const disabled = snapshot
      ? snapshot.disabled
      : desktopCartButton.disabled || desktopCartButton.getAttribute("aria-disabled") === "true";
    mobileBuyButton.disabled = disabled;
    mobilePurchaseDock?.classList.toggle("is-buy", !disabled);
    mobilePurchaseDock?.classList.toggle("is-hint", disabled && Boolean(mobileHint));
    scheduleCookieBannerLayout();
  }

  function syncProductState() {
    syncVariantState();
    syncQuantity();
    syncPrice();
    syncAvailability();
  }

  root.querySelector("[data-mobile-quantity-minus]")?.addEventListener("click", () => {
    if (sharedProductState) sharedProductState.changeQuantity(-1);
    else document.getElementById("js_quantity_minus")?.click();
    requestAnimationFrame(syncProductState);
  }, { signal });

  root.querySelector("[data-mobile-quantity-plus]")?.addEventListener("click", () => {
    if (sharedProductState) sharedProductState.changeQuantity(1);
    else document.getElementById("js_quantity_plus")?.click();
    requestAnimationFrame(syncProductState);
  }, { signal });

  mobileBuyButton?.addEventListener("click", () => {
    if (mobileBuyButton.disabled) return;
    if (sharedProductState) sharedProductState.addToCart();
    else desktopCartButton?.click();
  }, { signal });

  root.querySelector("[data-mobile-product-back]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    let localReferrer = false;
    try {
      localReferrer = Boolean(document.referrer && new URL(document.referrer).origin === location.origin);
    } catch (_) {
      localReferrer = false;
    }
    if (history.length > 1 && (history.state?.wave || localReferrer)) {
      history.back();
    } else {
      location.href = button.dataset.fallbackUrl || "/";
    }
  }, { signal });

  function syncCartBadge(rawValue) {
    if (!cartBadge) return;
    const count = Math.max(0, Number.parseInt(rawValue, 10) || 0);
    cartBadge.hidden = count === 0;
    cartBadge.classList.toggle("is-attention-active", count > 0);
    mobileCartButton?.setAttribute(
      "aria-label",
      count > 0 ? `Корзина, товаров: ${count}` : "Корзина"
    );
  }

  const basketCounter = document.getElementById("basketCounter");
  syncCartBadge(basketCounter?.textContent);
  if (basketCounter) {
    const observer = new MutationObserver(() => {
      syncCartBadge(basketCounter.textContent);
    });
    observer.observe(basketCounter, { childList: true, characterData: true, subtree: true });
    observers.push(observer);
  }

  mobileCartButton?.addEventListener("click", () => {
    window._shopPanel?.show?.("cart_widget");
  }, { signal });

  const stateObserver = new MutationObserver(syncProductState);
  [
    document.getElementById("js_variant_section"),
    desktopQuantity,
    desktopPrice,
    desktopPriceCurrent,
    desktopPriceOld,
    desktopCartButton,
  ].filter(Boolean).forEach((target) => {
    stateObserver.observe(target, {
      attributes: true,
      attributeFilter: ["class", "disabled", "aria-disabled", "value"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  observers.push(stateObserver);

  const reviewsToggle = root.querySelector("[data-mobile-reviews-toggle]");
  const reviewsPanel = root.querySelector("[data-mobile-reviews-panel]");
  const reviewsMore = root.querySelector("[data-mobile-reviews-more]");
  const extraReviews = [...root.querySelectorAll("[data-mobile-product-review-extra]")];

  function syncReviewsPanelHeight() {
    if (reviewsPanel?.classList.contains("open")) {
      reviewsPanel.style.maxHeight = `${reviewsPanel.scrollHeight}px`;
    }
  }

  reviewsToggle?.addEventListener("click", () => {
    const open = !reviewsToggle.classList.contains("open");
    reviewsToggle.classList.toggle("open", open);
    reviewsPanel?.classList.toggle("open", open);
    reviewsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (reviewsPanel) reviewsPanel.style.maxHeight = open ? `${reviewsPanel.scrollHeight}px` : "0px";
  }, { signal });

  reviewsMore?.addEventListener("click", () => {
    extraReviews.forEach((entry) => {
      entry.hidden = false;
    });
    reviewsMore.setAttribute("aria-expanded", "true");
    reviewsMore.hidden = true;
    requestAnimationFrame(syncReviewsPanelHeight);
  }, { signal });

  if (reviewsPanel && typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(syncReviewsPanelHeight);
    observer.observe(reviewsPanel.firstElementChild || reviewsPanel);
    observers.push(observer);
  }

  const sheetBackdrop = root.querySelector("[data-mobile-product-sheet]");
  const sheet = sheetBackdrop?.querySelector(".sheet");
  const sheetTitle = root.querySelector("[data-mobile-sheet-title]");
  const sheetBody = root.querySelector("[data-mobile-sheet-body]");
  const sheetHandle = root.querySelector("[data-mobile-sheet-handle]");
  let sheetOpener = null;
  let sheetCollapsedHeight = 0;
  let sheetScrollTouchY = 0;
  let sheetScrollFrame = 0;
  let sheetScrollEndTimer = 0;
  let sheetCloseTimer = 0;
  let sheetScrollTargetHeight = 0;

  function getSheetViewportHeight() {
    return Math.round(window.visualViewport?.height || window.innerHeight || 0);
  }

  function stopSheetScrollAnimation() {
    window.clearTimeout(sheetScrollEndTimer);
    sheetScrollEndTimer = 0;
    if (sheetScrollFrame) cancelAnimationFrame(sheetScrollFrame);
    sheetScrollFrame = 0;
    sheetScrollTargetHeight = 0;
  }

  function closeSheet({ restoreFocus = true } = {}) {
    if (!sheetBackdrop?.classList.contains("open")) return;
    stopSheetScrollAnimation();
    window.clearTimeout(sheetCloseTimer);
    sheet?.classList.remove("dragging");
    if (sheetBackdrop.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    sheetBackdrop.classList.remove("open", "is-expanded");
    sheetBackdrop.setAttribute("aria-hidden", "true");
    sheetBackdrop.inert = true;
    document.body.classList.remove("is-mobile-product-sheet-open");
    sheetCloseTimer = window.setTimeout(() => {
      sheet?.style.removeProperty("height");
      sheet?.style.removeProperty("max-height");
    }, 440);
    sheetHandle?.setAttribute("aria-label", "Развернуть окно информации");
    if (restoreFocus && sheetOpener?.isConnected) sheetOpener.focus({ preventScroll: true });
    sheetOpener = null;
  }

  function getSheetSnapHeights() {
    const viewportHeight = getSheetViewportHeight();
    const collapsedHeight = Math.min(viewportHeight, sheetCollapsedHeight);
    return [0, 0.2, 0.4, 0.6, 0.8, 1]
      .map((progress) => Math.round(
        collapsedHeight + (viewportHeight - collapsedHeight) * progress
      ))
      .filter((height, index, heights) => index === 0 || height - heights[index - 1] >= 8);
  }

  function snapSheetToHeight(targetHeight) {
    if (!sheetBackdrop || !sheet) return;
    const currentHeight = sheet.getBoundingClientRect().height;
    const viewportHeight = getSheetViewportHeight();
    const nextHeight = Math.max(80, Math.min(viewportHeight, targetHeight));
    const expanded = nextHeight >= viewportHeight - 2;
    sheet.classList.remove("dragging");
    sheet.style.maxHeight = "100dvh";
    sheet.style.height = `${currentHeight}px`;
    sheet.offsetHeight;
    sheetBackdrop.classList.toggle("is-expanded", expanded);
    sheet.style.height = `${nextHeight}px`;
    sheetHandle?.setAttribute(
      "aria-label",
      expanded ? "Свернуть окно информации" : "Развернуть окно информации"
    );
  }

  function applySheetInteractiveHeight(height) {
    if (!sheet || !sheetBackdrop) return;
    const viewportHeight = getSheetViewportHeight();
    const nextHeight = Math.max(80, Math.min(viewportHeight, height));
    sheet.style.height = `${nextHeight}px`;
    const isExpanded = nextHeight >= viewportHeight - 2;
    sheetBackdrop.classList.toggle("is-expanded", isExpanded);
    sheetHandle?.setAttribute(
      "aria-label",
      isExpanded ? "Свернуть окно информации" : "Развернуть окно информации"
    );
  }

  function queueSheetInteractiveHeight(height) {
    if (!sheet) return;
    const viewportHeight = getSheetViewportHeight();
    sheetScrollTargetHeight = Math.max(80, Math.min(viewportHeight, height));
    sheet.classList.add("dragging");
    if (sheetScrollFrame) return;

    const animate = () => {
      if (!sheet || !sheetScrollTargetHeight) {
        sheetScrollFrame = 0;
        return;
      }
      const currentHeight = sheet.getBoundingClientRect().height;
      const distance = sheetScrollTargetHeight - currentHeight;
      const nextHeight = Math.abs(distance) < 0.75
        ? sheetScrollTargetHeight
        : currentHeight + distance * 0.42;
      applySheetInteractiveHeight(nextHeight);
      if (Math.abs(sheetScrollTargetHeight - nextHeight) >= 0.75) {
        sheetScrollFrame = requestAnimationFrame(animate);
      } else {
        sheetScrollFrame = 0;
      }
    };

    sheetScrollFrame = requestAnimationFrame(animate);
  }

  function settleSheetAfterInteraction() {
    if (!sheet || !sheetBackdrop?.classList.contains("open")) return;
    stopSheetScrollAnimation();
    const currentHeight = sheet.getBoundingClientRect().height;
    sheet.classList.remove("dragging");

    if (currentHeight < sheetCollapsedHeight * 0.72) {
      closeSheet();
      return;
    }

    const snapHeights = getSheetSnapHeights();
    const nearestHeight = snapHeights.reduce((nearest, height) => (
      Math.abs(height - currentHeight) < Math.abs(nearest - currentHeight) ? height : nearest
    ), snapHeights[0]);
    snapSheetToHeight(nearestHeight);
  }

  function resizeSheetBeforeScroll(delta) {
    if (
      !mobileMedia.matches
      || !sheetBackdrop?.classList.contains("open")
      || !sheet
      || !delta
    ) return false;

    const currentHeight = sheet.getBoundingClientRect().height;
    const viewportHeight = getSheetViewportHeight();
    const shrinkingFromTop = delta < 0 && (sheetBody?.scrollTop || 0) <= 1;
    const growingBeforeContent = delta > 0 && currentHeight < viewportHeight - 2;
    if (!shrinkingFromTop && !growingBeforeContent) return false;

    const normalizedDelta = Math.max(-96, Math.min(96, delta)) * 0.9;
    const baseHeight = sheetScrollTargetHeight || currentHeight;
    queueSheetInteractiveHeight(baseHeight + normalizedDelta);
    window.clearTimeout(sheetScrollEndTimer);
    sheetScrollEndTimer = window.setTimeout(settleSheetAfterInteraction, 150);
    return true;
  }

  root.querySelectorAll("[data-mobile-sheet-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const key = trigger.dataset.mobileSheetTrigger;
      const content = root.querySelector(`template[data-mobile-sheet-content="${CSS.escape(key || "")}"]`);
      if (!sheetBackdrop || !sheet || !sheetTitle || !sheetBody || !content) return;
      sheetTitle.textContent = trigger.querySelector(".info-card__title")?.textContent.trim() || "Информация";
      sheetBody.replaceChildren(content.content.cloneNode(true));
      sheetBody.scrollTop = 0;
      stopSheetScrollAnimation();
      window.clearTimeout(sheetCloseTimer);
      const viewportHeight = getSheetViewportHeight();
      sheetCollapsedHeight = Math.min(viewportHeight, Math.max(320, Math.round(viewportHeight * 0.56)));
      sheet.style.height = `${sheetCollapsedHeight}px`;
      sheet.style.maxHeight = "100dvh";
      sheetOpener = trigger;
      sheetBackdrop.inert = false;
      sheetBackdrop.setAttribute("aria-hidden", "false");
      sheetBackdrop.classList.remove("is-expanded");
      sheetBackdrop.classList.add("open");
      document.body.classList.add("is-mobile-product-sheet-open");
      requestAnimationFrame(() => sheetHandle?.focus({ preventScroll: true }));
    }, { signal });
  });

  sheetBackdrop?.addEventListener("click", (event) => {
    if (event.target === sheetBackdrop) closeSheet();
  }, { signal });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSheet();
      return;
    }
    if (event.key !== "Tab" || !sheetBackdrop?.classList.contains("open") || !sheet) return;
    const focusable = [...sheet.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      sheetHandle?.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, { signal });

  sheetBody?.addEventListener("wheel", (event) => {
    const viewportHeight = getSheetViewportHeight();
    const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * viewportHeight
        : event.deltaY;
    if (resizeSheetBeforeScroll(delta)) event.preventDefault();
  }, { passive: false, signal });

  sheetBody?.addEventListener("touchstart", (event) => {
    if (!mobileMedia.matches || !event.touches.length) return;
    sheetScrollTouchY = event.touches[0].clientY;
  }, { passive: true, signal });

  sheetBody?.addEventListener("touchmove", (event) => {
    if (!mobileMedia.matches || !event.touches.length) return;
    const nextY = event.touches[0].clientY;
    const delta = sheetScrollTouchY - nextY;
    sheetScrollTouchY = nextY;
    if (resizeSheetBeforeScroll(delta)) event.preventDefault();
  }, { passive: false, signal });

  sheetBody?.addEventListener("touchend", settleSheetAfterInteraction, { passive: true, signal });
  sheetBody?.addEventListener("touchcancel", settleSheetAfterInteraction, { passive: true, signal });

  if (sheet && sheetHandle) {
    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let startHeight = 0;
    let lastHeight = 0;
    let didDrag = false;

    sheetHandle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragging = true;
      didDrag = false;
      pointerId = event.pointerId;
      startY = event.clientY;
      startHeight = sheet.getBoundingClientRect().height;
      lastHeight = startHeight;
      sheet.classList.add("dragging");
      sheetHandle.setPointerCapture(pointerId);
    }, { signal });

    sheetHandle.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      event.preventDefault();
      const distance = startY - event.clientY;
      if (Math.abs(distance) > 6) didDrag = true;
      lastHeight = Math.max(80, Math.min(getSheetViewportHeight(), startHeight + distance));
      applySheetInteractiveHeight(lastHeight);
    }, { signal });

    function finishSheetDrag(event) {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      sheet.classList.remove("dragging");
      if (sheetHandle.hasPointerCapture(pointerId)) sheetHandle.releasePointerCapture(pointerId);
      pointerId = null;
      settleSheetAfterInteraction();
    }

    sheetHandle.addEventListener("pointerup", finishSheetDrag, { signal });
    sheetHandle.addEventListener("pointercancel", finishSheetDrag, { signal });
    sheetHandle.addEventListener("click", () => {
      if (didDrag || !sheetBackdrop.classList.contains("open")) return;
      const currentHeight = sheet.getBoundingClientRect().height;
      const snapHeights = getSheetSnapHeights();
      const nextHeight = snapHeights.find((height) => height > currentHeight + 4) || snapHeights[0];
      snapSheetToHeight(nextHeight);
    }, { signal });
  }

  function syncSheetToViewport() {
    if (!sheet || !sheetBackdrop?.classList.contains("open")) return;
    const viewportHeight = getSheetViewportHeight();
    const currentHeight = sheet.getBoundingClientRect().height;
    if (sheetBackdrop.classList.contains("is-expanded")) {
      applySheetInteractiveHeight(viewportHeight);
    } else if (currentHeight > viewportHeight) {
      applySheetInteractiveHeight(viewportHeight);
    }
  }

  window.addEventListener("resize", syncSheetToViewport, { signal });
  window.visualViewport?.addEventListener("resize", syncSheetToViewport, { signal });

  mobileMedia.addEventListener("change", (event) => {
    stopSmoothVerticalScroll();

    if (!event.matches) {
      closeSheet({ restoreFocus: false });
      document.body.classList.remove("is-mobile-product-sheet-open");
      root.querySelectorAll(".is-dragging").forEach((element) => {
        element.classList.remove("is-dragging");
      });
      gallerySlides.forEach((slide) => slide.querySelector("video")?.pause());
    }

    horizontalRows.forEach((update) => update());
    if (event.matches) {
      setActiveGalleryIndex(activeGalleryIndex);
      scheduleCookieBannerLayout();
    } else {
      productPage.style.removeProperty("--product-mobile-cookie-bottom");
    }
  }, { signal });

  syncProductState();
  setActiveGalleryIndex(0);
})();
