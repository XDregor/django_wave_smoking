(() => {
  const root = document.querySelector(".wa-categories");
  const dataElement = document.getElementById("admin-categories-data");
  if (!root || !dataElement) return;

  let categories = JSON.parse(dataElement.textContent || "[]");
  const storageKey = "waveAdminCategoriesSearch";
  const state = {
    mode: "create",
    currentId: null,
    busy: false,
    query: localStorage.getItem(storageKey) || "",
  };

  const els = {
    list: document.getElementById("categoryList"),
    empty: document.getElementById("emptyState"),
    count: document.getElementById("categoryCount"),
    search: document.getElementById("categorySearchInput"),
    create: document.getElementById("createCategoryBtn"),
    modal: document.getElementById("categoryModalBackdrop"),
    modalTitle: document.getElementById("categoryModalTitle"),
    modalClose: document.getElementById("categoryModalClose"),
    name: document.getElementById("categoryNameInput"),
    save: document.getElementById("saveCategoryBtn"),
    delete: document.getElementById("deleteCategoryBtn"),
    cancel: document.getElementById("cancelCategoryBtn"),
    toasts: document.getElementById("categoryToastContainer"),
  };

  function escHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(";").shift() : "";
  }

  function noun(number, forms) {
    const value = Math.abs(Number(number)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  }

  function productCountLabel(count) {
    return `${count} ${noun(count, ["товар", "товара", "товаров"])}`;
  }

  function filteredCategories() {
    const query = state.query.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      `${category.name} ${category.slug}`.toLowerCase().includes(query)
    );
  }

  function render() {
    const items = filteredCategories();
    els.count.textContent = `${categories.length} ${noun(categories.length, ["категория", "категории", "категорий"])}`;
    els.empty.hidden = items.length > 0;
    els.list.hidden = items.length === 0;
    els.list.innerHTML = items.map((category, index) => `
      <button
        class="category-row"
        type="button"
        data-category-open="${escHtml(category.id)}"
        style="animation-delay:${Math.min(index, 8) * 0.025}s"
      >
        <span class="category-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 6h18"></path>
            <path d="M5 6V4h5l2 2"></path>
            <path d="M4 6h16v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"></path>
          </svg>
        </span>
        <span class="category-copy">
          <span class="category-name">${escHtml(category.name)}</span>
          <span class="category-slug">/${escHtml(category.slug)}</span>
        </span>
        <span class="category-count">${escHtml(productCountLabel(category.product_count))}</span>
        <svg class="category-chevron" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m9 18 6-6-6-6"></path>
        </svg>
      </button>
    `).join("");
  }

  function findCategory(id) {
    return categories.find((category) => String(category.id) === String(id)) || null;
  }

  function openCreate() {
    state.mode = "create";
    state.currentId = null;
    els.modalTitle.textContent = "Добавить категорию";
    els.name.value = "";
    els.name.style.borderColor = "";
    els.save.textContent = "Добавить";
    els.delete.hidden = true;
    openModal();
  }

  function openEdit(id) {
    const category = findCategory(id);
    if (!category) return;
    state.mode = "edit";
    state.currentId = category.id;
    els.modalTitle.textContent = "Редактировать категорию";
    els.name.value = category.name || "";
    els.name.style.borderColor = "";
    els.save.textContent = "Сохранить";
    els.delete.hidden = false;
    openModal();
  }

  function openModal() {
    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => els.name.focus(), 100);
  }

  function closeModal() {
    if (state.busy) return;
    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.currentId = null;
    els.name.style.borderColor = "";
  }

  function setBusy(value) {
    state.busy = value;
    els.save.disabled = value;
    els.delete.disabled = value;
    els.cancel.disabled = value;
    els.modalClose.disabled = value;
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Не удалось выполнить действие.");
    }
    return data;
  }

  async function saveCategory() {
    if (state.busy) return;
    const name = els.name.value.trim();
    if (!name) {
      els.name.style.borderColor = "var(--danger)";
      toast("Введите название категории", "error");
      els.name.focus();
      return;
    }

    const formData = new FormData();
    if (state.mode === "edit") formData.append("id", state.currentId);
    formData.append("name", name);
    const wasEditing = state.mode === "edit";

    setBusy(true);
    try {
      const response = await fetch(root.dataset.saveUrl, {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        body: formData,
      });
      const data = await parseResponse(response);
      const index = categories.findIndex((category) => String(category.id) === String(data.category.id));
      if (index === -1) categories.push(data.category);
      else categories[index] = data.category;
      categories.sort((a, b) => a.name.localeCompare(b.name, "ru"));
      setBusy(false);
      closeModal();
      render();
      toast(wasEditing ? "Категория обновлена" : "Категория добавлена");
    } catch (error) {
      setBusy(false);
      toast(error.message, "error");
    }
  }

  async function deleteCategory() {
    if (state.busy || !state.currentId) return;
    const category = findCategory(state.currentId);
    if (!category) return;
    if (Number(category.product_count) > 0) {
      toast("Сначала перенесите товары в другую категорию", "error");
      return;
    }
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) return;

    setBusy(true);
    try {
      const response = await fetch(root.dataset.deleteUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ id: category.id }),
      });
      await parseResponse(response);
      categories = categories.filter((item) => String(item.id) !== String(category.id));
      setBusy(false);
      closeModal();
      render();
      toast("Категория удалена");
    } catch (error) {
      setBusy(false);
      toast(error.message, "error");
    }
  }

  function toast(message, type = "info") {
    const item = document.createElement("div");
    item.className = `toast${type === "error" ? " error" : ""}`;
    item.innerHTML = `<span class="toast-dot"></span><span>${escHtml(message)}</span>`;
    els.toasts.appendChild(item);
    window.setTimeout(() => {
      item.classList.add("fade-out");
      window.setTimeout(() => item.remove(), 200);
    }, 2800);
  }

  els.search.value = state.query;
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    localStorage.setItem(storageKey, state.query);
    render();
  });
  els.create.addEventListener("click", openCreate);
  els.modalClose.addEventListener("click", closeModal);
  els.cancel.addEventListener("click", closeModal);
  els.save.addEventListener("click", saveCategory);
  els.delete.addEventListener("click", deleteCategory);
  els.name.addEventListener("input", () => {
    els.name.style.borderColor = "";
  });
  els.name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCategory();
    }
  });
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  els.list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-category-open]");
    if (row) openEdit(row.dataset.categoryOpen);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.modal.classList.contains("open")) closeModal();
  });

  render();
})();
