(function () {
  "use strict";

  const catalog = Array.isArray(window.SKU_ADMIN_CONFIG?.variantCatalog)
    ? window.SKU_ADMIN_CONFIG.variantCatalog
    : [];
  const catalogGroups = catalog.map((group) => ({
    id: String(group.id),
    name: String(group.name || "").trim(),
  }));
  const catalogOptions = Object.fromEntries(
    catalog.map((group) => [
      String(group.id),
      (group.options || []).map((option) => ({
        id: String(option.id),
        name: String(option.name || "").trim(),
        filterName: String(option.filterName || option.filter_name || option.name || "").trim(),
        colorHex: String(option.colorHex || option.color_hex || "").trim(),
      })),
    ])
  );
  const runtimeGroups = [];
  const runtimeOptions = {};
  let runtimeSequence = 0;
  let draggedVariantGroupId = null;

  function getContainer() {
    return document.getElementById("variantGroupsContainer");
  }

  function getAddButton() {
    return document.getElementById("addGroupBtn");
  }

  function getCounter() {
    return document.getElementById("variantGroupCounter");
  }

  function allCatalogGroups() {
    return [...catalogGroups, ...runtimeGroups];
  }

  function allCatalogOptions(groupId) {
    return [...(catalogOptions[groupId] || []), ...(runtimeOptions[groupId] || [])];
  }

  function usedCatalogGroupIds() {
    return variantGroups.map((group) => group.catalogGroupId).filter(Boolean);
  }

  function nextRuntimeId(prefix) {
    runtimeSequence += 1;
    return `${prefix}_${Date.now()}_${runtimeSequence}`;
  }

  function createNewGroup() {
    return {
      id: nextGroupId++,
      catalogGroupId: null,
      name: "",
      variants: [],
      hasImages: false,
    };
  }

  function createNewVariant(catalogOptionId, name, filterName = name, colorHex = "") {
    return {
      id: nextVariantId++,
      catalogOptionId: String(catalogOptionId),
      name: String(name || "").trim(),
      filterName: String(filterName || name || "").trim(),
      colorHex: String(colorHex || "").trim(),
      imageData: null,
      imageFile: null,
      imageOrder: 0,
    };
  }

  function escapeVariantHtml(value) {
    const node = document.createElement("div");
    node.textContent = value == null ? "" : String(value);
    return node.innerHTML;
  }

  function updateVariantControls() {
    const addButton = getAddButton();
    const counter = getCounter();
    if (addButton) {
      addButton.style.display = variantGroups.length ? "inline-flex" : "none";
      addButton.disabled = variantGroups.length >= MAX_GROUPS;
    }
    if (counter) counter.textContent = `${variantGroups.length} из ${MAX_GROUPS} групп`;
  }

  function focusLastGroupSelector() {
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll(".variant-group .vg-combobox-input");
      inputs[inputs.length - 1]?.focus();
    });
  }

  function vgAddVariantGroup() {
    if (variantGroups.length >= MAX_GROUPS) return;
    variantGroups.push(createNewGroup());
    renderAllGroups();
    focusLastGroupSelector();
  }

  function vgRemoveVariantGroup(groupId) {
    variantGroups = variantGroups.filter((group) => group.id !== groupId);
    if (activeImageGroupId === groupId) activeImageGroupId = null;
    renderAllGroups();
  }

  function assignCatalogGroup(groupId, catalogGroupId, name) {
    const group = variantGroups.find((item) => item.id === groupId);
    if (!group) return;
    group.catalogGroupId = String(catalogGroupId);
    group.name = String(name || "").trim();
    group.variants = [];
    if (activeImageGroupId === groupId) activeImageGroupId = null;
    group.hasImages = false;
    renderAllGroups();
  }

  function quickAddGroup(groupId, name) {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return;
    const existing = allCatalogGroups().find(
      (group) => group.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
    );
    if (existing) {
      assignCatalogGroup(groupId, existing.id, existing.name);
      return;
    }
    const catalogGroupId = nextRuntimeId("custom_group");
    runtimeGroups.push({ id: catalogGroupId, name: trimmedName });
    runtimeOptions[catalogGroupId] = [];
    assignCatalogGroup(groupId, catalogGroupId, trimmedName);
  }

  function addVariantFromCatalog(groupId, optionId, name, filterName = name, colorHex = "") {
    const group = variantGroups.find((item) => item.id === groupId);
    if (!group || group.variants.length >= MAX_VARIANTS_PER_GROUP) return;
    const normalizedOptionId = String(optionId);
    if (group.variants.some((variant) => variant.catalogOptionId === normalizedOptionId)) return;
    const variant = createNewVariant(normalizedOptionId, name, filterName, colorHex);
    variant.imageOrder = group.variants.length;
    group.variants.push(variant);
    renderAllGroups();
  }

  function quickAddOption(groupId, name) {
    const group = variantGroups.find((item) => item.id === groupId);
    const trimmedName = String(name || "").trim();
    if (!group?.catalogGroupId || !trimmedName) return;
    const existing = allCatalogOptions(group.catalogGroupId).find(
      (option) => option.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
    );
    if (existing) {
      addVariantFromCatalog(groupId, existing.id, existing.name, existing.filterName, existing.colorHex);
      return;
    }
    const optionId = nextRuntimeId("custom_option");
    runtimeOptions[group.catalogGroupId] ||= [];
    runtimeOptions[group.catalogGroupId].push({ id: optionId, name: trimmedName, filterName: trimmedName });
    addVariantFromCatalog(groupId, optionId, trimmedName, trimmedName);
  }

  function vgRemoveVariant(groupId, variantId) {
    const group = variantGroups.find((item) => item.id === groupId);
    if (!group) return;
    group.variants = group.variants.filter((variant) => variant.id !== variantId);
    renderAllGroups();
  }

  function vgSetImageGroup(groupId, enabled) {
    const group = variantGroups.find((item) => item.id === groupId);
    if (!group?.catalogGroupId) return;
    variantGroups.forEach((item) => {
      item.hasImages = false;
    });
    activeImageGroupId = enabled ? groupId : null;
    if (enabled) {
      group.hasImages = true;
      const index = variantGroups.indexOf(group);
      if (index > 0) {
        variantGroups.splice(index, 1);
        variantGroups.unshift(group);
      }
    }
    renderAllGroups();
  }

  function vgHandleVariantImageUpload(groupId, variantId, input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const group = variantGroups.find((item) => item.id === groupId);
      const variant = group?.variants.find((item) => item.id === variantId);
      if (!variant) return;
      variant.imageData = event.target.result;
      variant.imageFile = file;
      renderAllGroups();
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function vgRenameVariant(groupId, variantId, name) {
    const group = variantGroups.find((item) => item.id === groupId);
    const variant = group?.variants.find((item) => item.id === variantId);
    if (!variant) return;
    const previousName = variant.name;
    const followsDisplayName = !variant.filterName || variant.filterName === previousName;
    variant.name = String(name || "").trimStart();
    if (followsDisplayName) variant.filterName = variant.name;
    if (window.skuTreeRebuild) window.skuTreeRebuild();
    return followsDisplayName;
  }

  function vgRenameVariantFilter(groupId, variantId, filterName) {
    const group = variantGroups.find((item) => item.id === groupId);
    const variant = group?.variants.find((item) => item.id === variantId);
    if (!variant) return;
    variant.filterName = String(filterName || "").trimStart();
  }

  function createVariantFilterInput(groupId, variant, className) {
    const input = document.createElement("input");
    input.className = className;
    input.type = "text";
    input.maxLength = 100;
    input.value = variant.filterName || variant.name;
    input.placeholder = "Для фильтра";
    input.title = "Служебное значение для фильтра каталога";
    input.setAttribute("aria-label", `Значение фильтра для ${variant.name}`);
    input.addEventListener("input", () => vgRenameVariantFilter(groupId, variant.id, input.value));
    return input;
  }

  function buildGroupCombobox(group) {
    const usedIds = usedCatalogGroupIds().filter((id) => id !== group.catalogGroupId);
    const wrap = document.createElement("div");
    wrap.className = "vg-combobox";
    wrap.dataset.comboboxHint = "Нет нужной группы? Введите её название, чтобы добавить.";

    const inputWrap = document.createElement("div");
    inputWrap.className = "vg-combobox-input-wrap";
    const input = document.createElement("input");
    input.className = "vg-combobox-input";
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 80;
    input.placeholder = "Найти группу в справочнике…";
    input.value = group.name;
    inputWrap.appendChild(input);
    wrap.appendChild(inputWrap);

    const dropdown = document.createElement("div");
    dropdown.className = "vg-combobox-dropdown";
    wrap.appendChild(dropdown);

    function renderDropdown(filter = "") {
      dropdown.innerHTML = "";
      const normalizedFilter = filter.trim().toLocaleLowerCase();
      const groups = allCatalogGroups().filter(
        (item) => !usedIds.includes(item.id) && item.name.toLocaleLowerCase().includes(normalizedFilter)
      );

      const label = document.createElement("div");
      label.className = "vg-dropdown-label";
      label.textContent = normalizedFilter ? "Результаты поиска" : "Группы из справочника";
      dropdown.appendChild(label);

      groups.forEach((item) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "vg-combobox-option";
        option.innerHTML = `<span class="opt-icon">G</span>${escapeVariantHtml(item.name)}`;
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          assignCatalogGroup(group.id, item.id, item.name);
        });
        dropdown.appendChild(option);
      });

      if (!groups.length) {
        const empty = document.createElement("div");
        empty.className = "vg-combobox-option no-results";
        empty.textContent = normalizedFilter ? "Совпадений не найдено" : "Все доступные группы уже выбраны";
        dropdown.appendChild(empty);
      }

      const exactMatch = allCatalogGroups().some(
        (item) => item.name.toLocaleLowerCase() === normalizedFilter
      );
      const create = document.createElement("button");
      create.type = "button";
      create.className = "vg-combobox-option is-new";
      create.innerHTML = normalizedFilter && !exactMatch
        ? `<span class="opt-icon">+</span>Создать группу «${escapeVariantHtml(filter.trim())}»`
        : `<span class="opt-icon">+</span>Создать новую группу`;
      create.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (normalizedFilter && !exactMatch) {
          quickAddGroup(group.id, filter);
          return;
        }
        input.value = "";
        input.placeholder = "Введите название новой группы…";
        input.focus();
      });
      dropdown.appendChild(create);
    }

    input.addEventListener("focus", () => {
      renderDropdown(group.catalogGroupId ? "" : input.value);
      dropdown.classList.add("open");
    });
    input.addEventListener("input", () => {
      renderDropdown(input.value);
      dropdown.classList.add("open");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dropdown.classList.remove("open");
        input.blur();
        return;
      }
      if (event.key !== "Enter") return;
      const value = input.value.trim();
      if (!value) return;
      event.preventDefault();
      quickAddGroup(group.id, value);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => dropdown.classList.remove("open"), 120);
      input.value = group.name;
    });

    return wrap;
  }

  function buildOptionCombobox(group, photoMode) {
    const selectedIds = group.variants.map((variant) => variant.catalogOptionId);
    const wrap = document.createElement("div");
    wrap.className = "vg-option-combobox";
    wrap.dataset.comboboxHint = "Нет нужного значения? Введите его название, чтобы добавить.";

    const inputWrap = document.createElement("div");
    inputWrap.className = "vg-combobox-input-wrap";
    const input = document.createElement("input");
    input.className = "vg-combobox-input";
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 100;
    input.placeholder = photoMode ? "+ Добавить" : "+ Добавить вариант";
    inputWrap.appendChild(input);
    wrap.appendChild(inputWrap);

    const dropdown = document.createElement("div");
    dropdown.className = "vg-combobox-dropdown";
    wrap.appendChild(dropdown);

    function renderDropdown(filter = "") {
      dropdown.innerHTML = "";
      const normalizedFilter = filter.trim().toLocaleLowerCase();
      const allOptions = allCatalogOptions(group.catalogGroupId);
      const options = allOptions.filter(
        (item) => !selectedIds.includes(item.id) && item.name.toLocaleLowerCase().includes(normalizedFilter)
      );

      const label = document.createElement("div");
      label.className = "vg-dropdown-label";
      label.textContent = normalizedFilter ? "Результаты поиска" : "Значения из справочника";
      dropdown.appendChild(label);

      options.forEach((item) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "vg-combobox-option";
        option.innerHTML = `<span class="opt-icon">✓</span>${escapeVariantHtml(item.name)}`;
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          addVariantFromCatalog(group.id, item.id, item.name, item.filterName, item.colorHex);
        });
        dropdown.appendChild(option);
      });

      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "vg-combobox-option no-results";
        empty.textContent = normalizedFilter ? "Совпадений не найдено" : "Все значения уже выбраны";
        dropdown.appendChild(empty);
      }

      const exactMatch = allOptions.some(
        (item) => item.name.toLocaleLowerCase() === normalizedFilter
      );
      if (normalizedFilter && !exactMatch) {
        const create = document.createElement("button");
        create.type = "button";
        create.className = "vg-combobox-option is-new";
        create.innerHTML = `<span class="opt-icon">+</span>Создать значение «${escapeVariantHtml(filter.trim())}»`;
        create.addEventListener("mousedown", (event) => {
          event.preventDefault();
          quickAddOption(group.id, filter);
        });
        dropdown.appendChild(create);
      }
    }

    input.addEventListener("focus", () => {
      renderDropdown();
      dropdown.classList.add("open");
    });
    input.addEventListener("input", () => {
      renderDropdown(input.value);
      dropdown.classList.add("open");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dropdown.classList.remove("open");
        input.blur();
        return;
      }
      if (event.key !== "Enter") return;
      const value = input.value.trim();
      if (!value) return;
      event.preventDefault();
      quickAddOption(group.id, value);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => dropdown.classList.remove("open"), 120);
      input.value = "";
    });

    return wrap;
  }

  function createVariantChip(groupId, variant) {
    const item = document.createElement("div");
    item.className = "variant-chip-item";
    const chip = document.createElement("div");
    chip.className = "variant-chip";
    const name = document.createElement("span");
    name.className = "chip-name";
    name.textContent = variant.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "chip-del";
    remove.setAttribute("aria-label", `Удалить ${variant.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => vgRemoveVariant(groupId, variant.id));
    chip.append(name, remove);
    item.append(chip, createVariantFilterInput(groupId, variant, "variant-chip-filter-name"));
    return item;
  }

  function createVariantPhotoCard(groupId, variant) {
    const item = document.createElement("div");
    item.className = "variant-photo-item";

    const thumb = document.createElement("label");
    const previewSrc = variant.imageData || variant.imageUrl || "";
    thumb.className = `variant-photo-thumb${previewSrc ? " filled" : ""}`;
    if (previewSrc) {
      const image = document.createElement("img");
      image.src = previewSrc;
      image.alt = variant.name;
      thumb.appendChild(image);
    } else {
      thumb.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><span>Загрузить</span>`;
    }
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    file.onchange = () => vgHandleVariantImageUpload(groupId, variant.id, file);
    thumb.appendChild(file);

    const name = document.createElement("input");
    name.className = "variant-photo-name";
    name.type = "text";
    name.maxLength = 100;
    name.value = variant.name;
    const filterName = createVariantFilterInput(groupId, variant, "variant-photo-filter-name");
    name.addEventListener("input", () => {
      if (vgRenameVariant(groupId, variant.id, name.value)) {
        filterName.value = name.value;
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "variant-photo-del";
    remove.setAttribute("aria-label", `Удалить ${variant.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => vgRemoveVariant(groupId, variant.id));
    item.append(thumb, name, filterName, remove);
    return item;
  }

  function onVariantGroupDragStart(event, groupId) {
    draggedVariantGroupId = groupId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(groupId));
    requestAnimationFrame(() => event.currentTarget.closest(".variant-group")?.classList.add("dragging"));
  }

  function onVariantGroupDragEnd(event) {
    event.currentTarget.closest(".variant-group")?.classList.remove("dragging");
    document.querySelectorAll(".variant-group").forEach((node) => node.classList.remove("drag-over"));
    draggedVariantGroupId = null;
  }

  function onVariantGroupDrop(event, targetGroupId) {
    event.preventDefault();
    if (!draggedVariantGroupId || draggedVariantGroupId === targetGroupId) return;
    const fromIndex = variantGroups.findIndex((group) => group.id === draggedVariantGroupId);
    const toIndex = variantGroups.findIndex((group) => group.id === targetGroupId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = variantGroups.splice(fromIndex, 1);
    variantGroups.splice(toIndex, 0, moved);
    renderAllGroups();
  }

  function vgRenderAllGroups() {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = "";

    if (!variantGroups.length) {
      container.innerHTML = `
        <div class="variant-empty">
          <div class="variant-empty-icon" aria-hidden="true">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div class="variant-empty-title">Варианты ещё не настроены</div>
          <div class="variant-empty-text">Добавьте первую группу и выберите её из справочника, например «Цвет», «Размер» или «Объём».</div>
          <button class="btn btn-primary" id="emptyAddGroupBtn" type="button">Выбрать первую группу</button>
        </div>`;
      document.getElementById("emptyAddGroupBtn")?.addEventListener("click", vgAddVariantGroup);
      updateVariantControls();
      return;
    }

    variantGroups.forEach((group, index) => {
      const hasGroup = Boolean(group.catalogGroupId);
      const isImageGroup = activeImageGroupId === group.id;
      group.hasImages = isImageGroup;
      const groupElement = document.createElement("article");
      groupElement.className = `variant-group${isImageGroup ? " has-images" : ""}`;
      groupElement.dataset.groupId = group.id;

      const header = document.createElement("div");
      header.className = "variant-group-header";

      const drag = document.createElement("div");
      drag.className = `drag-handle${isImageGroup ? " locked" : ""}`;
      drag.draggable = !isImageGroup;
      drag.title = "Перетащить группу";
      drag.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>`;
      if (!isImageGroup) {
        drag.addEventListener("dragstart", (event) => onVariantGroupDragStart(event, group.id));
        drag.addEventListener("dragend", onVariantGroupDragEnd);
        groupElement.addEventListener("dragover", (event) => {
          event.preventDefault();
          groupElement.classList.add("drag-over");
        });
        groupElement.addEventListener("dragleave", () => groupElement.classList.remove("drag-over"));
        groupElement.addEventListener("drop", (event) => onVariantGroupDrop(event, group.id));
      }

      const indexBadge = document.createElement("div");
      indexBadge.className = "variant-group-index";
      indexBadge.textContent = index + 1;

      const selector = document.createElement("div");
      selector.className = "vg-group-selector";
      const fieldStack = document.createElement("div");
      fieldStack.className = "vg-field-stack";
      const fieldLabel = document.createElement("span");
      fieldLabel.className = "vg-field-label";
      fieldLabel.textContent = "Группа вариантов";
      fieldStack.append(fieldLabel, buildGroupCombobox(group));
      selector.appendChild(fieldStack);

      const actions = document.createElement("div");
      actions.className = "variant-group-actions";
      const photoToggle = document.createElement("label");
      const anotherImageGroupIsActive = activeImageGroupId !== null && !isImageGroup;
      photoToggle.className = `variant-img-toggle${isImageGroup ? " active" : ""}${anotherImageGroupIsActive ? " hidden" : ""}${!hasGroup ? " disabled" : ""}`;
      photoToggle.innerHTML = `<span class="toggle-label">Фото</span><span class="toggle-switch"><input class="toggle-input" type="checkbox" ${isImageGroup ? "checked" : ""}><span class="toggle-slider"></span></span>`;
      photoToggle.querySelector("input").addEventListener("change", (event) => vgSetImageGroup(group.id, event.target.checked));

      const removeGroup = document.createElement("button");
      removeGroup.type = "button";
      removeGroup.className = "variant-group-del";
      removeGroup.title = "Удалить группу";
      removeGroup.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
      removeGroup.addEventListener("click", () => vgRemoveVariantGroup(group.id));
      actions.append(photoToggle, removeGroup);
      header.append(drag, indexBadge, selector, actions);

      const values = document.createElement("div");
      values.className = `variant-values${hasGroup ? "" : " disabled"}`;
      values.dataset.label = "Значения группы";
      values.dataset.count = hasGroup ? `${group.variants.length} выбрано` : "Сначала выберите группу";

      if (!hasGroup) {
        values.innerHTML = `<div class="vg-group-not-selected"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Сначала выберите группу из справочника</div>`;
      } else {
        group.variants.forEach((variant) => {
          values.appendChild(
            isImageGroup
              ? createVariantPhotoCard(group.id, variant)
              : createVariantChip(group.id, variant)
          );
        });
        if (group.variants.length < MAX_VARIANTS_PER_GROUP) {
          values.appendChild(buildOptionCombobox(group, isImageGroup));
        }
      }

      groupElement.append(header, values);
      container.appendChild(groupElement);
    });

    updateVariantControls();
  }

  function vgInitVariantGroups() {
    const container = getContainer();
    const addButton = getAddButton();
    if (!container || !addButton) return;
    variantGroups = [];
    nextGroupId = 1;
    nextVariantId = 1;
    activeImageGroupId = null;
    addButton.onclick = null;
    addButton.addEventListener("click", vgAddVariantGroup);
    vgRenderAllGroups();
  }

  function vgLoadVariantGroups(groups) {
    const normalized = Array.isArray(groups) ? groups : [];
    variantGroups = normalized.map((group) => ({
      id: String(group.id),
      catalogGroupId: group.catalogGroupId ? String(group.catalogGroupId) : null,
      name: String(group.name || "").trim(),
      variants: (group.variants || group.values || []).map((variant, variantIndex) => ({
        id: String(variant.id),
        catalogOptionId: variant.catalogOptionId ? String(variant.catalogOptionId) : String(variant.id),
        name: String(variant.name || "").trim(),
        filterName: String(variant.filterName || variant.filter_name || variant.name || "").trim(),
        colorHex: String(variant.colorHex || variant.color_hex || "").trim(),
        imageData: null,
        imageFile: null,
        imageUrl: variant.imageUrl || variant.image_url || "",
        imageOrder: Number.isFinite(Number(variant.imageOrder ?? variant.image_order))
          ? Number(variant.imageOrder ?? variant.image_order)
          : variantIndex,
      })),
      hasImages: Boolean(group.hasImages),
    }));
    activeImageGroupId = variantGroups.find((group) => group.hasImages)?.id || null;
    const numericGroupIds = variantGroups.map((group) => Number(group.id)).filter(Number.isFinite);
    const numericVariantIds = variantGroups.flatMap((group) => group.variants.map((variant) => Number(variant.id))).filter(Number.isFinite);
    nextGroupId = numericGroupIds.length ? Math.max(...numericGroupIds) + 1 : 1;
    nextVariantId = numericVariantIds.length ? Math.max(...numericVariantIds) + 1 : 1;
    vgRenderAllGroups();
  }

  window.initVariantGroups = vgInitVariantGroups;
  window.renderAllGroups = vgRenderAllGroups;
  window.loadVariantGroups = vgLoadVariantGroups;
  window.addVariantGroup = vgAddVariantGroup;
  window.removeVariantGroup = vgRemoveVariantGroup;
  window.removeVariant = vgRemoveVariant;
  window.setImageGroup = vgSetImageGroup;
  window.handleVariantImageUpload = vgHandleVariantImageUpload;
  window.renameVariant = vgRenameVariant;
})();
