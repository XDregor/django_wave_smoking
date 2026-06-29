(() => {
  const root = document.querySelector(".wa-brands");
  const dataElement = document.getElementById("admin-brands-data");
  if (!root || !dataElement) return;

  let brands = JSON.parse(dataElement.textContent || "[]");
  const state = {
    filter: "all",
    query: "",
    mode: "create",
    currentBrandId: null,
    imageFile: null,
    imagePreview: null,
    busy: false,
  };

  const els = {
    carousel: document.getElementById("carouselTrack"),
    carouselCount: document.getElementById("carouselCount"),
    grid: document.getElementById("brandsGrid"),
    empty: document.getElementById("emptyState"),
    search: document.getElementById("brandSearchInput"),
    modal: document.getElementById("brandModalBackdrop"),
    modalTitle: document.getElementById("brandModalTitle"),
    modalImageWrap: document.getElementById("modalImgWrap"),
    modalImageInput: document.getElementById("modalImageInput"),
    modalImageContent: document.getElementById("modalImgContent"),
    modalName: document.getElementById("modalNameInput"),
    modalSlug: document.getElementById("modalSlugPreview"),
    modalSlugHidden: document.getElementById("modalSlugHidden"),
    modalToggle: document.getElementById("modalToggleCheck"),
    modalSave: document.getElementById("modalSaveBtn"),
    modalDelete: document.getElementById("modalDeleteBtn"),
    modalCancel: document.getElementById("modalCancelBtn"),
    toastContainer: document.getElementById("toastContainer"),
  };

  function escHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
  }

  function translit(value) {
    const map = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
      к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
      х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      і: "i", ї: "yi", є: "ye", ґ: "g",
    };
    return String(value || "")
      .toLowerCase()
      .split("")
      .map((char) => map[char] ?? char)
      .join("")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function updateModalImage(src) {
    if (src) {
      els.modalImageContent.innerHTML = `<img src="${escHtml(src)}" alt="Изображение бренда" />`;
      return;
    }
    els.modalImageContent.innerHTML = `
      <div class="modal-no-img">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <path d="m21 15-5-5L5 21"></path>
        </svg>
        <span>Нет изображения</span>
      </div>
    `;
  }

  function renderCarousel() {
    const carouselBrands = brands.filter((brand) => brand.in_carousel);
    const rows = els.carousel.querySelectorAll("[data-carousel-row]");
    els.carouselCount.textContent = carouselBrands.length;
    if (!carouselBrands.length) {
      els.carousel.classList.add("is-empty");
      rows.forEach((row, index) => {
        row.innerHTML = index === 0
          ? '<span class="carousel-empty-msg">Ни один бренд не добавлен в карусель</span>'
          : "";
      });
      return;
    }
    els.carousel.classList.remove("is-empty");
    const items = carouselBrands.map((brand) => {
      const content = brand.image
        ? `<img src="${escHtml(brand.image)}" alt="${escHtml(brand.name)}" loading="lazy" />`
        : `<span class="brand_line_fallback">${escHtml(brand.name)}</span>`;
      return `<div class="brand_line_item" data-brand-open="${escHtml(brand.id)}" title="${escHtml(brand.name)}">${content}</div>`;
    }).join("");
    rows.forEach((row) => {
      row.innerHTML = items;
    });
  }

  function filteredBrands() {
    const query = state.query.trim().toLowerCase();
    return brands.filter((brand) => {
      if (state.filter === "carousel" && !brand.in_carousel) return false;
      if (state.filter === "noimg" && brand.image) return false;
      if (!query) return true;
      return `${brand.name} ${brand.slug}`.toLowerCase().includes(query);
    });
  }

  function renderGrid() {
    const items = filteredBrands();
    if (!items.length) {
      els.grid.innerHTML = "";
      els.empty.classList.add("visible");
      return;
    }
    els.empty.classList.remove("visible");
    els.grid.innerHTML = items.map((brand) => {
      const label = brand.in_carousel ? "В карусели" : "Не в карусели";
      const cardImage = brand.image
        ? `<div class="item-logo"><img src="${escHtml(brand.image)}" alt="${escHtml(brand.name)}" /></div>`
        : `<div class="item-logo no-img"><span>${escHtml((brand.name || "?").charAt(0))}</span></div>`;
      return `
        <div class="brand-card${brand.in_carousel ? " in-carousel" : ""}" data-brand-open="${escHtml(brand.id)}" data-id="${escHtml(brand.id)}">
          <div class="brand-card-media">${cardImage}</div>
          <div class="brand-card-body">
            <div class="brand-name">${escHtml(brand.name)}</div>
            <div class="brand-slug">${escHtml(brand.slug)}</div>
            <div class="brand-card-footer${brand.in_carousel ? " is-active" : ""}">
              <span class="status-dot ${brand.in_carousel ? "on" : "off"}"></span>
              <span class="status-text">${label}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAll() {
    renderCarousel();
    renderGrid();
  }

  function findBrand(id) {
    return brands.find((brand) => String(brand.id) === String(id)) || null;
  }

  function openCreateBrand() {
    state.mode = "create";
    state.currentBrandId = null;
    state.imageFile = null;
    state.imagePreview = null;
    els.modalTitle.textContent = "Добавить бренд";
    els.modalName.value = "";
    els.modalName.style.borderColor = "";
    els.modalSlug.textContent = "—";
    els.modalSlugHidden.value = "";
    els.modalToggle.checked = false;
    els.modalSave.textContent = "Создать";
    els.modalDelete.style.display = "none";
    els.modalImageInput.value = "";
    updateModalImage(null);
    openModal();
  }

  function openEditBrand(id) {
    const brand = findBrand(id);
    if (!brand) return;
    state.mode = "edit";
    state.currentBrandId = brand.id;
    state.imageFile = null;
    state.imagePreview = brand.image || null;
    els.modalTitle.textContent = "Редактировать бренд";
    els.modalName.value = brand.name || "";
    els.modalName.style.borderColor = "";
    els.modalSlug.textContent = brand.slug || "—";
    els.modalSlugHidden.value = brand.slug || "";
    els.modalToggle.checked = Boolean(brand.in_carousel);
    els.modalSave.textContent = "Сохранить";
    els.modalDelete.style.display = "flex";
    els.modalImageInput.value = "";
    updateModalImage(brand.image);
    openModal();
  }

  function openModal() {
    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => els.modalName.focus(), 100);
  }

  function closeModal() {
    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
    state.imageFile = null;
    state.imagePreview = null;
    state.currentBrandId = null;
    els.modalImageInput.value = "";
  }

  async function saveBrand() {
    const name = els.modalName.value.trim();
    if (!name) {
      toast("Введите название бренда", "err");
      els.modalName.style.borderColor = "var(--danger)";
      return;
    }
    els.modalName.style.borderColor = "";
    const formData = new FormData();
    if (state.mode === "edit") formData.append("id", state.currentBrandId);
    formData.append("name", name);
    formData.append("show_in_carousel", els.modalToggle.checked ? "1" : "0");
    if (state.imageFile) formData.append("image", state.imageFile);

    setBusy(true);
    try {
      const data = await postForm(root.dataset.saveUrl, formData);
      upsertBrand(data.brand);
      closeModal();
      renderAll();
      toast(state.mode === "edit" ? "Бренд обновлён" : "Бренд создан", "ok");
    } catch (error) {
      toast(error.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBrand() {
    if (!state.currentBrandId) return;
    const brand = findBrand(state.currentBrandId);
    if (!window.confirm(`Удалить бренд «${brand?.name || ""}»?`)) return;
    setBusy(true);
    try {
      await postJson(root.dataset.deleteUrl, { id: state.currentBrandId });
      brands = brands.filter((item) => String(item.id) !== String(state.currentBrandId));
      closeModal();
      renderAll();
      toast("Бренд удалён", "info");
    } catch (error) {
      toast(error.message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCarousel(id, nextState) {
    try {
      const data = await postJson(root.dataset.toggleCarouselUrl, { id, show_in_carousel: nextState });
      upsertBrand(data.brand);
      if (String(state.currentBrandId) === String(id) && els.modal.classList.contains("open")) {
        els.modalToggle.checked = data.brand.in_carousel;
      }
      renderAll();
      toast(data.brand.in_carousel ? "Бренд добавлен в карусель" : "Бренд убран из карусели", data.brand.in_carousel ? "ok" : "info");
    } catch (error) {
      toast(error.message, "err");
    }
  }

  function upsertBrand(brand) {
    const index = brands.findIndex((item) => String(item.id) === String(brand.id));
    if (index === -1) {
      brands.push(brand);
    } else {
      brands[index] = brand;
    }
  }

  async function postForm(url, formData) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
      body: formData,
    });
    return parseResponse(response);
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(payload),
    });
    return parseResponse(response);
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Не удалось выполнить действие.");
    }
    return data;
  }

  function setBusy(value) {
    state.busy = value;
    els.modalSave.disabled = value;
    els.modalDelete.disabled = value;
  }

  function toast(message, type = "info") {
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `<span class="toast-dot ${escHtml(type)}"></span>${escHtml(message)}`;
    els.toastContainer.appendChild(item);
    window.setTimeout(() => {
      item.classList.add("fade-out");
      window.setTimeout(() => item.remove(), 220);
    }, 2800);
  }

  document.getElementById("createBrandBtn")?.addEventListener("click", openCreateBrand);
  els.search?.addEventListener("input", () => {
    state.query = els.search.value;
    renderGrid();
  });
  root.querySelectorAll(".filter-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter || "all";
      root.querySelectorAll(".filter-tab").forEach((item) => item.classList.toggle("active", item === button));
      renderGrid();
    });
  });
  root.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-brand-toggle]");
    if (toggle) {
      event.stopPropagation();
      toggleCarousel(toggle.dataset.brandToggle, toggle.dataset.state === "true");
      return;
    }
    const open = event.target.closest("[data-brand-open]");
    if (open) openEditBrand(open.dataset.brandOpen);
  });
  els.modalImageWrap?.addEventListener("click", () => els.modalImageInput.click());
  els.modalImageInput?.addEventListener("change", () => {
    const file = els.modalImageInput.files?.[0];
    if (!file) return;
    state.imageFile = file;
    state.imagePreview = URL.createObjectURL(file);
    updateModalImage(state.imagePreview);
    toast("Изображение выбрано", "ok");
  });
  els.modalName?.addEventListener("input", () => {
    const slug = translit(els.modalName.value);
    els.modalSlug.textContent = slug || "—";
    els.modalSlugHidden.value = slug;
  });
  els.modalSave?.addEventListener("click", saveBrand);
  els.modalDelete?.addEventListener("click", deleteBrand);
  els.modalCancel?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  renderAll();
})();
