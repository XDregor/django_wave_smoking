(() => {
  const root = document.querySelector(".wa-history");
  const dataElement = document.getElementById("admin-action-history-data");
  if (!root || !dataElement) return;

  let entries = JSON.parse(dataElement.textContent || "[]");
  const state = {
    filter: "all",
    page: 1,
    pageSize: 24,
  };
  const storageKey = "wave_admin_action_history_state_v1";

  const els = {
    search: document.getElementById("historySearchInput"),
    list: document.getElementById("historyList"),
    empty: document.getElementById("emptyState"),
    pagination: document.getElementById("paginationBar"),
    prev: document.getElementById("prevBtn"),
    next: document.getElementById("nextBtn"),
    pageInfo: document.getElementById("pageInfo"),
    cleanup: document.getElementById("cleanupHistoryBtn"),
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

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          filter: state.filter,
          search: els.search?.value || "",
        })
      );
    } catch (error) {
      /* localStorage can be unavailable. */
    }
  }

  function applyState() {
    const saved = readState();
    const filters = new Set(["all", "create", "change", "delete"]);
    if (filters.has(saved.filter)) state.filter = saved.filter;
    if (els.search && typeof saved.search === "string") els.search.value = saved.search;
    document.querySelectorAll(".filter-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === state.filter);
    });
  }

  function toast(message) {
    if (!els.toastContainer) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    els.toastContainer.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function actionIcon(action) {
    if (action === "create") {
      return '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>';
    }
    if (action === "delete") {
      return '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path></svg>';
    }
    return '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path></svg>';
  }

  function filteredEntries() {
    const query = (els.search?.value || "").trim().toLowerCase();
    return entries.filter((entry) => {
      if (state.filter !== "all" && entry.action !== state.filter) return false;
      if (!query) return true;
      return [
        entry.user,
        entry.user_label,
        entry.model,
        entry.app,
        entry.object,
        entry.action_label,
        entry.message,
        entry.date,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  function paged(items) {
    const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    return {
      totalPages,
      items: items.slice(start, start + state.pageSize),
    };
  }

  function renderEntry(entry) {
    return `
      <article class="history-item is-${escHtml(entry.action)}">
        <div class="history-icon">${actionIcon(entry.action)}</div>
        <div class="history-content">
          <div class="history-title-row">
            <strong class="history-title">${escHtml(entry.action_label)}: ${escHtml(entry.object)}</strong>
          </div>
          <div class="history-message">${escHtml(entry.message)}</div>
          <div class="history-meta-row">
            <span class="history-pill">${escHtml(entry.user)}</span>
            <span class="history-pill">${escHtml(entry.model)}</span>
            ${entry.object_id ? `<span class="history-pill">ID ${escHtml(entry.object_id)}</span>` : ""}
          </div>
        </div>
        <time class="history-time" datetime="${escHtml(entry.timestamp)}">
          ${escHtml(entry.time)}
          <span class="history-relative">${escHtml(entry.relative)}</span>
        </time>
      </article>
    `;
  }

  function renderStats() {
    const counts = entries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.action === "create") acc.create += 1;
        if (entry.action === "change") acc.change += 1;
        if (entry.action === "delete") acc.delete += 1;
        return acc;
      },
      { total: 0, create: 0, change: 0, delete: 0 }
    );
    document.getElementById("statTotal").textContent = counts.total;
    document.getElementById("statCreate").textContent = counts.create;
    document.getElementById("statChange").textContent = counts.change;
    document.getElementById("statDelete").textContent = counts.delete;
  }

  function render() {
    const items = filteredEntries();
    const { items: pageItems, totalPages } = paged(items);
    els.list.innerHTML = pageItems.map(renderEntry).join("");
    els.empty.hidden = items.length !== 0;
    els.pagination.hidden = items.length <= state.pageSize;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
    els.pageInfo.textContent = `${state.page} / ${totalPages}`;
    renderStats();
  }

  function cleanupHistory() {
    if (!root.dataset.cleanupUrl || els.cleanup?.disabled) return;
    const days = root.dataset.retentionDays || "30";
    if (!window.confirm(`Удалить записи истории старше ${days} дней?`)) return;
    els.cleanup.disabled = true;
    fetch(root.dataset.cleanupUrl, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Requested-With": "XMLHttpRequest",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message || "Не удалось очистить историю.");
        toast(`Удалено записей: ${data.deleted}`);
        window.location.reload();
      })
      .catch((error) => toast(error.message || "Ошибка очистки истории."))
      .finally(() => {
        els.cleanup.disabled = false;
      });
  }

  applyState();
  render();

  els.search?.addEventListener("input", () => {
    state.page = 1;
    saveState();
    render();
  });

  document.querySelectorAll(".filter-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter || "all";
      state.page = 1;
      document.querySelectorAll(".filter-tab").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      saveState();
      render();
    });
  });

  els.prev?.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    render();
  });

  els.next?.addEventListener("click", () => {
    state.page += 1;
    render();
  });

  els.cleanup?.addEventListener("click", cleanupHistory);
})();
