class AdaptiveAccountButton {
        constructor(buttonElement) {
          this.button = buttonElement;
          this.originalText = buttonElement?.querySelector(".account_button_text_original");
          this.hoverText = buttonElement?.querySelector(".account_button_text_hover");
          this.measurer = null;

          if (!this.button || !this.originalText || !this.hoverText) return;

          this.createMeasurer();
          this.measureWidths();
          this.updateWidth();
          this.bindEvents();
        }

        createMeasurer() {
          this.measurer = document.createElement("div");
          this.measurer.className = "text_measurer";
          document.body.appendChild(this.measurer);
        }

        measureLine(textElement) {
          this.measurer.innerHTML = "";
          textElement.querySelectorAll("span").forEach((span) => {
            this.measurer.appendChild(span.cloneNode(true));
          });
          return this.measurer.offsetWidth;
        }

        getBaseWidth() {
          const viewportWidthUnit = window.innerWidth * 0.01;
          return 40 + 2.5 * viewportWidthUnit;
        }

        measureWidths() {
          this.originalWidth = this.measureLine(this.originalText);
          this.hoverWidth = this.measureLine(this.hoverText);
        }

        updateWidth() {
          if (this.button.classList.contains("compact")) return;
          const base = this.getBaseWidth();
          this.button.style.width = base + this.originalWidth + "px";
        }

        setHoverWidth() {
          if (this.button.classList.contains("compact")) return;
          const base = this.getBaseWidth();
          this.button.style.width = base + this.hoverWidth + "px";
        }

        // Метод, вызываемый поиском
        setCompactMode(isCompact) {
          if (isCompact) {
            // Фиксируем текущую вычисленную ширину как inline, чтобы CSS transition имел точку отсчёта
            this.button.style.width = this.button.getBoundingClientRect().width + "px";
            // Один rAF — браузер рисует кадр с зафиксированной шириной, затем меняем на compact
            requestAnimationFrame(() => {
              this.button.style.width = "";
              this.button.classList.add("compact");
            });
          } else {
            this.button.classList.remove("compact");
            // Восстанавливаем инлайн-стиль в зависимости от ховера
            if (this.button.matches(":hover")) {
              this.setHoverWidth();
            } else {
              this.updateWidth();
            }
          }
        }

        shouldBeCompact() {
          return window.innerWidth <= 1200;
        }

        applyCompact() {
          const compact = this.shouldBeCompact();
          if (compact === this.button.classList.contains("compact")) return;
          this.setCompactMode(compact);
        }

        bindEvents() {
          this.button.addEventListener("mouseenter", () => this.setHoverWidth());
          this.button.addEventListener("mouseleave", () => this.updateWidth());

          window.addEventListener("resize", () => {
            this.measureWidths();
            this.applyCompact();
            if (!this.button.classList.contains("compact")) {
              if (this.button.matches(":hover")) {
                this.setHoverWidth();
              } else {
                this.updateWidth();
              }
            }
          });

          this.applyCompact();
        }
      }

      class HeaderProductSearchResults {
        constructor(input, dropdown, options = {}) {
          this.input = input;
          this.dropdown = dropdown;
          this.onSelect = options.onSelect || null;
          this.debounceId = null;
          this.abortController = null;

          if (!this.input || !this.dropdown) return;
          this.bindEvents();
        }

        bindEvents() {
          this.input.addEventListener("input", () => this.handleInput());
          this.input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              const query = this.getQuery();
              if (!query) return;
              event.preventDefault();
              this.goToCatalog(query);
            }
            if (event.key === "Escape") {
              this.hide();
            }
          });
        }

        getQuery() {
          return String(this.input.value || "").trim().replace(/\s+/g, " ");
        }

        shouldSearch(query) {
          return query.length >= 2 || /^\d+$/.test(query);
        }

        catalogUrl(query) {
          const params = new URLSearchParams();
          params.set("q", query);
          params.set("search", "1");
          return `/catalog/?${params.toString()}`;
        }

        goToCatalog(query = this.getQuery()) {
          if (!query) return;
          window.location.href = this.catalogUrl(query);
        }

        handleInput() {
          const query = this.getQuery();
          window.clearTimeout(this.debounceId);

          if (!query) {
            this.hide();
            return;
          }

          if (!this.shouldSearch(query)) {
            this.renderMessage("Введите минимум 2 символа");
            return;
          }

          this.debounceId = window.setTimeout(() => this.fetchResults(query), 280);
        }

        fetchResults(query) {
          this.abortController?.abort();
          this.abortController = new AbortController();
          this.renderMessage("Ищем...");

          fetch(`/api/search/products/?q=${encodeURIComponent(query)}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
            signal: this.abortController.signal,
          })
            .then((response) => response.ok ? response.json() : Promise.reject(response))
            .then((data) => this.renderResults(query, data))
            .catch((error) => {
              if (error?.name === "AbortError") return;
              this.renderMessage("Поиск временно недоступен");
            });
        }

        escapeHtml(value) {
          return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
          })[char]);
        }

        formatPrice(value) {
          return `${Number(value || 0).toLocaleString("uk-UA")}₴`;
        }

        renderMessage(message) {
          this.dropdown.innerHTML = `
            <div class="header-search-results__empty">
              <div class="header-search-results__empty-title">${this.escapeHtml(message)}</div>
            </div>
          `;
          this.show();
        }

        renderResults(query, data) {
          const results = Array.isArray(data?.results) ? data.results : [];
          const total = Number(data?.total || 0);
          const catalogUrl = this.catalogUrl(query);

          if (!results.length) {
            this.dropdown.innerHTML = `
              <div class="header-search-results__empty">
                <div class="header-search-results__empty-title">Ничего не найдено</div>
                <a class="header-search-results__empty-link" href="${catalogUrl}">Перейти в каталог</a>
              </div>
            `;
            this.show();
            return;
          }

          this.dropdown.innerHTML = `
            <div class="header-search-results__list">
              ${results.map((product) => this.renderProduct(product)).join("")}
            </div>
            <div class="header-search-results__footer">
              <a href="${catalogUrl}">Показать все результаты${total > results.length ? ` (${total})` : ""}</a>
            </div>
          `;
          this.dropdown.querySelectorAll(".header-search-results__item").forEach((item) => {
            item.addEventListener("click", () => {
              this.onSelect?.();
            });
          });
          this.show();
        }

        renderProduct(product) {
          const image = product.image_url
            ? `<img class="header-search-results__image" src="${this.escapeHtml(product.image_url)}" alt="${this.escapeHtml(product.name)}" loading="lazy">`
            : `<span class="header-search-results__image" aria-hidden="true"></span>`;
          const statusHtml = product.available ? "" : '<span class="header-search-results__status">Нет в наличии</span>';
          return `
            <a class="header-search-results__item" href="${this.escapeHtml(product.url)}">
              ${image}
              <span class="header-search-results__content">
                <span class="header-search-results__name">${this.escapeHtml(product.name)}</span>
                <span class="header-search-results__meta">
                  <span>${this.escapeHtml(product.brand || "Без бренда")}</span>
                  <span>${this.escapeHtml(product.code || "")}</span>
                </span>
              </span>
              <span>
                <span class="header-search-results__price">${this.formatPrice(product.price)}</span>
                ${statusHtml}
              </span>
            </a>
          `;
        }

        show() {
          this.dropdown.classList.add("is-open");
        }

        hide() {
          this.dropdown.classList.remove("is-open");
          this.dropdown.innerHTML = "";
        }

        clear() {
          this.input.value = "";
          this.hide();
          window.clearTimeout(this.debounceId);
          this.abortController?.abort();
        }
      }

      class HeaderSearchController {
        constructor(accountButtonController) {
          this.accountButtonController = accountButtonController;
          this.searchRoot = document.querySelector("[data-search-shell]");
          this.openButton = document.querySelector("[data-search-open]");
          this.closeButton = document.querySelector("[data-search-close]");
          this.input = document.querySelector("[data-search-input]");
          this.results = document.querySelector("[data-search-results]");
          this.underline = document.querySelector(".header-search__underline");
          this.isOpen = false;

          if (!this.searchRoot || !this.openButton || !this.closeButton || !this.input) {
            return;
          }

          this.searchResults = new HeaderProductSearchResults(this.input, this.results, {
            onSelect: () => this.close(false),
          });
          this.bindEvents();
        }

        bindEvents() {
          this.openButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.open();
          });

          this.closeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.close();
          });

          this.input.addEventListener("focus", () => {
            if (this.isOpen && this.underline) {
              this.underline.style.transform = "scaleX(1)";
            }
          });

          this.input.addEventListener("blur", () => {
            if (this.isOpen && !this.input.value && this.underline) {
              this.underline.style.transform = "scaleX(0)";
            }
          });

          document.addEventListener("click", (event) => {
            if (this.isOpen && !this.searchRoot.contains(event.target) && !this.results?.contains(event.target)) {
              this.close();
            }
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.isOpen) {
              this.close();
            }
          });
        }

        open() {
          this.isOpen = true;
          this.searchRoot.classList.add("is-active");
          this.accountButtonController?.setCompactMode(true);

          window.setTimeout(() => {
            this.input.focus();
            if (this.underline) {
              this.underline.style.transform = "scaleX(1)";
            }
          }, 180);
        }

        close(clearInput = true) {
          this.isOpen = false;
          this.searchRoot.classList.remove("is-active");
          this.accountButtonController?.setCompactMode(false);
          if (clearInput) {
            this.searchResults?.clear();
          } else {
            this.searchResults?.hide();
          }

          window.setTimeout(() => {
            if (clearInput) this.input.value = "";
            this.input.blur();
            if (this.underline) {
              this.underline.style.transform = "scaleX(0)";
            }
          }, 140);
        }
      }

      class InfoLineController {
        constructor() {
          this.infoLine = document.querySelector("[data-info-line]");
          this.mobileCloseButton = document.querySelector("[data-info-line-mobile-close]");
          this.mobileBreakpoint = 900;
          this.items = document.querySelectorAll(".promo_banner_item");
          this.items.forEach((item) => {
            if (item.querySelector(":scope > .promo_banner_content")) return;
            const content = document.createElement("div");
            content.className = "promo_banner_content";
            while (item.firstChild) content.appendChild(item.firstChild);
            item.appendChild(content);
          });
          this.iconContainers = document.querySelectorAll(".promo_banner_icon_container");
          this.track = document.querySelector(".promo_banner_track");
          this.contents = document.querySelectorAll(".promo_banner_content");
          if (this.track) {
            this.track.style.animation = "none";
            this.contents.forEach((content) => {
              content.style.animation = "none";
            });
            void this.track.offsetWidth;
            this.track.style.animation = "";
            this.contents.forEach((content) => {
              content.style.animation = "";
            });
          }
          this.iconClassNames = ["promo_banner_icon_question", "promo_banner_icon_phone", "promo_banner_icon_telegram"];
          this.currentIconIndex = 0;
          this.iconIntervalId = null;

          // Состояния для отложенной паузы
          this.pauseTimeout = null;
          this.isPaused = false;
          this.waitingForCycleEnd = false;
          this.handleTrackMouseEnter = null;
          this.handleTrackMouseLeave = null;
          this.mobileDismissTimer = null;
          this.mobileDismissedForScroll = false;
          this.runtimePaused = document.hidden;
          this.handleRuntimeChange = (event) => {
            this.setRuntimePaused(document.hidden);
          };
          this.handleVisibilityChange = () => {
            this.setRuntimePaused(document.hidden);
          };
          this.handlePageMounted = () => {
            window.clearTimeout(this.mobileDismissTimer);
            document.body.classList.remove("is-mobile-info-line-dismissing");
            document.body.classList.remove("is-mobile-info-line-dismissed");
            if (this.infoLine) this.infoLine.style.visibility = "";
            this.syncInfoLineHeight();
          };
          this.handlePageReady = () => this.syncInfoLineHeight();

          window.addEventListener("header-runtime-change", this.handleRuntimeChange);
          window.addEventListener("wave:page-mounted", this.handlePageMounted);
          window.addEventListener("wave:page-ready", this.handlePageReady);
          document.addEventListener("visibilitychange", this.handleVisibilityChange);

          if (this.iconContainers.length && !this.runtimePaused) {
            this.startAnimation();
          }

          if (this.track) {
            this.bindHoverPause();
          }

          this.bindMobileClose();
        }

        isMobileViewport() {
          return window.innerWidth <= this.mobileBreakpoint;
        }

        bindMobileClose() {
          this.mobileCloseButton?.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!this.isMobileViewport() || !document.body.classList.contains("is-header-hidden")) return;
            window.clearTimeout(this.mobileDismissTimer);
            this.mobileDismissedForScroll = true;
            document.body.classList.add("is-mobile-info-line-dismissed-for-scroll");
            document.body.classList.add("is-mobile-info-line-dismissing");
            document.body.classList.add("is-mobile-info-line-dismissed");
            this.mobileDismissTimer = window.setTimeout(() => {
              this.syncInfoLineHeight();
              document.body.classList.remove("is-mobile-info-line-dismissing");
            }, 320);
          });

          window.addEventListener("resize", () => {
            if (this.isMobileViewport()) return;
            window.clearTimeout(this.mobileDismissTimer);
            this.mobileDismissedForScroll = false;
            document.body.classList.remove("is-mobile-info-line-dismissed-for-scroll");
            document.body.classList.remove("is-mobile-info-line-dismissing");
            document.body.classList.remove("is-mobile-info-line-dismissed");
            this.syncInfoLineHeight();
          });

          window.addEventListener("info-line-header-hidden", () => {
            if (!this.isMobileViewport() || (!this.mobileDismissedForScroll && !document.body.classList.contains("is-mobile-info-line-dismissed-for-scroll"))) return;
            document.body.classList.add("is-mobile-info-line-dismissed");
            this.syncInfoLineHeight();
          });

          window.addEventListener("info-line-restore", () => {
            window.clearTimeout(this.mobileDismissTimer);
            document.body.classList.remove("is-mobile-info-line-dismissing");
            document.body.classList.remove("is-mobile-info-line-dismissed");
            this.syncInfoLineHeight();
          });
        }

        syncInfoLineHeight() {
          window.requestAnimationFrame(() => {
            const height = document.body.classList.contains("is-header-hidden")
              && document.body.classList.contains("is-mobile-info-line-dismissed")
              ? 0
              : (this.infoLine?.offsetHeight || 32);
            document.documentElement.style.setProperty("--info-line-height", `${height}px`);
            window.dispatchEvent(new CustomEvent("info-line-layout-change"));
          });
        }

        startAnimation() {
          if (this.runtimePaused || this.iconIntervalId !== null || !this.iconContainers.length) {
            return;
          }

          const switchIcons = () => {
            if (![...this.iconContainers].every((container) => document.body.contains(container))) {
              this.destroy();
              return;
            }

            this.iconContainers.forEach((container) => {
              this.iconClassNames.forEach((className) => {
                const icon = container.querySelector(`.${className}`);
                if (icon) icon.style.opacity = "0";
              });

              const activeIcon = container.querySelector(`.${this.iconClassNames[this.currentIconIndex]}`);
              if (activeIcon) activeIcon.style.opacity = "1";
            });

            this.currentIconIndex = (this.currentIconIndex + 1) % this.iconClassNames.length;
          };

          switchIcons();
          this.iconIntervalId = window.setInterval(switchIcons, 1500);
        }

        setRuntimePaused(paused) {
          if (this.runtimePaused === paused) {
            return;
          }

          this.runtimePaused = paused;

          if (paused) {
            if (this.iconIntervalId !== null) {
              window.clearInterval(this.iconIntervalId);
              this.iconIntervalId = null;
            }

            if (this.pauseTimeout !== null) {
              window.clearTimeout(this.pauseTimeout);
              this.pauseTimeout = null;
            }

            this.waitingForCycleEnd = false;
            if (this.track) this.track.style.animationPlayState = "paused";
            return;
          }

          this.startAnimation();
          if (this.track && !this.isPaused) {
            this.track.style.animationPlayState = "running";
          }
        }

        bindHoverPause() {
          // Получаем длительность одного цикла анимации из CSS (в миллисекундах)
          const getAnimationDuration = () => {
            const style = getComputedStyle(this.track);
            const duration = parseFloat(style.animationDuration);
            return duration * 1000; // в мс
          };

          this.handleTrackMouseEnter = () => {
            // Если уже на паузе или уже ждём завершения цикла — ничего не делаем
            if (this.runtimePaused || this.isPaused || this.waitingForCycleEnd) return;

            const cycleDuration = getAnimationDuration();

            this.waitingForCycleEnd = true;

            this.pauseTimeout = setTimeout(() => {
              this.track.style.animationPlayState = "paused";
              this.isPaused = true;
              this.waitingForCycleEnd = false;
              this.pauseTimeout = null;
            }, cycleDuration);
          };

          this.handleTrackMouseLeave = () => {
            // Если мы ждали завершения цикла, но мышь ушла — отменяем таймер
            if (this.waitingForCycleEnd) {
              clearTimeout(this.pauseTimeout);
              this.pauseTimeout = null;
              this.waitingForCycleEnd = false;
            }

            // Если анимация была на паузе — возобновляем
            if (this.isPaused) {
              if (!this.runtimePaused) this.track.style.animationPlayState = "running";
              this.isPaused = false;
            }
          };

          this.track.addEventListener("mouseenter", this.handleTrackMouseEnter);
          this.track.addEventListener("mouseleave", this.handleTrackMouseLeave);
        }

        destroy() {
          if (this.iconIntervalId !== null) {
            window.clearInterval(this.iconIntervalId);
            this.iconIntervalId = null;
          }

          if (this.pauseTimeout !== null) {
            window.clearTimeout(this.pauseTimeout);
            this.pauseTimeout = null;
          }

          if (this.track && this.handleTrackMouseEnter) {
            this.track.removeEventListener("mouseenter", this.handleTrackMouseEnter);
          }

          if (this.track && this.handleTrackMouseLeave) {
            this.track.removeEventListener("mouseleave", this.handleTrackMouseLeave);
          }

          window.removeEventListener("header-runtime-change", this.handleRuntimeChange);
          window.removeEventListener("wave:page-mounted", this.handlePageMounted);
          window.removeEventListener("wave:page-ready", this.handlePageReady);
          document.removeEventListener("visibilitychange", this.handleVisibilityChange);
        }
      }

      class NavigationUnderlineController {
        constructor() {
          this.header = document.querySelector("[data-header]");
          this.navItems = [...document.querySelectorAll(".site-nav__item")];
          this.runtimePaused = document.hidden;
          this.resizeTimer = null;
          this.handleResize = () => {
            if (this.runtimePaused) return;
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => this.updateOffsets(), 120);
          };
          this.handleRuntimeChange = (event) => {
            const paused = Boolean(event.detail?.paused) || document.hidden;
            if (this.runtimePaused === paused) return;
            this.runtimePaused = paused;
            window.clearTimeout(this.resizeTimer);
            if (!paused) this.updateOffsets();
          };

          if (!this.header || !this.navItems.length) {
            return;
          }

          this.updateOffsets();
          window.addEventListener("resize", this.handleResize);
          window.addEventListener("header-runtime-change", this.handleRuntimeChange);
        }

        updateOffsets() {
          if (this.runtimePaused) return;

          const headerRect = this.header.getBoundingClientRect();
          const headerHeight = headerRect.height;

          this.navItems.forEach((navItem) => {
            const itemRect = navItem.getBoundingClientRect();
            const distanceToHeaderBottom = headerHeight - (itemRect.bottom - headerRect.top);
            const underlineOffset = Math.max(-distanceToHeaderBottom + 3, -85);
            navItem.style.setProperty("--nav-underline-offset", `${underlineOffset}px`);
          });
        }
      }

      class MegaMenuController {
        constructor() {
          this.headerModule = document.querySelector("[data-header-module]");
          this.menu = document.querySelector("[data-mega-menu-panel]");
          this.menuContainer = document.querySelector("[data-mega-menu-container]");
          this.header = document.querySelector("[data-header]");
          this.infoLine = document.querySelector("[data-info-line]");
          this.navItems = [...document.querySelectorAll(".site-nav__item")];
          this.activeTrigger = null;
          this.closeTimeoutId = null;
          this.catalogUrl = "/#products";
          this.enabled = this.headerModule?.dataset.megaMenuEnabled !== "false";

          if (!this.menu || !this.menuContainer || !this.header || !this.navItems.length) {
            return;
          }

          if (!this.enabled) {
            this.disable();
            return;
          }

          this.bindEvents();
        }

        disable() {
          this.menu.hidden = true;
          this.menu.classList.remove("is-active");
          this.header.classList.remove("is-mega-menu-open");
          document.getElementById("megaMenuOverlay")?.classList.remove("is-open");

          this.navItems.forEach((navItem) => {
            if (!navItem.hasAttribute("data-mega-menu-trigger")) return;
            navItem.classList.remove("site-nav__item--dropdown", "is-active");
            const anchor = navItem.querySelector("a");
            anchor?.removeAttribute("aria-haspopup");
            anchor?.removeAttribute("aria-expanded");
          });
        }

        bindEvents() {
          this.navItems.forEach((navItem) => {
            const anchor = navItem.querySelector("a");
            const sectionName = navItem.dataset.megaMenuSection;

            anchor?.addEventListener("click", (event) => {
              if (anchor.getAttribute("href") === "#") {
                event.preventDefault();
              }
            });

            navItem.addEventListener("mouseenter", () => {
              this.show(sectionName, navItem);
            });

            navItem.addEventListener("mouseleave", () => {
              if (!this.menu.matches(":hover")) {
                this.scheduleHide();
              }
            });
          });

          this.menu.addEventListener("mouseenter", () => {
            window.clearTimeout(this.closeTimeoutId);
          });

          this.menu.addEventListener("mouseleave", () => this.scheduleHide());
        }

        hide(force = false) {
          const closeMenu = () => {
            this.menu.classList.remove("is-active");
            this.header.classList.remove("is-mega-menu-open");

            if (this.activeTrigger) {
              this.activeTrigger.classList.remove("is-active");
              this.activeTrigger.querySelector("a")?.setAttribute("aria-expanded", "false");
            }

            if (this.infoLine) {
              this.infoLine.style.opacity = "1";
              this.infoLine.style.visibility = "visible";
            }

            this.activeTrigger = null;
            // hide mega menu overlay when menu closed
            const mmOverlayClose = document.getElementById("megaMenuOverlay");
            if (mmOverlayClose) mmOverlayClose.classList.remove("is-open");
          };

          window.clearTimeout(this.closeTimeoutId);

          if (force) {
            closeMenu();
            return;
          }

          this.closeTimeoutId = window.setTimeout(closeMenu, 150);
        }

        scheduleHide() {
          this.hide(false);
        }

        show(sectionName, navItem) {
          if (!sectionName) {
            return;
          }

          window.clearTimeout(this.closeTimeoutId);
          this.render(sectionName);

          this.navItems.forEach((item) => {
            item.classList.remove("is-active");
            item.querySelector("a")?.setAttribute("aria-expanded", "false");
          });

          navItem.classList.add("is-active");
          navItem.querySelector("a")?.setAttribute("aria-expanded", "true");
          this.activeTrigger = navItem;

          if (this.infoLine) {
            this.infoLine.style.opacity = "0";
            this.infoLine.style.visibility = "hidden";
          }

          this.menu.classList.add("is-active");
          this.header.classList.add("is-mega-menu-open");
          // show blur overlay for promo cards and collections layouts
          const mmOverlay = document.getElementById("megaMenuOverlay");
          if (mmOverlay) {
            if (this.menu.classList.contains("mega_menu_layout_promo_cards") || this.menu.classList.contains("mega_menu_layout_collections")) {
              mmOverlay.classList.add("is-open");
            } else {
              mmOverlay.classList.remove("is-open");
            }
          }
        }

        render(sectionName) {
          this.menu.classList.remove("mega_menu_layout_collections", "mega_menu_layout_promo_cards", "mega_menu_layout_brands_grid");

          if (sectionName === "collections") {
            this.menu.classList.add("mega_menu_layout_collections");
            this.menuContainer.innerHTML = this.createCollectionsMarkup();
            this.bindCollectionsInteractions();
            return;
          }

          if (sectionName === "site-nav__item--sale") {
            this.menu.classList.add("mega_menu_layout_promo_cards");
            this.menuContainer.innerHTML = this.createPromoCardsMarkup();
            this.bindPromoImageFallbacks();
            return;
          }
        }

        bindCollectionsInteractions() {
          const cards = [...this.menuContainer.querySelectorAll(".mega_menu_collection_card")];
          const banner = this.menuContainer.querySelector(".mega_menu_banner");
          const sneaker = this.menuContainer.querySelector(".mega_menu_banner_sneaker");

          cards.forEach((card) => {
            card.addEventListener("click", () => {
              window.location.href = this.catalogUrl;
            });
          });

          if (!banner || !sneaker) {
            return;
          }

          // Scale handled via CSS on .mega_menu_banner_sneaker_container
        }

        bindPromoImageFallbacks() {
          this.menuContainer.querySelectorAll(".mega_menu_promo_card").forEach((card) => {
            card.addEventListener("click", () => {
              window.location.href = this.catalogUrl;
            });
          });

          this.menuContainer.querySelectorAll(".mega_menu_promo_card .card_image").forEach((image) => {
            const handleError = () => {
              image.style.display = "none";
              const placeholder = image.nextElementSibling;
              if (placeholder?.classList.contains("card_image_placeholder")) {
                placeholder.style.display = "flex";
              }
            };

            image.addEventListener("error", handleError);

            if (image.complete && image.naturalHeight === 0) {
              handleError();
            }
          });
        }

        createCollectionsMarkup() {
          return `
      <div class="mega_menu_collections_container">
        <div class="mega_menu_collections_content">
          <div class="mega_menu_collection_banner">
            <div class="mega_menu_banner">
              <div class="mega_menu_banner_bg"></div>
              <div class="mega_menu_banner_decorative" style="top: 10%; left: 5%; animation-delay: 0s">NEW</div>
              <div class="mega_menu_banner_decorative" style="top: 8%; left: 45%; animation-delay: 2s">NEW</div>
              <div class="mega_menu_banner_decorative" style="top: 5%; left: 85%; animation-delay: 1.5s">NEW</div>
              <div class="mega_menu_banner_decorative" style="top: 85%; left: 5%; animation-delay: 0.7s">NEW</div>
              <div class="mega_menu_banner_decorative" style="top: 88%; left: 45%; animation-delay: 1s">NEW</div>
              <div class="mega_menu_banner_decorative" style="top: 86%; left: 85%; animation-delay: 1.9s">NEW</div>
              <div class="mega_menu_banner_symbol" style="top: 25%; left: 15%; animation-delay: 1.3s">✦</div>
              <div class="mega_menu_banner_symbol" style="top: 35%; left: 75%; animation-delay: 2.8s">✦</div>
              <div class="mega_menu_banner_bg_text">SUMMER'26</div>

              <div class="mega_menu_banner_particles">
                <div class="mega_menu_banner_particle" style="width: 4px; height: 4px; left: 15%; animation-delay: 0s"></div>
                <div class="mega_menu_banner_particle" style="width: 6px; height: 6px; left: 35%; animation-delay: 2s"></div>
                <div class="mega_menu_banner_particle" style="width: 3px; height: 3px; left: 55%; animation-delay: 4s"></div>
              </div>

              <div class="mega_menu_banner_content">
                <h2 class="mega_menu_banner_title">TASTE<br />IT</h2>
                <h3 class="mega_menu_banner_subtitle">SUMMER'26</h3>
                <button class="mega_menu_banner_button" type="button" onclick="window.location.href='${this.catalogUrl}'">КУПИТЬ</button>
              </div>

              <div class="mega_menu_banner_sneaker_container">
                <img class="mega_menu_banner_sneaker" src="/static/site/shared/img/liquid_for_pod.png" alt="Liquid for Pod" />
              </div>
            </div>
          </div>

          <div class="mega_menu_collections_section">
            <div class="mega_menu_collections_grid">
              <div class="mega_menu_collection_card active" data-collection="summer">
                <div class="mega_menu_card_bg_icon"><i class="fas fa-sun"></i></div>
                <div class="mega_menu_collection_icon"><i class="fas fa-sun"></i></div>
                <div class="mega_menu_collection_name">Summer'26</div>
                <div class="mega_menu_collection_subtitle">Новинки сезона</div>
              </div>

              <div class="mega_menu_collection_card" data-collection="wave">
                <div class="mega_menu_card_bg_icon mega_menu_card_bg_icon_system" aria-hidden="true"></div>
                <div class="mega_menu_collection_icon mega_menu_collection_icon_system" aria-hidden="true"></div>
                <div class="mega_menu_collection_name">POD системы</div>
                <div class="mega_menu_collection_subtitle">Выбери свой гаджет</div>
              </div>

              <div class="mega_menu_collection_card" data-collection="urban">
                <div class="mega_menu_card_bg_icon mega_menu_card_bg_icon_collection" aria-hidden="true"></div>
                <div class="mega_menu_collection_icon mega_menu_collection_icon_collection" aria-hidden="true"></div>
                <div class="mega_menu_collection_name">One-time</div>
                <div class="mega_menu_collection_subtitle">Одноразовые електронные сигареты</div>
              </div>

              <div class="mega_menu_collection_card" data-collection="campus">
                <div class="mega_menu_card_bg_icon mega_menu_card_bg_icon_liquid" aria-hidden="true"></div>
                <div class="mega_menu_collection_icon mega_menu_collection_icon_liquid" aria-hidden="true"></div>
                <div class="mega_menu_collection_name">Жидкости</div>
                <div class="mega_menu_collection_subtitle">Выбери свой вкус</div>
              </div>

              <div class="mega_menu_collection_card" data-collection="night">
                <div class="mega_menu_card_bg_icon mega_menu_card_bg_icon_pod" aria-hidden="true"></div>
                <div class="mega_menu_collection_icon mega_menu_collection_icon_pod" aria-hidden="true"></div>
                <div class="mega_menu_collection_name">Комплектующие</div>
                <div class="mega_menu_collection_subtitle">Лучшие компоненты</div>
              </div>

              <div class="mega_menu_collection_card" data-collection="street">
                <div class="mega_menu_card_bg_icon mega_menu_card_bg_icon_brand" aria-hidden="true"></div>
                <div class="mega_menu_collection_icon mega_menu_collection_icon_brand" aria-hidden="true"></div>
                <div class="mega_menu_collection_name">Бренды</div>
                <div class="mega_menu_collection_subtitle">Топовые бренды</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
        }
        createPromoCardsMarkup() {
          return `
      <div class="mega_menu_promo_cards_container">
        <div class="mega_menu_promo_cards_list">
          ${this.createPromoCard({
            className: "discount",
            title: "Максимальные скидки",
            subtitle: "до -30%",
            imageUrl: "https://i.pinimg.com/1200x/ed/5e/0f/ed5e0f5212672d2f45bb92a3b648f909.jpg",
            alt: "Максимальные скидки",
          })}
          ${this.createPromoCard({
            title: "POD-системы",
            imageUrl: "https://i.pinimg.com/736x/b0/5a/e5/b05ae559420fd079bf61a6d4a62fdbac.jpg",
            alt: "POD-системы",
          })}
          ${this.createPromoCard({
            title: "Одноразовые системы",
            imageUrl: "https://i.pinimg.com/736x/6f/c9/20/6fc9203162f604a2f78c820388a0b402.jpg",
            alt: "Одноразовые електронные сигареты",
          })}
          ${this.createPromoCard({
            title: "Испарители",
            imageUrl: "https://i.pinimg.com/736x/83/1a/d3/831ad3981dc81d34c922a046039d0092.jpg",
            alt: "Испарители и картриджи",
          })}
          ${this.createPromoCard({
            className: "discount",
            title: "Жидкости со скидкой",
            subtitle: "до -15%",
            imageUrl: "https://i.pinimg.com/736x/3c/38/15/3c381575a6bf382208b84fed840eb515.jpg",
            alt: "Жидкости со скидкой",
          })}
        </div>
      </div>
    `;
        }

        createPromoCard({ className = "", title, subtitle = "", imageUrl, alt }) {
          return `
      <div class="mega_menu_promo_card ${className}">
        <div class="card_image_container">
          <img src="${imageUrl}" alt="${alt}" class="card_image" />
          <div class="card_image_placeholder" style="display: none">
            <i class="fas fa-image shop_panel_placeholder_icon"></i>
            <div class="shop_panel_placeholder_text">
              <div>Упс...</div>
              <div>Мы уже подбираем фото</div>
            </div>
          </div>
        </div>
        <div class="card_content">
          <h3 class="card_title">${title}</h3>
          ${subtitle ? `<p class="card_subtitle">${subtitle}</p>` : ""}
        </div>
      </div>
    `;
        }
      }

      class ShopPanelController {
        constructor() {
          this.state = {
            isOpen: false,
            currentMode: "favorites_widget",
            currentFilter: "all",
            favorites_widget: [],
            basketItems: [],
            selectedSizes: {},
            promoApplied: false,
            initialRender: true,
          };

          this.elements = {
            dropdown: document.getElementById("universalDropdown"),
            dropdownTitle: document.getElementById("dropdownTitle"),
            dropdownList: document.getElementById("dropdownList"),
            favoritesButton: document.getElementById("favoritesBtn"),
            basketButton: document.getElementById("basketBtn"),
            favoritesCounter: document.getElementById("favoritesCounter"),
            basketCounter: document.getElementById("basketCounter"),
            actionsList: document.querySelector(".site-nav__secondary-list"),
          };

          this.promoCode = "SAVE20";
          this.discountPercent = 20;
          this.sampleProducts = this.createSampleProducts();

          if (!this.elements.dropdown || !this.elements.favoritesButton || !this.elements.basketButton) {
            return;
          }

          this.movePanelIntoActionsFlow();
          this.bindEvents();
          this.updateUI();
        }

        createSampleProducts() {
          return [
            {
              id: 1,
              name: "POD-система Vaporesso XROS 3",
              price: 2499,
              icon: "fa-microchip",
              category: "devices",
              images: 3,
              imageUrl: "https://i.pinimg.com/736x/c4/24/30/c42430c407d853edca925a349190c629.jpg",
              isNew: true,
              currentImageIndex: 0,
            },
            {
              id: 2,
              name: "Жидкость Sadboy Butter Cookie 30мл",
              price: 899,
              icon: "fa-flask",
              category: "liquids",
              images: 2,
              imageUrl: "https://i.pinimg.com/736x/98/af/ae/98afae8d49346b4ef8c554bec6ff67c3.jpg",
              sizes: ["0mg", "3mg", "6mg"],
              availableSizes: ["3mg", "6mg"],
              currentImageIndex: 0,
            },
            {
              id: 3,
              name: "Картридж Voopoo PnP R1 0.8Ω (5шт)",
              price: 599,
              icon: "fa-gear",
              category: "components",
              images: 1,
              imageUrl: "https://i.pinimg.com/1200x/0d/f6/58/0df658af43b4bfa2afb22c3e7289c1a8.jpg",
              isNew: false,
              currentImageIndex: 0,
            },
            {
              id: 4,
              name: "Одноразка Elf Bar BC5000 (5000 затяжек)",
              price: 1299,
              icon: "fa-charging-station",
              category: "devices",
              images: 4,
              imageUrl: "https://i.pinimg.com/736x/3a/02/2c/3a022cc0400dd175e6c2d9bbd00159ed.jpg",
              isNew: true,
              currentImageIndex: 0,
            },
            {
              id: 5,
              name: "Жидкость Nasty Juice Cush Man 60мл",
              price: 1099,
              icon: "fa-flask",
              category: "liquids",
              images: 2,
              imageUrl: "https://i.pinimg.com/736x/ff/d6/fd/ffd6fdbf5bf984ddc3d297a844d83760.jpg",
              sizes: ["0mg", "3mg", "6mg"],
              availableSizes: ["3mg"],
              isSale: true,
              currentImageIndex: 0,
            },
            {
              id: 6,
              name: "POD-система Smok Novo 4",
              price: 2199,
              icon: "fa-microchip",
              category: "devices",
              images: 2,
              imageUrl: "https://i.pinimg.com/736x/7f/bc/26/7fbc265746771268ae0cfcd02843879d.jpg",
              isSale: true,
              currentImageIndex: 0,
            },
            {
              id: 7,
              name: "Испарители GeekVape Z Series 0.2Ω (5шт)",
              price: 699,
              icon: "fa-gear",
              category: "components",
              images: 3,
              imageUrl: "https://i.pinimg.com/1200x/4d/41/c7/4d41c73ce5ad2d31a0ce118351fcd308.jpg",
              isNew: true,
              currentImageIndex: 0,
            },
            {
              id: 8,
              name: "Жидкость Dinner Lady Lemon Tart 50мл",
              price: 1199,
              icon: "fa-flask",
              category: "liquids",
              images: 2,
              imageUrl: "https://i.pinimg.com/1200x/d0/f6/b3/d0f6b3ffc359158a80afe3a61adf49f4.jpg",
              sizes: ["0mg", "3mg", "6mg"],
              availableSizes: ["3mg", "6mg"],
              currentImageIndex: 0,
            },
          ];
        }

        movePanelIntoActionsFlow() {
          const actionsList = this.elements.actionsList; // .site-nav__secondary-list
          const bigButtons = actionsList.closest(".site-header__actions");
          if (!actionsList || !bigButtons) return;

          // Удаляем старый контейнер, если есть
          const oldContainer = bigButtons.querySelector(".shop_panel_buttons_container");
          if (oldContainer) oldContainer.remove();

          // Создаём контейнер для кнопок магазина (избранное + корзина)
          const container = document.createElement("li");
          container.className = "shop_panel_buttons_container";
          container.style.listStyle = "none";
          container.style.display = "flex";
          container.style.alignItems = "center";
          // gap задаётся через CSS, инлайн не ставим!

          const favoritesItem = this.elements.favoritesButton.closest("li");
          const basketItem = this.elements.basketButton.closest(".cart_widget_container");

          if (!favoritesItem || !basketItem) return;

          container.appendChild(favoritesItem);
          container.appendChild(basketItem);
          actionsList.appendChild(container);

          // Удаляем <li> с дропдауном из списка (если он там есть)
          const oldDropdownLi = actionsList.querySelector(".shop_panel_trigger_item");
          if (oldDropdownLi) oldDropdownLi.remove();

          // Перемещаем сам дропдаун в .site-header__actions (за пределы <ul>)
          if (!bigButtons.contains(this.elements.dropdown)) {
            bigButtons.appendChild(this.elements.dropdown);
          }
        }
        bindEvents() {
          this.elements.favoritesButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.toggle("favorites_widget");
          });

          this.elements.basketButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.toggle("cart_widget");
          });

          this.elements.dropdown.addEventListener("click", (event) => event.stopPropagation());

          document.addEventListener("click", (event) => {
            const insideFavorites = this.elements.favoritesButton.contains(event.target);
            const insideBasket = this.elements.basketButton.contains(event.target);
            const insidePanel = this.elements.dropdown.contains(event.target);

            if (!insideFavorites && !insideBasket && !insidePanel && this.state.isOpen) {
              this.hide();
            }
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.state.isOpen) {
              this.hide();
            }
          });

          let resizeTimer;
          window.addEventListener("resize", () => {
            if (document.body.classList.contains("is-runtime-paused")) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.updatePanelPosition(), 60);
          });
          window.addEventListener("scroll", () => {
            if (document.body.classList.contains("is-runtime-paused")) return;
            if (this.state.isOpen) {
              this.hide();
            }
          });
        }
        updatePanelPosition() {
          const header = document.querySelector("[data-header]");
          if (!header) {
            return;
          }

          // На мобильных (≤768px) позиционирование полностью управляется CSS — сбрасываем inline стили
          if (window.innerWidth <= 768) {
            this.elements.dropdown.style.left = "";
            this.elements.dropdown.style.top = "";
            this.elements.dropdown.style.removeProperty("--shop-panel-available-height");
            return;
          }

          const favoritesRect = this.elements.favoritesButton.getBoundingClientRect();
          const basketRect = this.elements.basketButton.getBoundingClientRect();
          const headerRect = header.getBoundingClientRect();
          const panelWidth = this.elements.dropdown.offsetWidth || 400;
          const margin = 12; // минимальный отступ от края экрана
          const vw = window.innerWidth;

          // Идеальная позиция: центр между двумя кнопками
          const centerX = (favoritesRect.left + favoritesRect.width / 2 + basketRect.left + basketRect.width / 2) / 2;

          // left = центр - половина ширины панели, зажатый в безопасные границы
          const rawLeft = centerX - panelWidth / 2;
          const clampedLeft = Math.min(Math.max(rawLeft, margin), vw - panelWidth - margin);

          const panelTop = headerRect.height;
          const availableHeight = Math.max(220, window.innerHeight - panelTop);

          this.elements.dropdown.style.top = `${panelTop}px`;
          this.elements.dropdown.style.left = `${clampedLeft}px`;
          this.elements.dropdown.style.setProperty("--shop-panel-available-height", `${availableHeight}px`);
          // transform полностью управляется CSS (.shop_panel / .shop_panel.show)
          // — inline значение не ставим, чтобы не перебивать CSS-анимацию
        }

        toggle(mode) {
          if (this.state.isOpen && this.state.currentMode === mode) {
            this.hide();
            return;
          }

          this.show(mode);
        }

        show(mode) {
          this.state.currentMode = mode;
          this.state.isOpen = true;
          this.updatePanelPosition(); // устанавливает top/left
          this.elements.dropdown.classList.add("show"); // CSS сам анимирует translateY(0)
          this.renderHeader();
          this.renderContent();
        }

        hide() {
          this.state.isOpen = false;
          this.elements.dropdown.classList.remove("show");
          // transform управляется CSS — inline не трогаем
        }

        forceHide() {
          this.hide();
        }

        seedDemoItems() {
          this.addItem(null, "favorites_widget");
          this.addItem(null, "favorites_widget");
          this.addItem(null, "cart_widget");
          this.addItem(null, "cart_widget");
        }

        renderHeader() {
          const items = this.getCurrentItems();

          if (this.state.currentMode === "cart_widget") {
            this.elements.dropdownTitle.innerHTML = `
        <div class="shop-panel__top">
          <div class="shop_panel_title_text">
            <div class="shop_panel_title_icon shop_panel_mode_cart">
              <i class="fa-solid fa-shopping-bag"></i>
            </div>
            <span>Корзина</span>
          </div>
        </div>
      `;
            return;
          }

          // внутри renderHeader() после заголовка
          this.elements.dropdownTitle.innerHTML = `
            <div class="shop-panel__top">
              <div class="shop_panel_title_text">
                <div class="shop_panel_title_icon shop_panel_mode_favorites">
                  <i class="fa-solid fa-heart"></i>
                </div>
                <span>Избранное</span>
              </div>
            </div>
            <div class="shop_filters_container">
              <button class="shop_filter_button shop_filter_button_all ${this.state.currentFilter === "all" ? "active" : ""}" data-filter="all">Все</button>
              <button class="shop_filter_button ${this.state.currentFilter === "devices" ? "active" : ""}" data-filter="devices">Устройства</button>
              <button class="shop_filter_button ${this.state.currentFilter === "liquids" ? "active" : ""}" data-filter="liquids">Жидкости</button>
              <button class="shop_filter_button ${this.state.currentFilter === "components" ? "active" : ""}" data-filter="components">Комплектующие</button>
            </div>
          `;

          this.elements.dropdownTitle.querySelectorAll("[data-filter]").forEach((button) => {
            button.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              this.state.currentFilter = button.dataset.filter;
              this.renderHeader();
              this.renderContent();
            });
          });
        }

        renderContent() {
          if (this.state.currentMode === "cart_widget") {
            this.renderBasket();
            return;
          }

          this.renderFavorites();
        }

        renderFavorites() {
          const items = this.getFilteredFavorites();

          if (!items.length) {
            this.elements.dropdownList.innerHTML = this.createEmptyStateMarkup(this.state.currentFilter);
            this.hideFooter();
            return;
          }

          const appearanceClass = this.state.initialRender ? "initial-load" : "";

          this.elements.dropdownList.innerHTML = items
            .map(
              (item) => `
          <div class="favorites_panel_item ${appearanceClass}" data-favorite-id="${item.id}">
            <div class="cart_item_image_stack">
              ${item.isNew ? '<span class="shop_panel_item_badge_new">New</span>' : ""}
              ${item.isSale ? '<span class="shop_panel_item_badge_sale">Sale</span>' : ""}
              <div class="promo_image_slider">
                ${Array.from({ length: item.images }, (_, index) => {
                  const stateClass = index === item.currentImageIndex ? "active" : index === (item.currentImageIndex - 1 + item.images) % item.images ? "previous" : "next";

                  return `
                    <div class="promo_image_slide ${stateClass}">
                      <img src="${item.imageUrl}" alt="${item.name}" class="shop_panel_product_image" onerror="this.style.display='none'" />
                      <i class="fa-solid ${item.icon}"></i>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>

            <div class="shop_panel_item_details">
              <div class="shop_panel_item_header">
                <div class="shop_panel_item_name">${item.name}</div>
                <button class="cart_remove_button" type="button" data-remove-favorite="${item.id}">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="shop_panel_item_price_row">
                <div class="shop_panel_item_price">${this.formatPrice(item.price)}</div>
                ${item.isSale ? `<div class="shop_panel_item_price_old">${this.formatPrice(Math.round(item.price * 1.3))}</div>` : ""}
              </div>

              ${
                item.sizes
                  ? `
                    <div class="cart_size_selector">
                      ${item.sizes
                        .map(
                          (size) => `
                            <span
                              class="size ${item.availableSizes?.includes(size) ? "available" : ""} ${this.state.selectedSizes[item.id] === size ? "selected" : ""}"
                              data-size-select="${item.id}"
                              data-size-value="${size}"
                            >
                              ${size}
                            </span>
                          `,
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }

              <button
                class="cart_add_button"
                type="button"
                data-add-to-cart="${item.id}"
                ${item.sizes && !this.state.selectedSizes[item.id] ? "disabled" : ""}
              >
                <i class="fa-solid fa-cart-plus"></i>
                <span>В корзину</span>
              </button>
            </div>
          </div>
        `,
            )
            .join("");

          this.hideFooter();
          this.bindFavoritesInteractions();
          this.state.initialRender = false;
        }

        renderBasket() {
          if (!this.state.basketItems.length) {
            this.elements.dropdownList.innerHTML = this.createEmptyStateMarkup("cart_widget");
            this.hideFooter();
            return;
          }

          const appearanceClass = this.state.initialRender ? "initial-load" : "";

          this.elements.dropdownList.innerHTML = this.state.basketItems
            .map(
              (item, index) => `
          <div class="cart_item ${appearanceClass}" data-basket-index="${index}">
            <div class="cart_item_image">
              <img src="${item.imageUrl}" alt="${item.name}" class="shop_panel_product_image" onerror="this.style.display='none'" />
              <i class="fa-solid ${item.icon}"></i>
            </div>

            <div class="cart_item_details">
              <div class="cart_item_name">${item.name}</div>
              <div class="cart_item_price" id="basket-item-price-${index}">${this.formatPrice(item.price * item.quantity)}</div>
              <div class="cart_quantity_controls">
                <button class="cart_quantity_button" type="button" data-basket-decrease="${index}" ${item.quantity <= 1 ? "disabled" : ""}>
                  <i class="fa-solid fa-minus"></i>
                </button>
                <span class="cart_quantity_value" id="basket-quantity-value-${index}">${item.quantity}</span>
                <button class="cart_quantity_button" type="button" data-basket-increase="${index}">
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
            </div>

            <button class="cart_item_remove" type="button" data-remove-basket="${index}">
              <i class="fa-solid fa-trash-alt"></i>
            </button>
          </div>
        `,
            )
            .join("");

          this.showFooter();
          this.bindBasketInteractions();
          this.updateBasketTotals();
          this.state.initialRender = false;
        }

        bindFavoritesInteractions() {
          this.elements.dropdownList.querySelectorAll(".cart_item_image_stack").forEach((stack) => {
            stack.addEventListener("click", () => {
              const itemId = Number(stack.closest("[data-favorite-id]")?.dataset.favoriteId);
              const item = this.state.favorites_widget.find((favorite) => favorite.id === itemId);

              if (!item || item.images <= 1) {
                return;
              }

              item.currentImageIndex = (item.currentImageIndex + 1) % item.images;
              this.renderFavorites();
            });
          });

          this.elements.dropdownList.querySelectorAll("[data-size-select]").forEach((sizeButton) => {
            sizeButton.addEventListener("click", () => {
              const itemId = Number(sizeButton.dataset.sizeSelect);
              const size = sizeButton.dataset.sizeValue;
              if (!sizeButton.classList.contains("available")) {
                return;
              }

              this.state.selectedSizes[itemId] = size;
              this.renderFavorites();
            });
          });

          this.elements.dropdownList.querySelectorAll("[data-add-to-cart]").forEach((button) => {
            button.addEventListener("click", () => {
              const itemId = Number(button.dataset.addToCart);
              const item = this.state.favorites_widget.find((favorite) => favorite.id === itemId);

              if (!item) {
                return;
              }

              this.state.basketItems.push({
                ...item,
                id: Date.now() + Math.random(),
                quantity: 1,
              });

              this.updateUI();
              button.classList.add("adding");
              this.showToast(`Товар "${item.name}" добавлен в корзину`);

              window.setTimeout(() => {
                button.classList.remove("adding");
              }, 300);
            });
          });

          this.elements.dropdownList.querySelectorAll("[data-remove-favorite]").forEach((button) => {
            button.addEventListener("click", (event) => {
              event.stopPropagation();
              const itemId = Number(button.dataset.removeFavorite);
              const itemElement = button.closest(".favorites_panel_item");
              itemElement?.classList.add("removing");

              window.setTimeout(() => {
                this.state.favorites_widget = this.state.favorites_widget.filter((item) => item.id !== itemId);
                delete this.state.selectedSizes[itemId];
                this.renderFavorites();
                this.updateUI();
              }, 300);
            });
          });
        }
        bindBasketInteractions() {
          this.elements.dropdownList.querySelectorAll("[data-remove-basket]").forEach((button) => {
            button.addEventListener("click", () => {
              const index = Number(button.dataset.removeBasket);
              this.state.basketItems.splice(index, 1);
              this.renderBasket();
              this.updateUI();
            });
          });

          this.elements.dropdownList.querySelectorAll("[data-basket-increase]").forEach((button) => {
            button.addEventListener("click", () => {
              const index = Number(button.dataset.basketIncrease);
              this.state.basketItems[index].quantity += 1;
              this.updateBasketItem(index);
              this.updateBasketTotals();
            });
          });

          this.elements.dropdownList.querySelectorAll("[data-basket-decrease]").forEach((button) => {
            button.addEventListener("click", () => {
              const index = Number(button.dataset.basketDecrease);
              if (this.state.basketItems[index].quantity > 1) {
                this.state.basketItems[index].quantity -= 1;
                this.updateBasketItem(index);
                this.updateBasketTotals();
              }
            });
          });
        }

        updateBasketItem(index) {
          const item = this.state.basketItems[index];
          const price = document.getElementById(`basket-item-price-${index}`);
          const quantity = document.getElementById(`basket-quantity-value-${index}`);
          const decreaseButton = this.elements.dropdownList.querySelector(`[data-basket-decrease="${index}"]`);

          if (price) {
            price.textContent = this.formatPrice(item.price * item.quantity);
          }

          if (quantity) {
            quantity.textContent = item.quantity;
          }

          if (decreaseButton) {
            decreaseButton.disabled = item.quantity <= 1;
          }
        }

        ensureFooter() {
          if (this.elements.footer) {
            return;
          }

          const footer = document.createElement("div");
          footer.className = "shop_panel_footer";
          footer.innerHTML = `
      <div class="cart_promo_section">
        <div class="cart_promo_input_wrapper">
          <input type="text" class="cart_promo_input" id="promoInput" placeholder=" " />
          <label class="cart_promo_label" for="promoInput">
            <span class="navigation_label_text"></span>
          </label>
        </div>
      </div>

      <div class="cart_total_section">
        <span class="cart_total_label">Итого:</span>
        <div class="cart_total_prices">
          <span class="cart_total_price cart_price_old" id="oldPrice"></span>
          <span class="cart_total_price" id="totalPrice">0₴</span>
        </div>
      </div>

      <button class="cart_checkout_button" type="button">
        <div class="cart_widget_button_content">
          <span>Оформить заказ</span>
          <i class="fa-solid fa-arrow-right"></i>
        </div>
      </button>
    `;

          this.elements.dropdown.appendChild(footer);
          this.elements.footer = footer;

          const promoInput = footer.querySelector("#promoInput");
          const checkoutButton = footer.querySelector(".cart_checkout_button");

          promoInput?.addEventListener("input", () => {
            promoInput.value = promoInput.value.toUpperCase();
            promoInput.classList.remove("valid", "invalid");
          });

          promoInput?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              this.applyPromoCode();
            }
          });

          checkoutButton?.addEventListener("click", () => {
            this.showToast("Переход к оформлению заказа");
          });
        }

        showFooter() {
          this.ensureFooter();
          this.elements.footer.style.display = "block";
        }

        hideFooter() {
          if (this.elements.footer) {
            this.elements.footer.style.display = "none";
          }
        }

        applyPromoCode() {
          const promoInput = document.getElementById("promoInput");
          if (!promoInput) {
            return;
          }

          const enteredCode = promoInput.value.trim().toUpperCase();
          this.state.promoApplied = enteredCode === this.promoCode;

          promoInput.classList.remove("valid", "invalid");
          promoInput.classList.add(this.state.promoApplied ? "valid" : "invalid");
          this.updateBasketTotals();
        }

        updateBasketTotals() {
          const total = this.state.basketItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const totalPrice = document.getElementById("totalPrice");
          const oldPrice = document.getElementById("oldPrice");

          if (!totalPrice || !oldPrice) {
            return;
          }

          if (this.state.promoApplied) {
            oldPrice.textContent = this.formatPrice(total);
            oldPrice.classList.add("show");
            totalPrice.textContent = this.formatPrice(Math.round(total * (1 - this.discountPercent / 100)));
            return;
          }

          oldPrice.classList.remove("show");
          oldPrice.textContent = "";
          totalPrice.textContent = this.formatPrice(total);
        }

        createEmptyStateMarkup(mode) {
          const dictionary = {
            all: ["Нет избранных товаров", "Добавьте товары в избранное", "fa-heart"],
            devices: ["Нет избранных устройств", "Добавьте устройства в избранное", "fa-microchip"],
            liquids: ["Нет избранных жидкостей", "Добавьте жидкости в избранное", "fa-flask"],
            components: ["Нет избранных комплектующих", "Добавьте комплектующие в избранное", "fa-gear"],
            cart_widget: ["Корзина пуста", "Добавьте товары для покупки", "fa-shopping-cart"],
          };

          const [title, subtitle, icon] = dictionary[mode] || dictionary.all;
          return `
            <div class="shop_panel_empty_state">
              <i class="fa-solid ${icon}"></i>
              <div class="shop_panel_empty_title">${title}</div>
              <div class="shop_panel_empty_subtitle">${subtitle}</div>
            </div>
          `;
        }

        showToast(message) {
          const toast = document.createElement("div");
          toast.className = "shop_toast";
          toast.textContent = message;
          document.body.appendChild(toast);

          window.setTimeout(() => {
            toast.classList.add("shop_toast_closing");
            window.setTimeout(() => toast.remove(), 380);
          }, 2800);
        }

        addItem(customItem = null, targetList = "favorites_widget") {
          const source = customItem || this.sampleProducts[Math.floor(Math.random() * this.sampleProducts.length)];
          const newItem = {
            ...source,
            id: Date.now() + Math.random(),
            quantity: 1,
            currentImageIndex: 0,
          };

          if (targetList === "cart_widget") {
            this.state.basketItems.push(newItem);
          } else {
            this.state.favorites_widget.push(newItem);
          }

          this.updateUI();
        }

        updateUI() {
          const favoritesCount = this.state.favorites_widget.length;
          const basketCount = this.state.basketItems.length;

          this.elements.basketCounter.textContent = basketCount > 9 ? "9+" : `${basketCount}`;

          this.elements.favoritesButton.classList.toggle("has_items", favoritesCount > 0);
          this.elements.basketButton.classList.toggle("has_items", basketCount > 0);
        }

        getCurrentItems() {
          return this.state.currentMode === "cart_widget" ? this.state.basketItems : this.getFilteredFavorites();
        }

        getFilteredFavorites() {
          if (this.state.currentFilter === "all") {
            return this.state.favorites_widget;
          }

          return this.state.favorites_widget.filter((item) => item.category === this.state.currentFilter);
        }

        getItemsCountLabel(count) {
          if (count === 1) {
            return "товар";
          }

          if (count > 1 && count < 5) {
            return "товара";
          }

          return "товаров";
        }

        formatPrice(value) {
          return `${value.toLocaleString("ru-RU")}₴`;
        }
      }

      class HeaderVisibilityController {
        constructor({ megaMenuController, shopPanelController }) {
          this.header = document.querySelector("[data-header]");
          this.infoLine = document.querySelector("[data-info-line]");
          this.headerModule = document.querySelector("[data-header-module]");
          this.megaMenuController = megaMenuController;
          this.shopPanelController = shopPanelController;
          this.lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
          this.frameScheduled = false;
          this.headerHidden = false;
          this.pageHidden = document.hidden;
          this.runtimePaused = false;
          this.resizeTimer = null;
          this.lastMeasuredHeaderHeight = 0;
          this.lastMeasuredInfoLineHeight = 32;

          if (!this.header) {
            return;
          }

          this.updateLayoutVariables();
          this.syncPositions();
          this.bindEvents();
          this.syncRuntimeState();
        }

        bindEvents() {
          window.addEventListener("scroll", () => this.onScroll(), { passive: true });
          window.addEventListener("resize", () => {
            if (this.runtimePaused) return;
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => {
              this.updateLayoutVariables();
              this.syncPositions();
            }, 120);
          });
          window.addEventListener("product-sticky-bar-change", () => {
            if (this.runtimePaused) return;
            window.setTimeout(() => {
              if (this.runtimePaused) return;
              this.updateLayoutVariables();
              this.syncPositions();
            }, 40);
          });
          window.addEventListener("info-line-layout-change", () => {
            this.updateLayoutVariables();
            this.syncPositions();
          });
          window.addEventListener("wave:page-mounted", () => this.resetAfterNavigation());
          window.addEventListener("wave:page-ready", () => this.scheduleLayoutSync());
          document.addEventListener("visibilitychange", () => {
            this.pageHidden = document.hidden;
            this.syncRuntimeState();
          });
        }

        onScroll() {
          if (this.frameScheduled) {
            return;
          }

          this.frameScheduled = true;

          requestAnimationFrame(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollDelta = scrollTop - this.lastScrollTop;

            if (this.header.classList.contains("is-mobile-search-open")) {
              document.body.classList.add("scrolled");
              this.showHeader();
              this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
              this.frameScheduled = false;
              return;
            }

            if (document.body.classList.contains("is-mobile-info-line-dismissing")) {
              document.body.classList.add("scrolled");
              this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
              this.frameScheduled = false;
              return;
            }

            if (scrollTop > 120) {
              document.body.classList.add("scrolled");

              if (scrollDelta > 2) this.hideHeader();
              if (scrollDelta < -2) this.showHeader();
            } else {
              document.body.classList.remove("scrolled");
              this.showHeader();
            }

            this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
            this.frameScheduled = false;
          });
        }

        hideHeader() {
          if (this.header.classList.contains("is-mobile-search-open")) return;
          if (this.headerHidden) return;

          this.headerHidden = true;
          if (document.body.classList.contains("is-mobile-info-line-dismissed-for-scroll")) {
            document.body.classList.add("is-mobile-info-line-dismissed");
          }
          document.body.classList.add("is-header-hidden");
          this.header.classList.add("is-hidden");
          window.dispatchEvent(new CustomEvent("info-line-header-hidden"));
          this.megaMenuController?.hide(true);
          this.shopPanelController?.forceHide();
          this.syncPositions();
          this.syncRuntimeState();
        }

        showHeader() {
          const needsSync = this.headerHidden
            || document.body.classList.contains("is-header-hidden")
            || this.header.classList.contains("is-hidden");
          if (!needsSync) return;

          this.headerHidden = false;
          document.body.classList.remove("is-header-hidden");
          document.body.classList.remove("is-mobile-info-line-dismissed");
          window.dispatchEvent(new CustomEvent("info-line-restore"));
          this.header.classList.remove("is-hidden");
          this.syncRuntimeState();
          this.updateLayoutVariables();
          this.syncPositions();
        }

        resetAfterNavigation() {
          this.headerHidden = false;
          this.lastScrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
          document.body.classList.remove(
            "is-header-hidden",
            "is-mobile-info-line-dismissing",
            "is-mobile-info-line-dismissed"
          );
          document.body.classList.toggle("scrolled", this.lastScrollTop > 120);
          this.header.classList.remove("is-hidden");
          if (this.infoLine) this.infoLine.style.visibility = "";
          this.syncRuntimeState();
          this.updateLayoutVariables();
          this.syncPositions();
          this.scheduleLayoutSync();
        }

        scheduleLayoutSync() {
          window.requestAnimationFrame(() => {
            this.updateLayoutVariables();
            this.syncPositions();
            window.requestAnimationFrame(() => {
              this.updateLayoutVariables();
              this.syncPositions();
            });
          });
        }

        syncRuntimeState() {
          const shouldPause = this.headerHidden || this.pageHidden;
          if (this.runtimePaused === shouldPause) return;

          this.runtimePaused = shouldPause;
          document.body.classList.toggle("is-runtime-paused", shouldPause);
          this.headerModule?.classList.toggle("is-runtime-paused", shouldPause);
          window.dispatchEvent(new CustomEvent("header-runtime-change", {
            detail: { paused: shouldPause },
          }));
        }

        updateLayoutVariables() {
          const measuredHeaderHeight = this.header.offsetHeight;
          const measuredInfoLineHeight = this.infoLine?.offsetHeight || 0;
          const infoLineDismissed = document.body.classList.contains("is-header-hidden")
            && document.body.classList.contains("is-mobile-info-line-dismissed");

          if (measuredHeaderHeight > 0) {
            this.lastMeasuredHeaderHeight = measuredHeaderHeight;
            document.documentElement.style.setProperty("--header-height", `${measuredHeaderHeight}px`);
          } else if (this.lastMeasuredHeaderHeight > 0) {
            document.documentElement.style.setProperty("--header-height", `${this.lastMeasuredHeaderHeight}px`);
          }

          if (infoLineDismissed) {
            document.documentElement.style.setProperty("--info-line-height", "0px");
          } else if (measuredInfoLineHeight > 0) {
            this.lastMeasuredInfoLineHeight = measuredInfoLineHeight;
            document.documentElement.style.setProperty("--info-line-height", `${measuredInfoLineHeight}px`);
          } else {
            document.documentElement.style.setProperty("--info-line-height", `${this.lastMeasuredInfoLineHeight}px`);
          }
        }

        syncPositions() {
          if (!this.infoLine) {
            return;
          }

          const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || this.header.offsetHeight;
          this.infoLine.style.top = `${headerHeight}px`;
          this.infoLine.style.zIndex = document.body.classList.contains("is-header-hidden") ? "1001" : "999";
        }
      }

      /* ============================================================
         MOBILE MENU CONTROLLER
         ============================================================ */
      class MobileMenuController {
        constructor(shopPanelController) {
          this.shopPanelController = shopPanelController;
          this.menu = document.getElementById("mobileMenu");
          this.overlay = document.getElementById("mobileMenuOverlay");
          this.burgerBtn = document.getElementById("burgerBtn");
          this.searchBtn = document.getElementById("mobileSearchBtn");
          this.mobileFavBtn = document.getElementById("mobileFavBtn");
          this.mobileBasketBtn = document.getElementById("mobileBasketBtn");
          this.searchOverlay = document.getElementById("mobileSearchOverlay");
          this.searchInput = document.getElementById("mobileSearchInput");
          this.searchCloseBtn = document.getElementById("mobileSearchClose");
          this.searchResults = document.getElementById("mobileSearchResults");
          this.mobileBasketBadge = document.getElementById("mobileBasketBadge");
          this.menuTriggers = Array.from(document.querySelectorAll("[data-mobile-menu-trigger]"));
          this.searchTriggers = Array.from(document.querySelectorAll("[data-mobile-search-trigger]"));
          this.favoriteTriggers = Array.from(document.querySelectorAll("[data-mobile-favorites-trigger]"));
          this.cartTriggers = Array.from(document.querySelectorAll("[data-mobile-cart-trigger]"));
          this.mobileBasketBadges = Array.from(document.querySelectorAll("[data-mobile-basket-badge], #mobileBasketBadge"));
          this.dockItems = Array.from(document.querySelectorAll(".mobile-dock__item"));
          this.dockMain = document.querySelector("[data-mobile-dock-main]");
          this.dockPill = document.querySelector("[data-mobile-dock-pill]");
          this.mobileBreakpoint = 900;
          this.dockReady = false;

          // Accordion items
          this.accordionLinks = document.querySelectorAll("[data-accordion]");

          this.isOpen = false;
          this.searchResultsController = new HeaderProductSearchResults(this.searchInput, this.searchResults, {
            onSelect: () => this.closeSearch(false),
          });
          this.bindEvents();
        }

        bindEvents() {
          // Mobile dock/menu triggers.
          this.burgerBtn?.addEventListener("click", () => this.toggleMenu());
          this.menuTriggers.forEach((button) => {
            if (button === this.burgerBtn) return;
            button.addEventListener("click", () => this.toggleMenu());
          });

          // Click on dim overlay closes menu
          this.overlay?.addEventListener("click", () => this.closeMenu());

          // Escape key
          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
              this.closeMenu();
              this.closeSearch();
            }
          });

          // Accordion
          this.accordionLinks.forEach((link) => {
            link.setAttribute("aria-expanded", "false");
            link.addEventListener("click", () => {
              const item = link.closest(".mobile-menu__item");
              if (!item) return;

              const nextExpandedState = !item.classList.contains("is-expanded");
              item.classList.toggle("is-expanded", nextExpandedState);
              link.setAttribute("aria-expanded", String(nextExpandedState));
            });
          });

          // Mobile header-search__shell
          this.searchBtn?.addEventListener("click", () => this.openSearch());
          this.searchTriggers.forEach((button) => {
            if (button === this.searchBtn) return;
            button.addEventListener("click", () => this.openSearch());
          });
          this.searchCloseBtn?.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.closeSearch();
          });
          this.searchInput?.addEventListener("click", (event) => event.stopPropagation());
          this.searchInput?.addEventListener("input", () => {
            if (!this.searchInput.value.trim()) {
              window.setTimeout(() => this.renderMobileSearchSuggestions(), 0);
            }
          });
          this.searchOverlay?.addEventListener("click", (e) => {
            if (e.target === this.searchOverlay) this.closeSearch();
          });

          // Mobile favorites/cart buttons.
          this.mobileFavBtn?.addEventListener("click", () => {
            this.shopPanelController?.toggle("favorites_widget");
          });
          this.favoriteTriggers.forEach((button) => {
            button.addEventListener("click", () => this.shopPanelController?.toggle("favorites_widget"));
          });

          this.mobileBasketBtn?.addEventListener("click", () => {
            this.shopPanelController?.toggle("cart_widget");
          });
          this.cartTriggers.forEach((button) => {
            button.addEventListener("click", () => this.shopPanelController?.toggle("cart_widget"));
          });

          this.syncActiveDockItem();
          this.dockItems.forEach((item) => {
            item.addEventListener("click", () => {
              if (item.matches("[data-mobile-favorites-trigger], [data-mobile-cart-trigger], [data-mobile-menu-trigger]")) {
                return;
              }
              if (!item.matches("[data-mobile-dock-link]")) {
                return;
              }
              this.dockItems.forEach((button) => button.classList.remove("is-active"));
              item.classList.add("is-active");
              this.updateDockPill();
            });
          });

          // Mobile cart_widget btn (drawer footer)
          document.getElementById("mobileMenuBasketBtn")?.addEventListener("click", () => {
            this.closeMenu();
            window.setTimeout(() => this.shopPanelController?.toggle("cart_widget"), 300);
          });

          // Mobile fav btn (drawer footer)
          document.getElementById("mobileMenuFavBtn")?.addEventListener("click", () => {
            this.closeMenu();
            window.setTimeout(() => this.shopPanelController?.toggle("favorites_widget"), 300);
          });

          window.addEventListener("resize", () => this.handleViewportChange());
          window.addEventListener("load", () => this.syncActiveDockItem());
          window.addEventListener("pageshow", () => this.syncActiveDockItem());
          window.addEventListener("popstate", () => window.setTimeout(() => this.syncActiveDockItem(), 0));
          window.addEventListener("wave:page-mounted", () => {
            this.syncActiveDockItem();
            this.restartBasketBadgeAttention();
          });
          window.addEventListener("wave:page-ready", () => this.syncActiveDockItem());
          this.handleViewportChange();
        }

        isMobileViewport() {
          return window.innerWidth <= this.mobileBreakpoint;
        }

        handleViewportChange() {
          if (this.isMobileViewport()) {
            this.syncActiveDockItem();
            return;
          }
          this.closeMenu();
          this.resetMobileSearchState();
        }

        resetMobileSearchState() {
          window.clearTimeout(this.searchCloseTimer);
          document.querySelector("[data-header]")?.classList.remove("is-mobile-search-open");
          this.searchBtn?.classList.remove("is-open");
          this.searchOverlay?.classList.remove("is-open");
          if (this.searchInput) this.searchInput.value = "";
          this.searchResultsController?.clear();
          this.renderMobileSearchSuggestions();
        }

        syncActiveDockItem() {
          const path = window.location.pathname;
          const hash = window.location.hash;
          this.dockItems.forEach((item) => item.classList.remove("is-active"));
          const reviewsItem = this.dockItems.find((item) => item.getAttribute("href")?.includes("/reviews"));
          const catalogItem = this.dockItems.find((item) => item.getAttribute("href")?.includes("#products"));
          if (path.includes("/reviews") && reviewsItem) {
            reviewsItem.classList.add("is-active");
            this.updateDockPill();
            return;
          }
          if (
            path === "/" ||
            path.includes("/catalog") ||
            path.includes("/products") ||
            hash === "#products"
          ) {
            catalogItem?.classList.add("is-active");
          }
          this.updateDockPill();
        }

        updateDockPill() {
          if (!this.dockMain || !this.dockPill || !this.isMobileViewport()) return;
          const activeItem = this.dockMain.querySelector(".mobile-dock__item.is-active");
          if (!activeItem) {
            this.dockPill.classList.remove("is-ready");
            this.dockMain.classList.remove("is-dock-ready");
            this.dockReady = false;
            return;
          }
          const dockRect = this.dockMain.getBoundingClientRect();
          const itemRect = activeItem.getBoundingClientRect();
          if (!this.dockReady) {
            this.dockMain.classList.remove("is-dock-ready");
          }
          this.dockPill.style.left = `${itemRect.left - dockRect.left}px`;
          this.dockPill.style.width = `${itemRect.width}px`;
          this.dockPill.classList.add("is-ready");
          if (!this.dockReady) {
            this.dockReady = true;
            requestAnimationFrame(() => {
              this.dockMain?.classList.add("is-dock-ready");
            });
          }
        }

        toggleMenu() {
          this.isOpen ? this.closeMenu() : this.openMenu();
        }

        openMenu() {
          if (this.isMobileViewport()) {
            return;
          }
          this.isOpen = true;
          this.menu.classList.add("is-open");
          this.burgerBtn?.classList.add("is-open");
          this.burgerBtn?.setAttribute("aria-expanded", "true");
          this.menuTriggers.forEach((button) => {
            button.classList.add("is-open");
            button.setAttribute("aria-expanded", "true");
          });
          document.querySelector("[data-header]")?.classList.add("is-mobile-menu-open");
          document.querySelector("[data-info-line]")?.style.setProperty("visibility", "hidden");

          // Последовательно скрываем кнопки: поиск → избранное → корзина
          const icons = ["mobileSearchBtn", "mobileFavBtn", "mobileBasketBtn"];
          icons.forEach((id, i) => {
            window.setTimeout(() => {
              document.getElementById(id)?.classList.add("icon-hide");
            }, i * 80);
          });

          // Плавно меняем цвет хедера под drawer
          document.querySelector("[data-header]")?.classList.add("is-mobile-menu-open");
        }

        closeMenu() {
          this.isOpen = false;
          this.menu.classList.remove("is-open");
          this.burgerBtn?.classList.remove("is-open");
          this.burgerBtn?.setAttribute("aria-expanded", "false");
          this.menuTriggers.forEach((button) => {
            button.classList.remove("is-open");
            button.setAttribute("aria-expanded", "false");
          });
          document.querySelector("[data-header]")?.classList.remove("is-mobile-menu-open");
          document.querySelector("[data-info-line]")?.style.setProperty("visibility", "visible");

          // Последовательно возвращаем кнопки: корзина → избранное → поиск
          const icons = ["mobileBasketBtn", "mobileFavBtn", "mobileSearchBtn"];
          icons.forEach((id, i) => {
            window.setTimeout(() => {
              document.getElementById(id)?.classList.remove("icon-hide");
            }, i * 80);
          });

          // Возвращаем цвет хедера
          document.querySelector("[data-header]")?.classList.remove("is-mobile-menu-open");
        }

        openSearch() {
          if (!this.isMobileViewport()) {
            this.resetMobileSearchState();
            return;
          }
          window.clearTimeout(this.searchCloseTimer);
          const header = document.querySelector("[data-header]");
          header?.classList.remove("is-hidden");
          document.body.classList.remove("is-header-hidden");
          header?.classList.add("is-mobile-search-open");
          this.searchBtn?.classList.add("is-open");
          this.searchOverlay?.classList.add("is-open");
          if (!this.searchInput?.value.trim()) {
            this.renderMobileSearchSuggestions();
          }
          window.setTimeout(() => this.searchInput?.focus(), 120);
        }

        closeSearch(clearInput = true) {
          document.querySelector("[data-header]")?.classList.remove("is-mobile-search-open");
          this.searchBtn?.classList.remove("is-open");
          this.searchOverlay?.classList.remove("is-open");
          window.clearTimeout(this.searchCloseTimer);
          this.searchCloseTimer = window.setTimeout(() => {
            if (clearInput) {
              this.searchResultsController?.clear();
              if (this.searchInput) this.searchInput.value = "";
              this.renderMobileSearchSuggestions();
            } else {
              this.searchResultsController?.hide();
            }
          }, 260);
        }

        renderMobileSearchSuggestions() {
          if (!this.searchResults) return;
          this.searchResults.innerHTML = `
            <div class="search-results__hint">Популярные запросы</div>
            <a class="search-results__item" href="/#products"><i class="fa-solid fa-microchip"></i><div><b>POD-системы</b><small>Каталог устройств</small></div></a>
            <a class="search-results__item" href="/#products"><i class="fa-solid fa-flask"></i><div><b>Жидкости</b><small>Вкусы и наборы</small></div></a>
            <a class="search-results__item" href="/#products"><i class="fa-solid fa-gear"></i><div><b>Комплектующие</b><small>Картриджи и расходники</small></div></a>
            <a class="search-results__item" href="/?sort=hit#products"><i class="fa-solid fa-fire"></i><div><b>Хиты продаж</b><small>Популярные товары</small></div></a>
          `;
          this.searchResults.classList.add("is-open");
        }

        // Called by ShopPanelController to sync cart_widget site-nav__badge
        updateBasketBadge(count) {
          const value = count > 9 ? "9+" : String(count);
          this.mobileBasketBadges.forEach((badge) => {
            if (!badge) return;
            badge.textContent = value;
            badge.hidden = count <= 0;
            badge.classList.toggle("is-attention-active", count > 0);
          });
          this.mobileBasketBtn?.classList.toggle("has_items", count > 0);
          this.cartTriggers.forEach((button) => button.classList.toggle("has_items", count > 0));
        }

        restartBasketBadgeAttention() {
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          const activeBadges = this.mobileBasketBadges.filter((badge) => badge && !badge.hidden);
          activeBadges.forEach((badge) => badge.classList.remove("is-attention-active"));
          if (!activeBadges.length) return;
          window.requestAnimationFrame(() => {
            activeBadges.forEach((badge) => {
              if (badge.isConnected && !badge.hidden) badge.classList.add("is-attention-active");
            });
          });
        }
      }

      class MobileBottomDialogController {
        constructor({ overlay, panel, handle, isOpen, close }) {
          this.overlay = overlay;
          this.panel = panel;
          this.handle = handle;
          this.isOpen = isOpen;
          this.close = close;
          this.mediaQuery = window.matchMedia("(max-width: 900px)");
          this.collapsedHeight = 0;
          this.startY = 0;
          this.startHeight = 0;
          this.lastTouchY = 0;
          this.isDragging = false;
          this.hasMoved = false;
          this.raf = 0;

          this.bindEvents();
        }

        bindEvents() {
          if (!this.overlay || !this.panel || !this.handle) return;

          this.handle.addEventListener("pointerdown", (event) => this.onPointerDown(event));
          this.handle.addEventListener("click", (event) => this.onHandleClick(event));
          this.panel.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
          this.panel.addEventListener("touchstart", (event) => this.onTouchStart(event), { passive: true });
          this.panel.addEventListener("touchmove", (event) => this.onTouchMove(event), { passive: false });

          this.mediaQuery.addEventListener?.("change", () => {
            if (!this.mediaQuery.matches) this.reset();
            else if (this.isOpen?.()) this.syncOpen();
          });
          window.addEventListener("resize", () => {
            if (!this.isMobileOpen()) return;
            this.snapTo(Math.min(this.getCurrentHeight(), this.getMaxHeight()));
          });
        }

        isMobileOpen() {
          return this.mediaQuery.matches && Boolean(this.isOpen?.());
        }

        getViewportHeight() {
          return Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
        }

        getMaxHeight() {
          return Math.max(320, this.getViewportHeight() - 12);
        }

        getCurrentHeight() {
          return Math.round(this.panel.getBoundingClientRect().height || 0);
        }

        getCollapsedHeight() {
          if (this.collapsedHeight > 0) return Math.min(this.collapsedHeight, this.getMaxHeight());
          return Math.min(this.getCurrentHeight(), this.getMaxHeight());
        }

        syncOpen() {
          if (!this.mediaQuery.matches || !this.panel) return;
          this.panel.style.removeProperty("height");
          this.panel.style.removeProperty("--mobile-sheet-progress");
          this.overlay.classList.remove("is-mobile-sheet-expanded", "is-mobile-sheet-dragging");

          window.requestAnimationFrame(() => {
            if (!this.isMobileOpen()) return;
            this.collapsedHeight = Math.min(this.getCurrentHeight(), this.getMaxHeight());
            this.panel.style.maxHeight = "calc(100dvh - 12px)";
            this.updateState(this.collapsedHeight);
          });
        }

        reset() {
          window.cancelAnimationFrame(this.raf);
          this.isDragging = false;
          this.hasMoved = false;
          this.collapsedHeight = 0;
          this.overlay?.classList.remove("is-mobile-sheet-expanded", "is-mobile-sheet-dragging");
          this.panel?.style.removeProperty("height");
          this.panel?.style.removeProperty("--mobile-sheet-progress");
        }

        clampHeight(height) {
          const minHeight = Math.min(this.getCollapsedHeight(), this.getMaxHeight());
          return Math.min(Math.max(height, 96), this.getMaxHeight(), Math.max(minHeight, height));
        }

        applyHeight(height) {
          const maxHeight = this.getMaxHeight();
          const collapsed = this.getCollapsedHeight();
          const nextHeight = Math.min(Math.max(height, 96), maxHeight);
          const progress = maxHeight > collapsed ? (nextHeight - collapsed) / (maxHeight - collapsed) : 1;

          this.panel.style.height = `${Math.round(nextHeight)}px`;
          this.panel.style.maxHeight = "calc(100dvh - 12px)";
          this.panel.style.setProperty("--mobile-sheet-progress", Math.max(0, Math.min(1, progress)).toFixed(3));
          this.updateState(nextHeight);
        }

        updateState(height) {
          const expanded = height >= this.getMaxHeight() - 24;
          this.overlay.classList.toggle("is-mobile-sheet-expanded", expanded);
          this.handle?.setAttribute("aria-label", expanded ? "Свернуть окно" : "Развернуть окно");
        }

        getSnapHeights() {
          const collapsed = this.getCollapsedHeight();
          const max = this.getMaxHeight();
          const raw = [collapsed, max * 0.52, max * 0.66, max * 0.8, max * 0.92, max];
          return raw
            .map((height) => Math.round(Math.min(Math.max(height, collapsed), max)))
            .filter((height, index, list) => index === 0 || Math.abs(height - list[index - 1]) > 16);
        }

        snapTo(height) {
          if (!this.isMobileOpen()) return;
          this.overlay.classList.remove("is-mobile-sheet-dragging");
          this.applyHeight(height);
        }

        settle() {
          const current = this.getCurrentHeight();
          const collapsed = this.getCollapsedHeight();
          if (current < collapsed * 0.78) {
            this.close?.();
            return;
          }

          const target = this.getSnapHeights().reduce((nearest, height) => {
            return Math.abs(height - current) < Math.abs(nearest - current) ? height : nearest;
          }, collapsed);
          this.snapTo(target);
        }

        onPointerDown(event) {
          if (!this.isMobileOpen()) return;
          event.preventDefault();
          this.isDragging = true;
          this.hasMoved = false;
          this.startY = event.clientY;
          this.startHeight = this.getCurrentHeight();
          this.overlay.classList.add("is-mobile-sheet-dragging");
          this.handle.setPointerCapture?.(event.pointerId);

          const onMove = (moveEvent) => {
            if (!this.isDragging) return;
            const delta = this.startY - moveEvent.clientY;
            if (Math.abs(delta) > 4) this.hasMoved = true;
            this.applyHeight(this.startHeight + delta);
          };

          const onUp = (upEvent) => {
            this.isDragging = false;
            this.handle.releasePointerCapture?.(upEvent.pointerId);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            this.settle();
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }

        onHandleClick(event) {
          if (!this.isMobileOpen()) return;
          event.preventDefault();
          if (this.hasMoved) {
            this.hasMoved = false;
            return;
          }

          const current = this.getCurrentHeight();
          const collapsed = this.getCollapsedHeight();
          const max = this.getMaxHeight();
          this.snapTo(current >= max - 24 ? collapsed : max);
        }

        onWheel(event) {
          if (!this.isMobileOpen()) return;
          const delta = event.deltaY;
          if (!delta) return;

          const current = this.getCurrentHeight();
          const max = this.getMaxHeight();
          const collapsed = this.getCollapsedHeight();
          const canGrow = delta > 0 && current < max - 2;
          const canShrink = delta < 0 && current > collapsed + 2 && !this.hasScrollableParent(event.target, "up");

          if (!canGrow && !canShrink) return;

          event.preventDefault();
          const factor = canGrow ? 0.72 : 0.64;
          this.queueHeight(current + delta * factor);
        }

        onTouchStart(event) {
          if (!this.isMobileOpen() || !event.touches?.length) return;
          this.lastTouchY = event.touches[0].clientY;
        }

        onTouchMove(event) {
          if (!this.isMobileOpen() || !event.touches?.length) return;
          const nextY = event.touches[0].clientY;
          const delta = this.lastTouchY - nextY;
          this.lastTouchY = nextY;
          if (!delta) return;

          const current = this.getCurrentHeight();
          const max = this.getMaxHeight();
          const collapsed = this.getCollapsedHeight();
          const canGrow = delta > 0 && current < max - 2;
          const canShrink = delta < 0 && current > collapsed + 2 && !this.hasScrollableParent(event.target, "up");

          if (!canGrow && !canShrink) return;

          event.preventDefault();
          this.queueHeight(current + delta);
        }

        queueHeight(height) {
          window.cancelAnimationFrame(this.raf);
          this.raf = window.requestAnimationFrame(() => this.applyHeight(height));
        }

        hasScrollableParent(target, direction) {
          let node = target instanceof Element ? target : null;
          while (node && node !== this.panel) {
            const style = window.getComputedStyle(node);
            const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
            if (canScroll) {
              if (direction === "up" && node.scrollTop > 1) return true;
              if (direction === "down" && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
            }
            node = node.parentElement;
          }

          const panelCanScroll = this.panel.scrollHeight > this.panel.clientHeight + 1;
          if (!panelCanScroll) return false;
          if (direction === "up") return this.panel.scrollTop > 1;
          return this.panel.scrollTop + this.panel.clientHeight < this.panel.scrollHeight - 1;
        }
      }

      /* ============================================================
         DELIVERY MODAL CONTROLLER
         ============================================================ */
      class DeliveryModalController {
        constructor() {
          this.overlay = document.getElementById("deliveryModal");
          this.backdrop = document.getElementById("deliveryBackdrop");
          if (!this.overlay) return;

          this.panelTotal = 3;
          this.currentPanel = 0;

          this.panels = this.overlay.querySelectorAll(".delivery_panel_item");
          this.progressLines = this.overlay.querySelectorAll(".delivery_progress_line");
          this.prevBtn = document.getElementById("delivery_previous_button");
          this.nextBtn = document.getElementById("delivery_next_button");
          this.counter = document.getElementById("delivery_panel_counter");
          this.headerTitle = document.getElementById("delivery_header_title");
          this.headerSubtitle = document.getElementById("delivery_header_subtitle");
          this.headerIcon = document.getElementById("delivery_header_icon_slot");
          this.closeButton = document.getElementById("delivery_close_button");
          this.sheetHandle = this.overlay.querySelector("[data-delivery-sheet-handle]");
          this.sheetController = new MobileBottomDialogController({
            overlay: this.overlay,
            panel: this.overlay.querySelector(".delivery_modal_window"),
            handle: this.sheetHandle,
            isOpen: () => this.overlay.classList.contains("delivery_overlay_open"),
            close: () => this.close(),
          });
          this.lastTrigger = null;

          this.panelData = [
            {
              title: "Доставка",
              subtitle: "Надёжная упаковка и быстрая отправка",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/></svg>`,
            },
            {
              title: "Способы оплаты",
              subtitle: "Удобные варианты для вас",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/><line x1="14" y1="15" x2="16" y2="15"/></svg>`,
            },
            {
              title: "Важные условия",
              subtitle: "Ограничения и правила получения",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
            },
          ];

          this.bindEvents();
          this.updateUI();
          this.overlay.inert = true;
        }

        bindEvents() {
          // Триггеры открытия
          document.querySelectorAll("[data-delivery-open]").forEach((el) => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
              this.lastTrigger = e.currentTarget;
              this.open();
            });
          });

          // Закрыть по кнопке
          document.getElementById("delivery_close_button")?.addEventListener("click", () => this.close());

          // Закрыть по клику на оверлей
          this.overlay.addEventListener("click", (e) => {
            if (e.target === this.overlay) this.close();
          });

          // Закрыть по клику на бэкдроп
          this.backdrop?.addEventListener("click", () => this.close());

          // Escape и стрелки
          document.addEventListener("keydown", (e) => {
            if (!this.overlay.classList.contains("delivery_overlay_open")) return;
            if (e.key === "Escape") this.close();
            else if (e.key === "ArrowLeft") {
              e.preventDefault();
              this.goTo(this.currentPanel - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              this.goTo(this.currentPanel + 1);
            }
          });

          // Прогресс-линии
          this.progressLines.forEach((line, i) => {
            line.addEventListener("click", () => this.goTo(i));
          });

          // Навигация
          this.prevBtn?.addEventListener("click", () => this.goTo(this.currentPanel - 1));
          this.nextBtn?.addEventListener("click", () => this.goTo(this.currentPanel + 1));

          // Свайп
          const modal = this.overlay.querySelector(".delivery_modal_window");
          let touchStartX = 0;
          modal?.addEventListener(
            "touchstart",
            (e) => {
              touchStartX = e.changedTouches[0].screenX;
            },
            { passive: true },
          );
          modal?.addEventListener(
            "touchend",
            (e) => {
              const dist = touchStartX - e.changedTouches[0].screenX;
              if (Math.abs(dist) > 40) this.goTo(this.currentPanel + (dist > 0 ? 1 : -1));
            },
            { passive: true },
          );
        }

        goTo(index) {
          if (index < 0 || index >= this.panelTotal || index === this.currentPanel) return;
          this.currentPanel = index;
          this.updateUI();
        }

        updateUI() {
          this.panels.forEach((p, i) => p.classList.toggle("delivery_panel_item_active", i === this.currentPanel));
          this.progressLines.forEach((l, i) => l.classList.toggle("delivery_progress_line_active", i === this.currentPanel));

          const data = this.panelData[this.currentPanel];
          if (this.headerTitle) this.headerTitle.textContent = data.title;
          if (this.headerSubtitle) this.headerSubtitle.textContent = data.subtitle;
          if (this.headerIcon) this.headerIcon.innerHTML = data.icon;
          if (this.counter) this.counter.textContent = `${this.currentPanel + 1} / ${this.panelTotal}`;

          if (this.prevBtn) this.prevBtn.style.display = this.currentPanel === 0 ? "none" : "";
          if (this.nextBtn) this.nextBtn.style.display = this.currentPanel === this.panelTotal - 1 ? "none" : "";
        }

        open() {
          this.currentPanel = 0;
          this.updateUI();
          this.overlay.inert = false;
          this.overlay.classList.add("delivery_overlay_open");
          this.backdrop?.classList.add("delivery_backdrop_open");
          this.overlay.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          this.sheetController?.syncOpen();
          requestAnimationFrame(() => this.closeButton?.focus({ preventScroll: true }));
        }

        close() {
          this.sheetController?.reset();
          this.moveFocusOutside();
          this.overlay.classList.remove("delivery_overlay_open");
          this.backdrop?.classList.remove("delivery_backdrop_open");
          this.overlay.setAttribute("aria-hidden", "true");
          this.overlay.inert = true;
          document.body.style.overflow = "";
        }

        moveFocusOutside() {
          const activeElement = document.activeElement;
          if (!activeElement || !this.overlay.contains(activeElement)) return;

          const target = this.lastTrigger?.isConnected ? this.lastTrigger : document.querySelector("[data-delivery-open]");
          if (target?.focus) {
            target.focus({ preventScroll: true });
            return;
          }

          document.body.setAttribute("tabindex", "-1");
          document.body.focus({ preventScroll: true });
          window.setTimeout(() => document.body.removeAttribute("tabindex"), 0);
        }
      }

      /* ============================================================
         CONTACTS MODAL CONTROLLER
         ============================================================ */
      class ContactsModalController {
        constructor() {
          this.overlay = document.getElementById("contactsModal");
          this.backdrop = document.getElementById("contactsBackdrop");
          if (!this.overlay) return;
          this.closeButton = this.overlay.querySelector("[data-contacts-close]");
          this.sheetHandle = this.overlay.querySelector("[data-contacts-sheet-handle]");
          this.sheetController = new MobileBottomDialogController({
            overlay: this.overlay,
            panel: this.overlay.querySelector(".contacts_modal"),
            handle: this.sheetHandle,
            isOpen: () => this.overlay.classList.contains("is-open"),
            close: () => this.close(),
          });
          this.lastTrigger = null;

          this.bindEvents();
          this.overlay.inert = true;
        }

        bindEvents() {
          // Все триггеры (десктоп + мобайл)
          document.querySelectorAll("[data-contacts-open]").forEach((el) => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
              this.lastTrigger = e.currentTarget;
              this.open();
            });
          });

          // Закрытие по крестику
          this.overlay.querySelector("[data-contacts-close]")?.addEventListener("click", () => this.close());

          // Закрытие по клику на подложку (бэкдроп теперь снаружи)
          this.backdrop?.addEventListener("click", () => this.close());

          // Закрытие по клику на сам оверлей (мимо модала)
          this.overlay.addEventListener("click", (e) => {
            if (e.target === this.overlay) this.close();
          });

          // Закрытие по Escape
          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.overlay.classList.contains("is-open")) this.close();
          });
        }

        open() {
          this.overlay.inert = false;
          this.overlay.classList.add("is-open");
          this.backdrop?.classList.add("is-open");
          this.overlay.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          this.sheetController?.syncOpen();
          requestAnimationFrame(() => this.closeButton?.focus({ preventScroll: true }));
        }

        close() {
          this.sheetController?.reset();
          this.moveFocusOutside();
          this.overlay.classList.remove("is-open");
          this.backdrop?.classList.remove("is-open");
          this.overlay.setAttribute("aria-hidden", "true");
          this.overlay.inert = true;
          document.body.style.overflow = "";
        }

        moveFocusOutside() {
          const activeElement = document.activeElement;
          if (!activeElement || !this.overlay.contains(activeElement)) return;

          const target = this.lastTrigger?.isConnected ? this.lastTrigger : document.querySelector("[data-contacts-open]");
          if (target?.focus) {
            target.focus({ preventScroll: true });
            return;
          }

          document.body.setAttribute("tabindex", "-1");
          document.body.focus({ preventScroll: true });
          window.setTimeout(() => document.body.removeAttribute("tabindex"), 0);
        }
      }

      /* ============================================================
         CLIENT CARD MODAL CONTROLLER
         ============================================================ */
      class ClientCardModalController {
        constructor() {
          this.overlay = document.getElementById("clientCardModal");
          this.backdrop = document.getElementById("clientCardBackdrop");
          if (!this.overlay) return;

          this.closeButton = this.overlay.querySelector("[data-client-card-close]");
          this.status = this.overlay.querySelector("[data-client-status]");
          this.authView = this.overlay.querySelector('[data-client-view="auth"]');
          this.dashboardView = this.overlay.querySelector('[data-client-view="dashboard"]');
          this.lastTrigger = null;
          this.lockedScrollY = 0;
          const defaultBirthCalendarDate = new Date();
          defaultBirthCalendarDate.setFullYear(defaultBirthCalendarDate.getFullYear() - 18);
          this.birthCalendarDate = defaultBirthCalendarDate;
          this.birthCalendarMode = "day";
          this.storageKey = "waveClientCardProfile";
          this.sessionKey = "waveClientCardSession";
          this.firebaseConfig = this.readFirebaseConfig();
          this.firebaseAuth = null;
          this.pendingFirebaseUser = null;

          this.bindEvents();
          this.overlay.inert = true;
          this.renderState();
        }

        bindEvents() {
          document.querySelectorAll("[data-client-card-open]").forEach((trigger) => {
            trigger.addEventListener("click", (event) => {
              event.preventDefault();
              this.lastTrigger = event.currentTarget;
              this.open();
            });
            trigger.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              this.lastTrigger = event.currentTarget;
              this.open();
            });
          });

          this.closeButton?.addEventListener("click", () => this.close());
          this.backdrop?.addEventListener("click", () => this.close());
          this.overlay.addEventListener("click", (event) => {
            if (event.target === this.overlay) this.close();
          });
          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.overlay.classList.contains("is-open")) this.close();
          });

          this.overlay.querySelectorAll("[data-client-auth-tab]").forEach((button) => {
            button.addEventListener("click", () => this.setAuthTab(button.dataset.clientAuthTab));
          });

          this.overlay.querySelectorAll("[data-client-password-toggle]").forEach((button) => {
            button.addEventListener("click", () => this.togglePassword(button));
          });

          this.overlay.querySelector("#clientBirthInput")?.addEventListener("input", (event) => {
            this.formatBirthInput(event.currentTarget);
            this.syncBirthCalendarFromInput();
          });
          this.overlay.querySelector("[data-client-date-toggle]")?.addEventListener("click", () => this.toggleBirthCalendar());
          this.overlay.querySelectorAll("[data-client-date-mode]").forEach((button) => {
            button.addEventListener("click", () => this.setBirthCalendarMode(button.dataset.clientDateMode));
          });
          this.overlay.querySelector("[data-client-date-grid]")?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-client-date-day]");
            if (button) {
              this.selectBirthDate(button.dataset.clientDateDay);
              return;
            }
            const monthButton = event.target.closest("[data-client-date-month]");
            if (monthButton) {
              this.setBirthCalendarMonth(monthButton.dataset.clientDateMonth);
              return;
            }
            const yearButton = event.target.closest("[data-client-date-year]");
            if (yearButton) {
              this.setBirthCalendarYear(yearButton.dataset.clientDateYear);
            }
          });

          this.overlay.querySelectorAll("[data-client-google]").forEach((button) => {
            button.addEventListener("click", () => this.handleGoogle());
          });
          this.overlay.querySelectorAll("[data-client-provider]").forEach((button) => {
            button.addEventListener("click", () => this.handleProviderLogin(button.dataset.clientProvider));
          });

          this.overlay.querySelector('[data-client-form="login"]')?.addEventListener("submit", (event) => this.handleLogin(event));
          this.overlay.querySelector('[data-client-form="register"]')?.addEventListener("submit", (event) => this.handleRegister(event));
          this.overlay.querySelector("[data-client-avatar-input]")?.addEventListener("change", (event) => this.handleAvatar(event));
          this.overlay.querySelector("[data-client-save-profile]")?.addEventListener("click", () => this.saveProfileEdits());
          this.overlay.querySelector("[data-client-logout]")?.addEventListener("click", () => this.logout());

          this.overlay.querySelectorAll("[data-client-dashboard-tab]").forEach((button) => {
            button.addEventListener("click", () => this.setDashboardTab(button.dataset.clientDashboardTab));
          });

          this.overlay.addEventListener("click", (event) => {
            const birthField = this.overlay.querySelector("[data-client-birth-field]");
            if (birthField && !birthField.contains(event.target)) this.closeBirthCalendar();
          });
        }

        getProfile() {
          try {
            return JSON.parse(localStorage.getItem(this.storageKey) || "null");
          } catch (_) {
            return null;
          }
        }

        saveProfile(profile) {
          localStorage.setItem(this.storageKey, JSON.stringify(profile));
        }

        isSessionActive() {
          return localStorage.getItem(this.sessionKey) === "1";
        }

        setSessionActive(isActive) {
          if (isActive) {
            localStorage.setItem(this.sessionKey, "1");
          } else {
            localStorage.removeItem(this.sessionKey);
          }
        }

        readFirebaseConfig() {
          return null;
        }

        getCsrfToken() {
          return document.cookie
            .split(";")
            .map((item) => item.trim())
            .find((item) => item.startsWith("csrftoken="))
            ?.split("=")[1] || "";
        }

        async getFirebaseAuth() {
          if (this.firebaseAuth) return this.firebaseAuth;
          if (!this.firebaseConfig?.apiKey || !this.firebaseConfig?.projectId || !this.firebaseConfig?.appId) {
            throw new Error("Firebase web config не настроен.");
          }

          const [{ initializeApp, getApps }, authModule] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
            import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
          ]);
          const app = getApps().length ? getApps()[0] : initializeApp(this.firebaseConfig);
          this.firebaseAuth = {
            auth: authModule.getAuth(app),
            GoogleAuthProvider: authModule.GoogleAuthProvider,
            OAuthProvider: authModule.OAuthProvider,
            signInWithPopup: authModule.signInWithPopup,
            signOut: authModule.signOut,
          };
          return this.firebaseAuth;
        }

        async sendFirebaseAuth(user, extraPayload = {}) {
          const authUrl = this.authView?.dataset.clientAuthUrl;
          if (!authUrl || !user) throw new Error("Не настроен URL авторизации клиента.");
          const idToken = await user.getIdToken();
          const response = await fetch(authUrl, {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": this.getCsrfToken(),
            },
            body: JSON.stringify({
              idToken,
              displayName: user.displayName || "",
              avatarUrl: user.photoURL || "",
              ...extraPayload,
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            throw new Error(result.message || "Не удалось войти в карту клиента.");
          }
          return result;
        }

        normalizeNickname(value) {
          const clean = String(value || "").trim().replace(/^@+/, "");
          return clean ? `@${clean}` : "";
        }

        setStatus(message = "", type = "") {
          if (!this.status) return;
          this.status.textContent = message;
          this.status.classList.toggle("is-error", type === "error");
          this.status.classList.toggle("is-success", type === "success");
        }

        setAuthTab(tab) {
          const authView = this.authView;
          authView?.classList.remove("is-switching-login", "is-switching-register");
          authView?.classList.add(`is-switching-${tab}`);
          this.overlay.querySelectorAll("[data-client-google]").forEach((button) => {
            button.classList.remove("is-pulsed");
          });
          this.overlay.querySelectorAll("[data-client-auth-tab]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.clientAuthTab === tab);
          });
          this.overlay.querySelectorAll("[data-client-form]").forEach((form) => {
            form.classList.toggle("is-active", form.dataset.clientForm === tab);
          });
          window.setTimeout(() => {
            authView?.classList.remove("is-switching-login", "is-switching-register");
          }, 320);
          this.setStatus();
        }

        validateRegisterForm() {
          const birth = this.overlay.querySelector("#clientBirthInput");
          const username = this.overlay.querySelector("#clientUsernameInput");
          const password = this.overlay.querySelector("#clientRegisterPasswordInput");
          const confirm = this.overlay.querySelector("#clientRegisterPasswordConfirmInput");
          const usernameValue = username?.value.trim() || "";
          const passwordValue = password?.value.trim() || "";
          const confirmValue = confirm?.value.trim() || "";

          if (!birth?.value) {
            this.setStatus("Укажите дату рождения.", "error");
            birth?.focus();
            return false;
          }
          if (!this.parseBirthDate(birth.value)) {
            this.setStatus("Введите дату в формате ДД.ММ.ГГГГ.", "error");
            birth?.focus();
            return false;
          }
          if (!this.isAdult(birth.value)) {
            this.setStatus("Карта клиента доступна только пользователям 18+.", "error");
            birth?.focus();
            return false;
          }
          if (!/^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(usernameValue)) {
            this.setStatus("Логин должен быть на английском: от 3 символов, буквы, цифры и _.", "error");
            username?.focus();
            return false;
          }
          if (passwordValue.length < 6) {
            this.setStatus("Пароль должен быть минимум из 6 символов.", "error");
            password?.focus();
            return false;
          }
          if (passwordValue !== confirmValue) {
            this.setStatus("Пароли не совпадают.", "error");
            confirm?.focus();
            return false;
          }
          this.setStatus();
          return true;
        }

        togglePassword(button) {
          const inputId = button?.dataset?.targetInput;
          const input = inputId ? this.overlay.querySelector(`#${CSS.escape(inputId)}`) : null;
          if (!input) return;
          const isVisible = input.type === "text";
          input.type = isVisible ? "password" : "text";
          button.classList.toggle("visible", !isVisible);
          button.setAttribute("aria-label", isVisible ? "Показать пароль" : "Скрыть пароль");
        }

        handleGoogle() {
          this.setStatus();
          this.overlay.querySelectorAll("[data-client-google]").forEach((button) => {
            button.classList.remove("is-pulsed");
          });
          window.requestAnimationFrame(() => {
            this.overlay.querySelectorAll("[data-client-google]").forEach((button) => {
              button.classList.add("is-pulsed");
            });
          });
        }

        async handleProviderLogin(providerName) {
          this.setStatus("Открываем безопасный вход...", "");
          this.overlay.querySelectorAll("[data-client-provider]").forEach((button) => {
            button.disabled = true;
          });
          try {
            const firebase = await this.getFirebaseAuth();
            const provider = providerName === "apple"
              ? new firebase.OAuthProvider("apple.com")
              : new firebase.GoogleAuthProvider();
            if (providerName === "google") {
              provider.setCustomParameters({ prompt: "select_account" });
            }
            const credential = await firebase.signInWithPopup(firebase.auth, provider);
            this.pendingFirebaseUser = credential.user;
            const result = await this.sendFirebaseAuth(credential.user);
            if (result.needsOnboarding) {
              this.showOnboarding(result);
              return;
            }
            this.saveProfile(result.profile);
            this.setSessionActive(true);
            this.renderDashboard(result.profile);
            this.setStatus("Вы вошли в карту клиента.", "success");
          } catch (error) {
            this.setStatus(error?.message || "Не удалось выполнить вход.", "error");
          } finally {
            this.overlay.querySelectorAll("[data-client-provider]").forEach((button) => {
              button.disabled = false;
            });
          }
        }

        showOnboarding(data = {}) {
          this.authView?.classList.add("is-onboarding");
          this.overlay.querySelector("[data-client-social-panel]")?.setAttribute("hidden", "");
          this.overlay.querySelector(".client_card_tabs")?.setAttribute("hidden", "");
          this.overlay.querySelector('[data-client-form="login"]')?.setAttribute("hidden", "");
          const registerForm = this.overlay.querySelector('[data-client-form="register"]');
          if (registerForm) {
            registerForm.hidden = false;
            registerForm.classList.add("active", "client_card_onboarding");
          }
          const username = this.overlay.querySelector("#clientUsernameInput");
          if (username && !username.value) {
            username.value = String(data.suggestedNickname || "").replace(/^@+/, "");
            username.placeholder = "Ник на английском";
            username.setAttribute("aria-label", "Ник");
          }
          const technicalPassword = "firebase-client";
          const password = this.overlay.querySelector("#clientRegisterPasswordInput");
          const confirm = this.overlay.querySelector("#clientRegisterPasswordConfirmInput");
          if (password) password.value = technicalPassword;
          if (confirm) confirm.value = technicalPassword;
          this.setStatus("Осталось указать ник и дату рождения.");
          username?.focus({ preventScroll: true });
        }

        formatDateForInput(date) {
          const day = String(date.getDate()).padStart(2, "0");
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const year = date.getFullYear();
          return `${day}.${month}.${year}`;
        }

        formatBirthInput(input) {
          const digits = String(input.value || "").replace(/\D/g, "").slice(0, 8);
          const chunks = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
          input.value = chunks.join(".");
        }

        parseBirthDate(value) {
          const raw = String(value || "").trim();
          const dotMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
          const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          const day = dotMatch ? Number(dotMatch[1]) : isoMatch ? Number(isoMatch[3]) : 0;
          const month = dotMatch ? Number(dotMatch[2]) : isoMatch ? Number(isoMatch[2]) : 0;
          const year = dotMatch ? Number(dotMatch[3]) : isoMatch ? Number(isoMatch[1]) : 0;
          if (!day || !month || !year) return null;
          const birthDate = new Date(year, month - 1, day);
          if (
            birthDate.getFullYear() !== year ||
            birthDate.getMonth() !== month - 1 ||
            birthDate.getDate() !== day
          ) {
            return null;
          }
          return birthDate;
        }

        syncBirthCalendarFromInput() {
          const inputDate = this.parseBirthDate(this.overlay.querySelector("#clientBirthInput")?.value);
          if (!inputDate) return;
          this.birthCalendarDate = new Date(inputDate.getFullYear(), inputDate.getMonth(), 1);
          this.renderBirthCalendar();
        }

        toggleBirthCalendar() {
          const picker = this.overlay.querySelector("[data-client-date-picker]");
          const toggle = this.overlay.querySelector("[data-client-date-toggle]");
          if (!picker || !toggle) return;
          const shouldOpen = picker.hidden;
          if (shouldOpen) {
            this.birthCalendarMode = "day";
            this.syncBirthCalendarFromInput();
            this.renderBirthCalendar();
          }
          picker.hidden = !shouldOpen;
          toggle.classList.toggle("is-active", shouldOpen);
          toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        }

        closeBirthCalendar() {
          const picker = this.overlay.querySelector("[data-client-date-picker]");
          const toggle = this.overlay.querySelector("[data-client-date-toggle]");
          if (!picker || picker.hidden) return;
          picker.hidden = true;
          toggle?.classList.remove("is-active");
          toggle?.setAttribute("aria-expanded", "false");
        }

        setBirthCalendarMonth(value) {
          const month = Number(value);
          if (Number.isNaN(month)) return;
          this.birthCalendarDate = new Date(
            this.birthCalendarDate.getFullYear(),
            month,
            1
          );
          this.birthCalendarMode = "day";
          this.renderBirthCalendar();
        }

        setBirthCalendarYear(value) {
          const year = Number(value);
          if (Number.isNaN(year)) return;
          this.birthCalendarDate = new Date(
            year,
            this.birthCalendarDate.getMonth(),
            1
          );
          this.birthCalendarMode = "day";
          this.renderBirthCalendar();
        }

        setBirthCalendarMode(mode) {
          const nextMode = mode === "month" || mode === "year" ? mode : "day";
          this.birthCalendarMode = this.birthCalendarMode === nextMode ? "day" : nextMode;
          this.renderBirthCalendar();
        }

        selectBirthDate(value) {
          const [year, month, day] = String(value || "").split("-").map(Number);
          if (!year || !month || !day) return;
          const selectedDate = new Date(year, month - 1, day);
          const input = this.overlay.querySelector("#clientBirthInput");
          if (input) input.value = this.formatDateForInput(selectedDate);
          this.birthCalendarDate = new Date(year, month - 1, 1);
          this.closeBirthCalendar();
        }

        renderBirthCalendar() {
          const monthLabel = this.overlay.querySelector("[data-client-date-month-label]");
          const yearLabel = this.overlay.querySelector("[data-client-date-year-label]");
          const weekdays = this.overlay.querySelector("[data-client-date-weekdays]");
          const picker = this.overlay.querySelector("[data-client-date-picker]");
          const grid = this.overlay.querySelector("[data-client-date-grid]");
          if (!monthLabel || !yearLabel || !weekdays || !grid) return;
          const monthNames = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
          ];
          const year = this.birthCalendarDate.getFullYear();
          const month = this.birthCalendarDate.getMonth();
          const selectedDate = this.parseBirthDate(this.overlay.querySelector("#clientBirthInput")?.value);
          const firstDay = new Date(year, month, 1);
          const startOffset = (firstDay.getDay() + 6) % 7;
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells = [];
          monthLabel.textContent = monthNames[month];
          yearLabel.textContent = String(year);
          picker?.setAttribute("data-mode", this.birthCalendarMode);
          weekdays.hidden = this.birthCalendarMode !== "day";

          if (this.birthCalendarMode === "month") {
            grid.innerHTML = monthNames
              .map((name, index) => (
                `<button class="client_card_date_option${index === month ? " is-selected" : ""}" type="button" data-client-date-month="${index}">${name}</button>`
              ))
              .join("");
            return;
          }

          if (this.birthCalendarMode === "year") {
            const currentYear = new Date().getFullYear();
            const minYear = currentYear - 100;
            const maxYear = currentYear - 18;
            for (let optionYear = maxYear; optionYear >= minYear; optionYear -= 1) {
              cells.push(
                `<button class="client_card_date_option${optionYear === year ? " is-selected" : ""}" type="button" data-client-date-year="${optionYear}">${optionYear}</button>`
              );
            }
            grid.innerHTML = cells.join("");
            return;
          }

          for (let index = 0; index < startOffset; index += 1) {
            cells.push('<span class="client_card_date_empty"></span>');
          }

          for (let day = 1; day <= daysInMonth; day += 1) {
            const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSelected = selectedDate &&
              selectedDate.getFullYear() === year &&
              selectedDate.getMonth() === month &&
              selectedDate.getDate() === day;
            cells.push(
              `<button class="client_card_date_day${isSelected ? " is-selected" : ""}" type="button" data-client-date-day="${value}">${day}</button>`
            );
          }

          while (cells.length < 42) {
            cells.push('<span class="client_card_date_empty"></span>');
          }

          grid.innerHTML = cells.join("");
        }

        isAdult(value) {
          const birthDate = this.parseBirthDate(value);
          if (!birthDate) return false;
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDelta = today.getMonth() - birthDate.getMonth();
          if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
          return age >= 18;
        }

        handleLogin(event) {
          event.preventDefault();
          const profile = this.getProfile();
          const login = this.overlay.querySelector("#clientLoginInput")?.value.trim();
          const password = this.overlay.querySelector("#clientPasswordInput")?.value.trim();
          if (!login || !password) {
            this.setStatus("Введите логин и пароль.", "error");
            return;
          }
          if (!profile) {
            this.setStatus("Карта пока не создана. Перейдите в регистрацию.", "error");
            this.setAuthTab("register");
            return;
          }
          this.setSessionActive(true);
          this.setStatus("Вы вошли в карту клиента.", "success");
          this.renderDashboard(profile);
        }

        async handleRegister(event) {
          event.preventDefault();
          if (this.pendingFirebaseUser) {
            if (!this.validateRegisterForm()) return;
            try {
              const nickname = this.overlay.querySelector("#clientUsernameInput")?.value.trim() || "";
              const birthDate = this.overlay.querySelector("#clientBirthInput")?.value || "";
              const result = await this.sendFirebaseAuth(this.pendingFirebaseUser, { nickname, birthDate });
              this.saveProfile(result.profile);
              this.setSessionActive(true);
              this.pendingFirebaseUser = null;
              this.renderDashboard(result.profile);
              this.setStatus("Карта клиента создана.", "success");
            } catch (error) {
              this.setStatus(error?.message || "Не удалось создать карту клиента.", "error");
            }
            return;
          }
          if (!this.validateRegisterForm()) return;
          const username = this.overlay.querySelector("#clientUsernameInput")?.value.trim();
          const password = this.overlay.querySelector("#clientRegisterPasswordInput")?.value.trim();
          if (!username || !password || password.length < 6) {
            this.setStatus("Укажите логин и пароль минимум из 6 символов.", "error");
            return;
          }
          const profile = {
            nickname: this.normalizeNickname(username),
            birthDate: this.overlay.querySelector("#clientBirthInput")?.value || "",
            firstName: this.overlay.querySelector("#clientFirstNameInput")?.value.trim() || "",
            lastName: "",
            username,
            avatar: this.getProfile()?.avatar || "",
            orders: [],
            reviews: [],
          };
          this.saveProfile(profile);
          this.setSessionActive(true);
          this.setStatus("Карта клиента создана.", "success");
          this.renderDashboard(profile);
        }

        handleAvatar(event) {
          const file = event.target.files?.[0];
          if (!file || !file.type.startsWith("image/")) return;
          const reader = new FileReader();
          reader.onload = () => {
            const profile = this.getProfile() || {};
            profile.avatar = String(reader.result || "");
            this.saveProfile(profile);
            this.renderDashboard(profile);
          };
          reader.readAsDataURL(file);
        }

        saveProfileEdits() {
          const profile = this.getProfile();
          if (!profile) return;
          const input = this.overlay.querySelector("[data-client-edit-nick]");
          const login = String(input?.value || "").trim().replace(/^@+/, "");
          if (!/^[A-Za-z][A-Za-z0-9_]{2,31}$/.test(login)) {
            this.setStatus("Логин должен быть на английском: от 3 символов, буквы, цифры и _.", "error");
            input?.focus();
            return;
          }
          profile.username = login;
          profile.nickname = this.normalizeNickname(login);
          this.saveProfile(profile);
          this.renderDashboard(profile);
          this.setStatus("Профиль обновлён.", "success");
        }

        async logout() {
          try {
            const firebase = this.firebaseAuth || await this.getFirebaseAuth().catch(() => null);
            if (firebase?.auth) await firebase.signOut(firebase.auth);
          } catch (_) {
            /* Firebase can be unavailable before first login. */
          }
          const logoutUrl = this.authView?.dataset.clientLogoutUrl;
          if (logoutUrl) {
            fetch(logoutUrl, {
              method: "POST",
              credentials: "same-origin",
              headers: { "X-CSRFToken": this.getCsrfToken() },
            }).catch(() => {});
          }
          this.setSessionActive(false);
          this.pendingFirebaseUser = null;
          this.authView?.classList.remove("is-onboarding");
          this.overlay.querySelector("[data-client-social-panel]")?.removeAttribute("hidden");
          this.overlay.querySelector('[data-client-form="register"]')?.setAttribute("hidden", "");
          this.authView.hidden = false;
          this.dashboardView.hidden = true;
          this.setAuthTab("login");
          this.setStatus("Вы вышли из карты клиента.");
        }

        setDashboardTab(tab) {
          this.overlay.querySelectorAll("[data-client-dashboard-tab]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.clientDashboardTab === tab);
          });
          this.overlay.querySelectorAll("[data-client-dashboard-panel]").forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.clientDashboardPanel === tab);
          });
        }

        renderState() {
          const profile = this.getProfile();
          if (profile && this.isSessionActive()) {
            this.renderDashboard(profile);
          } else {
            this.authView?.classList.remove("is-onboarding");
            this.overlay.querySelector("[data-client-social-panel]")?.removeAttribute("hidden");
            this.overlay.querySelector('[data-client-form="register"]')?.setAttribute("hidden", "");
            this.authView.hidden = false;
            this.dashboardView.hidden = true;
            this.renderAvatar(profile?.avatar || "");
          }
        }

        renderDashboard(profile) {
          const nickname = profile.nickname || "@wave";
          const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Клиент wave smokin";
          this.authView.hidden = true;
          this.dashboardView.hidden = false;
          this.overlay.querySelector("[data-client-dashboard-nick]").textContent = nickname;
          this.overlay.querySelector("[data-client-dashboard-name]").textContent = fullName;
          this.overlay.querySelector("[data-client-orders-count]").textContent = profile.orders?.length || 0;
          this.overlay.querySelector("[data-client-reviews-count]").textContent = profile.reviews?.length || 0;
          const editNick = this.overlay.querySelector("[data-client-edit-nick]");
          if (editNick) editNick.value = String(profile.username || nickname).replace(/^@/, "");
          this.renderAvatar(profile.avatar);
        }

        renderDashboard(profile) {
          const nickname = this.normalizeNickname(profile.nickname || profile.username || "wave");
          const fullName = profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Клиент wave smokin";
          this.authView.hidden = true;
          this.dashboardView.hidden = false;
          this.overlay.querySelector("[data-client-dashboard-nick]").textContent = nickname;
          this.overlay.querySelector("[data-client-dashboard-name]").textContent = fullName;
          this.overlay.querySelector("[data-client-orders-count]").textContent = profile.ordersCount ?? profile.orders?.length ?? 0;
          this.overlay.querySelector("[data-client-reviews-count]").textContent = profile.reviewsCount ?? profile.reviews?.length ?? 0;
          const editNick = this.overlay.querySelector("[data-client-edit-nick]");
          if (editNick) editNick.value = String(profile.nickname || profile.username || nickname).replace(/^@/, "");
          this.renderAvatar(profile.avatarUrl || profile.avatar);
        }

        renderAvatar(src) {
          const fallback = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
          const markup = src ? `<img src="${src}" alt="">` : fallback;
          this.overlay.querySelector("[data-client-avatar]").innerHTML = markup;
        }

        open() {
          window._mobileMenu?.closeMenu?.();
          this.renderState();
          this.overlay.inert = false;
          this.overlay.classList.add("is-open");
          this.backdrop?.classList.add("is-open");
          this.overlay.setAttribute("aria-hidden", "false");
          this.lockBodyScroll();
          requestAnimationFrame(() => this.closeButton?.focus({ preventScroll: true }));
        }

        close() {
          this.moveFocusOutside();
          this.overlay.classList.remove("is-open");
          this.backdrop?.classList.remove("is-open");
          this.overlay.setAttribute("aria-hidden", "true");
          this.overlay.inert = true;
          this.unlockBodyScroll();
        }

        lockBodyScroll() {
          if (document.body.classList.contains("client_card_scroll_locked")) return;
          this.lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
          document.body.classList.add("client_card_scroll_locked");
          document.body.style.position = "fixed";
          document.body.style.top = `-${this.lockedScrollY}px`;
          document.body.style.left = "0";
          document.body.style.right = "0";
          document.body.style.width = "100%";
          document.body.style.overflow = "hidden";
        }

        unlockBodyScroll() {
          if (!document.body.classList.contains("client_card_scroll_locked")) return;
          document.body.classList.remove("client_card_scroll_locked");
          document.body.style.position = "";
          document.body.style.top = "";
          document.body.style.left = "";
          document.body.style.right = "";
          document.body.style.width = "";
          document.body.style.overflow = "";
          window.scrollTo(0, this.lockedScrollY || 0);
        }

        moveFocusOutside() {
          const activeElement = document.activeElement;
          if (!activeElement || !this.overlay.contains(activeElement)) return;
          const target = this.lastTrigger?.isConnected ? this.lastTrigger : document.querySelector("[data-client-card-open]");
          if (target?.focus) {
            target.focus({ preventScroll: true });
            return;
          }
          document.body.setAttribute("tabindex", "-1");
          document.body.focus({ preventScroll: true });
          window.setTimeout(() => document.body.removeAttribute("tabindex"), 0);
        }
      }

      document.addEventListener("DOMContentLoaded", () => {
        const accountButtonController = new AdaptiveAccountButton(document.querySelector("[data-account-button]"));
        new HeaderSearchController(accountButtonController);
        new InfoLineController();
        new NavigationUnderlineController();

        const megaMenuController = new MegaMenuController();
        const shopPanelController = new ShopPanelController();

        function installRealShopPanelController(controller) {
          if (!controller?.elements?.dropdownList) return;

          controller.getCSRFToken = function () {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; csrftoken=`);
            return parts.length === 2 ? parts.pop().split(";").shift() : "";
          };

          controller.fetchJSON = async function (url, options = {}) {
            const response = await fetch(url, {
              ...options,
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": this.getCSRFToken(),
                "X-Requested-With": "XMLHttpRequest",
                ...(options.headers || {}),
              },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || "Request failed");
            return data;
          };

          controller.getShopPanelItemsSignature = function (items, mode) {
            return JSON.stringify((items || []).map((item) => {
              if (mode === "cart_widget") {
                return [
                  item.id,
                  item.product_id,
                  item.quantity,
                  item.total_price,
                  item.image_url,
                  item.variant_name,
                  item.variant_ids,
                ];
              }
              return [item.id, item.price, item.old_price, item.image_url, item.is_liked];
            }));
          };

          controller.refreshFavorites = async function () {
            try {
              const previousSignature = this.getShopPanelItemsSignature(this.state.favorites_widget, "favorites_widget");
              const data = await this.fetchJSON("/api/favorites/");
              this.state.favorites_widget = data.items || [];
              const nextSignature = this.getShopPanelItemsSignature(this.state.favorites_widget, "favorites_widget");
              this.updateUI();
              if (this.state.isOpen && this.state.currentMode === "favorites_widget" && previousSignature !== nextSignature) {
                this.renderHeader();
                this.renderFavorites();
              }
            } catch (_) {
              this.state.favorites_widget = [];
              this.updateUI();
            }
          };

          controller.refreshCart = async function () {
            try {
              const previousSignature = this.getShopPanelItemsSignature(this.state.basketItems, "cart_widget");
              const data = await this.fetchJSON("/api/cart/");
              this.state.basketItems = data.items || [];
              this.state.cartTotalQuantity = data.total_quantity || 0;
              this.state.cartTotalPrice = data.total_price || 0;
              const nextSignature = this.getShopPanelItemsSignature(this.state.basketItems, "cart_widget");
              this.updateUI();
              if (this.state.isOpen && this.state.currentMode === "cart_widget" && previousSignature !== nextSignature) {
                this.renderHeader();
                this.renderBasket();
              }
            } catch (_) {
              this.state.basketItems = [];
              this.state.cartTotalQuantity = 0;
              this.state.cartTotalPrice = 0;
              this.updateUI();
            }
          };

          const originalShow = controller.show.bind(controller);
          controller.show = function (mode) {
            originalShow(mode);
            if (mode === "cart_widget") {
              this.refreshCart();
            } else if (mode === "favorites_widget") {
              this.refreshFavorites();
            }
          };

          controller.updateCartCounters = function (count) {
            const value = count > 9 ? "9+" : `${count}`;
            if (this.elements.basketCounter) this.elements.basketCounter.textContent = value;
            this.elements.basketButton?.classList.toggle("has_items", count > 0);
            window._mobileMenu?.updateBasketBadge?.(count);
          };

          controller.updateUI = function () {
            const favoritesCount = this.state.favorites_widget.length;
            const basketCount = this.state.cartTotalQuantity || this.state.basketItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
            if (this.elements.favoritesCounter) {
              this.elements.favoritesCounter.textContent = favoritesCount > 9 ? "9+" : `${favoritesCount}`;
              this.elements.favoritesCounter.style.display = favoritesCount ? "" : "none";
            }
            this.elements.favoritesButton?.classList.toggle("has_items", favoritesCount > 0);
            this.updateCartCounters(basketCount);
          };

          controller.renderHeader = function () {
            const items = this.getCurrentItems();
            const modeLabel = this.state.currentMode === "cart_widget" ? "Корзина" : "Избранное";
            const iconClass = this.state.currentMode === "cart_widget" ? "fa-shopping-bag" : "fa-heart";
            const modeClass = this.state.currentMode === "cart_widget" ? "shop_panel_mode_cart" : "shop_panel_mode_favorites";
            this.elements.dropdownTitle.innerHTML = `
              <div class="shop-panel__top">
                <div class="shop_panel_title_text">
                  <div class="shop_panel_title_icon ${modeClass}">
                    <i class="fa-solid ${iconClass}"></i>
                  </div>
                  <span>${modeLabel}</span>
                </div>
              </div>
            `;
          };

          controller.getCurrentItems = function () {
            return this.state.currentMode === "cart_widget" ? this.state.basketItems : this.state.favorites_widget;
          };

          controller.formatPrice = function (value) {
            return `${Number(value || 0).toLocaleString("uk-UA")}₴`;
          };

          controller.escapeHtml = function (value) {
            return String(value ?? "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
          };

          controller.getImageMarkup = function (item, alt) {
            if (item.image_url) {
              return `<img src="${this.escapeHtml(item.image_url)}" alt="${this.escapeHtml(alt)}" class="shop_panel_product_image" onerror="this.style.display='none'" />`;
            }
            return `<i class="fa-solid fa-box-open"></i>`;
          };

          controller.getBadgeMarkup = function (badge) {
            if (!badge) return "";
            const className = badge.type === "sale" ? "shop_panel_item_badge_sale" : "shop_panel_item_badge_new";
            return `<span class="${className}">${this.escapeHtml(badge.label)}</span>`;
          };

          controller.getCartVariantDetails = function (item) {
            if (Array.isArray(item.selected_variants) && item.selected_variants.length) {
              return item.selected_variants
                .filter((variant) => variant && variant.name)
                .map((variant) => ({
                  group: variant.group || "Вариант",
                  name: variant.name,
                }));
            }
            if (item.variant_name) {
              return String(item.variant_name)
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
                .map((name) => ({ group: "Вариант", name }));
            }
            return [];
          };

          controller.renderCartVariantInfo = function (item) {
            const variants = this.getCartVariantDetails(item);
            if (!variants.length) return "";
            const panelId = `cart-item-variants-${item.id}`;
            return `
              <button class="cart_item_variant_info" type="button" data-cart-variant-toggle="${item.id}" aria-label="Показать выбранные варианты" aria-expanded="false" aria-controls="${panelId}">
                <span class="cart_item_variant_info_mark" aria-hidden="true">
                  <svg viewBox="0 0 18 18" focusable="false">
                    <path d="M5.25 4.75h7.5M5.25 9h7.5M5.25 13.25h4.6" />
                    <path d="M3.1 4.75h.05M3.1 9h.05M3.1 13.25h.05" />
                  </svg>
                </span>
              </button>
            `;
          };

          controller.renderCartVariantPanel = function (item) {
            const variants = this.getCartVariantDetails(item);
            if (!variants.length) return "";
            const rows = variants.map((variant) => `
              <span class="cart_item_variant_panel_row">
                <span>${this.escapeHtml(variant.group)}</span>
                <strong>${this.escapeHtml(variant.name)}</strong>
              </span>
            `).join("");
            return `
              <div class="cart_item_variant_panel" id="cart-item-variants-${item.id}" data-cart-variant-panel aria-hidden="true">
                <div class="cart_item_variant_panel_inner">
                  ${rows}
                </div>
              </div>
            `;
          };

          controller.animateShopPanelItemRemoval = function (element) {
            if (!element) return Promise.resolve();
            const measuredHeight = element.getBoundingClientRect().height;
            element.style.setProperty("--shop-panel-removal-height", `${measuredHeight}px`);
            element.classList.add("is-removing");
            element.querySelectorAll("button, a").forEach((control) => {
              control.setAttribute("tabindex", "-1");
              control.setAttribute("aria-hidden", "true");
            });
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                element.classList.add("is-collapsing");
              });
            });
            return new Promise((resolve) => {
              window.setTimeout(() => {
                element.remove();
                resolve();
              }, 320);
            });
          };

          controller.renderFavorites = function () {
            const items = this.state.favorites_widget;
            if (!items.length) {
              this.elements.dropdownList.innerHTML = this.createEmptyStateMarkup("all");
              this.hideFooter();
              return;
            }
            this.elements.dropdownList.innerHTML = items.map((item) => {
              const oldPriceMarkup = item.old_price && Number(item.old_price) > Number(item.price)
                ? `<span class="favorite_item_price_old">${this.formatPrice(item.old_price)}</span>`
                : "";
              return `
                <div class="favorites_panel_item" data-favorite-id="${item.id}" data-card-link="${this.escapeHtml(item.detail_url || "#")}" tabindex="0" role="link" aria-label="${this.escapeHtml(item.name)}">
                  <a class="favorite_item_image" href="${this.escapeHtml(item.detail_url || "#")}" aria-label="${this.escapeHtml(item.name)}">
                    ${this.getBadgeMarkup(item.badge)}
                    ${this.getImageMarkup(item, item.name)}
                  </a>
                  <div class="favorite_item_details">
                    <div class="favorite_item_header">
                      <a class="favorite_item_name" href="${this.escapeHtml(item.detail_url || "#")}">${this.escapeHtml(item.name)}</a>
                      <button class="favorite_item_remove" type="button" data-remove-favorite="${item.id}" aria-label="Удалить из избранного">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M4.15 4.15L11.85 11.85M11.85 4.15L4.15 11.85" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                    <div class="favorite_item_price_row">
                      ${oldPriceMarkup}
                      <span class="favorite_item_price">${this.formatPrice(item.price)}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join("");
            this.hideFooter();
            this.bindFavoritesInteractions();
          };

          controller.bindFavoritesInteractions = function () {
            this.elements.dropdownList.querySelectorAll("[data-card-link]").forEach((card) => {
              const openCard = () => {
                const url = card.getAttribute("data-card-link");
                if (url && url !== "#") window.location.href = url;
              };
              card.addEventListener("click", (event) => {
                if (event.target.closest("a, button")) return;
                openCard();
              });
              card.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openCard();
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-remove-favorite]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-remove-favorite"));
                const itemElement = button.closest(".favorites_panel_item");
                try {
                  button.disabled = true;
                  const data = await this.fetchJSON(`/products/${itemId}/like/`, { method: "POST" });
                  document.dispatchEvent(new CustomEvent("product_card_component:liked", {
                    detail: {
                      productId: itemId,
                      liked: Boolean(data.liked),
                      likes: Number(data.likes || 0),
                    },
                  }));
                  await this.animateShopPanelItemRemoval(itemElement);
                  this.state.favorites_widget = this.state.favorites_widget.filter((item) => Number(item.id) !== itemId);
                  this.updateUI();
                  this.renderHeader();
                  if (!this.state.favorites_widget.length) {
                    this.renderFavorites();
                  }
                  this.showToast("Удалено из избранного");
                } catch (error) {
                  button.disabled = false;
                  this.showToast(error.message);
                }
              });
            });
          };

          controller.renderBasket = function () {
            if (!this.state.basketItems.length) {
              this.elements.dropdownList.innerHTML = this.createEmptyStateMarkup("cart_widget");
              this.hideFooter();
              return;
            }
            this.elements.dropdownList.innerHTML = this.state.basketItems.map((item) => `
              <div class="cart_item" data-cart-item-id="${item.id}" data-card-link="${this.escapeHtml(item.product_url || "#")}" tabindex="0" role="link" aria-label="${this.escapeHtml(item.product_name)}">
                <div class="cart_item_image_wrap">
                  <a class="cart_item_image" href="${this.escapeHtml(item.product_url || "#")}" aria-label="${this.escapeHtml(item.product_name)}">
                    ${this.getImageMarkup(item, item.product_name)}
                  </a>
                </div>
                <div class="cart_item_details">
                  <div class="cart_item_topline">
                    <a class="cart_item_name" href="${this.escapeHtml(item.product_url || "#")}">${this.escapeHtml(item.product_name)}</a>
                    <button class="cart_item_remove" type="button" data-remove-cart-item="${item.id}" aria-label="Удалить из корзины">
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4.15 4.15L11.85 11.85M11.85 4.15L4.15 11.85" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                      </svg>
                    </button>
                  </div>
                  <div class="cart_item_meta_row">
                    <div class="cart_item_control_cluster">
                      <div class="cart_quantity_controls">
                        <button class="cart_quantity_button" type="button" data-cart-decrease="${item.id}" aria-label="${item.quantity <= 1 ? "Удалить товар" : "Уменьшить количество"}">
                          <i class="fa-solid fa-minus"></i>
                        </button>
                        <span class="cart_quantity_value">${item.quantity}</span>
                        <button class="cart_quantity_button" type="button" data-cart-increase="${item.id}">
                          <i class="fa-solid fa-plus"></i>
                        </button>
                      </div>
                      ${this.renderCartVariantInfo(item)}
                    </div>
                    <div class="cart_item_meta_cluster">
                      <span class="cart_item_price">${this.formatPrice(item.total_price)}</span>
                    </div>
                  </div>
                </div>
                ${this.renderCartVariantPanel(item)}
              </div>
            `).join("");
            this.showFooter();
            this.bindBasketInteractions();
            this.updateBasketTotals();
          };

          controller.bindBasketInteractions = function () {
            this.elements.dropdownList.querySelectorAll("[data-card-link]").forEach((card) => {
              const openCard = () => {
                const url = card.getAttribute("data-card-link");
                if (url && url !== "#") window.location.href = url;
              };
              card.addEventListener("click", (event) => {
                if (event.target.closest("a, button, [data-cart-variant-toggle], .cart_quantity_controls")) return;
                openCard();
              });
              card.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openCard();
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-cart-variant-toggle]").forEach((button) => {
              button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const card = button.closest(".cart_item");
                const panel = card?.querySelector("[data-cart-variant-panel]");
                if (!card || !panel) return;
                const shouldOpen = !card.classList.contains("is-variants-open");
                this.elements.dropdownList.querySelectorAll(".cart_item.is-variants-open").forEach((openCard) => {
                  if (openCard === card) return;
                  openCard.classList.remove("is-variants-open");
                  openCard.querySelector("[data-cart-variant-toggle]")?.setAttribute("aria-expanded", "false");
                  openCard.querySelector("[data-cart-variant-panel]")?.setAttribute("aria-hidden", "true");
                });
                card.classList.toggle("is-variants-open", shouldOpen);
                button.setAttribute("aria-expanded", String(shouldOpen));
                panel.setAttribute("aria-hidden", String(!shouldOpen));
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-cart-increase], [data-cart-decrease]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-cart-increase") || button.getAttribute("data-cart-decrease"));
                const item = this.state.basketItems.find((cartItem) => cartItem.id === itemId);
                if (!item) return;
                const nextQuantity = button.hasAttribute("data-cart-increase") ? item.quantity + 1 : item.quantity - 1;
                try {
                  if (nextQuantity <= 0) {
                    const itemElement = button.closest(".cart_item");
                    const data = await this.fetchJSON(`/api/cart/${itemId}/`, { method: "DELETE" });
                    await this.animateShopPanelItemRemoval(itemElement);
                    if (data.cart) {
                      this.state.basketItems = data.cart.items || [];
                      this.state.cartTotalQuantity = data.cart.total_quantity || 0;
                      this.state.cartTotalPrice = data.cart.total_price || 0;
                    } else {
                      this.state.basketItems = this.state.basketItems.filter((cartItem) => Number(cartItem.id) !== itemId);
                      this.state.cartTotalQuantity = this.state.basketItems.reduce((sum, cartItem) => sum + (cartItem.quantity || 0), 0);
                      this.state.cartTotalPrice = this.state.basketItems.reduce((sum, cartItem) => sum + Number(cartItem.total_price || 0), 0);
                    }
                    this.updateUI();
                    this.renderHeader();
                    this.updateBasketTotals();
                    if (!this.state.basketItems.length) this.renderBasket();
                    return;
                  }
                  await this.fetchJSON(`/api/cart/${itemId}/`, {
                    method: "PATCH",
                    body: JSON.stringify({ quantity: nextQuantity }),
                  });
                  await this.refreshCart();
                } catch (error) {
                  this.showToast(error.message);
                }
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-remove-cart-item]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-remove-cart-item"));
                const itemElement = button.closest(".cart_item");
                try {
                  button.disabled = true;
                  const data = await this.fetchJSON(`/api/cart/${itemId}/`, { method: "DELETE" });
                  await this.animateShopPanelItemRemoval(itemElement);
                  if (data.cart) {
                    this.state.basketItems = data.cart.items || [];
                    this.state.cartTotalQuantity = data.cart.total_quantity || 0;
                    this.state.cartTotalPrice = data.cart.total_price || 0;
                  } else {
                    this.state.basketItems = this.state.basketItems.filter((item) => Number(item.id) !== itemId);
                    this.state.cartTotalQuantity = this.state.basketItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                    this.state.cartTotalPrice = this.state.basketItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
                  }
                  this.updateUI();
                  this.renderHeader();
                  this.updateBasketTotals();
                  if (!this.state.basketItems.length) {
                    this.renderBasket();
                  }
                } catch (error) {
                  button.disabled = false;
                  this.showToast(error.message);
                }
              });
            });
          };

          controller.ensureFooter = function () {
            if (this.elements.footer?.dataset.cartFooterDesign === "checkout-v2") {
              return;
            }

            this.elements.footer?.remove();
            const footer = document.createElement("div");
            footer.className = "shop_panel_footer";
            footer.dataset.cartFooterDesign = "checkout-v2";
            footer.innerHTML = `
              <details class="cart_promo_section">
                <summary class="cart_promo_summary">
                  <span class="cart_promo_summary_text">Промокод</span>
                  <span class="cart_promo_summary_icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16"><path d="M4.3 6.2 8 9.9l3.7-3.7" /></svg>
                  </span>
                </summary>
                <div class="cart_promo_body">
                  <div class="cart_promo_input_wrapper">
                    <input type="text" class="cart_promo_input" id="promoInput" placeholder="SAVE20" autocomplete="off" />
                    <button class="cart_promo_button" type="button">Применить</button>
                  </div>
                </div>
              </details>
              <div class="cart_total_section">
                <div class="cart_total_copy">
                  <span class="cart_total_label">К оплате</span>
                  <span class="cart_total_hint">Без учета доставки</span>
                </div>
                <div class="cart_total_prices">
                  <span class="cart_total_price cart_price_old" id="oldPrice"></span>
                  <span class="cart_total_price" id="totalPrice">0₴</span>
                </div>
              </div>

              <button class="cart_checkout_button" type="button">
                <span class="cart_checkout_text">Оформить заказ</span>
                <span class="cart_checkout_icon_container" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="cart_checkout_icon cart_checkout_card_icon">
                    <path d="M20,8H4V6H20M20,18H4V12H20M20,4H4C2.89,4 2,4.89 2,6V18C2,19.11 2.89,20 4,20H20C21.11,20 22,19.11 22,18V6C22,4.89 21.11,4 20,4Z" fill="currentColor"></path>
                  </svg>
                  <svg viewBox="0 0 24 24" class="cart_checkout_icon cart_checkout_terminal_icon">
                    <path d="M2,17H22V21H2V17M6.25,7H9V6H6V3H18V6H15V7H17.75L19,17H5L6.25,7M9,10H15V8H9V10M9,13H15V11H9V13Z" fill="currentColor"></path>
                  </svg>
                  <svg viewBox="0 0 24 24" class="cart_checkout_icon cart_checkout_coin_icon">
                    <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="currentColor"></path>
                  </svg>
                  <svg viewBox="0 0 24 24" class="cart_checkout_icon cart_checkout_wallet_icon is-default">
                    <path d="M21,18V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V6H12C10.89,6 10,6.9 10,8V16A2,2 0 0,0 12,18M12,16H22V8H12M16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5Z" fill="currentColor"></path>
                  </svg>
                  <svg viewBox="0 0 24 24" class="cart_checkout_icon cart_checkout_check_icon">
                    <path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" fill="currentColor"></path>
                  </svg>
                </span>
              </button>
            `;

            this.elements.dropdown.appendChild(footer);
            this.elements.footer = footer;

            const promoInput = footer.querySelector("#promoInput");
            const promoButton = footer.querySelector(".cart_promo_button");
            const checkoutButton = footer.querySelector(".cart_checkout_button");

            promoInput?.addEventListener("input", () => {
              promoInput.value = promoInput.value.toUpperCase();
              promoInput.classList.remove("valid", "invalid");
            });

            promoInput?.addEventListener("keydown", (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                this.applyPromoCode();
              }
            });

            promoButton?.addEventListener("click", () => this.applyPromoCode());
            checkoutButton?.addEventListener("click", () => {
              this.showToast("Переход к оформлению заказа");
            });
          };

          controller.updateBasketTotals = function () {
            const totalPrice = document.getElementById("totalPrice");
            const oldPrice = document.getElementById("oldPrice");
            if (oldPrice) {
              oldPrice.classList.remove("show");
              oldPrice.textContent = "";
            }
            if (!totalPrice) return;
            const total = Number(this.state.cartTotalPrice || 0);
            if (this.state.promoApplied) {
              oldPrice?.classList.add("show");
              if (oldPrice) oldPrice.textContent = this.formatPrice(total);
              totalPrice.textContent = this.formatPrice(Math.round(total * (1 - this.discountPercent / 100)));
              return;
            }
            totalPrice.textContent = this.formatPrice(total);
          };

          controller.addItem = async function (customItem = null, targetList = "favorites_widget") {
            if (targetList === "cart_widget" && customItem?.product_id) {
              await this.fetchJSON("/api/cart/add/", {
                method: "POST",
                body: JSON.stringify(customItem),
              });
              await this.refreshCart();
            }
          };

          controller.seedDemoItems = function () {};
          controller.refreshFavorites();
          controller.refreshCart();
        }

        installRealShopPanelController(shopPanelController);
        window._shopPanel = shopPanelController;

        // Patch ShopPanelController to also update mobile site-nav__badge
        const origUpdateUI = shopPanelController.updateUI.bind(shopPanelController);
        shopPanelController.updateUI = function () {
          origUpdateUI();
          const count = this.state.cartTotalQuantity || this.state.basketItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
          window._mobileMenu?.updateBasketBadge(count);
        };

        new HeaderVisibilityController({
          megaMenuController,
          shopPanelController,
        });

        const mobileMenu = new MobileMenuController(shopPanelController);
        window._mobileMenu = mobileMenu;

        new ContactsModalController();
        new DeliveryModalController();
        new ClientCardModalController();

        window.addEventListener("load", () => {
          shopPanelController?.updatePanelPosition?.();
        });

        const refreshShopPanelData = () => {
          shopPanelController?.refreshFavorites?.();
          shopPanelController?.refreshCart?.();
        };

        window.setTimeout(refreshShopPanelData, 120);

        window.addEventListener("pageshow", refreshShopPanelData);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) refreshShopPanelData();
        });
        window.addEventListener("focus", refreshShopPanelData);
      });

      document.addEventListener("click", (event) => {
        const link = event.target.closest("[data-product-browser-link]");
        if (!link || window.location.pathname !== "/") return;

        const target = document.getElementById("products");
        if (!target) return;
        event.preventDefault();

        const sort = link.getAttribute("data-product-browser-sort");
        if (sort) {
          const sortButton = document.querySelector(`[data-sort-option-key="${sort}"]`);
          sortButton?.click();
        }
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState({}, "", sort ? `/?sort=${sort}#products` : "/#products");
      });
