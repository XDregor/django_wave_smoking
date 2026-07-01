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

        function isProductAvailable(product) {
          if (Number(product.stock) <= 0) return false;

          const variants = Array.isArray(product.display_variant_options) ? product.display_variant_options : [];
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
            ...(Array.isArray(product.display_variant_options) ? product.display_variant_options : []),
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
            ...(Array.isArray(product.display_variant_options) ? product.display_variant_options : []),
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
          document.body.classList.toggle("catalog_search_mode", Boolean(query));
          const title = document.getElementById("catalog_search_summary_title_id");
          const text = document.getElementById("catalog_search_summary_text_id");
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
          window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
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
          [...(productCardTemplate?.content.querySelectorAll(".product_card_component") || [])].map((card) => [Number(card.getAttribute("data_product_card_id")), card.outerHTML]),
        );

        function renderCard(p) {
          const templateHtml = productCardMap.get(Number(p.id));
          if (templateHtml) return templateHtml;

          const badgeHtml = p.badge && p.badge.type
            ? `<span class="product_card_badge_element product_card_badge_${p.badge.type}_variant">${p.badge.label}</span>` : "";
          const oldHtml = Number(p.old_price || 0) > Number(p.price || 0)
            ? `<span class="product_card_old_price_value">${Number(p.old_price).toLocaleString("uk-UA")}₴</span>` : "";
          const imgHtml = p.image_url
            ? `<img src="${p.image_url}" alt="${p.name}" class="product_card_image_element" loading="lazy" />` : "";
          const isUnavailable = !isProductAvailable(p);
          const detailUrl = p.detail_url || (p.slug ? `/products/${p.id}/${p.slug}/` : "#");
          const brandHtml = p.brand ? `<div class="product_card_brand_text">${p.brand}</div>` : "";
          const detailAttr = ` data_product_card_url="${detailUrl}"`;
          const requiresSelection = Boolean(p.requires_selection);
          const ratingHtml = Number(p.review_count || 0) > 0
            ? `<a class="product_card_rating_row" href="${detailUrl}#product-reviews" aria-label="Рейтинг ${Number(p.average_rating || 0).toFixed(1)}, отзывов: ${Number(p.review_count)}">
                <span class="product_card_rating_value"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.7Z"/></svg>${Number(p.average_rating || 0).toFixed(1)}</span>
                <span class="product_card_rating_separator" aria-hidden="true"></span>
                <span class="product_card_review_count"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/></svg>${Number(p.review_count)}</span>
              </a>` : "";
          const unavailableMediaHtml = isUnavailable
            ? `<div class="product_card_unavailable_overlay_element" aria-hidden="true"></div><div class="product_card_unavailable_status_text">Нет в наличии</div>` : "";
          const nameHtml = `<a href="${detailUrl}">${p.name}</a>`;
          return `
          <article class="product_card_component${isUnavailable ? " product_card_unavailable_state" : ""}" data_product_card_id="${p.id}"${detailAttr} data_product_card_requires_selection="${requiresSelection ? "true" : "false"}">
            <div class="product_card_media_container">
              <div class="product_card_skeleton_element"></div>
              ${badgeHtml}
              <button class="product_card_like_button${p.is_liked ? " active" : ""}" type="button" data_product_card_like_id="${p.id}" data_product_card_like_url="/products/${p.id}/like/" data_product_card_liked_state="${p.is_liked ? "true" : "false"}" aria-label="В избранное">
                <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span class="product_card_like_count_text">${p.likes || 0}</span>
              </button>
              ${imgHtml}
              ${unavailableMediaHtml}
            </div>
            <div class="product_card_info_block">
              ${brandHtml}
              <h3 class="product_card_name_text product_card_name_link_element">
                ${nameHtml}
              </h3>
              ${ratingHtml}
              <div class="product_card_footer_row">
                <button class="product_card_cart_button" type="button" data_product_card_cart_url="/api/cart/add/"${isUnavailable ? " disabled aria-disabled=\"true\" title=\"Нет в наличии\"" : requiresSelection ? " title=\"Выбрать вариант\" aria-label=\"Выбрать вариант товара\"" : " title=\"Добавить в корзину\" aria-label=\"Добавить товар в корзину\""}>
                  <svg class="product_card_cart_icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2l1.8 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M15 3v6M12 6h6"/></svg>
                  <svg class="product_card_cart_check_icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                </button>
                <div class="product_card_price_row_container">
                  <span class="product_card_price_value">${Number(p.price).toLocaleString("uk-UA")}₴</span>
                  ${oldHtml}
                </div>
              </div>
            </div>
          </article>`;
        }

        document.addEventListener("product-card:liked", (event) => {
          const id = Number(event.detail?.productId);
          if (!id) return;
          const liked = Boolean(event.detail?.liked);
          const likes = Number(event.detail?.likes || 0);

          const product = allProducts.find((item) => Number(item.id) === id);
          if (product) {
            product.is_liked = liked;
            product.likes = likes;
          }

          const templateCard = productCardTemplate?.content.querySelector(`.product_card_component[data_product_card_id="${id}"]`);
          if (templateCard) {
            const templateBtn = templateCard.querySelector("[data_product_card_like_id]");
            if (templateBtn) {
              templateBtn.setAttribute("data_product_card_liked_state", liked ? "true" : "false");
              templateBtn.classList.toggle("active", liked);
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
          document.getElementById("catalog_total_count_bar_id").textContent = total.toLocaleString("uk-UA");
          document.getElementById("catalog_shown_count_id").textContent = Math.min(state.perPage, page.length).toString();

          if (page.length === 0) {
            grid.innerHTML = "";
            empty.classList.add("catalog_empty_state_visible");
            const noProducts = document.getElementById("catalog_empty_icon_no_products_id");
            const noResults = document.getElementById("catalog_empty_icon_no_results_id");
            const emptyTitle = document.getElementById("emptyTitle");
            const catalog_empty_reset_button_idBtn = document.getElementById("catalog_empty_reset_button_id");
            const hasVariantFilters = Object.values(state.variantFilters).some((values) => values.size > 0);
            const hasSortFilter = ["hit", "new", "sale"].includes(state.sort);
            const isFiltered = Boolean(state.searchQuery) || state.categoryFilter !== "all" || state.priceMin > 0 || state.priceMax < maxPrice || state.brandFilters.size > 0 || hasVariantFilters || hasSortFilter;
            if (allProducts.length === 0) {
              // Товаров нет вообще в БД
              if (noProducts) noProducts.style.display = "";
              if (noResults) noResults.style.display = "none";
              if (emptyTitle) emptyTitle.textContent = "Список товаров пуст";
              if (catalog_empty_reset_button_idBtn) catalog_empty_reset_button_idBtn.style.display = "none";
            } else {
              // Есть товары, но фильтры дали 0 результатов
              if (noProducts) noProducts.style.display = "none";
              if (noResults) noResults.style.display = "";
              if (emptyTitle) emptyTitle.textContent = state.searchQuery ? `По запросу "${state.searchQuery}" ничего не найдено` : "Ничего не найдено";
              if (catalog_empty_reset_button_idBtn) catalog_empty_reset_button_idBtn.style.display = "";
            }
          } else {
            empty.classList.remove("catalog_empty_state_visible");
            grid.innerHTML = page.map(renderCard).join("");
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
          document.querySelectorAll(".filter_block_header_element").forEach((header) => {
            header.addEventListener("click", () => {
              const block = header.closest(".filter_block_component");
              if (block.classList.contains("filter_block_static_variant")) return;
              block.classList.toggle("filter_block_open_state");
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
              <button class="filter_chip_button${state.categoryFilter === category.slug ? " active" : ""}" type="button" data_filter_category_slug="${category.slug}">
                ${category.name}
              </button>
            `)
            .join("");
        }

        function initTypeChips() {
          buildCategoryChips();
          const allChips = document.querySelectorAll("[data_filter_category_slug].filter_chip_button");
          allChips.forEach((btn) => {
            btn.addEventListener("click", () => {
              document.querySelectorAll(".filter_chip_button[data_filter_category_slug]").forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              state.categoryFilter = btn.getAttribute("data_filter_category_slug");
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
            root.innerHTML = '<span class="filter_empty_text_element">Нет брендов</span>';
            return;
          }

          root.innerHTML = [...brandMap.values()]
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"))
            .map((brand) => `
              <label class="filter_checkbox_label_element">
                <input type="checkbox" data_filter_brand_id="${brand.id}" ${state.brandFilters.has(brand.id) ? "checked" : ""} />
                <span class="filter_checkbox_box_element"></span>
                <span class="filter_checkbox_text_span">${brand.name}</span>
                <span class="filter_checkbox_count_span">${brand.count}</span>
              </label>
            `)
            .join("");

          root.querySelectorAll("[data_filter_brand_id]").forEach((input) => {
            input.addEventListener("change", () => {
              const id = String(input.getAttribute("data_filter_brand_id"));
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
              if (!groups.has(group)) groups.set(group, new Map());
              const bySlug = groups.get(group);
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
            .map(([group, variants]) => {
              const title = group === "default" ? "Варианты" : group;
              const options = [...variants.values()]
                .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"))
                .map((variant) => `
                  <label class="filter_checkbox_label_element">
                    <input type="checkbox" data_filter_variant_group_name="${group}" data_filter_variant_slug="${variant.slug}" ${state.variantFilters[group]?.has(String(variant.slug)) ? "checked" : ""} />
                    <span class="filter_checkbox_box_element"></span>
                    <span class="filter_checkbox_text_span">${variant.name}</span>
                    <span class="filter_checkbox_count_span">${variant.count}</span>
                  </label>
                `)
                .join("");
              return `
                <div class="filter_block_component filter_block_open_state" data_filter_variant_block_group="${group}">
                  <div class="filter_block_header_element">
                    <span class="filter_block_title_text">${title}</span>
                    <span class="filter_block_arrow_wrapper">
                      <svg class="filter_block_arrow_icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                    </span>
                  </div>
                  <div class="filter_block_body_container">
                    <div class="filter_block_body_inner_wrapper">
                      <div class="filter_block_body_content_area">
                        <div class="filter_checkboxes_container">
                          ${options}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("");

          root.querySelectorAll(".filter_block_header_element").forEach((header) => {
            header.addEventListener("click", () => {
              header.closest(".filter_block_component")?.classList.toggle("filter_block_open_state");
            });
          });

          root.querySelectorAll("[data_filter_variant_slug]").forEach((input) => {
            input.addEventListener("change", () => {
              const group = input.getAttribute("data_filter_variant_group_name") || "default";
              const slug = String(input.getAttribute("data_filter_variant_slug"));
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
          container.querySelectorAll(".sort_option_button").forEach((b) => b.classList.toggle("active", b.getAttribute("data_sort_option_key") === state.sort));
          container.querySelectorAll(".sort_option_button").forEach((btn) => {
            btn.addEventListener("click", () => {
              container.querySelectorAll(".sort_option_button").forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              state.sort = btn.getAttribute("data_sort_option_key");
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
          if (w > 1200) return { options: [4, 5], default: 5 };
          if (w > 900) return { options: [2, 3], default: 3 };
          // ≤900: мобиль — 1 или 2 колонки
          return { options: [1, 2], default: 2 };
        }

        function getGridViewClass(cols) {
          const classes = {
            1: "catalog_grid_one_column_state",
            2: "catalog_grid_two_columns_state",
            3: "catalog_grid_three_columns_state",
            4: "catalog_grid_four_columns_state",
          };
          return classes[cols] || "";
        }

        function buildViewToggle() {
          const container = document.getElementById("catalog_view_toggle_id");
          if (!container) return;
          const { options, default: def } = getViewOptions();

          // Если текущее state.view не входит в доступные — сбросить на дефолт
          if (!options.includes(state.view)) {
            state.view = def;
            const grid = document.getElementById("catalog_grid_container_id");
            if (grid) {
              grid.className = "catalog_grid_container";
              if (state.view !== options[options.length - 1]) {
                grid.classList.add(getGridViewClass(state.view));
              }
            }
          }

          container.innerHTML = options
            .map(
              (cols) => `
            <button class="catalog_view_button_element${state.view === cols ? " catalog_view_button_active_state" : ""}"
                    data_view_columns_count="${cols}"
                    data_view_button_label="${VIEW_LABELS[cols]}"
                    title="${VIEW_LABELS[cols]}">
              ${VIEW_ICONS[cols]}
            </button>
          `,
            )
            .join("");

          container.querySelectorAll(".catalog_view_button_element").forEach((btn) => {
            btn.addEventListener("click", () => {
              const cols = +btn.getAttribute("data_view_columns_count");
              state.view = cols;
              container.querySelectorAll(".catalog_view_button_element").forEach((b) => b.classList.remove("catalog_view_button_active_state"));
              btn.classList.add("catalog_view_button_active_state");
              const grid = document.getElementById("catalog_grid_container_id");
              if (!grid) return;
              grid.className = "catalog_grid_container";
              const maxCols = getViewOptions().options[getViewOptions().options.length - 1];
              if (cols !== maxCols) grid.classList.add(getGridViewClass(cols));
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
          document.querySelectorAll(".filter_chip_button[data_filter_category_slug]").forEach((b) => b.classList.toggle("active", b.getAttribute("data_filter_category_slug") === "all"));
          document.querySelectorAll(".sort_option_button").forEach((b) => b.classList.toggle("active", b.getAttribute("data_sort_option_key") === "recommended"));
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
          document.querySelectorAll(".filter_checkboxes_container input[type=checkbox]").forEach((cb) => (cb.checked = false));
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
          if (!toggleBtn || !drawer || !overlay) return;

          function openDrawer() {
            drawer.classList.add("open");
            overlay.classList.add("open");
            arrowBtn?.classList.add("open");
            document.body.style.overflow = "hidden";
          }
          function closeDrawer() {
            drawer.classList.remove("open");
            overlay.classList.remove("open");
            arrowBtn?.classList.remove("open");
            document.body.style.overflow = "";
          }

          toggleBtn.addEventListener("click", openDrawer);
          arrowBtn?.addEventListener("click", closeDrawer);
          overlay.addEventListener("click", closeDrawer);
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
