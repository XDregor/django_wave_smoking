(() => {
        /* ============================================================
         DATA — из Django (products_json из views.py)
        ============================================================ */
        const _rawData = document.getElementById("productsData");
        const _rawCategories = document.getElementById("categoriesData");
        let allProducts = [];
        let allCategories = [];
        try {
          const parsed = _rawData ? JSON.parse(_rawData.textContent) : [];
          allProducts = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          allProducts = [];
        }
        try {
          const parsedCategories = _rawCategories ? JSON.parse(_rawCategories.textContent) : [];
          allCategories = Array.isArray(parsedCategories) ? parsedCategories : [];
        } catch (e) {
          allCategories = [];
        }

        // Пустой стейт обрабатывается только внутри render()

        /* ============================================================
         STATE
      ============================================================ */
        const maxPrice = allProducts.length > 0 ? Math.ceil((Math.max(...allProducts.map(p => p.price)) * 1.1) / 50) * 50 : 5000;
        const _rMaxEl = document.getElementById("filter_range_max_slider_id");
        const _rMinEl = document.getElementById("filter_range_min_slider_id");
        const _iMaxEl = document.getElementById("filter_price_max_input_id");
        if (_rMaxEl) { _rMaxEl.max = maxPrice; _rMaxEl.value = maxPrice; }
        if (_rMinEl) { _rMinEl.max = maxPrice; }
        if (_iMaxEl) { _iMaxEl.value = maxPrice; _iMaxEl.max = maxPrice; }

        let state = {
          categoryFilter: "all", // all | pod | liquid | cart | acc
          priceMin: 0,
          priceMax: maxPrice,
          brandFilters: new Set(),
          variantFilters: {},
          page: 1,
          perPage: 30,
          sort: "recommended",
          view: 4,
          searchQuery: "",
        };

        function parseCsv(value) {
          return String(value || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }

        function normalizeBrandFilterTokens(tokens) {
          const brandLookup = new Map();
          allProducts.forEach((product) => {
            if (!product.brand_id) return;
            const id = String(product.brand_id);
            [id, product.brand_slug, product.brand]
              .filter(Boolean)
              .forEach((value) => {
                brandLookup.set(String(value).trim().toLowerCase(), id);
              });
          });

          return tokens
            .map((token) => brandLookup.get(String(token).trim().toLowerCase()))
            .filter(Boolean);
        }

        function readStateFromUrl() {
          const params = new URLSearchParams(window.location.search);
          state.categoryFilter = params.get("category") || "all";
          state.priceMin = Math.min(maxPrice, Math.max(0, Math.round(Number(params.get("price_min") || 0))));
          state.priceMax = Math.min(maxPrice, Math.round(Number(params.get("price_max") || maxPrice)));
          if (state.priceMax < state.priceMin) state.priceMax = maxPrice;
          state.brandFilters = new Set(normalizeBrandFilterTokens(parseCsv(params.get("brands"))));
          state.variantFilters = {};
          params.forEach((value, key) => {
            if (!key.startsWith("variant_group_")) return;
            const group = key.replace("variant_group_", "") || "default";
            state.variantFilters[group] = new Set(parseCsv(value).map(String));
          });
          state.sort = params.get("sort") || "recommended";
          state.searchQuery = (params.get("q") || "").trim();
        }

        function writeStateToUrl() {
          const params = new URLSearchParams();
          if (state.categoryFilter !== "all") params.set("category", state.categoryFilter);
          if (state.priceMin > 0) params.set("price_min", String(state.priceMin));
          if (state.priceMax < maxPrice) params.set("price_max", String(state.priceMax));
          if (state.brandFilters.size) params.set("brands", [...state.brandFilters].join(","));
          Object.entries(state.variantFilters).forEach(([group, values]) => {
            if (values.size) params.set(`variant_group_${group}`, [...values].join(","));
          });
          if (state.sort !== "recommended") params.set("sort", state.sort);
          if (state.searchQuery) {
            params.set("q", state.searchQuery);
            params.set("search", "1");
          }
          const query = params.toString();
          const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
          window.history.replaceState({}, "", nextUrl);
        }

        readStateFromUrl();

        function getBadgeType(product) {
          return product.badge?.type || "";
        }

        function getDiscountPercent(product) {
          if (Number(product.discount_percent) > 0) return Number(product.discount_percent);
          if (product.old_price && product.price && Number(product.old_price) > Number(product.price)) {
            return Math.round((1 - Number(product.price) / Number(product.old_price)) * 100);
          }
          return 0;
        }

        function escapeHtml(value) {
          const node = document.createElement("div");
          node.textContent = value == null ? "" : String(value);
          return node.innerHTML;
        }

        function getProductColorVariants(product) {
          const variants = [
            ...(Array.isArray(product.display_options) ? product.display_options : []),
            ...(Array.isArray(product.variant_options) ? product.variant_options : []),
          ];
          const seen = new Set();
          return variants.filter((variant) => {
            if (variant.group_kind !== "color" || !variant.color_hex) return false;
            const key = String(variant.option_id || variant.id || variant.name || "");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        function renderProductColorSwatches(product) {
          return getProductColorVariants(product).map((variant) => {
            const imageUrl = variant.image_url || variant.thumbnail_url || "";
            const label = variant.name || variant.filter_name || "Цвет";
            return `
              <button
                class="product_card_color_swatch"
                type="button"
                style="--product-swatch-color: ${escapeHtml(variant.color_hex)}"
                data-product-card-color-swatch
                data-product-card-color-image="${escapeHtml(imageUrl)}"
                aria-label="${escapeHtml(label)}"
                aria-pressed="false"
                title="${escapeHtml(label)}"
              ></button>
            `;
          }).join("");
        }

        function hydrateProductCard(card, product) {
          if (!card || !product) return;
          const image = card.querySelector(".product_card_image_element");
          if (image && !image.getAttribute("data-product-card-default-image")) {
            image.setAttribute("data-product-card-default-image", image.getAttribute("src") || product.image_url || "");
          }
          const swatches = card.querySelector(".product_card_color_swatches");
          if (swatches) swatches.innerHTML = renderProductColorSwatches(product);
        }

        function hydrateRenderedCards(products) {
          const productById = new Map(products.map((product) => [Number(product.id), product]));
          document.querySelectorAll(".product_card_component[data-product-card-id]").forEach((card) => {
            hydrateProductCard(card, productById.get(Number(card.getAttribute("data-product-card-id"))));
          });
        }

        function isProductAvailable(product) {
          if (Number(product.stock) <= 0) return false;

          const variants = Array.isArray(product.display_options) ? product.display_options : [];
          if (variants.length) return variants.some((variant) => Boolean(variant.available));
          return true;
        }

        function normalizeSearch(value) {
          return String(value || "")
            .toLowerCase()
            .trim()
            .replace(/\s+/g, " ");
        }

        function getProductSearchCode(product) {
          return `654${String(product.id).padStart(4, "0")}`;
        }

        function matchesProductSearch(product, query) {
          if (!query) return true;

          const fields = [
            product.name,
            product.brand,
            product.brand_name,
            product.brand_slug,
            product.category,
            product.category_name,
            getProductSearchCode(product),
            product.id,
          ];

          const variants = [
            ...(Array.isArray(product.variant_options) ? product.variant_options : []),
            ...(Array.isArray(product.display_options) ? product.display_options : []),
          ];

          variants.forEach((variant) => {
            fields.push(variant.name);
            fields.push(variant.slug);
            fields.push(variant.group);
          });

          return fields
            .filter(Boolean)
            .some((field) => normalizeSearch(field).includes(query));
        }

        function getProductSearchRank(product, query) {
          if (!query) return 99;
          const code = normalizeSearch(getProductSearchCode(product));
          const name = normalizeSearch(product.name);
          const brand = normalizeSearch(product.brand || product.brand_name);
          const variants = [
            ...(Array.isArray(product.variant_options) ? product.variant_options : []),
            ...(Array.isArray(product.display_options) ? product.display_options : []),
          ];
          const variantMatch = variants.some((variant) => [variant.name, variant.slug, variant.group].filter(Boolean).some((value) => normalizeSearch(value).includes(query)));

          if (code === query) return 0;
          if (name === query) return 1;
          if (name.startsWith(query)) return 2;
          if (brand.includes(query)) return 3;
          if (variantMatch) return 4;
          return 5;
        }

        function updateCatalogSearchMode(total) {
          const query = state.searchQuery.trim();
          document.body.classList.toggle("is-catalog-search", Boolean(query));
          const title = document.getElementById("catalog-search-summary__title_id");
          const text = document.getElementById("catalog-search-summary__text_id");
          if (!title || !text) return;
          if (!query) {
            title.textContent = "";
            text.textContent = "";
            return;
          }
          if (total > 0) {
            title.textContent = `Результаты поиска: "${query}"`;
            text.textContent = `Найдено: ${total.toLocaleString("uk-UA")} товаров`;
          } else {
            title.textContent = `По запросу "${query}" ничего не найдено`;
            text.textContent = "Попробуйте изменить запрос или перейти в каталог.";
          }
        }

        function scrollToTop(smooth = true) {
          const productBrowser = document.querySelector("[data-product-browser]");
          const top = productBrowser ? productBrowser.getBoundingClientRect().top + window.scrollY - 96 : 0;
          window.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
        }

        /* ============================================================
         FILTER + SORT
      ============================================================ */
        function getFiltered() {
          return allProducts.filter((p) => {
            const query = normalizeSearch(state.searchQuery);
            if (query && !matchesProductSearch(p, query)) return false;
            if (state.categoryFilter !== "all" && p.category !== state.categoryFilter) return false;
            if (p.price < state.priceMin || p.price > state.priceMax) return false;
            if (state.brandFilters.size && !state.brandFilters.has(String(p.brand_id))) return false;
            if (state.sort === "hit" && getBadgeType(p) !== "hit") return false;
            if (state.sort === "new" && getBadgeType(p) !== "new") return false;
            if (state.sort === "sale" && getDiscountPercent(p) <= 0) return false;
            const activeGroups = Object.entries(state.variantFilters).filter(([, values]) => values.size > 0);
            if (activeGroups.length) {
              const productVariants = Array.isArray(p.variant_options) ? p.variant_options : [];
              const productByGroup = productVariants.reduce((acc, variant) => {
                const group = variant.group || "default";
                if (!acc[group]) acc[group] = new Set();
                acc[group].add(String(variant.filter_slug || variant.filter_name || variant.name || ""));
                return acc;
              }, {});
              for (const [group, selected] of activeGroups) {
                const productGroupValues = productByGroup[group] || new Set();
                const hasMatch = [...selected].some((slug) => productGroupValues.has(slug));
                if (!hasMatch) return false;
              }
            }
            return true;
          });
        }

        function getSorted(arr) {
          const a = [...arr];
          const byAvailability = (x, y) => Number(isProductAvailable(y)) - Number(isProductAvailable(x));
          const byLikesDesc = (x, y) => Number(y.likes || 0) - Number(x.likes || 0);
          const byCreatedDesc = (x, y) => String(y.created || "").localeCompare(String(x.created || ""));
          const sortAvailableFirst = (comparator) => a.sort((x, y) => byAvailability(x, y) || comparator(x, y));
          const query = normalizeSearch(state.searchQuery);
          if (query) return sortAvailableFirst((x, y) => getProductSearchRank(x, query) - getProductSearchRank(y, query) || byLikesDesc(x, y));
          if (state.sort === "price_asc") return sortAvailableFirst((x, y) => Number(x.price || 0) - Number(y.price || 0));
          if (state.sort === "price_desc") return sortAvailableFirst((x, y) => Number(y.price || 0) - Number(x.price || 0));
          if (state.sort === "hit") return sortAvailableFirst(byLikesDesc);
          if (state.sort === "new") return sortAvailableFirst(byCreatedDesc);
          if (state.sort === "sale") return sortAvailableFirst(byLikesDesc);
          if (state.sort === "discount_pct") return sortAvailableFirst((x, y) => getDiscountPercent(y) - getDiscountPercent(x));
          return sortAvailableFirst(byLikesDesc);
        }

        /* ============================================================
         RENDER CARD
      ============================================================ */
        const productCardTemplate = document.getElementById("productCardTemplates");
        const productCardMap = new Map(
          [...(productCardTemplate?.content.querySelectorAll(".product_card_component") || [])].map((card) => [Number(card.getAttribute("data-product-card-id")), card.outerHTML]),
        );

        function renderCard(p) {
          const templateHtml = productCardMap.get(Number(p.id));
          if (templateHtml) return templateHtml;

          const badgeHtml = p.badge && p.badge.type
            ? `<span class="product_card_badge_element product_card_badge_${p.badge.type}_variant">${p.badge.label}</span>` : "";
          const discountPercent = getDiscountPercent(p);
          const oldHtml = Number(p.old_price || 0) > Number(p.price || 0)
            ? `<div class="product_card_price_meta_row"><span class="product_card_old_price_value">${Number(p.old_price).toLocaleString("uk-UA")} грн</span>${discountPercent ? `<span class="product_card_discount_value">-${discountPercent}%</span>` : ""}</div>`
            : `<div class="product_card_price_meta_row"></div>`;
          const imgHtml = p.image_url
            ? `<img src="${p.image_url}" data-product-card-default-image="${p.image_url}" alt="${p.name}" class="product_card_image_element" loading="lazy" />` : "";
          const isUnavailable = !isProductAvailable(p);
          const detailUrl = p.detail_url || (p.slug ? `/products/${p.id}/${p.slug}/` : "#");
          const brandHtml = `<div class="product_card_brand_text">${p.brand || ""}</div>`;
          const detailAttr = ` data-product-card-url="${detailUrl}"`;
          const requiresSelection = Boolean(p.requires_selection);
          const ratingHtml = `<div class="product_card_rating_slot">${Number(p.review_count || 0) > 0
            ? `<a class="product_card_rating_row" href="${detailUrl}#product-reviews" aria-label="Рейтинг ${Number(p.average_rating || 0).toFixed(1)}, отзывов: ${Number(p.review_count)}">
                <span class="product_card_rating_value"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.7Z"/></svg>${Number(p.average_rating || 0).toFixed(1)}</span>
                <span class="product_card_rating_separator" aria-hidden="true"></span>
                <span class="product_card_review_count"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/></svg>${Number(p.review_count)}</span>
              </a>` : ""}</div>`;
          const unavailableMediaHtml = isUnavailable
            ? `<div class="product_card_unavailable_overlay_element" aria-hidden="true"></div><div class="product_card_unavailable_status_text">Нет в наличии</div>` : "";
          const nameHtml = `<a href="${detailUrl}">${p.name}</a>`;
          return `
          <article class="product_card_component${isUnavailable ? " product_card_unavailable_state" : ""}" data-product-card-id="${p.id}"${detailAttr} data-product-card-requires-selection="${requiresSelection ? "true" : "false"}">
            <div class="product_card_media_container">
              <div class="product_card_skeleton_element"></div>
              ${badgeHtml}
              <button class="product_card_like_button${p.is_liked ? " is-active" : ""}" type="button" data-product-card-like-id="${p.id}" data-product-card-like-url="/products/${p.id}/like/" data-product-card-liked-state="${p.is_liked ? "true" : "false"}" aria-label="В избранное">
                <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span class="product_card_like_count_text">${p.likes || 0}</span>
              </button>
              ${imgHtml}
              ${unavailableMediaHtml}
            </div>
            <div class="product_card_info_block">
              ${brandHtml}
              <div class="product_card_identity_block">
                <h3 class="product_card_name_text ">
                  ${nameHtml}
                </h3>
                ${ratingHtml}
              </div>
              <div class="product_card_color_swatches">${renderProductColorSwatches(p)}</div>
              <div class="product_card_footer_row">
                <div class="product_card_price_row_container">
                  ${oldHtml}
                  <span class="product_card_price_value">${Number(p.price).toLocaleString("uk-UA")} грн</span>
                </div>
                <button class="product_card_cart_button" type="button" data-product-card-cart-url="/api/cart/add/"${isUnavailable ? " disabled aria-disabled=\"true\" title=\"Нет в наличии\"" : requiresSelection ? " title=\"Выбрать вариант\" aria-label=\"Выбрать вариант товара\"" : " title=\"Добавить в корзину\" aria-label=\"Добавить товар в корзину\""}>
                  <svg class="product_card_cart_icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l1.8 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M15 3v6M12 6h6"/></svg>
                  <svg class="product_card_cart_check_icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                </button>
              </div>
            </div>
          </article>`;
        }

        document.addEventListener("product_card_component:liked", (event) => {
          const id = Number(event.detail?.productId);
          if (!id) return;
          const liked = Boolean(event.detail?.liked);
          const likes = Number(event.detail?.likes || 0);

          const product = allProducts.find((item) => Number(item.id) === id);
          if (product) {
            product.is_liked = liked;
            product.likes = likes;
          }

          const templateCard = productCardTemplate?.content.querySelector(`.product_card_component[data-product-card-id="${id}"]`);
          if (templateCard) {
            const templateBtn = templateCard.querySelector("[data-product-card-like-id]");
            if (templateBtn) {
              templateBtn.setAttribute("data-product-card-liked-state", liked ? "true" : "false");
              templateBtn.classList.toggle("is-active", liked);
            }
            const templateCounter = templateCard.querySelector(".product_card_like_count_text");
            if (templateCounter) templateCounter.textContent = likes;
            productCardMap.set(id, templateCard.outerHTML);
          }
        });

        /* ============================================================
         RENDER PAGINATION
      ============================================================ */
        function renderPagination(total) {
          const totalPages = Math.ceil(total / state.perPage);
          const el = document.getElementById("pagination");
          if (!el) return;
          const paginationRoot = el.closest("[data_pagination_component_wrapper]");
          function renderPaginationTemplate(name, values = {}) {
            const tpl = paginationRoot?.querySelector(`[data_pagination_template_name="${name}"]`);
            if (!tpl) return "";
            let markup = tpl.innerHTML.trim();
            Object.entries(values).forEach(([key, value]) => {
              markup = markup.replaceAll(`__${key}__`, value);
            });
            return markup;
          }
          if (totalPages <= 1) {
            el.innerHTML = "";
            return;
          }

          let html = "";
          // Пред
          html += renderPaginationTemplate("prev");

          const range = [];
          for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= state.page - 1 && i <= state.page + 1)) range.push(i);
            else if (range[range.length - 1] !== "…") range.push("…");
          }
          range.forEach((r) => {
            if (r === "…") {
              html += renderPaginationTemplate("dots");
            } else {
              html += renderPaginationTemplate("page", {
                PAGE: r,
                ACTIVE_CLASS: r === state.page ? "active" : "",
              });
            }
          });

          // След
          html += renderPaginationTemplate("next");

          const from = (state.page - 1) * state.perPage + 1;
          const to = Math.min(state.page * state.perPage, total);
          // pagination info removed

          el.innerHTML = html;

          el.querySelectorAll("[data_pagination_page_number]").forEach((btn) => {
            btn.addEventListener("click", () => {
              state.page = +btn.getAttribute("data_pagination_page_number");
              render();
              scrollToTop(false);
            });
          });
          const prev = el.querySelector("[data_pagination_prev_button]");
          const next = el.querySelector("[data_pagination_next_button]");
          if (prev) {
            prev.disabled = state.page === 1;
            prev.addEventListener("click", () => {
              state.page--;
              render();
              scrollToTop(false);
            });
          }
          if (next) {
            next.disabled = state.page === totalPages;
            next.addEventListener("click", () => {
              state.page++;
              render();
              scrollToTop(false);
            });
          }
        }

        /* ============================================================
         MAIN RENDER
        ============================================================ */
        function render() {
          const filtered = getFiltered();
          const sorted = getSorted(filtered);
          const total = sorted.length;
          const page = sorted.slice((state.page - 1) * state.perPage, state.page * state.perPage);
          updateCatalogSearchMode(total);

          const grid = document.getElementById("catalog_grid_container_id");
          const empty = document.getElementById("catalog_empty_state_id");

          if (!grid) return;

          // Обновляем счётчики
          const tcEl = document.getElementById("totalCount");
          if (tcEl) tcEl.textContent = total.toLocaleString("uk-UA");
          const totalBar = document.getElementById("catalog_total_count_bar_id");
          const shownCount = document.getElementById("catalog_shown_count_id");
          if (totalBar) totalBar.textContent = total.toLocaleString("uk-UA");
          if (shownCount) shownCount.textContent = Math.min(state.perPage, page.length).toString();

          if (page.length === 0) {
            grid.innerHTML = "";
            empty.classList.add("is-visible");
            const noProducts = document.getElementById("catalog_empty_icon_no_products_id");
            const noResults = document.getElementById("catalog_empty_icon_no_results_id");
            const emptyTitle = document.getElementById("emptyTitle");
            const emptyDescription = document.getElementById("emptyDescription");
            const catalog_empty_reset_button_idBtn = document.getElementById("catalog_empty_reset_button_id");
            const hasVariantFilters = Object.values(state.variantFilters).some((values) => values.size > 0);
            const hasSortFilter = ["hit", "new", "sale"].includes(state.sort);
            const isFiltered = Boolean(state.searchQuery) || state.categoryFilter !== "all" || state.priceMin > 0 || state.priceMax < maxPrice || state.brandFilters.size > 0 || hasVariantFilters || hasSortFilter;
            if (allProducts.length === 0) {
              // Товаров нет вообще в БД
              if (noProducts) noProducts.style.display = "";
              if (noResults) noResults.style.display = "none";
              if (emptyTitle) emptyTitle.textContent = "Список товаров пуст";
              if (emptyDescription) emptyDescription.textContent = "Ассортимент пока не заполнен. Новые товары появятся здесь.";
              if (catalog_empty_reset_button_idBtn) catalog_empty_reset_button_idBtn.style.display = "none";
            } else {
              // Есть товары, но фильтры дали 0 результатов
              if (noProducts) noProducts.style.display = "none";
              if (noResults) noResults.style.display = "";
              if (emptyTitle) emptyTitle.textContent = state.searchQuery ? `По запросу "${state.searchQuery}" ничего не найдено` : "Ничего не найдено";
              if (emptyDescription) {
                emptyDescription.textContent = state.searchQuery
                  ? "Проверьте запрос или сбросьте выбранные фильтры."
                  : "Измените параметры или сбросьте фильтры, чтобы увидеть товары.";
              }
              if (catalog_empty_reset_button_idBtn) catalog_empty_reset_button_idBtn.style.display = "";
            }
          } else {
            empty.classList.remove("is-visible");
            grid.innerHTML = page.map(renderCard).join("");
            hydrateRenderedCards(page);
          }

          renderPagination(total);
          writeStateToUrl();
        }

        let renderFrameId = 0;
        function scheduleRender() {
          if (renderFrameId) return;
          renderFrameId = requestAnimationFrame(() => {
            renderFrameId = 0;
            render();
          });
        }

        /* ============================================================
         RANGE SLIDER
        ============================================================ */
        function initRangeSlider() {
          const rMin = document.getElementById("filter_range_min_slider_id");
          const rMax = document.getElementById("filter_range_max_slider_id");
          const iMin = document.getElementById("filter_price_min_input_id");
          const iMax = document.getElementById("filter_price_max_input_id");
          const fill = document.getElementById("filter_range_fill_line_id");
          if (!rMin || !rMax || !fill) return;
          rMin.value = state.priceMin;
          rMax.value = state.priceMax;
          iMin.value = state.priceMin;
          iMax.value = state.priceMax;

          function updateFill() {
            const min = +rMin.min,
              max = +rMax.max;
            const lo = +rMin.value,
              hi = +rMax.value;
            const l = ((lo - min) / (max - min)) * 100;
            const r = ((hi - min) / (max - min)) * 100;
            fill.style.left = l + "%";
            fill.style.width = r - l + "%";
            iMin.value = lo;
            iMax.value = hi;
          }

          rMin.addEventListener("input", () => {
            if (+rMin.value > +rMax.value - 100) rMin.value = +rMax.value - 100;
            state.priceMin = +rMin.value;
            state.page = 1;
            updateFill();
            scheduleRender();
          });
          rMax.addEventListener("input", () => {
            if (+rMax.value < +rMin.value + 100) rMax.value = +rMin.value + 100;
            state.priceMax = +rMax.value;
            state.page = 1;
            updateFill();
            scheduleRender();
          });
          iMin.addEventListener("change", () => {
            rMin.value = Math.max(0, Math.min(+iMin.value, +rMax.value - 100));
            state.priceMin = +rMin.value;
            state.page = 1;
            updateFill();
            render();
          });
          iMax.addEventListener("change", () => {
            rMax.value = Math.min(maxPrice, Math.max(+iMax.value, +rMin.value + 100));
            state.priceMax = +rMax.value;
            state.page = 1;
            updateFill();
            render();
          });
          updateFill();
        }

        /* ============================================================
         FILTER BLOCKS (accordion)
        ============================================================ */
        function initFilterBlocks() {
          document.querySelectorAll(".filter-panel__header").forEach((header) => {
            header.addEventListener("click", () => {
              const block = header.closest(".filter-panel");
              if (block.classList.contains("filter-panel--static")) return;
              block.classList.toggle("is-open");
            });
          });
        }

        /* ============================================================
         TYPE CHIPS (category bar)
        ============================================================ */
        function buildCategoryChips() {
          const root = document.getElementById("filter_category_chips_container_id");
          if (!root) return;
          const categories = [{ slug: "all", name: "Все" }, ...allCategories];
          root.innerHTML = categories
            .map((category) => `
              <button class="filter-chip${state.categoryFilter === category.slug ? " is-active" : ""}" type="button" data-filter-category-slug="${category.slug}">
                ${category.name}
              </button>
            `)
            .join("");
        }

        function initTypeChips() {
          buildCategoryChips();
          const allChips = document.querySelectorAll("[data-filter-category-slug].filter-chip");
          allChips.forEach((btn) => {
            btn.addEventListener("click", () => {
              document.querySelectorAll(".filter-chip[data-filter-category-slug]").forEach((b) => b.classList.remove("is-active"));
              btn.classList.add("is-active");
              state.categoryFilter = btn.getAttribute("data-filter-category-slug");
              state.brandFilters = new Set();
              state.variantFilters = {};
              state.page = 1;
              initBrandFilters();
              initVariantFilters();
              writeStateToUrl();
              render();
            });
          });
        }

        function getProductsForCategory() {
          return allProducts.filter((product) => state.categoryFilter === "all" || product.category === state.categoryFilter);
        }

        function initBrandFilters() {
          const root = document.getElementById("filter_brand_checkboxes_id");
          if (!root) return;
          const brandMap = new Map();
          getProductsForCategory().forEach((product) => {
            if (!product.brand_id) return;
            const id = String(product.brand_id);
            const item = brandMap.get(id) || {
              id,
              name: product.brand,
              count: 0,
            };
            item.count += 1;
            brandMap.set(id, item);
          });

          if (!brandMap.size) {
            root.innerHTML = '<span class="filter-empty">Нет брендов</span>';
            return;
          }

          root.innerHTML = [...brandMap.values()]
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"))
            .map((brand) => `
              <label class="filter-checkbox">
                <input type="checkbox" data-filter-brand-id="${brand.id}" ${state.brandFilters.has(brand.id) ? "checked" : ""} />
                <span class="filter-checkbox__box"></span>
                <span class="filter-checkbox__text">${brand.name}</span>
                <span class="filter-checkbox__count">${brand.count}</span>
              </label>
            `)
            .join("");

          root.querySelectorAll("[data-filter-brand-id]").forEach((input) => {
            input.addEventListener("change", () => {
              const id = String(input.getAttribute("data-filter-brand-id"));
              if (input.checked) state.brandFilters.add(id);
              else state.brandFilters.delete(id);
              state.page = 1;
              writeStateToUrl();
              render();
            });
          });
        }

        function initVariantFilters() {
          const root = document.getElementById("filter_variant_blocks_container_id");
          if (!root) return;

          const groups = new Map();
          getProductsForCategory().forEach((product) => {
            const variants = Array.isArray(product.variant_options) ? product.variant_options : [];
            const countedFilters = new Set();
            variants.forEach((variant) => {
              const group = variant.group || "default";
              const parsedGroupOrder = Number(variant.group_order);
              const groupOrder = Number.isFinite(parsedGroupOrder) ? parsedGroupOrder : 999999;
              if (!groups.has(group)) {
                groups.set(group, { order: groupOrder, variants: new Map() });
              } else {
                groups.get(group).order = Math.min(groups.get(group).order, groupOrder);
              }
              const bySlug = groups.get(group).variants;
              const slug = String(variant.filter_slug || variant.filter_name || variant.name || "");
              if (!slug || countedFilters.has(`${group}\u0000${slug}`)) return;
              countedFilters.add(`${group}\u0000${slug}`);
              const item = bySlug.get(slug) || {
                ...variant,
                name: variant.filter_name || variant.name,
                slug,
                count: 0,
              };
              item.count += 1;
              bySlug.set(slug, item);
            });
          });

          if (!groups.size) {
            root.innerHTML = "";
            return;
          }

          root.innerHTML = [...groups.entries()]
            .sort(([groupA, dataA], [groupB, dataB]) => (
              dataA.order - dataB.order || groupA.localeCompare(groupB, "ru")
            ))
            .map(([group, groupData]) => {
              const title = group === "default" ? "Варианты" : group;
              const options = [...groupData.variants.values()]
                .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"))
                .map((variant) => `
                  <label class="filter-checkbox">
                    <input type="checkbox" data-filter-group-name="${group}" data-filter-slug="${variant.slug}" ${state.variantFilters[group]?.has(String(variant.slug)) ? "checked" : ""} />
                    <span class="filter-checkbox__box"></span>
                    <span class="filter-checkbox__text">${variant.name}</span>
                    <span class="filter-checkbox__count">${variant.count}</span>
                  </label>
                `)
                .join("");
              return `
                <div class="filter-panel" data-filter-block-group="${group}">
                  <div class="filter-panel__header">
                    <span class="filter-panel__title">${title}</span>
                    <span class="filter-panel__arrow">
                      <svg class="filter-panel__arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                    </span>
                  </div>
                  <div class="filter-panel__body">
                    <div class="filter-panel__body-inner">
                      <div class="filter-panel__content">
                        <div class="filter-checkbox-list">
                          ${options}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("");

          root.querySelectorAll(".filter-panel__header").forEach((header) => {
            header.addEventListener("click", () => {
              header.closest(".filter-panel")?.classList.toggle("is-open");
            });
          });

          root.querySelectorAll("[data-filter-slug]").forEach((input) => {
            input.addEventListener("change", () => {
              const group = input.getAttribute("data-filter-group-name") || "default";
              const slug = String(input.getAttribute("data-filter-slug"));
              if (!state.variantFilters[group]) state.variantFilters[group] = new Set();
              const selected = state.variantFilters[group];
              if (input.checked) selected.add(slug);
              else selected.delete(slug);
              state.page = 1;
              render();
            });
          });
        }

        /* ============================================================
         SORT
        ============================================================ */
        function initSort() {
          const container = document.getElementById("sort_options_container_id");
          if (!container) return;
          container.querySelectorAll(".sort-options__button").forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-sort-option-key") === state.sort));
          container.querySelectorAll(".sort-options__button").forEach((btn) => {
            btn.addEventListener("click", () => {
              container.querySelectorAll(".sort-options__button").forEach((b) => b.classList.remove("is-active"));
              btn.classList.add("is-active");
              state.sort = btn.getAttribute("data-sort-option-key");
              state.page = 1;
              render();
            });
          });
        }

        /* ============================================================
         VIEW TOGGLE — адаптивный (меняет опции по ширине экрана)
        ============================================================ */

        /* SVG-иконки для каждого варианта колонок */
        const VIEW_ICONS = {
          5: `<svg viewBox="0 0 20 16" fill="currentColor">
            <rect x="1" y="1" width="2.5" height="2.5" rx="0.4"/>
            <rect x="5" y="1" width="2.5" height="2.5" rx="0.4"/>
            <rect x="9" y="1" width="2.5" height="2.5" rx="0.4"/>
            <rect x="13" y="1" width="2.5" height="2.5" rx="0.4"/>
            <rect x="17" y="1" width="2.5" height="2.5" rx="0.4"/>
            <rect x="1" y="5" width="2.5" height="2.5" rx="0.4"/>
            <rect x="5" y="5" width="2.5" height="2.5" rx="0.4"/>
            <rect x="9" y="5" width="2.5" height="2.5" rx="0.4"/>
            <rect x="13" y="5" width="2.5" height="2.5" rx="0.4"/>
            <rect x="17" y="5" width="2.5" height="2.5" rx="0.4"/>
            <rect x="1" y="9" width="2.5" height="2.5" rx="0.4"/>
            <rect x="5" y="9" width="2.5" height="2.5" rx="0.4"/>
            <rect x="9" y="9" width="2.5" height="2.5" rx="0.4"/>
            <rect x="13" y="9" width="2.5" height="2.5" rx="0.4"/>
            <rect x="17" y="9" width="2.5" height="2.5" rx="0.4"/>
            <rect x="1" y="13" width="2.5" height="2.5" rx="0.4"/>
            <rect x="5" y="13" width="2.5" height="2.5" rx="0.4"/>
            <rect x="9" y="13" width="2.5" height="2.5" rx="0.4"/>
            <rect x="13" y="13" width="2.5" height="2.5" rx="0.4"/>
            <rect x="17" y="13" width="2.5" height="2.5" rx="0.4"/>
          </svg>`,
          4: `<svg viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="3" height="3" rx="0.5"/><rect x="5" y="1" width="3" height="3" rx="0.5"/>
            <rect x="9" y="1" width="3" height="3" rx="0.5"/><rect x="13" y="1" width="3" height="3" rx="0.5"/>
            <rect x="1" y="5" width="3" height="3" rx="0.5"/><rect x="5" y="5" width="3" height="3" rx="0.5"/>
            <rect x="9" y="5" width="3" height="3" rx="0.5"/><rect x="13" y="5" width="3" height="3" rx="0.5"/>
            <rect x="1" y="9" width="3" height="3" rx="0.5"/><rect x="5" y="9" width="3" height="3" rx="0.5"/>
            <rect x="9" y="9" width="3" height="3" rx="0.5"/><rect x="13" y="9" width="3" height="3" rx="0.5"/>
          </svg>`,
          3: `<svg viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="6" y="1" width="4" height="4" rx="0.5"/>
            <rect x="11" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="0.5"/>
            <rect x="6" y="7" width="4" height="4" rx="0.5"/><rect x="11" y="7" width="4" height="4" rx="0.5"/>
          </svg>`,
          2: `<svg viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/>
            <rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/>
          </svg>`,
          1: `<svg viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="14" height="3" rx="0.5"/><rect x="1" y="6" width="14" height="3" rx="0.5"/>
            <rect x="1" y="11" width="14" height="3" rx="0.5"/>
          </svg>`,
        };

        const VIEW_LABELS = { 5: "5 колонок", 4: "4 колонки", 3: "3 колонки", 2: "2 колонки", 1: "Список" };

        /* Определяем доступные опции по ширине и дефолтное значение */
        function getViewOptions() {
          const w = window.innerWidth;
          if (w > 1200) return { options: [4, 5], default: 4 };
          if (w > 900) return { options: [3, 4], default: 3 };
          // ≤900: мобиль — 1 или 2 колонки
          return { options: [1, 2], default: 2 };
        }

        function getGridViewClass(cols) {
          const classes = {
            1: "product-browser__grid--one",
            2: "product-browser__grid--two",
            3: "product-browser__grid--three",
            4: "product-browser__grid--four",
            5: "product-browser__grid--five",
          };
          return classes[cols] || "";
        }

        function applyGridView(cols) {
          const grid = document.getElementById("catalog_grid_container_id");
          if (!grid) return;
          grid.className = "product-browser__grid";
          const viewClass = getGridViewClass(cols);
          if (viewClass) grid.classList.add(viewClass);
        }

        function buildViewToggle() {
          const container = document.getElementById("catalog_view_toggle_id");
          if (!container) return;
          const { options, default: def } = getViewOptions();

          // Если текущее state.view не входит в доступные — сбросить на дефолт
          if (!options.includes(state.view)) {
            state.view = def;
          }
          applyGridView(state.view);

          container.innerHTML = options
            .map(
              (cols) => `
            <button class="product-browser-controls__view-button${state.view === cols ? " is-active" : ""}"
                    data_view_columns_count="${cols}"
                    data-view-button-label="${VIEW_LABELS[cols]}"
                    title="${VIEW_LABELS[cols]}">
              ${VIEW_ICONS[cols]}
            </button>
          `,
            )
            .join("");

          container.querySelectorAll(".product-browser-controls__view-button").forEach((btn) => {
            btn.addEventListener("click", () => {
              const cols = +btn.getAttribute("data_view_columns_count");
              state.view = cols;
              container.querySelectorAll(".product-browser-controls__view-button").forEach((b) => b.classList.remove("is-active"));
              btn.classList.add("is-active");
              applyGridView(cols);
            });
          });
        }

        function initViewToggle() {
          buildViewToggle();
          // При ресайзе — пересобрать toggle если пересекли брейкпоинт
          let lastBp = window.innerWidth > 1200 ? "xl" : window.innerWidth > 900 ? "md" : "sm";
          window.addEventListener("resize", () => {
            const w = window.innerWidth;
            const bp = w > 1200 ? "xl" : w > 900 ? "md" : "sm";
            if (bp !== lastBp) {
              lastBp = bp;
              buildViewToggle();
            }
          });
        }

        /* ============================================================
         RESET
        ============================================================ */
        function resetFilters() {
          state.categoryFilter = "all";
          state.priceMin = 0;
          state.priceMax = maxPrice;
          state.page = 1;
          state.brandFilters = new Set();
          state.variantFilters = {};
          state.sort = "recommended";
          state.searchQuery = "";
          document.querySelectorAll(".filter-chip[data-filter-category-slug]").forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-filter-category-slug") === "all"));
          document.querySelectorAll(".sort-options__button").forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-sort-option-key") === "recommended"));
          const rMin = document.getElementById("filter_range_min_slider_id");
          const rMax = document.getElementById("filter_range_max_slider_id");
          if (rMin) rMin.value = 0;
          if (rMax) rMax.value = maxPrice;
          const iMin = document.getElementById("filter_price_min_input_id");
          const iMax = document.getElementById("filter_price_max_input_id");
          if (iMin) iMin.value = 0;
          if (iMax) iMax.value = maxPrice;
          const fill = document.getElementById("filter_range_fill_line_id");
          if (fill) {
            fill.style.left = "0%";
            fill.style.width = "100%";
          }
          document.querySelectorAll(".filter-checkbox-list input[type=checkbox]").forEach((cb) => (cb.checked = false));
          initBrandFilters();
          initVariantFilters();
          render();
        }
        document.getElementById("filter_drawer_reset_button_id")?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          resetFilters();
        });
        document.getElementById("catalog_empty_reset_button_id")?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          resetFilters();
        });

        /* ============================================================
         DRAWER (universal — для всех экранов)
        ============================================================ */
        function initDrawer() {
          const toggleBtn = document.getElementById("catalog_filter_toggle_button_id");
          const drawer = document.getElementById("filter_drawer_panel_id");
          const overlay = document.getElementById("filter_drawer_overlay_id");
          const arrowBtn = document.getElementById("filter_drawer_arrow_id");
          const handle = drawer?.querySelector("[data-filter-drawer-handle]");
          const drawerContent = drawer?.querySelector(".filter-drawer__blocks");
          if (!toggleBtn || !drawer || !overlay) return;

          [overlay, drawer, arrowBtn].filter(Boolean).forEach((element) => {
            if (element.parentElement !== document.body) document.body.appendChild(element);
          });

          let previousBodyOverflow = "";
          let collapsedHeight = 0;
          let scrollTouchY = 0;
          let scrollFrame = 0;
          let scrollEndTimer = 0;
          let closeTimer = 0;
          let scrollTargetHeight = 0;
          const mobileDrawerMedia = window.matchMedia("(max-width: 768px)");

          function getDrawerViewportHeight() {
            return Math.round(window.visualViewport?.height || window.innerHeight || 0);
          }

          function stopDrawerHeightAnimation() {
            window.clearTimeout(scrollEndTimer);
            scrollEndTimer = 0;
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
            scrollTargetHeight = 0;
          }

          function getDrawerSnapHeights() {
            const viewportHeight = getDrawerViewportHeight();
            const baseHeight = Math.min(viewportHeight, collapsedHeight || Math.round(viewportHeight * 0.72));
            return [0, 0.18, 0.36, 0.54, 0.72, 1]
              .map((progress) => Math.round(baseHeight + (viewportHeight - baseHeight) * progress))
              .filter((height, index, heights) => index === 0 || height - heights[index - 1] >= 8);
          }

          function applyDrawerHeight(height) {
            if (!drawer) return;
            const viewportHeight = getDrawerViewportHeight();
            const nextHeight = Math.max(80, Math.min(viewportHeight, height));
            drawer.style.height = `${nextHeight}px`;
            drawer.classList.toggle("is-expanded", nextHeight >= viewportHeight - 2);
            overlay.classList.toggle("is-expanded", nextHeight >= viewportHeight - 2);
            handle?.setAttribute(
              "aria-label",
              nextHeight >= viewportHeight - 2 ? "Свернуть фильтры" : "Развернуть фильтры"
            );
          }

          function snapDrawerToHeight(targetHeight) {
            if (!mobileDrawerMedia.matches) return;
            const currentHeight = drawer.getBoundingClientRect().height;
            const viewportHeight = getDrawerViewportHeight();
            const nextHeight = Math.max(80, Math.min(viewportHeight, targetHeight));
            drawer.classList.remove("is-dragging");
            drawer.style.maxHeight = "100dvh";
            drawer.style.height = `${currentHeight}px`;
            drawer.offsetHeight;
            drawer.classList.toggle("is-expanded", nextHeight >= viewportHeight - 2);
            overlay.classList.toggle("is-expanded", nextHeight >= viewportHeight - 2);
            drawer.style.height = `${nextHeight}px`;
            handle?.setAttribute(
              "aria-label",
              nextHeight >= viewportHeight - 2 ? "Свернуть фильтры" : "Развернуть фильтры"
            );
          }

          function queueDrawerHeight(height) {
            if (!mobileDrawerMedia.matches) return;
            const viewportHeight = getDrawerViewportHeight();
            scrollTargetHeight = Math.max(80, Math.min(viewportHeight, height));
            drawer.classList.add("is-dragging");
            if (scrollFrame) return;

            const animate = () => {
              if (!scrollTargetHeight) {
                scrollFrame = 0;
                return;
              }
              const currentHeight = drawer.getBoundingClientRect().height;
              const distance = scrollTargetHeight - currentHeight;
              const nextHeight = Math.abs(distance) < 0.75 ? scrollTargetHeight : currentHeight + distance * 0.36;
              applyDrawerHeight(nextHeight);
              if (Math.abs(scrollTargetHeight - nextHeight) >= 0.75) {
                scrollFrame = requestAnimationFrame(animate);
              } else {
                scrollFrame = 0;
              }
            };

            scrollFrame = requestAnimationFrame(animate);
          }

          function settleDrawerHeight() {
            if (!drawer.classList.contains("is-open") || !mobileDrawerMedia.matches) return;
            stopDrawerHeightAnimation();
            const currentHeight = drawer.getBoundingClientRect().height;
            drawer.classList.remove("is-dragging");

            if (collapsedHeight && currentHeight < collapsedHeight * 0.72) {
              closeDrawer();
              return;
            }

            const snapHeights = getDrawerSnapHeights();
            const nearestHeight = snapHeights.reduce((nearest, height) => (
              Math.abs(height - currentHeight) < Math.abs(nearest - currentHeight) ? height : nearest
            ), snapHeights[0]);
            snapDrawerToHeight(nearestHeight);
          }

          function resizeDrawerBeforeContentScroll(delta) {
            if (!mobileDrawerMedia.matches || !drawer.classList.contains("is-open") || !delta) return false;
            const currentHeight = drawer.getBoundingClientRect().height;
            const viewportHeight = getDrawerViewportHeight();
            const shrinkingFromTop = delta < 0 && (drawerContent?.scrollTop || 0) <= 1;
            const growingBeforeContent = delta > 0 && currentHeight < viewportHeight - 2;
            if (!shrinkingFromTop && !growingBeforeContent) return false;

            const normalizedDelta = Math.max(-96, Math.min(96, delta)) * 0.9;
            const baseHeight = scrollTargetHeight || currentHeight;
            queueDrawerHeight(baseHeight + normalizedDelta);
            window.clearTimeout(scrollEndTimer);
            scrollEndTimer = window.setTimeout(settleDrawerHeight, 150);
            return true;
          }

          function openDrawer() {
            window.clearTimeout(closeTimer);
            previousBodyOverflow = document.body.style.overflow;
            if (mobileDrawerMedia.matches) {
              stopDrawerHeightAnimation();
              const viewportHeight = getDrawerViewportHeight();
              collapsedHeight = Math.min(viewportHeight, Math.max(360, Math.round(viewportHeight * 0.72)));
              drawer.style.height = `${collapsedHeight}px`;
              drawer.style.maxHeight = "100dvh";
              drawer.classList.remove("is-expanded", "is-dragging");
              overlay.classList.remove("is-expanded");
              if (drawerContent) drawerContent.scrollTop = 0;
            } else {
              drawer.style.removeProperty("height");
              drawer.style.removeProperty("max-height");
              drawer.classList.remove("is-expanded", "is-dragging");
              overlay.classList.remove("is-expanded");
            }
            drawer.classList.add("is-open");
            overlay.classList.add("is-open");
            arrowBtn?.classList.add("is-open");
            document.body.classList.add("is-filter-drawer-open");
            drawer.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
          }
          function closeDrawer() {
            stopDrawerHeightAnimation();
            drawer.classList.remove("is-open");
            overlay.classList.remove("is-open");
            drawer.classList.remove("is-expanded", "is-dragging");
            overlay.classList.remove("is-expanded");
            arrowBtn?.classList.remove("is-open");
            document.body.classList.remove("is-filter-drawer-open");
            drawer.setAttribute("aria-hidden", "true");
            document.body.style.overflow = previousBodyOverflow;
            closeTimer = window.setTimeout(() => {
              if (drawer.classList.contains("is-open")) return;
              drawer.style.removeProperty("height");
              drawer.style.removeProperty("max-height");
            }, 430);
          }

          drawer.setAttribute("aria-hidden", "true");
          toggleBtn.addEventListener("click", openDrawer);
          arrowBtn?.addEventListener("click", closeDrawer);
          overlay.addEventListener("click", closeDrawer);
          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && drawer.classList.contains("is-open")) closeDrawer();
          });

          drawerContent?.addEventListener("wheel", (event) => {
            const viewportHeight = getDrawerViewportHeight();
            const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
              ? event.deltaY * 18
              : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? event.deltaY * viewportHeight
                : event.deltaY;
            if (resizeDrawerBeforeContentScroll(delta)) event.preventDefault();
          }, { passive: false });

          drawerContent?.addEventListener("touchstart", (event) => {
            if (!mobileDrawerMedia.matches || !event.touches.length) return;
            scrollTouchY = event.touches[0].clientY;
          }, { passive: true });

          drawerContent?.addEventListener("touchmove", (event) => {
            if (!mobileDrawerMedia.matches || !event.touches.length) return;
            const nextY = event.touches[0].clientY;
            const delta = scrollTouchY - nextY;
            scrollTouchY = nextY;
            if (resizeDrawerBeforeContentScroll(delta)) event.preventDefault();
          }, { passive: false });

          drawerContent?.addEventListener("touchend", settleDrawerHeight, { passive: true });
          drawerContent?.addEventListener("touchcancel", settleDrawerHeight, { passive: true });

          if (handle) {
            let dragging = false;
            let pointerId = null;
            let startY = 0;
            let startHeight = 0;
            let didDrag = false;

            handle.addEventListener("pointerdown", (event) => {
              if (!mobileDrawerMedia.matches) return;
              event.preventDefault();
              dragging = true;
              didDrag = false;
              pointerId = event.pointerId;
              startY = event.clientY;
              startHeight = drawer.getBoundingClientRect().height;
              drawer.classList.add("is-dragging");
              handle.setPointerCapture(pointerId);
            });

            handle.addEventListener("pointermove", (event) => {
              if (!dragging || event.pointerId !== pointerId) return;
              event.preventDefault();
              const distance = startY - event.clientY;
              if (Math.abs(distance) > 6) didDrag = true;
              applyDrawerHeight(startHeight + distance);
            });

            const finishDrag = (event) => {
              if (!dragging || event.pointerId !== pointerId) return;
              dragging = false;
              drawer.classList.remove("is-dragging");
              if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
              pointerId = null;
              settleDrawerHeight();
            };

            handle.addEventListener("pointerup", finishDrag);
            handle.addEventListener("pointercancel", finishDrag);
            handle.addEventListener("click", () => {
              if (didDrag || !mobileDrawerMedia.matches || !drawer.classList.contains("is-open")) return;
              const currentHeight = drawer.getBoundingClientRect().height;
              const snapHeights = getDrawerSnapHeights();
              const nextHeight = snapHeights.find((height) => height > currentHeight + 4) || snapHeights[0];
              snapDrawerToHeight(nextHeight);
            });
          }

          function syncDrawerToViewport() {
            if (!drawer.classList.contains("is-open") || !mobileDrawerMedia.matches) return;
            const viewportHeight = getDrawerViewportHeight();
            const currentHeight = drawer.getBoundingClientRect().height;
            if (currentHeight > viewportHeight || drawer.classList.contains("is-expanded")) {
              applyDrawerHeight(viewportHeight);
            }
          }

          window.addEventListener("resize", syncDrawerToViewport);
          window.visualViewport?.addEventListener("resize", syncDrawerToViewport);
        }

        function initMobileDrawer() {
          /* legacy — replaced by initDrawer */
        }

        /* ============================================================
         CURSOR
        ============================================================ */
        function initCursor() {
          const small = document.getElementById("cursorSmall");
          const large = document.getElementById("cursorLarge");
          if (!small || !large) return;
          if (window.matchMedia("(pointer: coarse)").matches) {
            small.style.display = "none";
            large.style.display = "none";
            return;
          }
          let mouseX = window.innerWidth / 2;
          let mouseY = window.innerHeight / 2;
          let smallX = mouseX;
          let smallY = mouseY;
          let largeX = mouseX;
          let largeY = mouseY;
          const smallFollowSpeed = 0.45;
          const largeFollowSpeed = 0.24;

          document.addEventListener("mousemove", (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
          });

          function drawCursor(el, x, y) {
            el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
          }

          function animateCursor() {
            smallX += (mouseX - smallX) * smallFollowSpeed;
            smallY += (mouseY - smallY) * smallFollowSpeed;
            largeX += (mouseX - largeX) * largeFollowSpeed;
            largeY += (mouseY - largeY) * largeFollowSpeed;
            drawCursor(small, smallX, smallY);
            drawCursor(large, largeX, largeY);
            requestAnimationFrame(animateCursor);
          }

          drawCursor(small, smallX, smallY);
          drawCursor(large, largeX, largeY);
          animateCursor();
        }

        /* ============================================================
         INIT
        ============================================================ */
        initRangeSlider();
        initFilterBlocks();
        initTypeChips();
        initBrandFilters();
        initVariantFilters();

        initSort();
        initViewToggle();
        initDrawer();
        render();
      })();
