(() => {
  const root = document.querySelector(".wa-variant-groups");
  const dataElement = document.getElementById("admin-variant-groups-data");
  if (!root || !dataElement) return;

  let groups = JSON.parse(dataElement.textContent || "[]");
  let editOptions = [];
  let runtimeId = 0;
  let colorPaletteCloseTimer = null;
  const colorPaletteValues = [
    "#111111", "#374151", "#808080", "#B8BDC7", "#F4F4F4",
    "#7F1D1D", "#DC3545", "#F97316", "#FACC15", "#D4A017",
    "#166534", "#22C55E", "#14B8A6", "#0891B2", "#38BDF8",
    "#1D4ED8", "#2563EB", "#4338CA", "#7C3AED", "#A855F7",
    "#BE185D", "#EC4899", "#8B5E3C", "#D6C4A8",
  ];
  const storageKey = "waveAdminVariantGroupsSearch";
  const state = {
    mode: "create",
    currentId: null,
    isColor: false,
    isFlavor: false,
    isSystem: false,
    paletteOptionId: null,
    busy: false,
    query: localStorage.getItem(storageKey) || "",
  };

  const els = {
    grid: document.getElementById("variantGroupsGrid"),
    empty: document.getElementById("variantGroupsEmpty"),
    count: document.getElementById("variantGroupCount"),
    search: document.getElementById("variantGroupSearchInput"),
    create: document.getElementById("createVariantGroupBtn"),
    modal: document.getElementById("variantGroupModal"),
    modalTitle: document.getElementById("variantGroupModalTitle"),
    modalClose: document.getElementById("variantGroupModalClose"),
    name: document.getElementById("variantGroupName"),
    nameLabel: document.getElementById("variantGroupNameLabel"),
    colorGroupIdentity: document.getElementById("colorGroupIdentity"),
    flavorGroupIdentity: document.getElementById("flavorGroupIdentity"),
    order: document.getElementById("variantGroupOrder"),
    orderField: document.getElementById("variantGroupOrder")?.closest(".group-order-field"),
    groupFields: document.getElementById("variantGroupOrder")?.closest(".group-fields"),
    options: document.getElementById("variantOptionsList"),
    optionsEmpty: document.getElementById("variantOptionsEmpty"),
    optionsColumnHead: document.getElementById("variantOptionsColumnHead"),
    filterColumnLabel: document.getElementById("variantFilterColumnLabel"),
    addOption: document.getElementById("addVariantOptionBtn"),
    colorPalette: document.getElementById("colorPalettePopover"),
    colorPaletteGrid: document.getElementById("colorPaletteGrid"),
    colorPaletteCurrentSwatch: document.getElementById("colorPaletteCurrentSwatch"),
    colorPaletteCurrentValue: document.getElementById("colorPaletteCurrentValue"),
    save: document.getElementById("saveVariantGroupBtn"),
    delete: document.getElementById("deleteVariantGroupBtn"),
    cancel: document.getElementById("cancelVariantGroupBtn"),
    toasts: document.getElementById("variantGroupToasts"),
  };

  function escHtml(value) {
    const node = document.createElement("div");
    node.textContent = value == null ? "" : String(value);
    return node.innerHTML;
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

  function groupCountLabel(count) {
    return `${count} ${noun(count, ["группа", "группы", "групп"])}`;
  }

  function optionCountLabel(count) {
    return `${count} ${noun(count, ["значение", "значения", "значений"])}`;
  }

  function normalizeColorHex(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "";
  }

  function sortedGroups() {
    return [...groups].sort((a, b) => Number(a.order) - Number(b.order) || a.name.localeCompare(b.name, "ru"));
  }

  function filteredGroups() {
    const query = state.query.trim().toLocaleLowerCase();
    const items = sortedGroups();
    if (!query) return items;
    return items.filter((group) => {
      const values = (group.options || []).flatMap((option) => [option.name, option.filter_name]);
      return [group.name, group.slug, ...values]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query));
    });
  }

  function renderGroups() {
    const items = filteredGroups();
    els.count.textContent = groupCountLabel(groups.length);
    els.empty.hidden = items.length > 0;
    els.grid.hidden = items.length === 0;
    els.grid.innerHTML = items.map((group, index) => {
      const options = group.options || [];
      const visible = options.slice(0, 6);
      const remainder = Math.max(0, options.length - visible.length);
      const usedCount = options.filter((option) => option.is_used).length;
      const chips = visible.length
        ? visible.map((option) => {
          const swatch = group.is_color && normalizeColorHex(option.color_hex)
            ? `<span class="group-option-swatch" style="background:${escHtml(normalizeColorHex(option.color_hex))}"></span>`
            : "";
          return `<span class="group-option-chip" title="${escHtml(option.name)}">${swatch}${escHtml(option.name)}</span>`;
        }).join("")
        : '<span class="group-options-empty">Значения ещё не добавлены</span>';
      return `
        <button class="variant-group-card" type="button" data-group-open="${escHtml(group.id)}" style="animation-delay:${Math.min(index, 8) * 0.025}s">
          <span class="group-card-head">
            <span class="group-card-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h10"></path><circle cx="18" cy="17" r="2.5"></circle></svg>
            </span>
            <span class="group-card-copy">
              <span class="group-card-name">${escHtml(group.name)}${group.is_system ? '<span class="system-group-badge">Системная</span>' : ""}</span>
            </span>
            <span class="group-card-count">${escHtml(optionCountLabel(options.length))}</span>
          </span>
          <span class="group-card-options">${chips}${remainder ? `<span class="group-option-more">+${remainder}</span>` : ""}</span>
          <span class="group-card-footer">
            <span>Порядок: ${escHtml(group.order)}</span>
            <span>${usedCount ? `Используется: ${usedCount}` : "Не используется"}</span>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
          </span>
        </button>`;
    }).join("");
  }

  function findGroup(id) {
    return groups.find((group) => String(group.id) === String(id)) || null;
  }

  function cloneOptions(options) {
    return (options || []).map((option) => ({ ...option }));
  }

  function nextDefaultOrder() {
    if (!groups.length) return 0;
    return Math.max(...groups.map((group) => Number(group.order) || 0)) + 10;
  }

  function openCreate() {
    state.mode = "create";
    state.currentId = null;
    state.isColor = false;
    state.isFlavor = false;
    state.isSystem = false;
    editOptions = [];
    els.modalTitle.textContent = "Добавить группу вариантов";
    els.name.value = "";
    els.name.disabled = false;
    els.name.hidden = false;
    els.nameLabel.textContent = "Название группы";
    els.colorGroupIdentity.hidden = true;
    els.flavorGroupIdentity.hidden = true;
    els.order.value = String(nextDefaultOrder());
    els.order.disabled = false;
    els.orderField.hidden = false;
    els.groupFields.classList.remove("is-system");
    els.filterColumnLabel.textContent = "Для фильтра";
    els.save.textContent = "Добавить";
    els.delete.hidden = true;
    clearFieldErrors();
    renderOptions();
    openModal();
  }

  function openEdit(id) {
    const group = findGroup(id);
    if (!group) return;
    state.mode = "edit";
    state.currentId = group.id;
    state.isColor = Boolean(group.is_color);
    state.isFlavor = Boolean(group.is_flavor);
    state.isSystem = Boolean(group.is_system);
    editOptions = cloneOptions(group.options);
    els.modalTitle.textContent = "Редактировать группу вариантов";
    els.name.value = group.name || "";
    els.name.disabled = state.isSystem;
    els.name.hidden = state.isSystem;
    els.nameLabel.textContent = state.isSystem ? "Системная группа" : "Название группы";
    els.colorGroupIdentity.hidden = !state.isColor;
    els.flavorGroupIdentity.hidden = !state.isFlavor;
    els.order.value = String(group.order || 0);
    els.order.disabled = state.isSystem;
    els.orderField.hidden = state.isSystem;
    els.groupFields.classList.toggle("is-system", state.isSystem);
    els.filterColumnLabel.textContent = state.isFlavor ? "Вкус для фильтра" : "Для фильтра";
    els.save.textContent = "Сохранить";
    els.delete.hidden = state.isSystem;
    clearFieldErrors();
    renderOptions();
    openModal();
  }

  function openModal() {
    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      if (els.name.disabled) {
        els.options.querySelector('[data-option-field="name"]')?.focus();
      } else {
        els.name.focus();
      }
    }, 100);
  }

  function closeModal() {
    if (state.busy) return;
    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.currentId = null;
    state.isColor = false;
    state.isFlavor = false;
    state.isSystem = false;
    els.name.disabled = false;
    els.name.hidden = false;
    els.nameLabel.textContent = "Название группы";
    els.colorGroupIdentity.hidden = true;
    els.flavorGroupIdentity.hidden = true;
    els.order.disabled = false;
    els.orderField.hidden = false;
    els.groupFields.classList.remove("is-system");
    els.filterColumnLabel.textContent = "Для фильтра";
  }

  function clearFieldErrors() {
    els.name.style.borderColor = "";
    els.order.style.borderColor = "";
  }

  function optionUsage(option) {
    if (!option.is_used) return "Не используется";
    const parts = [];
    if (Number(option.product_count)) parts.push(`${option.product_count} тов.`);
    if (Number(option.sku_count)) parts.push(`${option.sku_count} SKU`);
    return parts.join(" · ") || "Используется";
  }

  function renderOptions() {
    closeColorPalette(true);
    els.options.classList.toggle("is-color", state.isColor);
    els.optionsColumnHead.classList.toggle("is-color", state.isColor);
    els.optionsEmpty.hidden = editOptions.length > 0;
    els.options.hidden = editOptions.length === 0;
    els.options.innerHTML = editOptions.map((option, index) => {
      const colorHex = normalizeColorHex(option.color_hex);
      const filterPlaceholder = state.isFlavor ? "Например: Малина" : "Как название";
      const colorControl = state.isColor ? `
        <span class="option-color-control${colorHex ? "" : " is-invalid"}">
          <button class="option-color-picker" type="button" style="--option-color:${escHtml(colorHex || "#808080")}" data-option-palette-trigger aria-label="Открыть палитру цвета" aria-haspopup="dialog" aria-expanded="false">
            <span class="option-color-swatch" aria-hidden="true"></span>
          </button>
          <input class="option-color-hex" type="text" inputmode="text" maxlength="7" value="${escHtml(colorHex)}" placeholder="#808080" data-option-field="color_hex" aria-label="HEX-код цвета" />
        </span>` : "";
      return `
      <div class="option-row" data-option-id="${escHtml(option.id)}">
        <input class="option-input" type="text" maxlength="100" value="${escHtml(option.name)}" placeholder="Название для покупателя" data-option-field="name" aria-label="Название варианта" />
        <input class="option-input" type="text" maxlength="100" value="${escHtml(option.filter_name || "")}" placeholder="${filterPlaceholder}" data-option-field="filter_name" aria-label="Значение для фильтра" />
        ${colorControl}
        <span class="option-usage${option.is_used ? " is-used" : ""}">${escHtml(optionUsage(option))}</span>
        <span class="option-actions">
          <button class="option-action" type="button" data-option-move="-1" title="Переместить выше" ${index === 0 ? "disabled" : ""} aria-label="Переместить выше">↑</button>
          <button class="option-action" type="button" data-option-move="1" title="Переместить ниже" ${index === editOptions.length - 1 ? "disabled" : ""} aria-label="Переместить ниже">↓</button>
          <button class="option-action option-remove" type="button" data-option-remove title="${option.is_used ? "Используемый вариант удалить нельзя" : "Удалить значение"}" ${option.is_used ? "disabled" : ""} aria-label="Удалить значение">×</button>
        </span>
      </div>
    `;
    }).join("");
  }

  function addOption() {
    runtimeId += 1;
    const id = `new_${Date.now()}_${runtimeId}`;
    editOptions.push({
      id,
      name: "",
      filter_name: "",
      color_hex: state.isColor ? "#808080" : "",
      product_count: 0,
      sku_count: 0,
      is_used: false,
    });
    renderOptions();
    requestAnimationFrame(() => els.options.querySelector(`[data-option-id="${id}"] [data-option-field="name"]`)?.focus());
  }

  function updateOption(input) {
    const row = input.closest("[data-option-id]");
    const option = editOptions.find((item) => String(item.id) === String(row?.dataset.optionId));
    if (!option) return;
    option[input.dataset.optionField] = input.value;
    input.style.borderColor = "";
    if (input.dataset.optionField === "color_hex") {
      const normalized = normalizeColorHex(input.value);
      const control = input.closest(".option-color-control");
      control?.classList.toggle("is-invalid", !normalized);
      if (normalized) {
        option.color_hex = normalized;
        input.value = normalized;
        control.querySelector(".option-color-picker")?.style.setProperty("--option-color", normalized);
        updateColorPaletteCurrent(normalized);
      }
    }
  }

  function updateColorPaletteCurrent(colorHex) {
    const normalized = normalizeColorHex(colorHex) || "#808080";
    els.colorPaletteCurrentSwatch.style.background = normalized;
    els.colorPaletteCurrentValue.textContent = normalized;
    els.colorPaletteGrid.querySelectorAll("[data-palette-color]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.paletteColor === normalized);
      button.setAttribute("aria-pressed", button.dataset.paletteColor === normalized ? "true" : "false");
    });
  }

  function positionColorPalette(trigger) {
    const rect = trigger.getBoundingClientRect();
    const paletteWidth = Math.min(252, window.innerWidth - 20);
    const paletteHeight = els.colorPalette.offsetHeight || 230;
    const margin = 10;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < paletteHeight + margin && rect.top > paletteHeight;
    const top = openAbove ? rect.top - paletteHeight - 7 : rect.bottom + 7;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - paletteWidth - margin),
    );
    els.colorPalette.style.top = `${Math.max(margin, top)}px`;
    els.colorPalette.style.left = `${left}px`;
    els.colorPalette.style.setProperty("--palette-origin", openAbove ? "bottom left" : "top left");
  }

  function openColorPalette(trigger, optionId) {
    window.clearTimeout(colorPaletteCloseTimer);
    state.paletteOptionId = String(optionId);
    const option = editOptions.find((item) => String(item.id) === state.paletteOptionId);
    const colorHex = normalizeColorHex(option?.color_hex) || "#808080";
    els.options.querySelectorAll("[data-option-palette-trigger]").forEach((button) => {
      button.setAttribute("aria-expanded", button === trigger ? "true" : "false");
    });
    els.colorPalette.hidden = false;
    updateColorPaletteCurrent(colorHex);
    positionColorPalette(trigger);
    requestAnimationFrame(() => els.colorPalette.classList.add("open"));
  }

  function closeColorPalette(immediate = false) {
    if (!els.colorPalette) return;
    state.paletteOptionId = null;
    els.options?.querySelectorAll("[data-option-palette-trigger]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
    els.colorPalette.classList.remove("open");
    window.clearTimeout(colorPaletteCloseTimer);
    if (immediate) {
      els.colorPalette.hidden = true;
      return;
    }
    colorPaletteCloseTimer = window.setTimeout(() => {
      if (!els.colorPalette.classList.contains("open")) els.colorPalette.hidden = true;
    }, 130);
  }

  function applyPaletteColor(colorHex) {
    const option = editOptions.find((item) => String(item.id) === String(state.paletteOptionId));
    if (!option) return;
    const normalized = normalizeColorHex(colorHex) || "#808080";
    option.color_hex = normalized;
    const row = els.options.querySelector(`[data-option-id="${CSS.escape(String(option.id))}"]`);
    const control = row?.querySelector(".option-color-control");
    control?.classList.remove("is-invalid");
    const hexInput = control?.querySelector('[data-option-field="color_hex"]');
    if (hexInput) hexInput.value = normalized;
    control?.querySelector(".option-color-picker")?.style.setProperty("--option-color", normalized);
    closeColorPalette();
  }

  function renderColorPalette() {
    els.colorPaletteGrid.innerHTML = colorPaletteValues.map((colorHex) => `
      <button
        class="color-palette-swatch"
        type="button"
        style="--swatch-color:${colorHex}"
        data-palette-color="${colorHex}"
        aria-label="Выбрать цвет ${colorHex}"
        aria-pressed="false"
        title="${colorHex}"
      ><span aria-hidden="true"></span></button>
    `).join("");
  }

  function moveOption(id, direction) {
    const index = editOptions.findIndex((option) => String(option.id) === String(id));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= editOptions.length) return;
    [editOptions[index], editOptions[target]] = [editOptions[target], editOptions[index]];
    renderOptions();
  }

  function removeOption(id) {
    const option = editOptions.find((item) => String(item.id) === String(id));
    if (!option || option.is_used) return;
    editOptions = editOptions.filter((item) => String(item.id) !== String(id));
    renderOptions();
  }

  function validateEditor() {
    const name = els.name.value.trim();
    if (!name) {
      els.name.style.borderColor = "var(--danger)";
      toast("Введите название группы", "error");
      els.name.focus();
      return false;
    }
    const seen = new Set();
    for (const option of editOptions) {
      const value = String(option.name || "").trim();
      const key = value.toLocaleLowerCase();
      if (!value) {
        const input = els.options.querySelector(`[data-option-id="${CSS.escape(String(option.id))}"] [data-option-field="name"]`);
        if (input) input.style.borderColor = "var(--danger)";
        toast("Заполните названия вариантов", "error");
        input?.focus();
        return false;
      }
      if (seen.has(key)) {
        toast("Названия вариантов не должны повторяться", "error");
        return false;
      }
      seen.add(key);
      if (state.isColor && !normalizeColorHex(option.color_hex)) {
        const input = els.options.querySelector(`[data-option-id="${CSS.escape(String(option.id))}"] [data-option-field="color_hex"]`);
        input?.closest(".option-color-control")?.classList.add("is-invalid");
        toast(`Выберите физический цвет для «${value}»`, "error");
        input?.focus();
        return false;
      }
    }
    return true;
  }

  function setBusy(value) {
    state.busy = value;
    [els.save, els.delete, els.cancel, els.modalClose, els.addOption].forEach((element) => {
      element.disabled = value;
    });
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || "Не удалось выполнить действие.");
    return data;
  }

  async function saveGroup() {
    if (state.busy || !validateEditor()) return;
    const payload = {
      id: state.mode === "edit" ? state.currentId : null,
      name: els.name.value.trim(),
      order: Number(els.order.value) || 0,
      options: editOptions.map((option, index) => ({
        id: String(option.id).startsWith("new_") ? null : option.id,
        name: String(option.name || "").trim(),
        filter_name: String(option.filter_name || "").trim() || String(option.name || "").trim(),
        color_hex: state.isColor ? normalizeColorHex(option.color_hex) : "",
        order: index,
      })),
    };
    const wasEditing = state.mode === "edit";
    setBusy(true);
    try {
      const response = await fetch(root.dataset.saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
        body: JSON.stringify(payload),
      });
      const data = await parseResponse(response);
      const index = groups.findIndex((group) => String(group.id) === String(data.group.id));
      if (index === -1) groups.push(data.group);
      else groups[index] = data.group;
      setBusy(false);
      closeModal();
      renderGroups();
      toast(wasEditing ? "Группа обновлена" : "Группа добавлена");
    } catch (error) {
      setBusy(false);
      toast(error.message, "error");
    }
  }

  async function deleteGroup() {
    if (state.busy || !state.currentId) return;
    const group = findGroup(state.currentId);
    if (!group) return;
    if (group.is_system) {
      toast(`Системную группу «${group.name}» удалить нельзя`, "error");
      return;
    }
    if ((group.options || []).some((option) => option.is_used)) {
      toast("Нельзя удалить группу, пока её варианты используются", "error");
      return;
    }
    if (!window.confirm(`Удалить группу «${group.name}»?`)) return;
    setBusy(true);
    try {
      const response = await fetch(root.dataset.deleteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
        body: JSON.stringify({ id: group.id }),
      });
      await parseResponse(response);
      groups = groups.filter((item) => String(item.id) !== String(group.id));
      setBusy(false);
      closeModal();
      renderGroups();
      toast("Группа удалена");
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
    }, 3000);
  }

  els.search.value = state.query;
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    localStorage.setItem(storageKey, state.query);
    renderGroups();
  });
  els.create.addEventListener("click", openCreate);
  els.modalClose.addEventListener("click", closeModal);
  els.cancel.addEventListener("click", closeModal);
  els.save.addEventListener("click", saveGroup);
  els.delete.addEventListener("click", deleteGroup);
  els.addOption.addEventListener("click", addOption);
  els.name.addEventListener("input", clearFieldErrors);
  els.order.addEventListener("input", () => {
    els.order.value = els.order.value.replace(/\D/g, "").slice(0, 5);
    clearFieldErrors();
  });
  els.options.addEventListener("input", (event) => {
    if (event.target.matches("[data-option-field]")) updateOption(event.target);
  });
  els.options.addEventListener("click", (event) => {
    const row = event.target.closest("[data-option-id]");
    if (!row) return;
    const paletteTrigger = event.target.closest("[data-option-palette-trigger]");
    if (paletteTrigger) {
      if (els.colorPalette.classList.contains("open") && state.paletteOptionId === String(row.dataset.optionId)) {
        closeColorPalette();
      } else {
        openColorPalette(paletteTrigger, row.dataset.optionId);
      }
      return;
    }
    const move = event.target.closest("[data-option-move]");
    if (move) moveOption(row.dataset.optionId, Number(move.dataset.optionMove));
    if (event.target.closest("[data-option-remove]")) removeOption(row.dataset.optionId);
  });
  els.grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-group-open]");
    if (card) openEdit(card.dataset.groupOpen);
  });
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  els.colorPaletteGrid.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-palette-color]");
    if (swatch) applyPaletteColor(swatch.dataset.paletteColor);
  });
  document.addEventListener("pointerdown", (event) => {
    if (els.colorPalette.hidden || els.colorPalette.contains(event.target)) return;
    if (event.target.closest("[data-option-palette-trigger]")) return;
    closeColorPalette();
  });
  window.addEventListener("resize", () => closeColorPalette(true));
  window.addEventListener("scroll", () => closeColorPalette(true), true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.colorPalette.hidden) {
      event.preventDefault();
      closeColorPalette();
      return;
    }
    if (event.key === "Escape" && els.modal.classList.contains("open")) closeModal();
    if (event.key === "Enter" && els.modal.classList.contains("open") && !event.target.closest("button")) {
      event.preventDefault();
      saveGroup();
    }
  });

  renderColorPalette();
  renderGroups();
})();
