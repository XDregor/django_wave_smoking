(() => {
  const root = document.querySelector(".wave-admin-products-list");
  const dataElement = document.getElementById("admin-products-data");
  if (!root || !dataElement) return;

  let products = JSON.parse(dataElement.textContent || "[]");
  const state = {
    filter: "all",
    sort: "date",
    page: 1,
    pageSize: 20,
    currentEditId: null,
    selectedIds: new Set(),
    busy: false,
  };
  const listStorageKey = "wave_admin_products_list_state_v1";

  const labels = {
    badges: {
      hit: "Хит",
      new: "Новинка",
      sale: "Скидка",
      top: "Топ",
    },
    status: {
      published: "Опубликован",
      draft: "Черновик",
    },
  };

  function escHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function money(value) {
    const number = Number(value || 0);
    return `${Math.round(number)} грн`;
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
  }

  function readListUiState() {
    try {
      return JSON.parse(localStorage.getItem(listStorageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function saveListUiState() {
    try {
      localStorage.setItem(
        listStorageKey,
        JSON.stringify({
          filter: state.filter,
          sort: state.sort,
          page: state.page,
          search: document.getElementById("searchInput")?.value || "",
        })
      );
    } catch (error) {
      /* localStorage can be unavailable in private contexts. */
    }
  }

  function applyListUiState() {
    const saved = readListUiState();
    const filters = new Set(["all", "published", "draft"]);
    const sorts = new Set(["date", "name", "price", "stock"]);
    if (filters.has(saved.filter)) state.filter = saved.filter;
    if (sorts.has(saved.sort)) state.sort = saved.sort;
    if (Number.isInteger(Number(saved.page)) && Number(saved.page) > 0) state.page = Number(saved.page);

    const searchInput = document.getElementById("searchInput");
    if (searchInput && typeof saved.search === "string") searchInput.value = saved.search;

    document.querySelectorAll(".filter-btn[data-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === state.filter);
    });

    const sortButton = document.querySelector(`.sort-opt[data-sort="${CSS.escape(state.sort)}"]`);
    if (sortButton) {
      document.getElementById("sortLabel").textContent = sortButton.dataset.label || sortButton.textContent.trim();
      document.querySelectorAll(".sort-opt").forEach((button) => {
        button.classList.toggle("active", button === sortButton);
      });
    }
  }

  function selectedProducts() {
    return products.filter((product) => state.selectedIds.has(String(product.id)));
  }

  function selectedAreOnlyDrafts() {
    const selected = selectedProducts();
    return selected.length > 0 && selected.every((product) => product.status === "draft");
  }

  function selectedCountLabel(count) {
    if (count === 1) return "Выбрано 1 товар";
    if (count >= 2 && count <= 4) return `Выбрано ${count} товара`;
    return `Выбрано ${count} товаров`;
  }

  function addIconSvg() {
    return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  }

  function draftIconSvg() {
    return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg>`;
  }

  function publishIconSvg() {
    return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M6 11l6-6 6 6"/></svg>`;
  }

  function totalStock(product) {
    if (Array.isArray(product.skus) && product.skus.length) {
      return product.skus.reduce((sum, sku) => sum + Number(sku.qty || 0), 0);
    }
    return Number(product.stock || 0);
  }

  function getFilteredProducts() {
    const searchInput = document.getElementById("searchInput");
    const query = (searchInput?.value || "").toLowerCase().trim();
    return products
      .filter((product) => {
        if (state.filter === "published" && product.status !== "published") return false;
        if (state.filter === "draft" && product.status !== "draft") return false;
        if (!query) return true;
        const searchable = [
          product.name,
          product.id,
          product.code,
          product.brand,
          product.category,
        ].join(" ").toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => {
        if (state.sort === "name") return a.name.localeCompare(b.name, "ru");
        if (state.sort === "price") return Number(a.price || 0) - Number(b.price || 0);
        if (state.sort === "stock") return totalStock(b) - totalStock(a);
        return Number(b.created_ts || 0) - Number(a.created_ts || 0);
      });
  }

  function getPagedProducts(filtered) {
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    return {
      items: filtered.slice(start, start + state.pageSize),
      totalPages,
    };
  }

  function renderGrid() {
    const grid = document.getElementById("productsGrid");
    const empty = document.getElementById("emptyState");
    if (!grid || !empty) return;

    const filtered = getFilteredProducts();
    const { items, totalPages } = getPagedProducts(filtered);

    updateBulkUi(filtered.length);
    if (!items.length) {
      grid.innerHTML = "";
      empty.hidden = false;
      renderPagination(1);
      saveListUiState();
      return;
    }

    empty.hidden = true;
    grid.innerHTML = items.map((product, index) => renderProductCard(product, index)).join("");
    renderPagination(totalPages);
    updateBulkUi(filtered.length);
    saveListUiState();
  }

  function renderProductCard(product, index) {
    const stock = totalStock(product);
    const skuCount = Array.isArray(product.skus) ? product.skus.length : 0;
    const priceHtml = product.old_price && Number(product.old_price) > Number(product.price)
      ? `<span>${money(product.price)}</span><span class="old-price">${money(product.old_price)}</span>`
      : `<span>${money(product.price)}</span>`;
    const badgeHtml = product.badge
      ? `<div class="product-badge ${escHtml(product.badge)}">${escHtml(labels.badges[product.badge] || product.badge_label || "")}</div>`
      : "";
    const thumbHtml = product.img
      ? `<img src="${escHtml(product.img)}" alt="${escHtml(product.name)}" loading="lazy" onerror="this.classList.add('img-error');this.nextElementSibling.style.display='flex'">
         <div class="product-thumb-empty" style="display:none">${emptyImageIcon()}</div>`
      : `<div class="product-thumb-empty" style="display:flex">${emptyImageIcon()}</div>`;
    const productId = String(product.id);
    const selected = state.selectedIds.has(productId);
    const isDraft = product.status === "draft";

    return `
      <article class="product-card${selected ? " selected" : ""}${isDraft ? " is-draft" : ""}" role="button" tabindex="0" data-product-id="${escHtml(product.id)}" style="animation-delay:${index * 0.03}s">
        <div class="product-thumb">
          ${thumbHtml}
          ${badgeHtml}
          ${isDraft ? `<div class="product-draft-label">Черновик</div>` : ""}
          <label class="product-select-control" title="Выбрать товар" aria-label="Выбрать товар">
            <input class="product-select-checkbox" type="checkbox" data-product-select="${escHtml(product.id)}" ${selected ? "checked" : ""}>
            <span class="product-select-box" aria-hidden="true">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
            </span>
          </label>
        </div>
        <div class="product-info">
          <div class="product-name">${escHtml(product.name)}</div>
          <div class="product-meta">
            <span class="product-id">${escHtml(product.code || `#${product.id}`)}</span>
            <span class="product-sep"></span>
            <span class="product-cat">${escHtml(product.category || "Без категории")}</span>
          </div>
          <div class="product-card-summary">
            <div class="product-price">${priceHtml}</div>
            <div class="product-inventory">
              <span class="product-stock">${stock} шт.</span>
              <span class="product-skus">${skuCount || 1} SKU</span>
            </div>
          </div>
        </div>
      </article>`;
  }

  function emptyImageIcon() {
    return `
      <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>Нет фото</span>`;
  }

  function renderPagination(totalPages) {
    const wrapper = document.getElementById("productsPagination");
    const prev = document.getElementById("pagePrevBtn");
    const next = document.getElementById("pageNextBtn");
    const info = document.getElementById("pageInfo");
    if (!wrapper || !prev || !next || !info) return;

    wrapper.hidden = totalPages <= 1;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= totalPages;
    info.textContent = `${state.page} / ${totalPages}`;
  }

  function setStatusFilter(filter) {
    state.filter = filter;
    state.page = 1;
    document.querySelectorAll(".filter-btn[data-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === filter);
    });
    renderGrid();
  }

  function setSort(sort, label, target) {
    state.sort = sort;
    state.page = 1;
    document.getElementById("sortLabel").textContent = label;
    document.getElementById("sortMenu")?.classList.remove("open");
    document.querySelectorAll(".sort-opt").forEach((button) => {
      button.classList.toggle("active", button === target);
    });
    renderGrid();
  }

  function updateBulkUi(filteredCount) {
    const selectedCount = state.selectedIds.size;
    const count = document.getElementById("totalCount");
    const addButton = document.getElementById("addProductBtn");
    const deleteButton = document.getElementById("deleteProductsBtn");
    const deleteText = deleteButton?.querySelector("[data-delete-text]");
    if (count) {
      count.textContent = selectedCount ? selectedCountLabel(selectedCount) : `${filteredCount} товаров`;
    }
    if (addButton) {
      if (selectedCount) {
        addButton.innerHTML = selectedAreOnlyDrafts()
          ? `${publishIconSvg()}<span data-primary-text>Опубликовать</span>`
          : `${draftIconSvg()}<span data-primary-text>Отправить в черновик</span>`;
      } else {
        addButton.innerHTML = `${addIconSvg()}<span data-primary-text>Добавить товар</span>`;
      }
    }
    if (deleteButton) {
      deleteButton.hidden = selectedCount === 0;
      if (deleteText) deleteText.textContent = `Удалить (${selectedCount})`;
    }
  }

  function toggleProductSelection(productId, force) {
    const id = String(productId);
    const shouldSelect = force === undefined ? !state.selectedIds.has(id) : Boolean(force);
    if (shouldSelect) {
      state.selectedIds.add(id);
    } else {
      state.selectedIds.delete(id);
    }
    const card = document.querySelector(`.product-card[data-product-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.toggle("selected", shouldSelect);
      const checkbox = card.querySelector(".product-select-checkbox");
      if (checkbox) checkbox.checked = shouldSelect;
    }
    updateBulkUi(getFilteredProducts().length);
  }

  async function postBulkAction(url, ids) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ ids }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Не удалось выполнить действие.");
    }
    return result;
  }

  async function sendSelectedToDraft() {
    if (!state.selectedIds.size || state.busy) return;
    state.busy = true;
    try {
      const ids = Array.from(state.selectedIds);
      await postBulkAction(root.dataset.bulkDraftUrl, ids);
      products.forEach((product) => {
        if (state.selectedIds.has(String(product.id))) product.status = "draft";
      });
      state.selectedIds.clear();
      renderGrid();
    } catch (error) {
      window.alert(error.message || "Не удалось отправить товары в черновик.");
    } finally {
      state.busy = false;
    }
  }

  async function publishSelectedProducts() {
    if (!state.selectedIds.size || state.busy) return;
    state.busy = true;
    try {
      const ids = Array.from(state.selectedIds);
      await postBulkAction(root.dataset.bulkPublishUrl, ids);
      products.forEach((product) => {
        if (state.selectedIds.has(String(product.id))) product.status = "published";
      });
      state.selectedIds.clear();
      renderGrid();
    } catch (error) {
      window.alert(error.message || "Не удалось опубликовать товары.");
    } finally {
      state.busy = false;
    }
  }

  async function deleteSelectedProducts() {
    const selected = selectedProducts();
    if (!selected.length || state.busy) return;
    const names = selected.map((product) => `• ${product.name}`).join("\n");
    if (!window.confirm(`Удалить выбранные товары?\n\nБудут удалены:\n${names}`)) return;
    state.busy = true;
    try {
      const ids = selected.map((product) => String(product.id));
      await postBulkAction(root.dataset.bulkDeleteUrl, ids);
      const deleted = new Set(ids);
      products = products.filter((product) => !deleted.has(String(product.id)));
      state.selectedIds.clear();
      renderGrid();
    } catch (error) {
      window.alert(error.message || "Не удалось удалить товары.");
    } finally {
      state.busy = false;
    }
  }

  function openEditPanel(productId) {
    {
      const product = products.find((item) => String(item.id) === String(productId));
      if (product?.edit_url) window.location.href = product.edit_url;
      return;
    }
    const product = products.find((item) => String(item.id) === String(productId));
    if (!product) return;
    state.currentEditId = product.id;

    document.getElementById("editPanelTitle").textContent = product.name || "Без названия";
    document.getElementById("editPanelId").textContent = `${product.code || `#${product.id}`} · ${product.brand || ""} · ${product.category || ""}`;
    document.getElementById("editPanelBody").innerHTML = renderEditPreview(product);
    document.getElementById("editOverlay").classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function renderEditPreview(product) {
    const skuListHtml = product.skus?.length
      ? product.skus.map((sku) => `
          <div class="sku-row">
            <div class="sku-avail ${Number(sku.qty || 0) > 0 ? "ok" : "off"}"></div>
            <div class="sku-name">${escHtml(sku.name || "SKU")}</div>
            <div class="sku-price">${Number(sku.qty || 0)} шт.</div>
          </div>`).join("")
      : `<div style="color:var(--text-3);font-size:13px;padding:8px 0">SKU не созданы</div>`;
    const charsHtml = product.chars?.length
      ? product.chars.map((item) => `
          <div class="field-row" style="gap:10px">
            <input type="text" value="${escHtml(item.k)}" readonly>
            <input type="text" value="${escHtml(item.v)}" readonly>
          </div>`).join("")
      : `<div style="color:var(--text-3);font-size:13px">Характеристики не добавлены</div>`;
    const thumbHtml = product.img
      ? `<div class="media-thumb-edit filled"><img src="${escHtml(product.img)}" alt=""></div>`
      : `<div class="media-thumb-edit">${emptyUploadIcon()}<span>Нет фото</span></div>`;

    return `
      <div class="wizard-card">
        <div class="card-header"><div class="card-header-top"><div class="card-title">Основная информация</div></div></div>
        <div class="card-body">
          <div class="field-group"><label>Название</label><input type="text" value="${escHtml(product.name)}" readonly></div>
          <div class="field-row">
            <div class="field-group"><label>Категория</label><input type="text" value="${escHtml(product.category || "")}" readonly></div>
            <div class="field-group"><label>Бренд</label><input type="text" value="${escHtml(product.brand || "")}" readonly></div>
          </div>
        </div>
      </div>
      <div class="wizard-card">
        <div class="card-header"><div class="card-header-top"><div class="card-title">Описание и характеристики</div></div></div>
        <div class="card-body">
          <div class="field-group"><label>Описание</label><textarea rows="4" readonly>${escHtml(product.description || "")}</textarea></div>
          <div><div class="section-label" style="margin-bottom:10px">Характеристики</div><div style="display:flex;flex-direction:column;gap:8px">${charsHtml}</div></div>
        </div>
      </div>
      <div class="wizard-card">
        <div class="card-header"><div class="card-header-top"><div class="card-title">Медиа</div></div></div>
        <div class="card-body"><div class="media-grid-edit">${thumbHtml}</div></div>
      </div>
      <div class="wizard-card">
        <div class="card-header"><div class="card-header-top"><div class="card-title">SKU / Остатки</div></div></div>
        <div class="card-body">
          <div class="sku-list">${skuListHtml}</div>
          <div style="font-size:11.5px;color:var(--text-3)">Цена: <strong style="color:var(--text-1)">${money(product.price)}</strong></div>
        </div>
      </div>`;
  }

  function emptyUploadIcon() {
    return `<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
  }

  function closeEditPanel() {
    document.getElementById("editOverlay")?.classList.remove("open");
    document.body.style.overflow = "";
    state.currentEditId = null;
  }

  function openCurrentEditor() {
    const product = products.find((item) => String(item.id) === String(state.currentEditId));
    if (!product?.edit_url) return;
    window.location.href = product.edit_url;
  }

  root.addEventListener("click", (event) => {
    const checkbox = event.target.closest(".product-select-checkbox");
    if (checkbox) {
      event.stopPropagation();
      toggleProductSelection(checkbox.dataset.productSelect, checkbox.checked);
      return;
    }

    const selectControl = event.target.closest(".product-select-control");
    if (selectControl) {
      event.preventDefault();
      event.stopPropagation();
      const input = selectControl.querySelector(".product-select-checkbox");
      if (input) toggleProductSelection(input.dataset.productSelect, !input.checked);
      return;
    }

    const card = event.target.closest(".product-card[data-product-id]");
    if (card) {
      if (state.selectedIds.size) {
        toggleProductSelection(card.dataset.productId);
        return;
      }
      const product = products.find((item) => String(item.id) === String(card.dataset.productId));
      if (product?.edit_url) window.location.href = product.edit_url;
      return;
    }

    const filter = event.target.closest(".filter-btn[data-filter]");
    if (filter) {
      setStatusFilter(filter.dataset.filter);
      return;
    }

    const sort = event.target.closest(".sort-opt[data-sort]");
    if (sort) {
      setSort(sort.dataset.sort, sort.dataset.label, sort);
      return;
    }

    if (event.target.closest("#sortBtn")) {
      document.getElementById("sortMenu")?.classList.toggle("open");
      return;
    }

    if (event.target.closest("#addProductBtn")) {
      if (state.selectedIds.size) {
        if (selectedAreOnlyDrafts()) {
          publishSelectedProducts();
        } else {
          sendSelectedToDraft();
        }
        return;
      }
      window.location.href = root.dataset.addUrl;
      return;
    }

    if (event.target.closest("#deleteProductsBtn")) {
      deleteSelectedProducts();
      return;
    }

    if (event.target.closest("#pagePrevBtn")) {
      state.page = Math.max(1, state.page - 1);
      renderGrid();
      return;
    }

    if (event.target.closest("#pageNextBtn")) {
      state.page += 1;
      renderGrid();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sort-menu-wrap")) {
      document.getElementById("sortMenu")?.classList.remove("open");
    }
  });

  root.addEventListener("keydown", (event) => {
    const card = event.target.closest(".product-card[data-product-id]");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (state.selectedIds.size || event.key === " ") {
      toggleProductSelection(card.dataset.productId);
      return;
    }
    const product = products.find((item) => String(item.id) === String(card.dataset.productId));
    if (product?.edit_url) window.location.href = product.edit_url;
  });

  document.getElementById("searchInput")?.addEventListener("input", () => {
    state.page = 1;
    renderGrid();
  });

  applyListUiState();
  renderGrid();
})();
