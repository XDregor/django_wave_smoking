(() => {
        const getCookie = (name) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          return parts.length === 2 ? parts.pop().split(";").shift() : "";
        };

        const csrfToken = getCookie("csrftoken");
        let toastTimer = null;

        function showToast(message, danger = false) {
          const toast = document.getElementById("js_toast");
          const dot = document.getElementById("js_toast_dot");
          const text = document.getElementById("js_toast_text");
          if (!toast || !dot || !text) return;

          text.textContent = message;
          dot.className = danger ? "product-toast__dot product-toast__dot--danger" : "product-toast__dot";
          toast.classList.add("visible");
          clearTimeout(toastTimer);
          toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
        }

        window.showToast = window.showToast || showToast;

        const mainImage = document.getElementById("js_main_image");
        const mainVideo = document.getElementById("js_main_video");
        const videoSoundToggle = document.getElementById("js_video_sound_toggle");
        const videoProgress = document.getElementById("js_video_progress");
        const videoProgressFill = document.getElementById("js_video_progress_fill");
        const galleryFrame = document.getElementById("js_gallery_frame");
        const thumbnailButtons = [...document.querySelectorAll(".product-gallery__thumb")];
        const variantGalleryThumb = document.getElementById("js_gallery_variant_thumb");
        const lightbox = document.getElementById("js_product_lightbox");
        const lightboxImage = document.getElementById("js_product_lightbox_image");
        const lightboxClose = document.getElementById("js_product_lightbox_close");
        const lightboxPrev = document.getElementById("js_product_lightbox_prev");
        const lightboxNext = document.getElementById("js_product_lightbox_next");
        let activeGalleryIndex = Math.max(0, thumbnailButtons.findIndex((button) => button.classList.contains("is-active")));

        function updateVideoSoundIcon() {
          if (!mainVideo || !videoSoundToggle) return;
          const muted = mainVideo.muted;
          videoSoundToggle.classList.toggle("is-sound-on", !muted);
          videoSoundToggle.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
        }

        function setVideoControlsVisible(visible) {
          if (videoSoundToggle) videoSoundToggle.hidden = !visible;
          if (videoProgress) videoProgress.hidden = !visible;
        }

        function updateVideoProgress() {
          if (!mainVideo || !videoProgressFill || !mainVideo.duration) return;
          const progress = (mainVideo.currentTime / mainVideo.duration) * 100;
          videoProgressFill.style.width = `${progress}%`;
        }

        function showGalleryImage(button) {
          if (!button || !mainImage) return;

          const src = button.getAttribute("data-gallery-src");
          const alt = button.getAttribute("data-gallery-alt") || "";
          if (!src) return;

          if (mainVideo) {
            mainVideo.pause();
            mainVideo.hidden = true;
            mainVideo.muted = true;
            updateVideoSoundIcon();
          }
          setVideoControlsVisible(false);
          if (videoProgressFill) videoProgressFill.style.width = "0%";

          mainImage.hidden = false;
          mainImage.src = src;
          mainImage.alt = alt;

          if (lightboxImage && lightbox?.classList.contains("open")) {
            lightboxImage.src = src;
            lightboxImage.alt = alt;
          }
        }

        function showGalleryVideo(button, autoplay = true) {
          const videoSrc = button?.getAttribute("data-gallery-video-src");
          const posterSrc = button?.getAttribute("data-gallery-poster-src") || "";
          if (!videoSrc || !mainVideo) return;

          if (mainImage) {
            mainImage.hidden = true;
          }

          mainVideo.hidden = false;
          mainVideo.muted = true;
          mainVideo.loop = true;
          mainVideo.src = videoSrc;
          if (posterSrc) mainVideo.poster = posterSrc;
          else mainVideo.removeAttribute("poster");
          mainVideo.load();
          setVideoControlsVisible(true);
          updateVideoSoundIcon();
          if (videoProgressFill) videoProgressFill.style.width = "0%";

          if (autoplay) {
            const playPromise = mainVideo.play();
            if (playPromise?.catch) playPromise.catch(() => {});
          }
        }

        function setGalleryItem(index) {
          const button = thumbnailButtons[index];
          if (!button) return;

          activeGalleryIndex = index;
          thumbnailButtons.forEach((item) => item.classList.toggle("is-active", item === button));

          const type = button.getAttribute("data-gallery-type") || "image";
          if (type === "video") {
            showGalleryVideo(button, true);
            return;
          }

          showGalleryImage(button);
        }

        function updateVariantGalleryImage(variantButton) {
          if (!variantGalleryThumb || !variantButton) return;
          const imageUrl = variantButton.getAttribute("data-variant-image-url") || "";
          const thumbnailUrl = variantButton.getAttribute("data-variant-thumbnail-url") || imageUrl;
          if (!imageUrl) return;

          const variantName = variantButton.getAttribute("data-variant-name") || "";
          const image = variantGalleryThumb.querySelector("img");
          variantGalleryThumb.setAttribute("data-gallery-variant-id", variantButton.getAttribute("data-variant-id") || "");
          variantGalleryThumb.setAttribute("data-gallery-src", imageUrl);
          variantGalleryThumb.setAttribute("data-gallery-alt", variantName);
          if (image) {
            image.src = thumbnailUrl;
            image.alt = variantName;
          }

          if (variantGalleryThumb.classList.contains("is-active")) {
            showGalleryImage(variantGalleryThumb);
          }
        }

        function openLightbox() {
          const activeButton = thumbnailButtons[activeGalleryIndex];
          if ((activeButton?.getAttribute("data-gallery-type") || "image") === "video") return;
          if (!mainImage || !lightbox || !lightboxImage) return;
          if (mainImage.hidden || !mainImage.src) return;

          lightboxImage.src = activeButton?.getAttribute("data-gallery-src") || mainImage.src;
          lightboxImage.alt = mainImage.alt || "";
          lightbox.classList.add("open");
          document.body.style.overflow = "hidden";
        }

        function closeLightbox() {
          lightbox?.classList.remove("open");
          document.body.style.overflow = "";
        }

        function shiftLightbox(step) {
          if (!thumbnailButtons.length) return;
          for (let offset = 1; offset <= thumbnailButtons.length; offset += 1) {
            const nextIndex = (activeGalleryIndex + step * offset + thumbnailButtons.length) % thumbnailButtons.length;
            const nextButton = thumbnailButtons[nextIndex];
            if ((nextButton?.getAttribute("data-gallery-type") || "image") === "video") continue;
            setGalleryItem(nextIndex);
            return;
          }
        }

        if (thumbnailButtons.length < 2) {
          lightboxPrev?.setAttribute("hidden", "");
          lightboxNext?.setAttribute("hidden", "");
        }

        thumbnailButtons.forEach((button, index) => {
          button.addEventListener("click", () => setGalleryItem(index));
          button.addEventListener("dblclick", () => {
            if ((button.getAttribute("data-gallery-type") || "image") !== "video") openLightbox();
          });
        });

        galleryFrame?.addEventListener("click", () => {
          if (mainImage && !mainImage.hidden) openLightbox();
        });

        mainVideo?.addEventListener("click", () => {
          if (mainVideo.paused) {
            const playPromise = mainVideo.play();
            if (playPromise?.catch) playPromise.catch(() => {});
            return;
          }
          mainVideo.pause();
        });

        mainVideo?.addEventListener("timeupdate", updateVideoProgress);
        mainVideo?.addEventListener("loadedmetadata", updateVideoProgress);

        videoSoundToggle?.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!mainVideo) return;
          mainVideo.muted = !mainVideo.muted;
          updateVideoSoundIcon();
        });

        const initialActiveGalleryButton = thumbnailButtons[activeGalleryIndex];
        if ((initialActiveGalleryButton?.getAttribute("data-gallery-type") || "image") === "video") {
          showGalleryVideo(initialActiveGalleryButton, false);
        } else {
          setVideoControlsVisible(false);
        }

        lightboxClose?.addEventListener("click", closeLightbox);
        lightbox?.addEventListener("click", (event) => {
          if (event.target === lightbox) closeLightbox();
        });
        lightboxPrev?.addEventListener("click", () => shiftLightbox(-1));
        lightboxNext?.addEventListener("click", () => shiftLightbox(1));

        document.addEventListener("keydown", (event) => {
          if (!lightbox?.classList.contains("open")) return;
          if (event.key === "Escape") closeLightbox();
          if (event.key === "ArrowLeft") shiftLightbox(-1);
          if (event.key === "ArrowRight") shiftLightbox(1);
        });

        const quantityInput = document.getElementById("input-quantity");
        const quantityMinus = document.getElementById("js_quantity_minus");
        const quantityPlus = document.getElementById("js_quantity_plus");
        const productPrice = document.getElementById("js_product_price");
        const productPriceCurrent = document.getElementById("js_product_price_current");
        const productPriceOld = document.getElementById("js_product_price_old");
        const productPriceSaving = document.getElementById("js_product_price_saving");
        const productPricePercent = document.querySelector(".product-info__price-percent");

        function parsePriceValue(value) {
          const normalized = `${value || ""}`.replace(",", ".");
          const parsed = Number.parseFloat(normalized);
          return Number.isFinite(parsed) ? parsed : 0;
        }

        function formatPriceValue(value) {
          return `${Math.round(value).toLocaleString("uk-UA").replace(/\u00a0/g, "\u202F")}₴`;
        }

        function tickProductPrice(element, text) {
          if (!element) return;
          element.classList.remove("is-ticking");
          void element.offsetWidth;
          element.textContent = text;
          element.classList.add("is-ticking");
          element.addEventListener("animationend", () => element.classList.remove("is-ticking"), { once: true });
        }

        function updateProductPriceForQuantity(quantity) {
          if (!productPrice || !productPriceCurrent) return;
          const unitPrice = parsePriceValue(productPrice.getAttribute("data-unit-price"));
          const unitOldPrice = parsePriceValue(productPrice.getAttribute("data-unit-old-price"));
          const unitSaving = parsePriceValue(productPrice.getAttribute("data-unit-saving"));

          tickProductPrice(productPriceCurrent, formatPriceValue(unitPrice * quantity));
          if (productPriceOld && unitOldPrice > 0) {
            productPriceOld.textContent = formatPriceValue(unitOldPrice * quantity);
          }
          if (productPriceSaving && unitSaving > 0) {
            productPriceSaving.textContent = `вы экономите ${formatPriceValue(unitSaving * quantity)}`;
          }
        }

        function normalizeQuantity(value) {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }

        function setQuantity(value) {
          if (!quantityInput) return 1;
          const nextQuantity = normalizeQuantity(value);
          quantityInput.value = `${nextQuantity}`;
          updateProductPriceForQuantity(nextQuantity);
          return nextQuantity;
        }

        quantityMinus?.addEventListener("click", () => {
          setQuantity(normalizeQuantity(quantityInput?.value) - 1);
        });

        quantityPlus?.addEventListener("click", () => {
          setQuantity(normalizeQuantity(quantityInput?.value) + 1);
        });

        quantityInput?.addEventListener("change", () => {
          setQuantity(quantityInput.value);
        });

        const collapsibleTriggers = [...document.querySelectorAll("[data-collapsible-trigger]")];

        function setCollapsibleHeight(panel) {
          if (!panel || panel.classList.contains("is-collapsed")) return;
          panel.style.height = "auto";
        }

        function openCollapsiblePanel(panel) {
          if (!panel) return;
          panel.style.height = "0px";
          panel.classList.remove("is-collapsed");
          const targetHeight = panel.scrollHeight;
          requestAnimationFrame(() => {
            panel.style.height = `${targetHeight}px`;
          });
        }

        function closeCollapsiblePanel(panel) {
          if (!panel) return;
          panel.style.height = `${panel.scrollHeight}px`;
          panel.offsetHeight;
          requestAnimationFrame(() => {
            panel.style.height = "0px";
            panel.classList.add("is-collapsed");
          });
        }

        collapsibleTriggers.forEach((trigger) => {
          const panel = document.getElementById(trigger.getAttribute("data-collapsible-trigger"));
          if (!panel) return;

          setCollapsibleHeight(panel);

          trigger.addEventListener("click", () => {
            const isOpen = trigger.getAttribute("aria-expanded") === "true";
            trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");

            if (isOpen) {
              closeCollapsiblePanel(panel);
              return;
            }

            openCollapsiblePanel(panel);
          });
        });

        window.addEventListener("resize", () => {
          collapsibleTriggers.forEach((trigger) => {
            const panel = document.getElementById(trigger.getAttribute("data-collapsible-trigger"));
            setCollapsibleHeight(panel);
          });
        });

        document.querySelectorAll(".product-info__collapsible").forEach((panel) => {
          panel.addEventListener("transitionend", (event) => {
            if (event.propertyName !== "height" || panel.classList.contains("is-collapsed")) return;
            panel.style.height = "auto";
          });
        });

        function syncProductGalleryHeaderState() {
          const header = document.querySelector(".site-header");
          document.body.classList.toggle(
            "is-product-header-hidden",
            header?.classList.contains("is-hidden")
          );
        }

        syncProductGalleryHeaderState();
        window.addEventListener("load", syncProductGalleryHeaderState);
        window.addEventListener("scroll", syncProductGalleryHeaderState, { passive: true });
        window.addEventListener("resize", syncProductGalleryHeaderState);
        document.querySelectorAll(".site-header").forEach((header) => {
          header.addEventListener("transitionend", syncProductGalleryHeaderState);
        });

        const variantButtons = [...document.querySelectorAll(".product-info__variant")];
        const availableVariantButtons = variantButtons.filter((button) => !button.disabled);
        const variantGroups = [...document.querySelectorAll(".product-info__variant-group")];
        const skuPayload = JSON.parse(document.getElementById("product_sku_payload")?.dataset.skuPayload || "[]");
        let selectedProductSkuId = null;
        const initialGalleryVariantId = variantGalleryThumb?.getAttribute("data-gallery-variant-id") || "";
        const urlParams = new URLSearchParams(window.location.search);
        const requestedVariantIds = new Set([
          ...urlParams.getAll("variant_id"),
          ...(urlParams.get("variant_ids") || "").split(","),
        ].filter(Boolean));

        function updateSelectedVariantName(group) {
          const labelValue = group?.querySelector("[data-selected-variant-name]");
          if (!labelValue) return;
          const activeButton = group.querySelector(".product-info__variant.is-active");
          labelValue.textContent = activeButton?.getAttribute("data-variant-name") || "";
        }

        function findSelectedSku() {
          if (!skuPayload.length) return null;
          const selectedOptionIds = getSelectedSkuOptionIds();
          if (!selectedOptionIds.length) return null;
          return skuPayload.find((sku) => {
            const skuOptionIds = [...(sku.option_ids || [])].map(Number).sort((a, b) => a - b);
            return skuOptionIds.length === selectedOptionIds.length && skuOptionIds.every((id, index) => id === selectedOptionIds[index]);
          }) || null;
        }

        function getSelectedSkuOptionIds() {
          return [...document.querySelectorAll(".product-info__variant.is-active")]
            .map((variant) => Number(variant.getAttribute("data-variant-option-id")))
            .filter(Boolean)
            .sort((a, b) => a - b);
        }

        function updateProductPriceUnit(price, oldPrice) {
          if (!productPrice || !productPriceCurrent) return;
          productPrice.setAttribute("data-unit-price", price || 0);
          productPrice.setAttribute("data-unit-old-price", oldPrice || "");
          const saving = oldPrice && oldPrice > price ? oldPrice - price : 0;
          productPrice.setAttribute("data-unit-saving", saving || "");
          const discount = saving && oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0;
          productPrice.classList.toggle("product-info__price--discount", discount > 0);
          if (productPricePercent) productPricePercent.textContent = discount > 0 ? `-${discount}%` : "";
          updateProductPriceForQuantity(setQuantity(quantityInput?.value));
        }

        function setProductPurchaseState({ text, disabled, showQuantity = false }) {
          const cartButton = document.getElementById("js_add_to_cart");
          const quantity = document.querySelector(".product-info__quantity");
          if (cartButton) {
            cartButton.disabled = Boolean(disabled);
            cartButton.classList.toggle("product-info__button--disabled", Boolean(disabled));
            cartButton.setAttribute("aria-disabled", disabled ? "true" : "false");
            const buttonText = cartButton.querySelector("[data-cart-button-text]");
            if (buttonText && text) buttonText.textContent = text;
          }
          if (quantity) quantity.hidden = !showQuantity;
        }

        function syncSelectedSkuState() {
          if (!skuPayload.length) return;
          const requiredVariantGroupCount = variantGroups.filter((group) => group.querySelector(".product-info__variant")).length;
          const selectedOptionIds = getSelectedSkuOptionIds();
          if (selectedOptionIds.length < requiredVariantGroupCount) {
            selectedProductSkuId = null;
            setProductPurchaseState({
              text: "Выберите вариант товара",
              disabled: true,
              showQuantity: false,
            });
            return;
          }

          const sku = findSelectedSku();
          selectedProductSkuId = sku?.id || null;
          if (!sku) {
            setProductPurchaseState({
              text: "Такой комбинации нет",
              disabled: true,
              showQuantity: false,
            });
            return;
          }

          updateProductPriceUnit(Number(sku.price || 0), Number(sku.old_price || 0));
          const unavailable = !sku.available || Number(sku.stock || 0) <= 0;
          setProductPurchaseState({
            text: unavailable ? "Нет в наличии" : "Купить",
            disabled: unavailable,
            showQuantity: !unavailable,
          });
        }

        variantGroups.forEach((group) => {
          const groupButtons = [...group.querySelectorAll(".product-info__variant")];
          const availableGroupButtons = groupButtons.filter((button) => !button.disabled);
          const requestedButton = availableGroupButtons.find((button) => requestedVariantIds.has(button.getAttribute("data-variant-id")));
          const initialGalleryButton = availableGroupButtons.find((button) => button.getAttribute("data-variant-id") === initialGalleryVariantId);
          (skuPayload.length ? requestedButton : (requestedButton || initialGalleryButton || availableGroupButtons[0]))?.classList.add("is-active");
          updateSelectedVariantName(group);
        });
        syncSelectedSkuState();

        variantButtons.forEach((button) => {
          button.addEventListener("click", () => {
            if (button.disabled) return;
            const group = button.closest(".product-info__variant-group");
            group?.querySelectorAll(".product-info__variant").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            updateSelectedVariantName(group);
            updateVariantGalleryImage(button);
            syncSelectedSkuState();
            syncStickyProductBar();
          });
        });

        document.getElementById("js_product_code_copy")?.addEventListener("click", async () => {
          const code = document.getElementById("js_product_code")?.getAttribute("data-product-code");
          if (!code) return;

          try {
            await navigator.clipboard.writeText(code);
            showToast("Код товара скопирован");
          } catch {
            showToast("Не удалось скопировать код", true);
          }
        });

        async function addToCart() {
          const button = document.getElementById("js_add_to_cart");
          if (button?.disabled) return false;
          const productId = Number(button?.getAttribute("data-product-id"));
          if (skuPayload.length && !selectedProductSkuId) {
            syncSelectedSkuState();
            showToast("Выберите вариант товара", true);
            return false;
          }
          if (!skuPayload.length) {
            variantGroups.forEach((group) => {
              if (group.querySelector(".product-info__variant.is-active")) return;
              const firstAvailable = [...group.querySelectorAll(".product-info__variant")].find((item) => !item.disabled);
              firstAvailable?.classList.add("is-active");
            });
          }

          const selectedVariants = [...document.querySelectorAll(".product-info__variant.is-active")];
          const requiredVariantGroupCount = variantGroups.filter((group) => group.querySelector(".product-info__variant:not(:disabled)")).length;

          if (variantButtons.length && selectedVariants.length < requiredVariantGroupCount) {
            showToast("Выберите варианты товара", true);
            return false;
          }
          const selectedVariantIds = selectedVariants.map((variant) => Number(variant.getAttribute("data-variant-id")));

          const response = await fetch("/api/cart/add/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": csrfToken,
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              product_id: productId,
              product_sku_id: selectedProductSkuId,
              variant_id: selectedVariantIds[0] || null,
              variant_ids: selectedVariantIds,
              quantity: setQuantity(quantityInput?.value),
            }),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (data.error === "out_of_stock") {
              const buttonText = button?.querySelector("[data-cart-button-text]");
              button?.classList.add("product-info__button--disabled");
              if (button) {
                button.disabled = true;
                button.setAttribute("aria-disabled", "true");
                button.closest(".product-info__actions")?.classList.add("product-info__actions--unavailable");
              }
              if (buttonText) buttonText.textContent = "Нет в наличии";
              document.querySelector(".product-info__quantity")?.setAttribute("hidden", "");
              showToast(data.message || "Товар закончился", true);
              return false;
            }
            showToast(data.message || data.error || "Не удалось добавить товар", true);
            return false;
          }

          window._shopPanel?.refreshCart?.();
          window._shopPanel?.updateCartCounters?.(data.cart?.total_quantity || 0);

          if (button) {
            const buttonText = button.querySelector("[data-cart-button-text]");
            const original = buttonText?.textContent || "Добавить в корзину";
            button.classList.add("is-success");
            if (buttonText) buttonText.textContent = "Добавлено";
            setTimeout(() => {
              button.classList.remove("is-success");
              if (buttonText) buttonText.textContent = original;
            }, 1600);
          }

          return true;
        }

        document.getElementById("js_add_to_cart")?.addEventListener("click", () => addToCart());

        document.getElementById("js_wishlist_btn")?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          const likeUrl = button.getAttribute("data-like-url");

          const response = await fetch(likeUrl, {
            method: "POST",
            headers: {
              "X-CSRFToken": csrfToken,
              "X-Requested-With": "XMLHttpRequest",
            },
          });

          if (response.status === 401 || response.status === 403) {
            showToast("Войдите в аккаунт", true);
            return;
          }

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            showToast("Не удалось обновить избранное", true);
            return;
          }

          button.classList.toggle("is-active", Boolean(data.liked));
          button.setAttribute("aria-pressed", data.liked ? "true" : "false");
          window._shopPanel?.refreshFavorites?.();
          showToast(data.liked ? "Добавлено в избранное" : "Удалено из избранного");
        });

        const stickyProductBar = document.querySelector("[data-sticky-product-bar]");
        const stickyProductImage = stickyProductBar?.querySelector("[data-sticky-product-image]");
        const stickyProductTitle = stickyProductBar?.querySelector("[data-sticky-product-title]");
        const stickyProductRatingWrap = stickyProductBar?.querySelector("[data-sticky-product-rating-wrap]");
        const stickyProductRating = stickyProductBar?.querySelector("[data-sticky-product-rating]");
        const stickyProductPriceCurrent = stickyProductBar?.querySelector("[data-sticky-product-price-current]");
        const stickyProductPriceOld = stickyProductBar?.querySelector("[data-sticky-product-price-old]");
        const stickyProductCart = stickyProductBar?.querySelector("[data-sticky-product-cart]");
        const stickyProductFavorite = stickyProductBar?.querySelector("[data-sticky-product-favorite]");
        const stickyTriggerSection = document.querySelector("#product-reviews, .product-cross-sell, .related-products");
        const productTitle = document.querySelector(".product-info__title");
        const mainCartButton = document.getElementById("js_add_to_cart");
        const mainFavoriteButton = document.getElementById("js_wishlist_btn");
        const mainReviewsText = document.querySelector(".product-info__reviews-text");
        const mainReviewsSummary = document.querySelector(".product-reviews__summary");

        function syncStickyProductImage() {
          if (!stickyProductImage) return;
          const activeVariantImage = document.querySelector(".product-info__variant.is-active[data-variant-image-url]")?.getAttribute("data-variant-image-url") || "";
          const activeGalleryButton = document.querySelector(".product-gallery__thumb.is-active");
          const galleryImage = activeGalleryButton?.getAttribute("data-gallery-src") || "";
          const imageSrc = activeVariantImage || galleryImage || mainImage?.src || "";
          if (!imageSrc) {
            stickyProductImage.hidden = true;
            return;
          }
          stickyProductImage.hidden = false;
          stickyProductImage.src = imageSrc;
          stickyProductImage.alt = productTitle?.textContent?.trim() || "";
        }

        function syncStickyProductPrice() {
          if (stickyProductPriceCurrent && productPriceCurrent) {
            stickyProductPriceCurrent.textContent = productPriceCurrent.textContent.trim();
          }
          const hasDiscount = productPrice?.classList.contains("product-info__price--discount");
          if (stickyProductPriceOld && productPriceOld) {
            stickyProductPriceOld.textContent = productPriceOld.textContent.trim();
            stickyProductPriceOld.hidden = !hasDiscount || !productPriceOld.textContent.trim();
          }
        }

        function syncStickyProductActions() {
          if (stickyProductCart && mainCartButton) {
            const mainText = mainCartButton.querySelector("[data-cart-button-text]")?.textContent?.trim() || "Добавить в корзину";
            stickyProductCart.innerHTML = `
              <span class="sticky-product-bar__cart-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 19V5"></path>
                  <path d="M6 11l6-6 6 6"></path>
                </svg>
              </span>
              <span>${mainText}</span>
            `;
            stickyProductCart.disabled = false;
            stickyProductCart.classList.toggle("is-disabled-look", mainCartButton.disabled);
            stickyProductCart.setAttribute("aria-disabled", mainCartButton.disabled ? "true" : "false");
          }
          if (stickyProductFavorite && mainFavoriteButton) {
            const isActive = mainFavoriteButton.classList.contains("is-active");
            stickyProductFavorite.classList.toggle("is-active", isActive);
            stickyProductFavorite.setAttribute("aria-pressed", isActive ? "true" : "false");
          }
        }

        function syncStickyProductBar() {
          if (!stickyProductBar) return;
          stickyProductBar.hidden = false;
          if (stickyProductTitle && productTitle) stickyProductTitle.textContent = productTitle.textContent.trim();
          const reviewsText = mainReviewsText?.textContent?.trim() || mainReviewsSummary?.textContent?.trim() || "";
          if (stickyProductRating && reviewsText) {
            stickyProductRating.textContent = reviewsText
              .trim()
              .replace(/^★\s*/, "");
            if (stickyProductRatingWrap) stickyProductRatingWrap.hidden = false;
          } else if (stickyProductRatingWrap) {
            stickyProductRatingWrap.hidden = true;
          }
          syncStickyProductImage();
          syncStickyProductPrice();
          syncStickyProductActions();
        }

        function syncStickyProductBarVisibility() {
          if (!stickyProductBar || !stickyTriggerSection) {
            const wasActive = document.body.classList.contains("product_sticky_bar_active");
            document.body.classList.remove("product_sticky_bar_active");
            if (wasActive) window.dispatchEvent(new CustomEvent("product-sticky-bar-change"));
            return;
          }
          const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 90;
          const infoLineHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--info-line-height")) || 32;
          const triggerTop = stickyTriggerSection.getBoundingClientRect().top + window.scrollY;
          const shouldShow = window.scrollY >= triggerTop - headerHeight - infoLineHeight - 48;
          const wasActive = document.body.classList.contains("product_sticky_bar_active");
          document.body.classList.toggle("product_sticky_bar_active", shouldShow);
          if (wasActive !== shouldShow) window.dispatchEvent(new CustomEvent("product-sticky-bar-change"));
          if (shouldShow) syncStickyProductBar();
        }

        function scrollToProductTop() {
          document.querySelector(".product-detail__hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        stickyProductCart?.addEventListener("click", scrollToProductTop);

        stickyProductFavorite?.addEventListener("click", () => {
          mainFavoriteButton?.click();
        });

        if (stickyProductBar) {
          const stickyObserver = new MutationObserver(syncStickyProductBar);
          [productPrice, productPriceCurrent, productPriceOld, productPriceSaving, mainCartButton, mainFavoriteButton, mainImage].forEach((target) => {
            if (target) stickyObserver.observe(target, { attributes: true, childList: true, subtree: true, characterData: true });
          });
          syncStickyProductBar();
          syncStickyProductBarVisibility();
          window.addEventListener("scroll", syncStickyProductBarVisibility, { passive: true });
          window.addEventListener("resize", syncStickyProductBarVisibility);
        }

        const productReviews = document.getElementById("product-reviews");
        const productReviewsToggle = document.getElementById("js_product_reviews_toggle");
        const productReviewsLink = document.getElementById("js_product_reviews_link");
        const productReviewCards = [...document.querySelectorAll("#js_product_reviews_body .review-card")];
        const productReviewsPagination = document.getElementById("js_product_reviews_pagination");
        const productReviewsPrev = document.getElementById("js_product_reviews_prev");
        const productReviewsNext = document.getElementById("js_product_reviews_next");
        const productReviewsPageInfo = document.getElementById("js_product_reviews_page_info");
        const productReviewsPerPage = 10;
        let currentProductReviewsPage = 1;
        const totalProductReviewPages = Math.ceil(productReviewCards.length / productReviewsPerPage);

        function renderProductReviewsPage() {
          if (!productReviewCards.length) return;
          const reviewsAreOpen = productReviews?.classList.contains("is-open");
          const start = (currentProductReviewsPage - 1) * productReviewsPerPage;
          const end = start + productReviewsPerPage;

          productReviewCards.forEach((card, index) => {
            card.hidden = index < start || index >= end;
          });

          if (productReviewsPagination) {
            productReviewsPagination.hidden = !reviewsAreOpen || totalProductReviewPages <= 1;
          }
          if (productReviewsPrev) {
            productReviewsPrev.disabled = currentProductReviewsPage === 1;
          }
          if (productReviewsNext) {
            productReviewsNext.disabled = currentProductReviewsPage === totalProductReviewPages;
          }
          if (productReviewsPageInfo) {
            productReviewsPageInfo.textContent = `${currentProductReviewsPage} / ${totalProductReviewPages}`;
          }
        }

        function setProductReviewsOpen(open) {
          if (!productReviews || !productReviewsToggle) return;
          productReviews.classList.toggle("is-open", open);
          productReviewsToggle.setAttribute("aria-expanded", open ? "true" : "false");
          productReviewsToggle.textContent = open ? "Скрыть" : "Показать";
          renderProductReviewsPage();
        }

        renderProductReviewsPage();

        productReviewsToggle?.addEventListener("click", () => {
          setProductReviewsOpen(!productReviews?.classList.contains("is-open"));
        });

        productReviews?.addEventListener("click", (event) => {
          if (productReviews.classList.contains("is-open")) return;
          const interactiveTarget = event.target.closest("button, a, input, textarea, select, label, .review-card");
          if (interactiveTarget) return;
          setProductReviewsOpen(true);
        });

        function openProductReviewsAndScroll() {
          setProductReviewsOpen(true);
          productReviews?.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        productReviewsPrev?.addEventListener("click", () => {
          if (currentProductReviewsPage <= 1) return;
          currentProductReviewsPage -= 1;
          renderProductReviewsPage();
        });

        productReviewsNext?.addEventListener("click", () => {
          if (currentProductReviewsPage >= totalProductReviewPages) return;
          currentProductReviewsPage += 1;
          renderProductReviewsPage();
        });

        productReviewsLink?.addEventListener("click", (event) => {
          event.preventDefault();
          openProductReviewsAndScroll();
        });

        stickyProductRatingWrap?.addEventListener("click", () => {
          openProductReviewsAndScroll();
        });

        document.querySelectorAll("[data-review-helpful-id]").forEach((button) => {
          button.addEventListener("click", async () => {
            const reviewId = button.getAttribute("data-review-helpful-id");
            const response = await fetch(`/api/reviews/${reviewId}/vote/`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken,
                "X-Requested-With": "XMLHttpRequest",
              },
              body: JSON.stringify({ vote: "up" }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              showToast("Не удалось обновить отзыв", true);
              return;
            }
            button.classList.toggle("is-liked", Boolean(data.liked));
            const counter = button.querySelector("span");
            if (counter) counter.textContent = data.helpful;
          });
        });

      })();
