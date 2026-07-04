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
            <div class="search_results_empty">
              <div class="search_results_empty_title">${this.escapeHtml(message)}</div>
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
              <div class="search_results_empty">
                <div class="search_results_empty_title">Ничего не найдено</div>
                <a class="search_result_empty_link" href="${catalogUrl}">Перейти в каталог</a>
              </div>
            `;
            this.show();
            return;
          }

          this.dropdown.innerHTML = `
            <div class="search_results_list">
              ${results.map((product) => this.renderProduct(product)).join("")}
            </div>
            <div class="search_result_footer">
              <a href="${catalogUrl}">Показать все результаты${total > results.length ? ` (${total})` : ""}</a>
            </div>
          `;
          this.dropdown.querySelectorAll(".search_result_item").forEach((item) => {
            item.addEventListener("click", () => {
              this.onSelect?.();
            });
          });
          this.show();
        }

        renderProduct(product) {
          const image = product.image_url
            ? `<img class="search_result_image" src="${this.escapeHtml(product.image_url)}" alt="${this.escapeHtml(product.name)}" loading="lazy">`
            : `<span class="search_result_image" aria-hidden="true"></span>`;
          const statusHtml = product.available ? "" : '<span class="search_result_status">Нет в наличии</span>';
          return `
            <a class="search_result_item" href="${this.escapeHtml(product.url)}">
              ${image}
              <span class="search_result_content">
                <span class="search_result_name">${this.escapeHtml(product.name)}</span>
                <span class="search_result_meta">
                  <span>${this.escapeHtml(product.brand || "Без бренда")}</span>
                  <span>${this.escapeHtml(product.code || "")}</span>
                </span>
              </span>
              <span>
                <span class="search_result_price">${this.formatPrice(product.price)}</span>
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
          this.underline = document.querySelector(".search_input_underline");
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
          this.searchRoot.classList.add("search_widget_active");
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
          this.searchRoot.classList.remove("search_widget_active");
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
          this.iconContainers = document.querySelectorAll(".promo_banner_icon_container");
          this.track = document.querySelector(".promo_banner_track");
          this.iconClassNames = ["promo_banner_icon_question", "promo_banner_icon_phone", "promo_banner_icon_telegram"];
          this.currentIconIndex = 0;
          this.iconIntervalId = null;

          // Состояния для отложенной паузы
          this.pauseTimeout = null;
          this.isPaused = false;
          this.waitingForCycleEnd = false;
          this.handleTrackMouseEnter = null;
          this.handleTrackMouseLeave = null;

          if (this.iconContainers.length) {
            this.startAnimation();
          }

          if (this.track) {
            this.bindHoverPause();
          }
        }

        startAnimation() {
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

        bindHoverPause() {
          // Получаем длительность одного цикла анимации из CSS (в миллисекундах)
          const getAnimationDuration = () => {
            const style = getComputedStyle(this.track);
            const duration = parseFloat(style.animationDuration);
            return duration * 1000; // в мс
          };

          this.handleTrackMouseEnter = () => {
            // Если уже на паузе или уже ждём завершения цикла — ничего не делаем
            if (this.isPaused || this.waitingForCycleEnd) return;

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
              this.track.style.animationPlayState = "running";
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
        }
      }

      class NavigationUnderlineController {
        constructor() {
          this.header = document.querySelector("[data-header]");
          this.navItems = [...document.querySelectorAll(".navigation_item")];

          if (!this.header || !this.navItems.length) {
            return;
          }

          this.updateOffsets();
          window.addEventListener("resize", () => this.updateOffsets());
        }

        updateOffsets() {
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
          this.menu = document.querySelector("[data-mega-menu-panel]");
          this.menuContainer = document.querySelector("[data-mega-menu-container]");
          this.header = document.querySelector("[data-header]");
          this.infoLine = document.querySelector("[data-info-line]");
          this.navItems = [...document.querySelectorAll(".navigation_item")];
          this.activeTrigger = null;
          this.closeTimeoutId = null;
          this.catalogUrl = "/#products";

          if (!this.menu || !this.menuContainer || !this.header || !this.navItems.length) {
            return;
          }

          this.bindEvents();
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
            this.menu.classList.remove("active");
            this.header.classList.remove("mega_menu_open");

            if (this.activeTrigger) {
              this.activeTrigger.classList.remove("navigation_item_active");
              this.activeTrigger.querySelector("a")?.setAttribute("aria-expanded", "false");
            }

            if (this.infoLine) {
              this.infoLine.style.opacity = "1";
              this.infoLine.style.visibility = "visible";
            }

            this.activeTrigger = null;
            // hide mega menu overlay when menu closed
            const mmOverlayClose = document.getElementById("megaMenuOverlay");
            if (mmOverlayClose) mmOverlayClose.classList.remove("open");
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
            item.classList.remove("navigation_item_active");
            item.querySelector("a")?.setAttribute("aria-expanded", "false");
          });

          navItem.classList.add("navigation_item_active");
          navItem.querySelector("a")?.setAttribute("aria-expanded", "true");
          this.activeTrigger = navItem;

          if (this.infoLine) {
            this.infoLine.style.opacity = "0";
            this.infoLine.style.visibility = "hidden";
          }

          this.menu.classList.add("active");
          this.header.classList.add("mega_menu_open");
          // show blur overlay for promo cards and collections layouts
          const mmOverlay = document.getElementById("megaMenuOverlay");
          if (mmOverlay) {
            if (this.menu.classList.contains("mega_menu_layout_promo_cards") || this.menu.classList.contains("mega_menu_layout_collections")) {
              mmOverlay.classList.add("open");
            } else {
              mmOverlay.classList.remove("open");
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

          if (sectionName === "navigation_item_sale") {
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
            actionsList: document.querySelector(".navigation_secondary_list"),
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
          const actionsList = this.elements.actionsList; // .navigation_secondary_list
          const bigButtons = actionsList.closest(".header_actions_wrapper");
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

          // Перемещаем сам дропдаун в .header_actions_wrapper (за пределы <ul>)
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
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.updatePanelPosition(), 60);
          });
          window.addEventListener("scroll", () => {
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

          this.elements.dropdown.style.top = `${headerRect.height}px`;
          this.elements.dropdown.style.left = `${clampedLeft}px`;
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
        <div class="page_header_top">
          <div class="shop_panel_title_text">
            <div class="shop_panel_title_icon shop_panel_mode_cart">
              <i class="fa-solid fa-shopping-bag"></i>
            </div>
            <span>Корзина</span>
          </div>
          <span class="shop_panel_items_count">${items.length} ${this.getItemsCountLabel(items.length)}</span>
        </div>
      `;
            return;
          }

          // внутри renderHeader() после заголовка
          this.elements.dropdownTitle.innerHTML = `
            <div class="page_header_top">
              <div class="shop_panel_title_text">
                <div class="shop_panel_title_icon shop_panel_mode_favorites">
                  <i class="fa-solid fa-heart"></i>
                </div>
                <span>Избранное</span>
              </div>
              <span class="shop_panel_items_count">${items.length} ${this.getItemsCountLabel(items.length)}</span>
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
          this.megaMenuController = megaMenuController;
          this.shopPanelController = shopPanelController;
          this.lastScrollTop = 0;
          this.frameScheduled = false;

          if (!this.header) {
            return;
          }

          this.updateLayoutVariables();
          this.syncPositions();
          this.bindEvents();
        }

        bindEvents() {
          window.addEventListener("scroll", () => this.onScroll());
          window.addEventListener("resize", () => {
            this.updateLayoutVariables();
            this.syncPositions();
          });
          window.addEventListener("product-sticky-bar-change", () => {
            window.setTimeout(() => {
              this.updateLayoutVariables();
              this.syncPositions();
            }, 40);
          });
        }

        onScroll() {
          if (this.frameScheduled) {
            return;
          }

          this.frameScheduled = true;

          requestAnimationFrame(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            if (scrollTop > 120) {
              document.body.classList.add("scrolled");

              if (scrollTop > this.lastScrollTop) {
                document.body.classList.add("header_hidden");
                this.header.classList.add("page_header_hidden");
                this.megaMenuController?.hide(true);
                this.shopPanelController?.forceHide();

                if (this.infoLine) {
                  this.updateLayoutVariables();
                  this.syncPositions();
                }
              } else {
                document.body.classList.remove("header_hidden");
                this.header.classList.remove("page_header_hidden");
                this.updateLayoutVariables();
                this.syncPositions();
              }
            } else {
              document.body.classList.remove("scrolled");
              document.body.classList.remove("header_hidden");
              this.header.classList.remove("page_header_hidden");
              this.updateLayoutVariables();
              this.syncPositions();
            }

            this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
            this.frameScheduled = false;
          });
        }

        updateLayoutVariables() {
          const headerHeight = this.header.offsetHeight;
          const infoLineHeight = this.infoLine?.offsetHeight || 32;
          document.documentElement.style.setProperty("--header-height", `${headerHeight}px`);
          document.documentElement.style.setProperty("--info-line-height", `${infoLineHeight}px`);
        }

        syncPositions() {
          if (!this.infoLine) {
            return;
          }

          const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || this.header.offsetHeight;
          this.infoLine.style.top = `${headerHeight}px`;
          this.infoLine.style.zIndex = document.body.classList.contains("header_hidden") ? "1001" : "999";
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
          this.mobileBasketBtn = document.getElementById("mobileBasketBtn");
          this.searchOverlay = document.getElementById("mobileSearchOverlay");
          this.searchInput = document.getElementById("mobileSearchInput");
          this.searchCloseBtn = document.getElementById("mobileSearchClose");
          this.searchResults = document.getElementById("mobileSearchResults");
          this.mobileBasketBadge = document.getElementById("mobileBasketBadge");

          // Accordion items
          this.accordionLinks = document.querySelectorAll("[data-accordion]");

          this.isOpen = false;
          this.searchResultsController = new HeaderProductSearchResults(this.searchInput, this.searchResults, {
            onSelect: () => this.closeSearch(false),
          });
          this.bindEvents();
        }

        bindEvents() {
          // Burger toggles menu (becomes X when open)
          this.burgerBtn?.addEventListener("click", () => this.toggleMenu());

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
              const item = link.closest(".mobile_menu_item");
              if (!item) return;

              const nextExpandedState = !item.classList.contains("expanded");
              item.classList.toggle("expanded", nextExpandedState);
              link.setAttribute("aria-expanded", String(nextExpandedState));
            });
          });

          // Mobile search_widget
          this.searchBtn?.addEventListener("click", () => this.openSearch());
          this.searchCloseBtn?.addEventListener("click", () => this.closeSearch());
          this.searchOverlay?.addEventListener("click", (e) => {
            if (e.target === this.searchOverlay) this.closeSearch();
          });

          // Mobile cart_widget btn (header)
          this.mobileBasketBtn?.addEventListener("click", () => {
            this.shopPanelController?.toggle("cart_widget");
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
        }

        toggleMenu() {
          this.isOpen ? this.closeMenu() : this.openMenu();
        }

        openMenu() {
          this.isOpen = true;
          this.menu.classList.add("open");
          this.burgerBtn.classList.add("open");
          this.burgerBtn.setAttribute("aria-expanded", "true");
          document.querySelector("[data-header]")?.classList.add("mobile_menu_open");
          document.querySelector("[data-info-line]")?.style.setProperty("visibility", "hidden");

          // Последовательно скрываем кнопки: поиск → избранное → корзина
          const icons = ["mobileSearchBtn", "mobileFavBtn", "mobileBasketBtn"];
          icons.forEach((id, i) => {
            window.setTimeout(() => {
              document.getElementById(id)?.classList.add("icon-hide");
            }, i * 80);
          });

          // Плавно меняем цвет хедера под drawer
          document.querySelector("[data-header]")?.classList.add("mobile_menu_header_open");
        }

        closeMenu() {
          this.isOpen = false;
          this.menu.classList.remove("open");
          this.burgerBtn.classList.remove("open");
          this.burgerBtn.setAttribute("aria-expanded", "false");
          document.querySelector("[data-header]")?.classList.remove("mobile_menu_open");
          document.querySelector("[data-info-line]")?.style.setProperty("visibility", "visible");

          // Последовательно возвращаем кнопки: корзина → избранное → поиск
          const icons = ["mobileBasketBtn", "mobileFavBtn", "mobileSearchBtn"];
          icons.forEach((id, i) => {
            window.setTimeout(() => {
              document.getElementById(id)?.classList.remove("icon-hide");
            }, i * 80);
          });

          // Возвращаем цвет хедера
          document.querySelector("[data-header]")?.classList.remove("mobile_menu_header_open");
        }

        openSearch() {
          this.searchOverlay.classList.add("open");
          window.setTimeout(() => this.searchInput?.focus(), 120);
        }

        closeSearch(clearInput = true) {
          this.searchOverlay.classList.remove("open");
          if (clearInput) {
            this.searchResultsController?.clear();
          } else {
            this.searchResultsController?.hide();
          }
          if (this.searchInput && clearInput) this.searchInput.value = "";
        }

        // Called by ShopPanelController to sync cart_widget notification_badge
        updateBasketBadge(count) {
          if (!this.mobileBasketBtn || !this.mobileBasketBadge) return;
          this.mobileBasketBadge.textContent = count > 9 ? "9+" : String(count);
          if (count > 0) {
            this.mobileBasketBtn.classList.add("has_items");
          } else {
            this.mobileBasketBtn.classList.remove("has_items");
          }
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

          this.panelData = [
            {
              title: "ДОСТАВКА",
              subtitle: "Надёжная упаковка и быстрая отправка",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><circle cx="18.5" cy="15.5" r="2.5"/><path d="M20.27 17.27 22 19"/></svg>`,
            },
            {
              title: "СПОСОБЫ ОПЛАТЫ",
              subtitle: "Удобные варианты для вас",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/><line x1="14" y1="15" x2="16" y2="15"/></svg>`,
            },
            {
              title: "ВАЖНЫЕ УСЛОВИЯ",
              subtitle: "Ограничения и правила получения",
              icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
            },
          ];

          this.bindEvents();
          this.updateUI();
        }

        bindEvents() {
          // Триггеры открытия
          document.querySelectorAll("[data-delivery-open]").forEach((el) => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
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
          this.overlay.classList.add("delivery_overlay_open");
          this.backdrop?.classList.add("delivery_backdrop_open");
          document.body.style.overflow = "hidden";
        }

        close() {
          this.overlay.classList.remove("delivery_overlay_open");
          this.backdrop?.classList.remove("delivery_backdrop_open");
          document.body.style.overflow = "";
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

          this.bindEvents();
        }

        bindEvents() {
          // Все триггеры (десктоп + мобайл)
          document.querySelectorAll("[data-contacts-open]").forEach((el) => {
            el.addEventListener("click", (e) => {
              e.preventDefault();
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
            if (e.key === "Escape" && this.overlay.classList.contains("open")) this.close();
          });
        }

        open() {
          this.overlay.classList.add("open");
          this.backdrop?.classList.add("open");
          document.body.style.overflow = "hidden";
        }

        close() {
          this.overlay.classList.remove("open");
          this.backdrop?.classList.remove("open");
          document.body.style.overflow = "";
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

          controller.refreshFavorites = async function () {
            try {
              const data = await this.fetchJSON("/api/favorites/");
              this.state.favorites_widget = data.items || [];
              this.updateUI();
              if (this.state.isOpen && this.state.currentMode === "favorites_widget") {
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
              const data = await this.fetchJSON("/api/cart/");
              this.state.basketItems = data.items || [];
              this.state.cartTotalQuantity = data.total_quantity || 0;
              this.state.cartTotalPrice = data.total_price || 0;
              this.updateUI();
              if (this.state.isOpen && this.state.currentMode === "cart_widget") {
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
              <div class="page_header_top">
                <div class="shop_panel_title_text">
                  <div class="shop_panel_title_icon ${modeClass}">
                    <i class="fa-solid ${iconClass}"></i>
                  </div>
                  <span>${modeLabel}</span>
                </div>
                <span class="shop_panel_items_count">${items.length} ${this.getItemsCountLabel(items.length)}</span>
              </div>
            `;
          };

          controller.getCurrentItems = function () {
            return this.state.currentMode === "cart_widget" ? this.state.basketItems : this.state.favorites_widget;
          };

          controller.formatPrice = function (value) {
            return `${Number(value || 0).toLocaleString("uk-UA")}₴`;
          };

          controller.getImageMarkup = function (item, alt) {
            if (item.image_url) {
              return `<img src="${item.image_url}" alt="${alt}" class="shop_panel_product_image" onerror="this.style.display='none'" />`;
            }
            return `<i class="fa-solid fa-box-open"></i>`;
          };

          controller.getBadgeMarkup = function (badge) {
            if (!badge) return "";
            const className = badge.type === "sale" ? "shop_panel_item_badge_sale" : "shop_panel_item_badge_new";
            return `<span class="${className}">${badge.label}</span>`;
          };

          controller.renderFavorites = function () {
            const items = this.state.favorites_widget;
            if (!items.length) {
              this.elements.dropdownList.innerHTML = this.createEmptyStateMarkup("all");
              this.hideFooter();
              return;
            }
            this.elements.dropdownList.innerHTML = items.map((item) => {
              const variants = item.display_variant_options || item.variant_options || [];
              const variantMarkup = variants.length ? `
                <div class="cart_size_selector">
                  ${variants.map((variant) => `
                    <button
                      class="size ${variant.available ? "available" : ""}"
                      type="button"
                      data-favorite-variant="${item.id}"
                      data-variant-id="${variant.id}"
                      ${variant.available ? "" : "disabled"}
                    >${variant.name}</button>
                  `).join("")}
                </div>
              ` : "";
              return `
                <div class="favorites_panel_item" data-favorite-id="${item.id}">
                  <div class="cart_item_image_stack">
                    ${this.getBadgeMarkup(item.badge)}
                    <div class="promo_image_slider">
                      <div class="promo_image_slide active">
                        ${this.getImageMarkup(item, item.name)}
                      </div>
                    </div>
                  </div>
                  <div class="shop_panel_item_details">
                    <div class="shop_panel_item_header">
                      <a class="shop_panel_item_name" href="${item.detail_url || "#"}">${item.name}</a>
                      <button class="cart_remove_button" type="button" data-remove-favorite="${item.id}">
                        <i class="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                    <div class="shop_panel_item_price_row">
                      <div class="shop_panel_item_price">${this.formatPrice(item.price)}</div>
                      ${item.old_price && Number(item.old_price) > Number(item.price) ? `<div class="shop_panel_item_price_old">${this.formatPrice(item.old_price)}</div>` : ""}
                    </div>
                    ${variantMarkup}
                    <button class="cart_add_button" type="button" data-add-favorite-to-cart="${item.id}">
                      <i class="fa-solid fa-cart-plus"></i>
                      <span>В корзину</span>
                    </button>
                  </div>
                </div>
              `;
            }).join("");
            this.hideFooter();
            this.bindFavoritesInteractions();
          };

          controller.bindFavoritesInteractions = function () {
            this.elements.dropdownList.querySelectorAll("[data-favorite-variant]").forEach((button) => {
              button.addEventListener("click", () => {
                const itemId = Number(button.getAttribute("data-favorite-variant"));
                const parent = button.closest(".cart_size_selector");
                parent?.querySelectorAll(".size").forEach((item) => item.classList.remove("selected"));
                button.classList.add("selected");
                this.state.selectedSizes[itemId] = Number(button.getAttribute("data-variant-id"));
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-add-favorite-to-cart]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-add-favorite-to-cart"));
                const item = this.state.favorites_widget.find((favorite) => favorite.id === itemId);
                if (!item) return;
                const variants = item.display_variant_options || item.variant_options || [];
                const variantId = this.state.selectedSizes[itemId] || null;
                if (variants.length && !variantId) {
                  this.showToast("Выберите вариант");
                  return;
                }
                try {
                  await this.fetchJSON("/api/cart/add/", {
                    method: "POST",
                    body: JSON.stringify({ product_id: item.id, variant_id: variantId, quantity: 1 }),
                  });
                  await this.refreshCart();
                  this.showToast("Товар добавлен в корзину");
                } catch (error) {
                  this.showToast(error.message);
                }
              });
            });
            this.elements.dropdownList.querySelectorAll("[data-remove-favorite]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-remove-favorite"));
                try {
                  await this.fetchJSON(`/products/${itemId}/like/`, { method: "POST" });
                  await this.refreshFavorites();
                  this.showToast("Удалено из избранного");
                } catch (error) {
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
              <div class="cart_item" data-cart-item-id="${item.id}">
                <div class="cart_item_image">
                  ${this.getImageMarkup(item, item.product_name)}
                </div>
                <div class="cart_item_details">
                  <a class="cart_item_name" href="${item.product_url || "#"}">${item.product_name}</a>
                  ${item.variant_name ? `<div class="shop_panel_item_variant">${item.variant_name}</div>` : ""}
                  <div class="cart_item_price">${this.formatPrice(item.total_price)}</div>
                  <div class="cart_quantity_controls">
                    <button class="cart_quantity_button" type="button" data-cart-decrease="${item.id}" ${item.quantity <= 1 ? "disabled" : ""}>
                      <i class="fa-solid fa-minus"></i>
                    </button>
                    <span class="cart_quantity_value">${item.quantity}</span>
                    <button class="cart_quantity_button" type="button" data-cart-increase="${item.id}">
                      <i class="fa-solid fa-plus"></i>
                    </button>
                  </div>
                </div>
                <button class="cart_item_remove" type="button" data-remove-cart-item="${item.id}">
                  <i class="fa-solid fa-trash-alt"></i>
                </button>
              </div>
            `).join("");
            this.showFooter();
            this.bindBasketInteractions();
            this.updateBasketTotals();
          };

          controller.bindBasketInteractions = function () {
            this.elements.dropdownList.querySelectorAll("[data-cart-increase], [data-cart-decrease]").forEach((button) => {
              button.addEventListener("click", async () => {
                const itemId = Number(button.getAttribute("data-cart-increase") || button.getAttribute("data-cart-decrease"));
                const item = this.state.basketItems.find((cartItem) => cartItem.id === itemId);
                if (!item) return;
                const nextQuantity = button.hasAttribute("data-cart-increase") ? item.quantity + 1 : item.quantity - 1;
                try {
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
                try {
                  await this.fetchJSON(`/api/cart/${itemId}/`, { method: "DELETE" });
                  await this.refreshCart();
                } catch (error) {
                  this.showToast(error.message);
                }
              });
            });
          };

          controller.updateBasketTotals = function () {
            const totalPrice = document.getElementById("totalPrice");
            const oldPrice = document.getElementById("oldPrice");
            if (oldPrice) {
              oldPrice.classList.remove("show");
              oldPrice.textContent = "";
            }
            if (totalPrice) totalPrice.textContent = this.formatPrice(this.state.cartTotalPrice || 0);
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

        // Patch ShopPanelController to also update mobile notification_badge
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

        window.addEventListener("load", () => {
          shopPanelController?.updatePanelPosition?.();
        });

        window.setTimeout(() => {
          shopPanelController?.refreshFavorites?.();
          shopPanelController?.refreshCart?.();
        }, 120);
      });

      document.addEventListener("click", (event) => {
        const link = event.target.closest("[data-product-browser-link]");
        if (!link || window.location.pathname !== "/") return;

        const target = document.getElementById("products");
        if (!target) return;
        event.preventDefault();

        const sort = link.getAttribute("data-product-browser-sort");
        if (sort) {
          const sortButton = document.querySelector(`[data_sort_option_key="${sort}"]`);
          sortButton?.click();
        }
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState({}, "", sort ? `/?sort=${sort}#products` : "/#products");
      });
