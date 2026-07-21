(function () {
  const dataNode = document.getElementById("warehouse-shipments-data");
  const root = document.querySelector("[data-shipments-root]");
  if (!dataNode || !root) return;
  const stageStorageKey = "waveWarehouseShipmentsStage";
  const savedStage = (() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(stageStorageKey) || "{}");
    } catch (error) {
      return {};
    }
  })();
  const allowedFilters = new Set(["formed", "shipped", "return_open"]);
  const allowedArchiveFilters = new Set(["received", "return_closed"]);

  const state = {
    ...JSON.parse(dataNode.textContent || "{}"),
    filter: allowedFilters.has(savedStage.filter) ? savedStage.filter : "formed",
    query: "",
    itemQuery: "",
    selectedItems: new Map(),
    totalPriceManual: false,
    pointsMonthKey: "",
    pointsMonthKeys: [],
    pointsMode: "week",
    overviewPanel: "limits",
    pointsCalendarYear: 0,
    archiveOpen: Boolean(savedStage.archiveOpen),
    archiveFilter: allowedArchiveFilters.has(savedStage.archiveFilter) ? savedStage.archiveFilter : "received",
    expandedOrderKey: "",
    lastModalTrigger: null,
    toastTimer: null,
  };

  const els = {
    grid: root.querySelector("[data-orders-grid]"),
    empty: root.querySelector("[data-empty-state]"),
    archivePanel: root.querySelector("[data-archive-panel]"),
    archiveGrid: root.querySelector("[data-archive-grid]"),
    archiveEmpty: root.querySelector("[data-archive-empty]"),
    search: root.querySelector("[data-search]"),
    visibleCount: root.querySelector("[data-visible-count]"),
    limitSummary: root.querySelector("[data-limit-summary]"),
    metricFormed: root.querySelector("[data-metric-formed]"),
    metricShipped: root.querySelector("[data-metric-shipped]"),
    metricCancelled: root.querySelector("[data-metric-cancelled]"),
    metricArchiveReceived: root.querySelector("[data-metric-archive-received]"),
    metricArchiveReturn: root.querySelector("[data-metric-archive-return]"),
    metricActiveSum: root.querySelector("[data-metric-active-sum]"),
    pointsValue: root.querySelector("[data-points-value]"),
    pointsTitle: root.querySelector("[data-points-title]"),
    pointsWeekRange: root.querySelector("[data-points-week-range]"),
    pointsModeButtons: root.querySelectorAll("[data-points-mode]"),
    pointsPeriod: root.querySelector("[data-points-period]"),
    pointsMonthToggle: root.querySelector("[data-points-month-toggle]"),
    pointsMonthLabel: root.querySelector("[data-points-month-label]"),
    pointsMonthPanel: root.querySelector("[data-points-month-panel]"),
    closePointsWeek: root.querySelector("[data-close-points-week]"),
    overviewPanelButtons: root.querySelectorAll("[data-overview-panel]"),
    overviewCards: root.querySelectorAll("[data-overview-card]"),
    ordersChart: root.querySelector("[data-orders-chart]"),
    activePhoneName: root.querySelector("[data-active-phone-name]"),
    activePhoneValue: root.querySelector("[data-active-phone-value]"),
    activePhoneUsed: root.querySelector("[data-active-phone-used]"),
    activePhoneLimit: root.querySelector("[data-active-phone-limit]"),
    activePhoneRemaining: root.querySelector("[data-active-phone-remaining]"),
    activePhoneBar: root.querySelector("[data-active-phone-bar]"),
    createModal: root.querySelector("[data-create-modal]"),
    createForm: root.querySelector("[data-create-form]"),
    exportModal: root.querySelector("[data-export-modal]"),
    exportForm: root.querySelector("[data-export-form]"),
    exportCounterparties: root.querySelector("[data-export-counterparties]"),
    counterpartyModal: root.querySelector("[data-counterparty-modal]"),
    counterpartyList: root.querySelector("[data-counterparty-list]"),
    phoneModal: root.querySelector("[data-phone-modal]"),
    phoneList: root.querySelector("[data-phone-list]"),
    counterpartySelect: root.querySelector("[data-counterparty-select]"),
    phoneSelect: root.querySelector("[data-phone-select]"),
    limitLine: root.querySelector("[data-limit-line]"),
    totalPrice: root.querySelector("[data-total-price]"),
    itemSearch: root.querySelector("[data-item-search]"),
    itemsList: root.querySelector("[data-items-list]"),
    selectedItems: root.querySelector("[data-selected-items]"),
    toast: root.querySelector("[data-toast]"),
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const formatMoney = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} \u0433\u0440\u043d`;

  const parseMoney = (value) => Number(String(value || "0").replace(",", ".")) || 0;

  const isPhoneInput = (target) => target instanceof HTMLInputElement
    && (target.type === "tel" || target.name === "phone");

  const sanitizePhoneValue = (value) => {
    const compact = String(value || "").replace(/\s+/g, "").replace(/[^\d+]/g, "");
    return compact.startsWith("+")
      ? `+${compact.slice(1).replace(/\+/g, "")}`
      : compact.replace(/\+/g, "");
  };

  const normalizePhoneInput = (input) => {
    const sanitized = sanitizePhoneValue(input.value);
    if (input.value !== sanitized) input.value = sanitized;
  };

  const isDuplicatePhone = (phoneValue, currentPhoneId = 0) => state.phones.some((phone) => (
    phone.phone === phoneValue && Number(phone.id) !== Number(currentPhoneId)
  ));

  const isDuplicateTtn = (ttnValue, currentOrderId = 0) => state.orders.some((order) => (
    order.ttn === ttnValue && Number(order.id) !== Number(currentOrderId)
  ));

  const saveStageState = () => {
    try {
      window.sessionStorage.setItem(stageStorageKey, JSON.stringify({
        filter: state.filter,
        archiveOpen: state.archiveOpen,
        archiveFilter: state.archiveFilter,
      }));
    } catch (error) {
      // Storage can be disabled; the page should keep working without persistence.
    }
  };

  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(";").shift() : "";
  };

  const showToast = (message, isError) => {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", Boolean(isError));
    els.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 2800);
  };

  const fetchForm = async (url, formData) => {
    const csrfToken = getCookie("csrftoken") || root.querySelector('input[name="csrfmiddlewaretoken"]')?.value || "";
    if (csrfToken && formData instanceof FormData && !formData.has("csrfmiddlewaretoken")) {
      formData.set("csrfmiddlewaretoken", csrfToken);
    }
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrfToken,
      },
    });
    const payload = await response.json().catch(() => ({
      message: response.status === 403
        ? "Сессия устарела. Обновите страницу и повторите действие."
        : "Запрос не выполнен.",
    }));
    if (!response.ok || !payload.success) throw new Error(payload.message || "Запрос не выполнен.");
    return payload;
  };

  const openModal = (modal, trigger = null) => {
    state.lastModalTrigger = trigger || document.activeElement;
    modal.classList.add("open");
    modal.removeAttribute("inert");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeModal = (modal) => {
    if (modal.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("inert", "");
    if (!root.querySelector(".modal-backdrop.open")) document.body.style.overflow = "";
    if (state.lastModalTrigger && document.contains(state.lastModalTrigger)) {
      state.lastModalTrigger.focus({ preventScroll: true });
    }
  };

  const selectedPhone = () => {
    const id = Number(els.phoneSelect.value || 0);
    return state.phones.find((phone) => phone.id === id) || null;
  };

  const selectedTotal = () => Array.from(state.selectedItems.values())
    .reduce((sum, row) => sum + (Number(row.price || 0) * Number(row.quantity || 0)), 0);

  const syncAutoPrice = () => {
    if (state.totalPriceManual) return;
    const total = selectedTotal();
    els.totalPrice.value = total ? String(total.toFixed(2)).replace(".", ",") : "";
    updateLimitLine();
  };

  const fillSelects = (selectedCounterpartyId, selectedPhoneId) => {
    els.counterpartySelect.innerHTML = '<option value="">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u0430</option>';
    state.counterparties.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.cardNumber ? `${item.title} \u00b7 ${item.cardNumber}` : item.title;
      els.counterpartySelect.append(option);
    });
    if (selectedCounterpartyId) els.counterpartySelect.value = String(selectedCounterpartyId);

    els.phoneSelect.innerHTML = '<option value="">\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043d\u043e\u043c\u0435\u0440</option>';
    state.phones.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.disabled = !item.isActive;
      option.textContent = `${item.label || item.phone} \u00b7 ${formatMoney(item.usedLimit)} \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e`;
      els.phoneSelect.append(option);
    });
    const fallbackPhoneId = selectedPhoneId || state.phones.find((item) => item.isActive)?.id;
    if (fallbackPhoneId) els.phoneSelect.value = String(fallbackPhoneId);
    updateLimitLine();
  };

  function updateLimitLine() {
    const phone = selectedPhone();
    const price = parseMoney(els.totalPrice.value);
    if (!phone) {
      els.limitLine.textContent = "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438.";
      els.limitLine.classList.remove("is-danger");
      return;
    }
    const remainingAfter = Number(phone.remainingLimit || 0) - price;
    els.limitLine.textContent = `\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e ${formatMoney(phone.remainingLimit)}, \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u043a\u0430\u0437\u0430 \u043e\u0441\u0442\u0430\u043d\u0435\u0442\u0441\u044f ${formatMoney(Math.max(0, remainingAfter))}.`;
    els.limitLine.classList.toggle("is-danger", remainingAfter < 0);
  }

  const orderSearchText = (order) => [
    order.id,
    order.recipientFullName,
    order.recipientLastName,
    order.recipientFirstName,
    order.recipientPhone,
    order.counterparty?.title,
    order.counterparty?.cardNumber,
    order.phone?.phone,
    order.phone?.label,
    order.ttn,
    order.deliveryDestination,
  ].join(" ").toLowerCase();

  const queryMatches = (order) => !state.query || orderSearchText(order).includes(state.query);

  const stageMatches = (order, stage) => {
    if (stage === "formed") return order.status === "created" || order.status === "ttn_assigned";
    if (stage === "return_closed") return order.status === "return_closed" || order.status === "cancelled";
    return order.status === stage;
  };

  const searchStageCounts = () => {
    const counts = {
      formed: 0,
      shipped: 0,
      return_open: 0,
      received: 0,
      return_closed: 0,
      archive: 0,
    };
    state.orders.forEach((order) => {
      if (!queryMatches(order)) return;
      if (stageMatches(order, "formed")) counts.formed += 1;
      else if (stageMatches(order, "shipped")) counts.shipped += 1;
      else if (stageMatches(order, "return_open")) counts.return_open += 1;
      else if (stageMatches(order, "received")) counts.received += 1;
      else if (stageMatches(order, "return_closed")) counts.return_closed += 1;
    });
    counts.archive = counts.received + counts.return_closed;
    return counts;
  };

  const currentStageHasSearchResults = (counts) => (
    state.archiveOpen
      ? counts[state.archiveFilter] > 0
      : counts[state.filter] > 0
  );

  const routeSearchToFirstResult = () => {
    if (!state.query) return;
    const counts = searchStageCounts();
    if (currentStageHasSearchResults(counts)) return;

    const activeStages = ["formed", "shipped", "return_open"];
    const activeStage = activeStages.find((stage) => counts[stage] > 0);
    if (activeStage) {
      state.archiveOpen = false;
      state.filter = activeStage;
      state.expandedOrderKey = "";
      saveStageState();
      return;
    }

    if (counts.received > 0) {
      state.archiveOpen = true;
      state.archiveFilter = "received";
      state.expandedOrderKey = "";
      saveStageState();
    } else if (counts.return_closed > 0) {
      state.archiveOpen = true;
      state.archiveFilter = "return_closed";
      state.expandedOrderKey = "";
      saveStageState();
    }
  };

  const filterMatches = (order) => {
    if (state.filter === "formed") return stageMatches(order, "formed");
    if (state.filter === "all") return true;
    return stageMatches(order, state.filter);
  };

  const filteredOrders = () => state.orders.filter((order) => (
    filterMatches(order) && queryMatches(order)
  ));

  const replaceOrder = (updatedOrder) => {
    state.orders = state.orders.map((order) => (
      Number(order.id) === Number(updatedOrder.id) ? updatedOrder : order
    ));
  };

  const focusOrderStage = (order) => {
    if (!order) return;
    state.expandedOrderKey = "";
    state.query = "";
    if (els.search) els.search.value = "";

    if (order.status === "shipped") {
      state.archiveOpen = false;
      state.filter = "shipped";
    } else if (order.status === "return_open") {
      state.archiveOpen = false;
      state.filter = "return_open";
    } else if (order.status === "created" || order.status === "ttn_assigned") {
      state.archiveOpen = false;
      state.filter = "formed";
    }
    saveStageState();
  };

  const monthNames = [
    "\u042f\u043d\u0432\u0430\u0440\u044c", "\u0424\u0435\u0432\u0440\u0430\u043b\u044c", "\u041c\u0430\u0440\u0442", "\u0410\u043f\u0440\u0435\u043b\u044c", "\u041c\u0430\u0439", "\u0418\u044e\u043d\u044c",
    "\u0418\u044e\u043b\u044c", "\u0410\u0432\u0433\u0443\u0441\u0442", "\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c", "\u041e\u043a\u0442\u044f\u0431\u0440\u044c", "\u041d\u043e\u044f\u0431\u0440\u044c", "\u0414\u0435\u043a\u0430\u0431\u0440\u044c",
  ];

  const parseDateTime = (value) => {
    const match = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!match) return null;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0));
  };

  const pointsDate = (order) => {
    if (["shipped", "received", "return_open", "return_closed", "cancelled"].includes(order.status)) {
      return parseDateTime(order.shippedAt) || parseDateTime(order.createdAt);
    }
    return null;
  };

  const monthKey = (date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "";

  const monthLabel = (key) => {
    const [year, month] = key.split("-").map(Number);
    return `${monthNames[month - 1]} ${year}`;
  };

  const monthShortLabel = (key) => {
    const [, month] = key.split("-").map(Number);
    return monthNames[month - 1] || "";
  };

  const monthTinyNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  const monthStartDate = (key) => {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1);
  };

  const formatShortDate = (date) => (
    date
      ? `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`
      : ""
  );

  const pointableOrders = () => state.orders.filter((order) => (
    ["shipped", "received", "return_open", "return_closed", "cancelled"].includes(order.status)
    && pointsDate(order)
  ));

  const latestPointsClosure = (month) => (
    (state.pointsClosures || [])
      .filter((closure) => closure.periodMonth === month)
      .map((closure) => ({ ...closure, date: parseDateTime(closure.periodEnd) }))
      .filter((closure) => closure.date)
      .sort((a, b) => b.date - a.date)[0] || null
  );

  const ensurePointsMonths = () => {
    const keys = Array.from(new Set(
      [
        ...state.orders
          .map(pointsDate)
          .filter(Boolean)
          .map(monthKey),
        ...(state.pointsClosures || []).map((closure) => closure.periodMonth).filter(Boolean),
      ]
    )).sort().reverse();
    const today = new Date();
    if (!keys.length) keys.push(monthKey(today));
    const currentKey = state.pointsMonthKey;
    state.pointsMonthKeys = keys;
    state.pointsMonthKey = keys.includes(currentKey)
      ? currentKey
      : keys.includes(monthKey(today))
        ? monthKey(today)
        : keys[0];
  };

  const closePointsPanel = () => {
    if (!els.pointsMonthPanel || !els.pointsMonthToggle) return;
    els.pointsMonthPanel.hidden = true;
    els.pointsMonthToggle.setAttribute("aria-expanded", "false");
  };

  const renderPointsPeriod = () => {
    ensurePointsMonths();
    if (els.pointsPeriod) els.pointsPeriod.hidden = false;
    if (els.pointsMonthLabel) els.pointsMonthLabel.textContent = monthShortLabel(state.pointsMonthKey);
    if (!els.pointsMonthPanel) return;
    const activeYears = Array.from(new Set(state.pointsMonthKeys.map((key) => Number(key.slice(0, 4))))).sort((a, b) => a - b);
    const selectedYear = Number((state.pointsMonthKey || "").slice(0, 4)) || new Date().getFullYear();
    if (!state.pointsCalendarYear || !activeYears.includes(state.pointsCalendarYear)) {
      state.pointsCalendarYear = activeYears.includes(selectedYear) ? selectedYear : activeYears[activeYears.length - 1];
    }
    const yearIndex = activeYears.indexOf(state.pointsCalendarYear);
    const availableKeys = new Set(state.pointsMonthKeys);
    const monthButtons = monthTinyNames.map((name, index) => {
      const key = `${state.pointsCalendarYear}-${String(index + 1).padStart(2, "0")}`;
      const isAvailable = availableKeys.has(key);
      return `
        <button class="points-month-option${key === state.pointsMonthKey ? " active" : ""}" type="button" data-points-month-option="${escapeHtml(key)}" ${isAvailable ? "" : "disabled"}>
          ${escapeHtml(name)}
        </button>
      `;
    }).join("");
    els.pointsMonthPanel.innerHTML = `
      <div class="points-year-row">
        <button type="button" data-points-year-prev ${yearIndex <= 0 ? "disabled" : ""} aria-label="Предыдущий год">‹</button>
        <span>${escapeHtml(state.pointsCalendarYear)}</span>
        <button type="button" data-points-year-next ${yearIndex >= activeYears.length - 1 ? "disabled" : ""} aria-label="Следующий год">›</button>
      </div>
      <div class="points-month-grid">${monthButtons}</div>
    `;
  };

  const renderOrdersChart = () => {
    const selectedMonth = state.pointsMonthKey || monthKey(new Date());
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 31;
    const values = Array.from({ length: daysInMonth }, () => 0);
    state.orders.forEach((order) => {
      const date = parseDateTime(order.createdAt);
      if (!date || monthKey(date) !== selectedMonth) return;
      values[date.getDate() - 1] += 1;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const activeValues = values
      .map((value, index) => ({ day: index + 1, value }))
      .filter((item) => item.value > 0);
    const max = Math.max(1, ...activeValues.map((item) => item.value));
    const chartValues = activeValues.length
      ? activeValues
      : [{ day: 1, value: 0 }];
    if (!els.ordersChart) return;
    els.ordersChart.classList.toggle("is-empty", !activeValues.length);
    els.ordersChart.innerHTML = chartValues.map((item) => {
      const level = total ? Math.max(14, Math.round((item.value / max) * 36)) : 8;
      const dateLabel = `${String(item.day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
      return `
        <div class="orders-chart-day" style="--level:${level}px">
          <span class="orders-chart-value">${escapeHtml(item.value)}</span>
          <span class="orders-chart-point" aria-hidden="true"></span>
          <span class="orders-chart-date">${escapeHtml(dateLabel)}</span>
        </div>
      `;
    }).join("");
  };

  const renderOverviewPanel = () => {
    els.overviewPanelButtons?.forEach((button) => {
      button.classList.toggle("active", button.dataset.overviewPanel === state.overviewPanel);
    });
    els.overviewCards?.forEach((card) => {
      const active = card.dataset.overviewCard === state.overviewPanel;
      card.classList.toggle("is-active", active);
      card.hidden = !active;
    });
  };

  const renderOverview = () => {
    renderPointsPeriod();
    renderOrdersChart();
    renderOverviewPanel();
    const selectedMonth = state.pointsMonthKey || "";
    const scoredOrders = pointableOrders().filter((order) => monthKey(pointsDate(order)) === selectedMonth);
    const latestClosure = latestPointsClosure(selectedMonth);
    const weekStart = latestClosure?.date || monthStartDate(selectedMonth);
    const weeklyOrders = scoredOrders.filter((order) => !order.pointsClosedAt);
    const monthPoints = scoredOrders.length * 100;
    const weekPoints = weeklyOrders.length * 100;
    const isMonthMode = state.pointsMode === "month";
    if (els.pointsTitle) els.pointsTitle.textContent = "Баллы";
    if (els.pointsValue) els.pointsValue.textContent = String(isMonthMode ? monthPoints : weekPoints);
    els.pointsModeButtons?.forEach((button) => {
      button.classList.toggle("active", button.dataset.pointsMode === state.pointsMode);
    });
    if (els.pointsWeekRange) {
      const today = new Date();
      els.pointsWeekRange.hidden = isMonthMode;
      els.pointsWeekRange.textContent = isMonthMode ? "" : `${formatShortDate(weekStart)} - ${formatShortDate(today)}`;
    }
    if (els.closePointsWeek) {
      els.closePointsWeek.hidden = isMonthMode;
      els.closePointsWeek.disabled = weeklyOrders.length <= 0;
    }

    const activePhone = state.phones.find((phone) => phone.isActive) || state.phones[0] || null;
    if (!activePhone) {
      if (els.activePhoneName) els.activePhoneName.textContent = "\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440";
      if (els.activePhoneValue) els.activePhoneValue.textContent = "\u041d\u043e\u043c\u0435\u0440 \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d";
      if (els.activePhoneUsed) els.activePhoneUsed.textContent = "0";
      if (els.activePhoneLimit) els.activePhoneLimit.textContent = formatMoney(state.limitAmount);
      if (els.activePhoneRemaining) els.activePhoneRemaining.textContent = "\u041e\u0441\u0442\u0430\u0442\u043e\u043a 0 \u0433\u0440\u043d";
      if (els.activePhoneBar) els.activePhoneBar.style.width = "0%";
      return;
    }
    const used = Number(activePhone.usedLimit || 0);
    const limit = Number(state.limitAmount || 1);
    const percent = Math.min(100, Math.round((used / limit) * 100));
    if (els.activePhoneName) els.activePhoneName.textContent = `${activePhone.label || "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f"}`;
    if (els.activePhoneValue) els.activePhoneValue.textContent = activePhone.phone;
    if (els.activePhoneUsed) els.activePhoneUsed.textContent = formatMoney(used);
    if (els.activePhoneLimit) els.activePhoneLimit.textContent = formatMoney(limit);
    if (els.activePhoneRemaining) els.activePhoneRemaining.textContent = `\u041e\u0441\u0442\u0430\u0442\u043e\u043a ${formatMoney(Math.max(0, limit - used))}`;
    if (els.activePhoneBar) {
      els.activePhoneBar.style.width = `${percent}%`;
      els.activePhoneBar.classList.toggle("is-high", percent >= 85);
    }
  };

  const renderMetrics = () => {
    const formed = state.orders.filter((order) => order.status === "created" || order.status === "ttn_assigned").length;
    const shipped = state.orders.filter((order) => order.status === "shipped").length;
    const cancelled = state.orders.filter((order) => order.status === "return_open").length;
    const archive = state.orders.filter((order) => order.status === "received" || order.status === "return_closed" || order.status === "cancelled").length;
    const displayCounts = state.query ? searchStageCounts() : {
      formed,
      shipped,
      return_open: cancelled,
      archive,
    };
    const activeSum = state.orders
      .filter((order) => order.status === "created" || order.status === "ttn_assigned")
      .reduce((sum, order) => sum + Number(order.totalPrice || 0), 0);
    if (els.metricFormed) els.metricFormed.textContent = displayCounts.formed;
    if (els.metricShipped) els.metricShipped.textContent = displayCounts.shipped;
    if (els.metricCancelled) els.metricCancelled.textContent = displayCounts.return_open;
    if (els.metricArchiveReceived) els.metricArchiveReceived.textContent = state.query
      ? displayCounts.received
      : state.orders.filter((order) => order.status === "received").length;
    if (els.metricArchiveReturn) els.metricArchiveReturn.textContent = state.query
      ? displayCounts.return_closed
      : state.orders.filter((order) => order.status === "return_closed" || order.status === "cancelled").length;
    if (els.metricActiveSum) els.metricActiveSum.textContent = formatMoney(activeSum);
    if (els.limitSummary) els.limitSummary.textContent = `\u041b\u0438\u043c\u0438\u0442 ${formatMoney(state.limitAmount)}`;
    renderOverview();
  };

  const orderInitials = (order) => {
    const letters = String(order.recipientFullName || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    return letters || "WS";
  };

  const icon = (name) => {
    const paths = {
      calendar: '<path d="M8 2v4M16 2v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z"></path>',
      check: '<path d="m5 12 4 4L19 6"></path>',
      chevronDown: '<path d="m6 9 6 6 6-6"></path>',
      cornerUpLeft: '<path d="M9 14 4 9l5-5"></path><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',
      lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect>',
      mapPin: '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
      package: '<path d="m3 7 9 5 9-5"></path><path d="M12 22V12"></path><path d="M21 7v10l-9 5-9-5V7l9-5 9 5Z"></path>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2Z"></path>',
      store: '<path d="M4 10h16"></path><path d="M5 10l1-6h12l1 6"></path><path d="M6 10v10h12V10"></path><path d="M9 20v-5h6v5"></path>',
      trash: '<path d="M4 7h16"></path><path d="M10 11v6M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path>',
      truck: '<path d="M3 6h11v10H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="17" cy="18" r="2"></circle>',
    };
    return `<svg class="sc-icon sc-icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
  };

  const chevronIcon = () => icon("chevronDown");

  const renderOrderItems = (order) => order.items.map((item) => `
    <span class="sc-item-chip">${escapeHtml(item.name)}<b>x${escapeHtml(item.quantity)}</b></span>
  `).join("");

  const renderTtnForm = (order, withDelete = false) => `
    <form class="sc-ttn-form" data-ttn-form data-order-id="${escapeHtml(order.id)}" data-url="${escapeHtml(order.urls.ttn)}">
      <input name="ttn" type="text" value="${escapeHtml(order.ttn)}" placeholder="&#1053;&#1086;&#1084;&#1077;&#1088; &#1058;&#1058;&#1053;" autocomplete="off" />
      <button type="submit">&#1057;&#1086;&#1093;&#1088;&#1072;&#1085;&#1080;&#1090;&#1100;</button>
      ${withDelete ? `<button class="sc-ttn-delete" type="button" data-delete-order data-url="${escapeHtml(order.urls.delete)}" data-order-id="${escapeHtml(order.id)}" aria-label="&#1059;&#1076;&#1072;&#1083;&#1080;&#1090;&#1100; &#1079;&#1072;&#1103;&#1074;&#1082;&#1091;">${icon("trash")}</button>` : ""}
    </form>
  `;

  const renderShipmentCard = (order, options = {}) => {
    const key = options.key || `order-${order.id}`;
    const isExpanded = state.expandedOrderKey === key;
    const phoneLabel = order.phone?.phone || "";
    const counterpartyLabel = order.counterparty?.title || "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d";
    const createdLabel = order.createdAt || "";
    const shippedLabel = order.shippedAt || "";
    const returnOpenedLabel = order.returnOpenedAt || "";
    const returnClosedLabel = order.returnClosedAt || order.cancelledAt || "";
    const receivedLabel = order.receivedAt || "";
    const ttnPreview = order.ttn ? `
      <div class="sc-ttn-preview">
        <div class="lbl">&#1058;&#1058;&#1053;</div>
        <div class="val">${escapeHtml(order.ttn)}</div>
      </div>
    ` : "";
    const footerLabel = options.footerLabel || "\u0421\u043e\u0437\u0434\u0430\u043d\u0430";
    const footerDate = options.footerDate || createdLabel;
    const ttnForm = options.withTtnForm ? renderTtnForm(order, options.withDeleteButton) : "";
    const actions = options.actions || "";
    const archivedPoints = options.archivePoints ? " &#183; +100 &#1073;&#1072;&#1083;&#1083;&#1086;&#1074;" : "";
    const detailDates = [
      createdLabel ? `<div class="sc-row">${icon("calendar")}<div><div class="lbl">&#1057;&#1086;&#1079;&#1076;&#1072;&#1085;&#1072;</div><div class="val">${escapeHtml(createdLabel)}</div></div></div>` : "",
      shippedLabel ? `<div class="sc-row">${icon("truck")}<div><div class="lbl">&#1054;&#1090;&#1087;&#1088;&#1072;&#1074;&#1083;&#1077;&#1085;&#1072;</div><div class="val">${escapeHtml(shippedLabel)}</div></div></div>` : "",
      receivedLabel ? `<div class="sc-row">${icon("check")}<div><div class="lbl">&#1055;&#1086;&#1083;&#1091;&#1095;&#1077;&#1085;&#1072;</div><div class="val">${escapeHtml(receivedLabel)}</div></div></div>` : "",
      returnOpenedLabel ? `<div class="sc-row">${icon("cornerUpLeft")}<div><div class="lbl">&#1042;&#1086;&#1079;&#1074;&#1088;&#1072;&#1090; &#1086;&#1090;&#1082;&#1088;&#1099;&#1090;</div><div class="val">${escapeHtml(returnOpenedLabel)}</div></div></div>` : "",
      returnClosedLabel ? `<div class="sc-row">${icon("lock")}<div><div class="lbl">&#1042;&#1086;&#1079;&#1074;&#1088;&#1072;&#1090; &#1079;&#1072;&#1082;&#1088;&#1099;&#1090;</div><div class="val">${escapeHtml(returnClosedLabel)}</div></div></div>` : "",
    ].filter(Boolean).join("");

    return `
      <article class="shipment-card${isExpanded ? " is-expanded" : ""}" data-order-card data-expand-card="${escapeHtml(key)}" data-id="${escapeHtml(order.id)}">
        <div class="sc-head">
          <div class="sc-avatar">${escapeHtml(orderInitials(order))}</div>
          <div class="sc-who">
            <div class="sc-name">${escapeHtml(order.recipientFullName)}</div>
            <div class="sc-phone">${escapeHtml(order.recipientPhone)}</div>
          </div>
          <div class="sc-head-right">
            ${ttnPreview}
            <button class="sc-expand-btn" type="button" data-card-expand-button aria-label="&#1054;&#1090;&#1082;&#1088;&#1099;&#1090;&#1100; &#1076;&#1077;&#1090;&#1072;&#1083;&#1080;">
              ${chevronIcon()}
            </button>
          </div>
        </div>
        <div class="sc-details">
          <div class="sc-details-inner">
            <div class="sc-details-content">
              <div class="sc-row">
                ${icon("mapPin")}
                <div>
                  <div class="lbl">&#1040;&#1076;&#1088;&#1077;&#1089; &#1086;&#1090;&#1087;&#1088;&#1072;&#1074;&#1082;&#1080;</div>
                  <div class="val">${escapeHtml(order.deliveryDestination)}</div>
                </div>
              </div>
              <div class="sc-row">
                ${icon("package")}
                <div class="sc-row-fill">
                  <div class="lbl">&#1058;&#1086;&#1074;&#1072;&#1088;&#1099;</div>
                  <div class="sc-items">${renderOrderItems(order)}</div>
                </div>
              </div>
              <div class="sc-cols">
                <div class="sc-row">
                  ${icon("store")}
                  <div>
                    <div class="lbl">&#1050;&#1086;&#1085;&#1090;&#1088;&#1072;&#1075;&#1077;&#1085;&#1090;</div>
                    <div class="val">${escapeHtml(counterpartyLabel)}</div>
                  </div>
                </div>
                <div class="sc-row">
                  ${icon("phone")}
                  <div>
                    <div class="lbl">&#1053;&#1086;&#1084;&#1077;&#1088; &#1086;&#1090;&#1087;&#1088;&#1072;&#1074;&#1082;&#1080;</div>
                    <div class="val">${escapeHtml(phoneLabel || "\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d")}</div>
                  </div>
                </div>
              </div>
              ${detailDates ? `<div class="sc-timeline">${detailDates}</div>` : ""}
              ${ttnForm}
              ${order.note ? `<div class="sc-note">${escapeHtml(order.note)}</div>` : ""}
              <div class="sc-footer">
                <div class="sc-footer-meta">${icon("calendar")}${escapeHtml(footerLabel)} ${escapeHtml(footerDate)}${archivedPoints}</div>
                <div class="sc-total">${formatMoney(order.totalPrice)}</div>
              </div>
              ${actions ? `<div class="sc-actions">${actions}</div>` : ""}
            </div>
          </div>
        </div>
      </article>
    `;
  };

  const renderActiveShipmentCard = (order) => {
    const withTtnForm = order.status !== "shipped" && order.status !== "return_open";
    const shipButton = order.status === "ttn_assigned"
      ? `<button class="sc-btn primary" type="button" data-ship-order data-url="${escapeHtml(order.urls.ship)}">${icon("truck")}&#1054;&#1090;&#1087;&#1088;&#1072;&#1074;&#1083;&#1077;&#1085;</button>`
      : "";
    const returnButton = order.status === "shipped"
      ? `<button class="sc-btn danger-ghost" type="button" data-order-transition data-url="${escapeHtml(order.urls.returnOpen)}">${icon("cornerUpLeft")}&#1042;&#1086;&#1079;&#1074;&#1088;&#1072;&#1090;</button>`
      : "";
    const receiveButton = order.status === "shipped"
      ? `<button class="sc-btn primary" type="button" data-order-transition data-url="${escapeHtml(order.urls.receive)}">${icon("check")}&#1055;&#1086;&#1083;&#1091;&#1095;&#1077;&#1085;&#1072;</button>`
      : "";
    const closeReturnButton = order.status === "return_open"
      ? `<button class="sc-btn sc-btn-wide" type="button" data-order-transition data-url="${escapeHtml(order.urls.returnClose)}">${icon("lock")}&#1047;&#1072;&#1082;&#1088;&#1099;&#1090;&#1100; &#1074;&#1086;&#1079;&#1074;&#1088;&#1072;&#1090;</button>`
      : "";
    const withDeleteButton = order.status === "created" || order.status === "ttn_assigned";
    const footerLabel = order.status === "return_open" ? "\u0412\u043e\u0437\u0432\u0440\u0430\u0442 \u043e\u0442\u043a\u0440\u044b\u0442" : order.status === "shipped" ? "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430" : "\u0421\u043e\u0437\u0434\u0430\u043d\u0430";
    const footerDate = order.status === "return_open"
      ? order.returnOpenedAt || order.shippedAt || order.createdAt
      : order.status === "shipped"
        ? order.shippedAt || order.createdAt
        : order.createdAt;
    return renderShipmentCard(order, {
      key: `order-${order.id}`,
      withTtnForm,
      withDeleteButton,
      footerLabel,
      footerDate,
      actions: `${returnButton}${shipButton}${closeReturnButton}${receiveButton}`,
    });
  };

  const renderArchiveShipmentCard = (order) => {
    const isReturn = order.status === "return_closed" || order.status === "cancelled";
    return renderShipmentCard(order, {
      key: `archive-${order.id}`,
      footerLabel: isReturn ? "\u0412\u043e\u0437\u0432\u0440\u0430\u0442 \u0437\u0430\u043a\u0440\u044b\u0442" : "\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u0430",
      footerDate: isReturn
        ? order.returnClosedAt || order.cancelledAt || order.shippedAt || order.createdAt
        : order.receivedAt || order.shippedAt || order.createdAt,
      archivePoints: !isReturn,
    });
  };
  const archiveOrders = () => state.orders.filter((order) => (
    stageMatches(order, state.archiveFilter) && queryMatches(order)
  ));

  const syncStageTabs = () => {
    const counts = searchStageCounts();
    root.querySelectorAll("[data-filter]").forEach((button) => {
      const count = counts[button.dataset.filter] || 0;
      const isActive = !state.archiveOpen && button.dataset.filter === state.filter;
      const isUnavailable = Boolean(state.query) && count === 0;
      button.classList.toggle("active", isActive);
      button.classList.toggle("is-search-empty", isUnavailable);
      button.disabled = isUnavailable && !isActive;
    });
    root.querySelectorAll("[data-toggle-archive]").forEach((button) => {
      const isUnavailable = Boolean(state.query) && counts.archive === 0;
      button.classList.toggle("active", state.archiveOpen);
      button.classList.toggle("is-search-empty", isUnavailable);
      button.disabled = isUnavailable && !state.archiveOpen;
    });
  };

  const renderOrders = () => {
    const orders = filteredOrders();
    const visibleOrders = state.archiveOpen ? archiveOrders() : orders;
    if (els.visibleCount) els.visibleCount.textContent = `${visibleOrders.length} \u0437\u0430\u043a\u0430\u0437\u043e\u0432`;
    syncStageTabs();
    els.empty.hidden = state.archiveOpen || orders.length > 0;
    els.grid.hidden = state.archiveOpen;
    els.grid.innerHTML = orders.map(renderActiveShipmentCard).join("");
    renderMetrics();
    renderArchive();
    return;
  };

  const renderArchive = () => {
    if (!els.archivePanel || !els.archiveGrid) return;
    const orders = archiveOrders();
    root.querySelectorAll("[data-archive-filter]").forEach((button) => {
      const counts = searchStageCounts();
      const count = counts[button.dataset.archiveFilter] || 0;
      const isActive = button.dataset.archiveFilter === state.archiveFilter;
      const isUnavailable = Boolean(state.query) && count === 0;
      button.classList.toggle("active", isActive);
      button.classList.toggle("is-search-empty", isUnavailable);
      button.disabled = isUnavailable && !isActive;
    });
    els.archivePanel.hidden = !state.archiveOpen;
    els.archiveEmpty.hidden = orders.length > 0;
    els.archiveGrid.innerHTML = orders.map(renderArchiveShipmentCard).join("");
    return;
  };

  const itemSearchText = (item) => [item.id, item.productId, item.name, item.batch].join(" ").toLowerCase();

  const renderAvailableItems = () => {
    const items = state.items
      .filter((item) => !state.itemQuery || itemSearchText(item).includes(state.itemQuery))
      .slice(0, 80);
    els.itemsList.innerHTML = items.map((item) => {
      const row = state.selectedItems.get(item.id);
      const isSelected = Boolean(row);
      const available = Number(item.available || 0);
      const quantity = row?.quantity || 1;
      return `
        <label class="picker-row${isSelected ? " is-selected" : ""}" data-picker-row="${escapeHtml(item.id)}">
          <input class="picker-check" type="checkbox" data-pick-item="${escapeHtml(item.id)}" ${isSelected ? "checked" : ""} ${available <= 0 ? "disabled" : ""}>
          <span class="picker-check-ui" aria-hidden="true"></span>
          <span class="picker-name">${escapeHtml(item.name)}</span>
          <span class="picker-stock">${available} \u0448\u0442.</span>
          <input class="picker-qty" type="text" inputmode="numeric" value="${isSelected ? escapeHtml(quantity) : ""}" placeholder="-" data-picker-quantity="${escapeHtml(item.id)}" ${isSelected ? "" : "disabled"}>
        </label>
      `;
    }).join("");
  };

  const renderSelectedItems = () => {
    els.selectedItems.innerHTML = "";
  };

  const renderItems = () => {
    renderAvailableItems();
    renderSelectedItems();
    syncAutoPrice();
  };

  const selectItem = (id, quantity = 1) => {
    const item = state.items.find((entry) => entry.id === id);
    if (!item || Number(item.available || 0) <= 0) return;
    state.selectedItems.set(id, {
      id: item.id,
      name: item.name,
      available: Number(item.available),
      price: Number(item.price || 0),
      quantity: Math.max(1, Math.min(Number(item.available), Number(quantity) || 1)),
    });
    renderItems();
  };

  const unselectItem = (id) => {
    state.selectedItems.delete(id);
    renderItems();
  };

  const setSelectedQuantity = (id, quantity, shouldRender = true) => {
    const row = state.selectedItems.get(id);
    if (!row) return;
    row.quantity = Math.max(1, Math.min(Number(row.available), Number(quantity) || 1));
    state.selectedItems.set(id, row);
    if (shouldRender) renderItems();
    else syncAutoPrice();
  };

  const resetCreateForm = () => {
    els.createForm.reset();
    state.itemQuery = "";
    state.selectedItems.clear();
    state.totalPriceManual = false;
    if (els.itemSearch) els.itemSearch.value = "";
    fillSelects();
    renderItems();
  };

  const renderCounterparties = () => {
    els.counterpartyList.innerHTML = `
      ${state.counterparties.map((item) => `
        <details class="directory-card">
          <summary>
            <span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.cardNumber || "Карта не указана")}</small>
            </span>
            <em>${escapeHtml(item.ordersCount || 0)} заказов</em>
          </summary>
          <form class="directory-edit" data-counterparty-edit-form data-url="${escapeHtml(item.urls.update)}">
            <label class="field"><span>Наименование</span><input name="title" value="${escapeHtml(item.title)}" maxlength="140" autocomplete="off" required></label>
            <label class="field"><span>Номер карты</span><input name="card_number" value="${escapeHtml(item.cardNumber)}" maxlength="64" autocomplete="off"></label>
            <div class="directory-actions">
              <button class="btn btn-danger-ghost" type="button" data-delete-counterparty data-url="${escapeHtml(item.urls.delete)}">Удалить</button>
              <button class="btn btn-primary" type="submit">Сохранить</button>
            </div>
          </form>
        </details>
      `).join("")}
      <details class="directory-card directory-card-add">
        <summary>
          <span>
            <strong>Добавить контрагента</strong>
          </span>
          <em>+</em>
        </summary>
        <form class="directory-edit" data-counterparty-create-form>
          <label class="field"><span>Наименование</span><input name="title" maxlength="140" autocomplete="off" required></label>
          <label class="field"><span>Номер карты</span><input name="card_number" maxlength="64" autocomplete="off"></label>
          <div class="directory-actions">
            <button class="btn btn-primary" type="submit">Создать</button>
          </div>
        </form>
      </details>
    `;
  };

  const renderExportCounterparties = () => {
    if (!els.exportCounterparties) return;
    els.exportCounterparties.innerHTML = state.counterparties.map((item) => `
      <label class="export-counterparty">
        <input name="counterparty_ids" type="checkbox" value="${escapeHtml(item.id)}" checked>
        <span class="export-check-ui" aria-hidden="true"></span>
        <span>${escapeHtml(item.title)}</span>
      </label>
    `).join("");
  };

  const renderPhones = () => {
    const activeIndex = state.phones.findIndex((item) => item.isActive);
    els.phoneList.innerHTML = `
      ${state.phones.map((item) => {
        const usedPercent = Math.min(100, Math.round((Number(item.usedLimit || 0) / Number(state.limitAmount || 1)) * 100));
        const isActive = activeIndex === -1 ? false : state.phones[activeIndex].id === item.id;
        return `
          <details class="directory-card">
            <summary>
              <span>
                <strong>${escapeHtml(item.label || item.phone)}</strong>
                <small>${escapeHtml(item.phone)} В· PIN ${escapeHtml(item.pinCode)}</small>
              </span>
              <em>${formatMoney(item.usedLimit)}</em>
            </summary>
            <div class="directory-limit-bar"><span style="width: ${usedPercent}%"></span></div>
            <form class="directory-edit" data-phone-edit-form data-url="${escapeHtml(item.urls.update)}">
              <label class="field"><span>Название</span><input name="label" value="${escapeHtml(item.label)}" maxlength="120" autocomplete="off"></label>
              <label class="field"><span>Номер телефона</span><input name="phone" type="tel" inputmode="tel" value="${escapeHtml(item.phone)}" maxlength="32" autocomplete="off" required></label>
              <label class="field"><span>PIN-код</span><input name="pin_code" value="${escapeHtml(item.pinCode)}" maxlength="64" autocomplete="off" required></label>
              <label class="active-toggle-row${isActive ? " is-active" : ""}">
                <span>Основной номер</span>
                <input name="is_active" type="checkbox" data-phone-active-toggle ${isActive ? "checked" : ""}>
                <span class="active-toggle-box" aria-hidden="true"></span>
              </label>
              <div class="directory-actions">
                <button class="btn btn-danger-ghost" type="button" data-delete-phone data-url="${escapeHtml(item.urls.delete)}">Удалить</button>
                <button class="btn btn-primary" type="submit">Сохранить</button>
              </div>
            </form>
          </details>
        `;
      }).join("")}
      <details class="directory-card directory-card-add">
        <summary>
          <span>
            <strong>Добавить номер</strong>
          </span>
          <em>+</em>
        </summary>
        <form class="directory-edit" data-phone-create-form>
          <label class="field"><span>Название</span><input name="label" maxlength="120" autocomplete="off"></label>
          <label class="field"><span>Номер телефона</span><input name="phone" type="tel" inputmode="tel" maxlength="32" autocomplete="off" required></label>
          <label class="field"><span>PIN-код</span><input name="pin_code" maxlength="64" autocomplete="off" required></label>
          <label class="active-toggle-row is-active">
            <span>Основной номер</span>
            <input name="is_active" type="checkbox" data-phone-active-toggle checked>
            <span class="active-toggle-box" aria-hidden="true"></span>
          </label>
          <div class="directory-actions">
            <button class="btn btn-primary" type="submit">Создать</button>
          </div>
        </form>
      </details>
    `;
  };

  root.addEventListener("click", async (event) => {
    const pointsToggle = event.target.closest("[data-points-month-toggle]");
    const pointsOption = event.target.closest("[data-points-month-option]");
    const pointsYearPrev = event.target.closest("[data-points-year-prev]");
    const pointsYearNext = event.target.closest("[data-points-year-next]");
    if (pointsToggle) {
      const shouldOpen = els.pointsMonthPanel?.hidden;
      state.pointsCalendarYear = Number((state.pointsMonthKey || "").slice(0, 4)) || state.pointsCalendarYear;
      renderPointsPeriod();
      els.pointsMonthPanel.hidden = !shouldOpen;
      els.pointsMonthToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      return;
    }
    if (pointsYearPrev || pointsYearNext) {
      const years = Array.from(new Set(state.pointsMonthKeys.map((key) => Number(key.slice(0, 4))))).sort((a, b) => a - b);
      const index = years.indexOf(state.pointsCalendarYear);
      const nextIndex = pointsYearPrev ? Math.max(0, index - 1) : Math.min(years.length - 1, index + 1);
      state.pointsCalendarYear = years[nextIndex] || state.pointsCalendarYear;
      renderPointsPeriod();
      els.pointsMonthPanel.hidden = false;
      els.pointsMonthToggle.setAttribute("aria-expanded", "true");
      return;
    }
    if (pointsOption) {
      if (pointsOption.disabled) return;
      state.pointsMonthKey = pointsOption.dataset.pointsMonthOption;
      state.pointsCalendarYear = Number(state.pointsMonthKey.slice(0, 4));
      renderOverview();
      closePointsPanel();
      return;
    }
    const pointsMode = event.target.closest("[data-points-mode]");
    if (pointsMode) {
      state.pointsMode = pointsMode.dataset.pointsMode === "month" ? "month" : "week";
      renderOverview();
      return;
    }
    const closeWeekButton = event.target.closest("[data-close-points-week]");
    if (closeWeekButton) {
      if (closeWeekButton.disabled) return;
      closeWeekButton.disabled = true;
      const formData = new FormData();
      formData.append("period_month", state.pointsMonthKey || "");
      try {
        const payload = await fetchForm(state.urls.closePointsWeek, formData);
        state.orders = payload.orders || state.orders;
        state.pointsClosures = payload.pointsClosures || [];
        renderOverview();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        renderOverview();
      }
      return;
    }
    if (els.pointsPeriod && !els.pointsPeriod.contains(event.target)) {
      closePointsPanel();
    }

    const overviewPanel = event.target.closest("[data-overview-panel]");
    if (overviewPanel) {
      state.overviewPanel = overviewPanel.dataset.overviewPanel === "orders" ? "orders" : "limits";
      renderOverviewPanel();
      return;
    }

    const directorySummary = event.target.closest(".directory-card > summary");
    if (directorySummary) {
      const currentCard = directorySummary.closest(".directory-card");
      const list = currentCard?.closest(".directory-list");
      if (list && !currentCard.open) {
        list.querySelectorAll(".directory-card[open]").forEach((card) => {
          if (card !== currentCard) card.open = false;
        });
      }
    }

    if (event.target.closest("[data-open-create]")) {
      resetCreateForm();
      openModal(els.createModal, event.target.closest("[data-open-create]"));
      renderItems();
    }
    if (event.target.closest("[data-open-export]")) {
      renderExportCounterparties();
      openModal(els.exportModal, event.target.closest("[data-open-export]"));
    }
    if (event.target.closest("[data-open-counterparty]")) {
      renderCounterparties();
      openModal(els.counterpartyModal, event.target.closest("[data-open-counterparty]"));
    }
    if (event.target.closest("[data-open-phone]")) {
      renderPhones();
      openModal(els.phoneModal, event.target.closest("[data-open-phone]"));
    }
    if (event.target.closest("[data-close-create]") || event.target === els.createModal) closeModal(els.createModal);
    if (event.target.closest("[data-close-export]") || event.target === els.exportModal) closeModal(els.exportModal);
    if (event.target.closest("[data-close-counterparty]") || event.target === els.counterpartyModal) closeModal(els.counterpartyModal);
    if (event.target.closest("[data-close-phone]") || event.target === els.phoneModal) closeModal(els.phoneModal);

    const expandButton = event.target.closest("[data-card-expand-button]");
    const expandableCard = event.target.closest("[data-expand-card]");
    if (expandableCard && (expandButton || !event.target.closest("button, input, select, textarea, form, a"))) {
      const key = expandableCard.dataset.expandCard;
      state.expandedOrderKey = state.expandedOrderKey === key ? "" : key;
      renderOrders();
      return;
    }

    const archiveToggle = event.target.closest("[data-toggle-archive]");
    if (archiveToggle) {
      if (archiveToggle.disabled) return;
      state.archiveOpen = true;
      state.expandedOrderKey = "";
      saveStageState();
      renderOrders();
      return;
    }

    const archiveFilter = event.target.closest("[data-archive-filter]");
    if (archiveFilter) {
      if (archiveFilter.disabled) return;
      root.querySelectorAll("[data-archive-filter]").forEach((button) => button.classList.remove("active"));
      archiveFilter.classList.add("active");
      state.archiveFilter = archiveFilter.dataset.archiveFilter;
      state.archiveOpen = true;
      state.expandedOrderKey = "";
      saveStageState();
      renderArchive();
      syncStageTabs();
      return;
    }

    const filter = event.target.closest("[data-filter]");
    if (filter) {
      if (filter.disabled) return;
      state.archiveOpen = false;
      state.filter = filter.dataset.filter;
      state.expandedOrderKey = "";
      saveStageState();
      renderOrders();
      return;
    }

    const deleteCounterparty = event.target.closest("[data-delete-counterparty]");
    if (deleteCounterparty && window.confirm("Удалить контрагента?")) {
      deleteCounterparty.disabled = true;
      try {
        const payload = await fetchForm(deleteCounterparty.dataset.url, new FormData());
        state.counterparties = payload.counterparties;
        fillSelects(Number(els.counterpartySelect.value || 0), Number(els.phoneSelect.value || 0));
        renderCounterparties();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        deleteCounterparty.disabled = false;
      }
    }

    const deletePhone = event.target.closest("[data-delete-phone]");
    if (deletePhone && window.confirm("Удалить номер?")) {
      deletePhone.disabled = true;
      try {
        const payload = await fetchForm(deletePhone.dataset.url, new FormData());
        state.phones = payload.phones;
        fillSelects(Number(els.counterpartySelect.value || 0), Number(els.phoneSelect.value || 0));
        renderPhones();
        renderOverview();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        deletePhone.disabled = false;
      }
    }

    const ship = event.target.closest("[data-ship-order]");
    if (ship) {
      ship.disabled = true;
      try {
        const payload = await fetchForm(ship.dataset.url, new FormData());
        replaceOrder(payload.order);
        focusOrderStage(payload.order);
        if (payload.items) state.items = payload.items;
        if (payload.phones) state.phones = payload.phones;
        fillSelects();
        renderOrders();
        renderItems();
        renderOverview();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        ship.disabled = false;
      }
    }

    const transition = event.target.closest("[data-order-transition]");
    if (transition) {
      transition.disabled = true;
      try {
        const payload = await fetchForm(transition.dataset.url, new FormData());
        replaceOrder(payload.order);
        focusOrderStage(payload.order);
        if (payload.items) state.items = payload.items;
        if (payload.phones) state.phones = payload.phones;
        fillSelects();
        renderOrders();
        renderItems();
        renderOverview();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        transition.disabled = false;
      }
    }

    const deleteOrder = event.target.closest("[data-delete-order]");
    if (deleteOrder && window.confirm("Удалить заявку на формировании?")) {
      deleteOrder.disabled = true;
      try {
        const payload = await fetchForm(deleteOrder.dataset.url, new FormData());
        state.orders = state.orders.filter((order) => Number(order.id) !== Number(payload.orderId));
        state.expandedOrderKey = "";
        if (payload.items) state.items = payload.items;
        if (payload.phones) state.phones = payload.phones;
        fillSelects();
        renderOrders();
        renderItems();
        renderOverview();
        showToast(payload.message);
      } catch (error) {
        showToast(error.message, true);
      } finally {
        deleteOrder.disabled = false;
      }
    }
  });

  root.addEventListener("beforeinput", (event) => {
    if (!isPhoneInput(event.target) || !event.data) return;
    if (/[^\d+\s().-]/.test(event.data)) event.preventDefault();
  });

  root.addEventListener("input", (event) => {
    if (isPhoneInput(event.target)) {
      normalizePhoneInput(event.target);
    }
    if (event.target === els.search) {
      state.query = els.search.value.trim().toLowerCase();
      state.expandedOrderKey = "";
      routeSearchToFirstResult();
      renderOrders();
    }
    if (event.target === els.itemSearch) {
      state.itemQuery = els.itemSearch.value.trim().toLowerCase();
      renderAvailableItems();
    }
    if (event.target === els.totalPrice) {
      state.totalPriceManual = Boolean(els.totalPrice.value.trim());
      updateLimitLine();
    }
    if (event.target.matches("[data-picker-quantity]")) {
      setSelectedQuantity(Number(event.target.dataset.pickerQuantity), event.target.value, false);
    }
  });

  root.addEventListener("change", (event) => {
    if (event.target === els.phoneSelect) updateLimitLine();
    if (event.target.matches("[data-picker-quantity]")) {
      setSelectedQuantity(Number(event.target.dataset.pickerQuantity), event.target.value, true);
    }
    if (event.target.matches("[data-pick-item]")) {
      const id = Number(event.target.dataset.pickItem);
      if (event.target.checked) {
        selectItem(id, 1);
        window.requestAnimationFrame(() => {
          const input = els.itemsList.querySelector(`[data-picker-quantity="${id}"]`);
          if (input) {
            input.focus();
            input.select();
          }
        });
      } else {
        unselectItem(id);
      }
    }
    if (event.target.matches("[data-phone-active-toggle]")) {
      if (!event.target.checked) {
        event.target.checked = true;
        return;
      }
      els.phoneList.querySelectorAll("[data-phone-active-toggle]").forEach((input) => {
        if (input !== event.target) input.checked = false;
        input.closest(".active-toggle-row")?.classList.toggle("is-active", input.checked);
      });
    }
  });

  els.createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = els.createForm.querySelector('button[type="submit"]');
    const formData = new FormData(els.createForm);
    const createTtn = String(formData.get("ttn") || "").trim();
    if (createTtn && isDuplicateTtn(createTtn)) {
      showToast("Такая ТТН уже используется в другой заявке.", true);
      els.createForm.querySelector('input[name="ttn"]')?.focus();
      return;
    }
    formData.set("items", JSON.stringify(Array.from(state.selectedItems.values()).map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }))));
    submit.disabled = true;
    try {
      const payload = await fetchForm(state.urls.create, formData);
      state.orders = [payload.order, ...state.orders];
      if (payload.items) state.items = payload.items;
      if (payload.phones) state.phones = payload.phones;
      if (payload.counterparties) state.counterparties = payload.counterparties;
      focusOrderStage(payload.order);
      fillSelects();
      resetCreateForm();
      closeModal(els.createModal);
      renderOrders();
      renderItems();
      renderOverview();
      showToast(payload.warning || payload.message, Boolean(payload.warning));
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  els.exportForm?.addEventListener("submit", (event) => {
    const dateFrom = els.exportForm.querySelector('input[name="date_from"]')?.value || "";
    const dateTo = els.exportForm.querySelector('input[name="date_to"]')?.value || "";
    if (dateFrom && dateTo && dateFrom > dateTo) {
      event.preventDefault();
      showToast("Дата начала не может быть позже даты окончания.", true);
      return;
    }
    window.setTimeout(() => closeModal(els.exportModal), 120);
  });

  root.addEventListener("submit", async (event) => {
    const ttnForm = event.target.closest("[data-ttn-form]");
    const counterpartyCreateForm = event.target.closest("[data-counterparty-create-form]");
    const counterpartyEditForm = event.target.closest("[data-counterparty-edit-form]");
    const phoneCreateForm = event.target.closest("[data-phone-create-form]");
    const phoneEditForm = event.target.closest("[data-phone-edit-form]");
    const form = ttnForm || counterpartyCreateForm || counterpartyEditForm || phoneCreateForm || phoneEditForm;
    if (!form) return;

    event.preventDefault();
    if (ttnForm) {
      const ttnInput = ttnForm.querySelector('input[name="ttn"]');
      const ttnValue = String(ttnInput?.value || "").trim();
      if (ttnValue && isDuplicateTtn(ttnValue, Number(ttnForm.dataset.orderId || 0))) {
        showToast("Такая ТТН уже используется в другой заявке.", true);
        ttnInput?.focus();
        return;
      }
    }
    if (phoneCreateForm || phoneEditForm) {
      const phoneInput = form.querySelector('input[name="phone"]');
      if (!phoneInput) return;
      normalizePhoneInput(phoneInput);
      const phoneValue = phoneInput.value;
      const currentPhone = phoneEditForm
        ? state.phones.find((phone) => phone.urls?.update === form.dataset.url)
        : null;
      if (phoneValue && isDuplicatePhone(phoneValue, currentPhone?.id || 0)) {
        showToast("Такой номер уже существует.", true);
        phoneInput.focus();
        return;
      }
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      let url = form.dataset.url;
      if (counterpartyCreateForm) url = state.urls.createCounterparty;
      if (phoneCreateForm) url = state.urls.createPhone;
      const payload = await fetchForm(url, new FormData(form));
      if (payload.order) {
        replaceOrder(payload.order);
        focusOrderStage(payload.order);
      }
      if (payload.items) {
        state.items = payload.items;
        renderItems();
      }
      if (payload.counterparties) {
        state.counterparties = payload.counterparties;
        fillSelects(payload.counterparty?.id || Number(els.counterpartySelect.value || 0), Number(els.phoneSelect.value || 0));
        renderCounterparties();
      }
      if (payload.phones) {
        state.phones = payload.phones;
        fillSelects(Number(els.counterpartySelect.value || 0), payload.phone?.id || Number(els.phoneSelect.value || 0));
        renderPhones();
        renderOverview();
      }
      if (counterpartyCreateForm || phoneCreateForm) form.reset();
      renderOrders();
      showToast(payload.message);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePointsPanel();
  });

  fillSelects();
  renderOrders();
  renderItems();
})();
