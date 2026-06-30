(() => {
  "use strict";

  function escHtml(value) {
    const node = document.createElement("div");
    node.textContent = value == null ? "" : String(value);
    return node.innerHTML;
  }

  function noun(number, forms) {
    const value = Math.abs(Number(number)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return forms[2];
    if (last > 1 && last < 5) return forms[1];
    if (last === 1) return forms[0];
    return forms[2];
  }

  function initMediaList() {
    const root = document.querySelector(".wa-media-list");
    const dataElement = document.getElementById("admin-media-products-data");
    if (!root || !dataElement) return;

    const products = JSON.parse(dataElement.textContent || "[]");
    const search = document.getElementById("mediaProductSearch");
    const list = document.getElementById("mediaProductList");
    const empty = document.getElementById("mediaProductsEmpty");
    const count = document.getElementById("mediaProductsCount");
    const storageKey = "waveAdminMediaSearch";

    function render() {
      const query = String(search.value || "").trim().toLocaleLowerCase();
      const filtered = products.filter((product) => [
        product.name,
        product.code,
        product.brand,
        product.category,
        product.id,
      ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(query)));

      count.textContent = `${products.length} ${noun(products.length, ["товар", "товара", "товаров"])}`;
      empty.hidden = filtered.length > 0;
      list.hidden = filtered.length === 0;
      list.innerHTML = filtered.map((product) => `
        <a class="media-product-row" href="${escHtml(product.url)}">
          <span class="media-product-thumb">
            ${product.image ? `<img src="${escHtml(product.image)}" alt="${escHtml(product.name)}" loading="lazy" />` : "<span>Нет фото</span>"}
          </span>
          <span class="media-product-copy">
            <span class="media-product-name">${escHtml(product.name)}</span>
            <span class="media-product-meta">${escHtml(product.code)}${product.brand ? ` · ${escHtml(product.brand)}` : ""}${product.category ? ` · ${escHtml(product.category)}` : ""}</span>
          </span>
          <span class="media-product-stats">
            <span class="media-stat">${escHtml(product.media_count)} файлов</span>
            ${Number(product.variant_image_count) ? `<span class="media-stat is-variant-stat">${escHtml(product.variant_image_count)} вар.</span>` : ""}
          </span>
          <svg class="media-product-chevron" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
        </a>
      `).join("");
    }

    search.value = localStorage.getItem(storageKey) || "";
    search.addEventListener("input", () => {
      localStorage.setItem(storageKey, search.value);
      render();
    });
    render();
  }

  function initMediaDetail() {
    const root = document.querySelector(".wa-media-detail");
    if (!root) return;

    const form = document.getElementById("mediaManagerForm");
    const saveButton = document.getElementById("saveMediaBtn");
    const count = document.getElementById("mediaItemsCount");
    const newImagesInput = root.querySelector("[data-new-images]");
    const newImagesLabel = root.querySelector("[data-new-images-label]");
    const objectUrls = [];

    root.querySelectorAll(".media-action").forEach((action) => {
      const label = action.querySelector(":scope > span");
      const text = label?.textContent?.trim();
      if (!text) return;
      label.classList.add("media-action-label");
      action.dataset.tooltip = text;
      action.setAttribute("aria-label", text);
    });

    function syncGridOrder(grid) {
      [...grid.querySelectorAll(":scope > [data-media-sort-item]")].forEach((item, index) => {
        const input = item.querySelector("[data-media-order-input]");
        const label = item.querySelector("[data-order-label]");
        if (input) input.value = String(index);
        if (label) label.textContent = `Позиция: ${index + 1}`;
      });
    }

    function initSortableGrid(grid) {
      let draggedItem = null;

      grid.querySelectorAll(":scope > [data-media-sort-item]").forEach((item) => {
        const handle = item.querySelector("[data-drag-handle]");
        if (!handle) return;

        handle.addEventListener("pointerdown", () => {
          item.draggable = true;
        });
        handle.addEventListener("pointerup", () => {
          if (!draggedItem) item.draggable = false;
        });
        handle.addEventListener("keydown", (event) => {
          const items = [...grid.querySelectorAll(":scope > [data-media-sort-item]")];
          const index = items.indexOf(item);
          const moveBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
          const moveForward = event.key === "ArrowRight" || event.key === "ArrowDown";
          if ((!moveBackward && !moveForward) || (moveBackward && index <= 0) || (moveForward && index >= items.length - 1)) return;
          event.preventDefault();
          if (moveBackward) grid.insertBefore(item, items[index - 1]);
          else grid.insertBefore(items[index + 1], item);
          syncGridOrder(grid);
          handle.focus();
        });

        item.addEventListener("dragstart", (event) => {
          if (!item.draggable) {
            event.preventDefault();
            return;
          }
          draggedItem = item;
          item.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", "media-order");
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("is-dragging");
          item.draggable = false;
          draggedItem = null;
          grid.querySelectorAll(".is-drag-target").forEach((target) => target.classList.remove("is-drag-target"));
          syncGridOrder(grid);
        });
      });

      grid.addEventListener("dragover", (event) => {
        if (!draggedItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const target = event.target.closest("[data-media-sort-item]");
        grid.querySelectorAll(".is-drag-target").forEach((item) => item.classList.remove("is-drag-target"));
        if (!target || target === draggedItem || target.parentElement !== grid) return;
        target.classList.add("is-drag-target");
        const rect = target.getBoundingClientRect();
        const relativeY = event.clientY - rect.top;
        const insertBefore = relativeY < rect.height * 0.25
          || (relativeY <= rect.height * 0.75 && event.clientX < rect.left + rect.width / 2);
        grid.insertBefore(draggedItem, insertBefore ? target : target.nextSibling);
      });
      grid.addEventListener("drop", (event) => {
        if (!draggedItem) return;
        event.preventDefault();
        syncGridOrder(grid);
      });

      syncGridOrder(grid);
    }

    function updateCount() {
      const existing = [...root.querySelectorAll(".media-tile[data-existing='true']")]
        .filter((tile) => !tile.classList.contains("is-marked-delete")).length;
      const pendingExisting = [...root.querySelectorAll(".media-tile[data-existing='false'][data-pending-upload='true']")]
        .filter((tile) => !tile.classList.contains("is-marked-delete")).length;
      const newImages = newImagesInput?.files?.length || 0;
      const total = existing + pendingExisting + newImages;
      if (count) count.textContent = `${total} ${noun(total, ["файл", "файла", "файлов"])}`;
    }

    function showFilePreview(input) {
      const file = input.files?.[0];
      const tile = input.closest(".media-tile");
      const content = tile?.querySelector(".media-preview-content");
      if (!file || !tile || !content) return;

      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      if (input.dataset.mediaUpload === "video") {
        content.innerHTML = `<video controls preload="metadata" src="${url}"></video>`;
      } else {
        content.innerHTML = `<img src="${url}" alt="Новое изображение" />`;
      }
      tile.classList.remove("is-empty", "is-marked-delete");
      tile.dataset.pendingUpload = "true";
      const deleteInput = tile.querySelector("[data-media-delete]");
      if (deleteInput) deleteInput.checked = false;
      updateCount();
    }

    root.querySelectorAll("[data-media-upload]").forEach((input) => {
      input.addEventListener("change", () => showFilePreview(input));
    });

    root.querySelectorAll("[data-media-delete]").forEach((input) => {
      input.addEventListener("change", () => {
        input.closest(".media-tile")?.classList.toggle("is-marked-delete", input.checked);
        updateCount();
      });
    });

    root.querySelectorAll("[data-media-settings]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const panel = button.closest(".media-frame")?.querySelector(".media-settings");
        root.querySelectorAll(".media-settings.open").forEach((item) => {
          if (item !== panel) item.classList.remove("open");
        });
        panel?.classList.toggle("open");
      });
    });

    root.querySelectorAll(".media-settings").forEach((panel) => {
      panel.addEventListener("click", (event) => event.stopPropagation());
    });
    root.querySelectorAll("[data-media-settings-close]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        button.closest(".media-settings")?.classList.remove("open");
      });
    });
    document.addEventListener("click", () => {
      root.querySelectorAll(".media-settings.open").forEach((panel) => panel.classList.remove("open"));
    });

    root.querySelectorAll("[data-media-sort-grid]").forEach(initSortableGrid);

    newImagesInput?.addEventListener("change", () => {
      const selected = newImagesInput.files?.length || 0;
      if (newImagesLabel) newImagesLabel.textContent = selected ? `Выбрано: ${selected}` : "Можно выбрать несколько";
      updateCount();
    });

    form?.addEventListener("submit", () => {
      if (!saveButton) return;
      saveButton.disabled = true;
      saveButton.textContent = "Сохранение...";
    });

    window.addEventListener("beforeunload", () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));
    updateCount();
  }

  initMediaList();
  initMediaDetail();
})();
