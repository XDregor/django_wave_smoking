(() => {
  const root = document.querySelector(".wa-warehouse");
  if (!root) return;

  const state = {
    view: "products",
    sort: "name",
  };

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function numeric(value) {
    const parsed = Number.parseInt(String(value || "").replace(/\D+/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getCards() {
    return Array.from(root.querySelectorAll("[data-warehouse-card]"));
  }

  function matchesProductCard(card, query) {
    if (!query) return true;
    return normalize([
      card.dataset.name,
      card.dataset.id,
      card.dataset.productId,
      card.dataset.note,
    ].join(" ")).includes(query);
  }

  function getBatchCards() {
    return Array.from(root.querySelectorAll("[data-warehouse-batch-card]"));
  }

  function matchesBatchCard(card, query) {
    if (!query) return true;
    const lineText = Array.from(card.querySelectorAll(".batch-history-line span"))
      .map((node) => node.textContent)
      .join(" ");
    return normalize([
      card.dataset.title,
      card.dataset.id,
      card.dataset.note,
      lineText,
    ].join(" ")).includes(query);
  }

  function sortCards(cards) {
    cards.sort((a, b) => {
      if (state.sort === "quantity") return numeric(b.dataset.quantity) - numeric(a.dataset.quantity);
      if (state.sort === "price") return Number(b.dataset.price || 0) - Number(a.dataset.price || 0);
      if (state.sort === "updated") {
        return String(b.dataset.date || "").localeCompare(String(a.dataset.date || "")) || numeric(b.dataset.id) - numeric(a.dataset.id);
      }
      return normalize(a.dataset.name).localeCompare(normalize(b.dataset.name), "ru");
    });
  }

  function renderList() {
    const grid = document.getElementById("warehouseGrid");
    const empty = document.getElementById("warehouseEmpty");
    const batchesPanel = document.getElementById("warehouseBatchesPanel");
    if (!grid) return;

    const query = normalize(document.getElementById("warehouseSearch")?.value);
    const isBatchView = state.view === "batches";
    grid.hidden = isBatchView;
    if (empty) empty.hidden = true;
    if (batchesPanel) batchesPanel.hidden = !isBatchView;

    root.querySelectorAll("[data-warehouse-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.warehouseView === state.view);
    });

    if (isBatchView) {
      let visibleBatches = 0;
      getBatchCards().forEach((card) => {
        const show = matchesBatchCard(card, query);
        card.hidden = !show;
        if (show) visibleBatches += 1;
      });
      const batchEmpty = root.querySelector("[data-batches-empty]");
      if (batchEmpty) batchEmpty.hidden = visibleBatches !== 0;
      return;
    }

    const cards = getCards();
    sortCards(cards);

    let visible = 0;
    cards.forEach((card) => {
      const show = matchesProductCard(card, query);
      card.hidden = !show;
      if (show) visible += 1;
      grid.appendChild(card);
    });

    if (empty) empty.hidden = visible !== 0;
  }

  function autoDismissMessages() {
    const messageItems = Array.from(document.querySelectorAll('ul[class*="gap-3"][class*="mb-4"] > li'));
    messageItems.forEach((item) => {
      if (item.dataset.warehouseAutoDismiss === "1") return;
      item.dataset.warehouseAutoDismiss = "1";

      window.setTimeout(() => {
        item.style.transition = "opacity 180ms ease, transform 180ms ease, max-height 220ms ease, margin 220ms ease";
        item.style.opacity = "0";
        item.style.transform = "translateY(-4px)";
        item.style.maxHeight = `${item.scrollHeight}px`;
        item.style.overflow = "hidden";
        window.setTimeout(() => {
          item.style.maxHeight = "0";
          item.style.margin = "0";
        }, 20);
        window.setTimeout(() => item.remove(), 260);
      }, 3000);
    });
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => modal.querySelector("input, textarea")?.focus(), 40);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!root.querySelector(".modal-backdrop.open")) document.body.style.overflow = "";
  }

  function closeAllModals() {
    root.querySelectorAll(".modal-backdrop.open").forEach(closeModal);
  }

  function formatDateDisplayFromIso(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  function formatIsoFromDateDisplay(value) {
    const digits = String(value || "").replace(/\D+/g, "").slice(0, 8);
    if (digits.length !== 8) return "";
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);
    return `${year}-${month}-${day}`;
  }

  function prettifyDateInput(input) {
    const digits = String(input.value || "").replace(/\D+/g, "").slice(0, 8);
    const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
    input.value = parts.join(".");
  }

  function bindDateFields() {
    root.querySelectorAll("[data-date-display]").forEach((input) => {
      const hidden = input.closest(".modal-field")?.querySelector("[data-date-value]");
      input.addEventListener("input", () => {
        prettifyDateInput(input);
        const iso = formatIsoFromDateDisplay(input.value);
        if (hidden && iso) hidden.value = iso;
      });
      input.addEventListener("blur", () => {
        const iso = formatIsoFromDateDisplay(input.value);
        if (hidden && iso) {
          hidden.value = iso;
          input.value = formatDateDisplayFromIso(iso);
        }
      });
    });
  }

  function bindFileInputs() {
    root.querySelectorAll("[data-warehouse-file]").forEach((fileBox) => {
      const input = fileBox.querySelector("[data-warehouse-file-input]");
      const preview = fileBox.querySelector("[data-warehouse-file-preview]");
      const title = fileBox.querySelector("[data-warehouse-file-title]");
      const fileName = fileBox.querySelector("[data-warehouse-file-name]");
      if (!input || !preview || !title || !fileName) return;

      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) {
          fileBox.classList.remove("has-file");
          title.textContent = "Фото товара";
          fileName.textContent = "Файл не выбран";
          preview.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8 12 3 7 8"></path><path d="M12 3v12"></path></svg>';
          return;
        }

        fileBox.classList.add("has-file");
        title.textContent = "Фото выбрано";
        fileName.textContent = file.name;

        if (file.type && file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (event) => {
            preview.innerHTML = "";
            const image = document.createElement("img");
            image.src = event.target.result;
            image.alt = "";
            preview.appendChild(image);
          };
          reader.readAsDataURL(file);
        }
      });
    });
  }

  function updateBatchSelectionState(form) {
    if (!form) return;
    const rows = Array.from(form.querySelectorAll("[data-batch-item-row]"));
    let selected = 0;

    rows.forEach((row) => {
      const checkbox = row.querySelector("[data-batch-item-check]");
      const quantity = row.querySelector("[data-batch-quantity]");
      const isSelected = Boolean(checkbox?.checked);

      row.classList.toggle("is-selected", isSelected);
      if (quantity) {
        quantity.disabled = !isSelected;
        if (!isSelected) quantity.value = "";
      }
      if (isSelected) selected += 1;
    });

    const counter = form.querySelector("[data-batch-selected-count]");
    if (counter) counter.textContent = `Выбрано ${selected}`;
  }

  function filterBatchItems(form) {
    if (!form) return;
    const query = normalize(form.querySelector("[data-batch-item-search]")?.value);
    let visible = 0;

    form.querySelectorAll("[data-batch-item-row]").forEach((row) => {
      const show = !query || normalize(row.dataset.batchName).includes(query);
      row.hidden = !show;
      if (show) visible += 1;
    });

    const empty = form.querySelector("[data-batch-items-empty]");
    if (empty) empty.hidden = visible !== 0;
  }

  function bindBatchPicker() {
    root.querySelectorAll("[data-warehouse-batch-form], [data-warehouse-writeoff-form]").forEach((form) => {
      form.querySelector("[data-batch-item-search]")?.addEventListener("input", () => filterBatchItems(form));

      form.querySelectorAll("[data-batch-item-check]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          updateBatchSelectionState(form);
          if (checkbox.checked) {
            const quantity = checkbox.closest("[data-batch-item-row]")?.querySelector("[data-batch-quantity]");
            window.setTimeout(() => quantity?.focus(), 0);
          }
        });
      });

      form.querySelectorAll("[data-batch-quantity]").forEach((input) => {
        input.addEventListener("input", () => {
          input.value = String(input.value || "").replace(/\D+/g, "");
        });
      });

      updateBatchSelectionState(form);
      filterBatchItems(form);
    });
  }

  function bindForms() {
    root.querySelectorAll("[data-warehouse-batch-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        form.querySelectorAll("[data-batch-quantity]").forEach((input) => {
          input.value = String(numeric(input.value));
        });

        const dateDisplay = form.querySelector("[data-date-display]");
        const dateValue = form.querySelector("[data-date-value]");
        const iso = formatIsoFromDateDisplay(dateDisplay?.value || "");
        if (!iso) {
          event.preventDefault();
          dateDisplay?.focus();
          return;
        }
        if (dateValue) dateValue.value = iso;
      });
    });

    root.querySelectorAll("[data-warehouse-writeoff-form]").forEach((form) => {
      form.addEventListener("submit", () => {
        form.querySelectorAll("[data-batch-quantity]").forEach((input) => {
          input.value = String(numeric(input.value));
        });
      });
    });

    root.querySelectorAll("[data-warehouse-product-form]").forEach((form) => {
      form.addEventListener("submit", () => {
        const price = form.querySelector('input[name="price"]');
        if (price) price.value = String(price.value || "0").replace(",", ".").trim();
      });
    });
  }

  root.addEventListener("click", (event) => {
    const view = event.target.closest("[data-warehouse-view]");
    if (view) {
      state.view = view.dataset.warehouseView || "products";
      renderList();
      return;
    }

    const closeBatch = event.target.closest("[data-close-batch]");
    if (closeBatch) {
      closeBatch.closest("details")?.removeAttribute("open");
      return;
    }

    const sort = event.target.closest("[data-warehouse-sort]");
    if (sort) {
      state.sort = sort.dataset.warehouseSort || "name";
      document.getElementById("warehouseSortLabel").textContent = sort.dataset.label || sort.textContent.trim();
      document.getElementById("warehouseSortMenu")?.classList.remove("open");
      root.querySelectorAll("[data-warehouse-sort]").forEach((button) => {
        button.classList.toggle("active", button === sort);
      });
      renderList();
      return;
    }

    if (event.target.closest("#warehouseSortBtn")) {
      document.getElementById("warehouseSortMenu")?.classList.toggle("open");
      return;
    }

    if (event.target.closest("#warehouseAddBtn")) {
      openModal(document.getElementById("warehouseProductModal"));
      return;
    }

    if (event.target.closest("#warehouseBatchBtn")) {
      openModal(document.getElementById("warehouseBatchModal"));
      return;
    }

    if (event.target.closest("#warehouseWriteOffBtn")) {
      openModal(document.getElementById("warehouseWriteOffModal"));
      return;
    }

    if (event.target.closest("[data-warehouse-modal-close]")) {
      closeModal(event.target.closest(".modal-backdrop"));
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sort-menu-wrap")) {
      document.getElementById("warehouseSortMenu")?.classList.remove("open");
    }
    if (event.target.classList.contains("modal-backdrop")) closeModal(event.target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllModals();
  });

  document.getElementById("warehouseSearch")?.addEventListener("input", renderList);

  bindDateFields();
  bindFileInputs();
  bindBatchPicker();
  bindForms();
  autoDismissMessages();
  renderList();
})();
