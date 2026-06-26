(() => {
  const root = document.querySelector(".wa-reviews");
  const dataElement = document.getElementById("admin-reviews-data");
  if (!root || !dataElement) return;

  let reviews = JSON.parse(dataElement.textContent || "[]");
  const state = {
    filter: "all",
    sort: "date_desc",
    rating: "all",
    page: 1,
    pageSize: 20,
    deletingId: null,
    renderedOnce: false,
  };
  const storageKey = "wave_admin_reviews_list_state_v1";

  const els = {
    search: document.getElementById("searchInput"),
    sortButton: document.getElementById("sortToggleBtn"),
    sortMenu: document.getElementById("sortMenu"),
    sortLabel: document.getElementById("sortLabel"),
    list: document.getElementById("reviewsList"),
    empty: document.getElementById("emptyState"),
    pagination: document.getElementById("paginationBar"),
    prev: document.getElementById("prevBtn"),
    next: document.getElementById("nextBtn"),
    pageInfo: document.getElementById("pageInfo"),
    deleteModal: document.getElementById("deleteModal"),
    cancelDelete: document.getElementById("cancelDeleteBtn"),
    confirmDelete: document.getElementById("confirmDeleteBtn"),
    refresh: document.getElementById("refreshReviewsBtn"),
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

  function declension(number, forms) {
    const n = Math.abs(Number(number) || 0);
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  function starSvg(filled) {
    return `<svg class="${filled ? "filled" : ""}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.4 2.95 6.05 6.68.96-4.83 4.71 1.14 6.65L12 17.62l-5.94 3.15 1.14-6.65-4.83-4.71 6.68-.96L12 2.4Z"/></svg>`;
  }

  function renderStars(rating) {
    let html = "";
    for (let index = 1; index <= 5; index += 1) {
      html += starSvg(index <= Number(rating || 0));
    }
    return html;
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
          sort: state.sort,
          rating: state.rating,
          page: state.page,
          search: els.search?.value || "",
        })
      );
    } catch (error) {
      /* localStorage can be unavailable. */
    }
  }

  function applySavedState() {
    const saved = readState();
    const filters = new Set(["all", "published", "hidden", "verified", "unverified"]);
    const sorts = new Set(["date_desc", "date_asc", "rating_desc", "rating_asc", "product", "verified"]);
    if (filters.has(saved.filter)) state.filter = saved.filter;
    if (sorts.has(saved.sort)) state.sort = saved.sort;
    if (saved.rating === "all" || (Number(saved.rating) >= 1 && Number(saved.rating) <= 5)) state.rating = saved.rating;
    if (Number.isInteger(Number(saved.page)) && Number(saved.page) > 0) state.page = Number(saved.page);
    if (els.search && typeof saved.search === "string") els.search.value = saved.search;

    document.querySelectorAll(".wa-reviews .tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === state.filter);
    });
    const sortButton = document.querySelector(`.wa-reviews .sort-opt[data-sort="${CSS.escape(state.sort)}"]`);
    if (sortButton) setSortButton(sortButton, false);
  }

  function filteredReviews() {
    const query = (els.search?.value || "").trim().toLowerCase();
    return reviews.filter((review) => {
      if (state.filter === "published" && !review.is_published) return false;
      if (state.filter === "hidden" && review.is_published) return false;
      if (state.filter === "verified" && !review.is_verified) return false;
      if (state.filter === "unverified" && review.is_verified) return false;
      if (state.rating !== "all" && Number(review.rating) !== Number(state.rating)) return false;

      if (!query) return true;
      return [review.text, review.author_name, review.product_name, review.user_name]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  function sortedReviews(items) {
    const result = [...items];
    result.sort((a, b) => {
      if (state.sort === "date_asc") return (a.created_ts || 0) - (b.created_ts || 0);
      if (state.sort === "rating_desc") return Number(b.rating || 0) - Number(a.rating || 0);
      if (state.sort === "rating_asc") return Number(a.rating || 0) - Number(b.rating || 0);
      if (state.sort === "product") {
        return String(a.product_name || "").localeCompare(String(b.product_name || ""), "ru");
      }
      if (state.sort === "verified") {
        return Number(b.is_verified) - Number(a.is_verified) || (b.created_ts || 0) - (a.created_ts || 0);
      }
      return (b.created_ts || 0) - (a.created_ts || 0);
    });
    return result;
  }

  function pagedReviews(items) {
    const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    return {
      items: items.slice(start, start + state.pageSize),
      totalPages,
    };
  }

  function renderCard(review) {
    const hiddenClass = review.is_published ? "" : " is-hidden";
    const longText = String(review.text || "").length > 260;
    const badges = [
      review.is_verified ? '<span class="badge badge-verified">Проверено</span>' : '<span class="badge">Не проверено</span>',
      review.is_published ? "" : '<span class="badge badge-hidden">Скрыт</span>',
    ].join("");
    const verifyText = review.is_verified ? "Проверено" : "Проверить";
    const visibilityText = review.is_published ? "Скрыть" : "Опубликовать";
    const visibilityClass = review.is_published ? "btn-hide" : "btn-publish";

    return `
      <article class="review-card${hiddenClass}" data-review-id="${escHtml(review.id)}">
        <div class="hidden-banner">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"/><path d="M9.9 4.24A10.43 10.43 0 0 1 12 4c7 0 10 8 10 8a17.84 17.84 0 0 1-2.06 3.35"/><path d="M6.1 6.1C3.3 8.08 2 12 2 12s3 8 10 8a10.7 10.7 0 0 0 5.9-1.75"/></svg>
          Скрыт
        </div>
        <header class="review-card-header">
          <div class="review-avatar">${escHtml(review.initials || "??")}</div>
          <div class="review-meta">
            <div class="review-author">${escHtml(review.author_name || "Аноним")}</div>
            <div class="review-product">${escHtml(review.product_name || "Товар удалён")}</div>
            <div class="review-stars">${renderStars(review.rating)}</div>
          </div>
          <div>
            <div class="review-date">${escHtml(review.created_label || "")}</div>
            <div class="review-badges">${badges}</div>
          </div>
        </header>
        <div class="review-card-body">
          <p class="review-text" id="review-text-${escHtml(review.id)}">${escHtml(review.text || "")}</p>
          ${longText ? `<button class="review-expand-btn" type="button" data-action="expand" data-review-id="${escHtml(review.id)}">Показать полностью</button>` : ""}
        </div>
        <footer class="review-card-footer">
          <span class="summary-sub">${Number(review.helpful_count || 0)} полезных отметок</span>
          <div class="spacer"></div>
          <button class="btn btn-sm ${review.is_verified ? "btn-verified" : "btn-accent"}" type="button" data-action="verify" data-review-id="${escHtml(review.id)}">${verifyText}</button>
          <button class="btn btn-sm ${visibilityClass}" type="button" data-action="visibility" data-review-id="${escHtml(review.id)}">${visibilityText}</button>
          <button class="btn btn-sm btn-danger" type="button" data-action="delete" data-review-id="${escHtml(review.id)}">Удалить</button>
        </footer>
      </article>
    `;
  }

  function renderList() {
    const items = sortedReviews(filteredReviews());
    const { items: pageItems, totalPages } = pagedReviews(items);
    els.list.innerHTML = pageItems.map(renderCard).join("");
    els.empty.hidden = items.length !== 0;
    els.pagination.hidden = items.length <= state.pageSize;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
    els.pageInfo.textContent = `${state.page} / ${totalPages}`;
  }

  function renderStats() {
    const total = reviews.length;
    const published = reviews.filter((review) => review.is_published).length;
    const hidden = total - published;
    const verified = reviews.filter((review) => review.is_verified).length;
    const unverified = total - verified;
    setText("statTotal", total);
    setText("statPublished", published);
    setText("statHidden", hidden);
    setText("statUnverified", unverified);

    const approvedReviews = reviews.filter((review) => review.is_published);
    const ratingBase = approvedReviews.length ? approvedReviews : reviews;
    const sum = ratingBase.reduce((value, review) => value + Number(review.rating || 0), 0);
    const avg = ratingBase.length ? sum / ratingBase.length : 0;
    setText("avgRating", avg.toFixed(1));
    setText("totalCountLabel", `${total} ${declension(total, ["отзыв", "отзыва", "отзывов"])}`);
    document.getElementById("summaryStars").innerHTML = renderStars(Math.round(avg));
    renderBars();
  }

  function renderBars() {
    const container = document.getElementById("ratingBars");
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((review) => {
      const rating = Number(review.rating || 0);
      if (counts[rating] != null) counts[rating] += 1;
    });
    const total = reviews.length || 1;
    const allActive = state.rating === "all" ? " active" : "";
    let html = `
      <div class="bars-all-row">
        <button class="bars-all-btn${allActive}" type="button" data-rating-filter="all">Все оценки</button>
        <span class="bars-all-total">${reviews.length} ${declension(reviews.length, ["отзыв", "отзыва", "отзывов"])}</span>
      </div>
    `;
    for (let rating = 5; rating >= 1; rating -= 1) {
      const count = counts[rating];
      const pct = Math.round((count / total) * 100);
      const active = Number(state.rating) === rating ? " active" : "";
      html += `
        <div class="bar-row${active}" data-rating-filter="${rating}">
          <span class="bar-num">${rating} ★</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-cnt">${count}</span>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  function renderAll() {
    renderStats();
    renderList();
    saveState();
    if (!state.renderedOnce) {
      state.renderedOnce = true;
      window.requestAnimationFrame(() => {
        root.classList.add("is-stable");
      });
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setSortButton(button, render = true) {
    document.querySelectorAll(".wa-reviews .sort-opt").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    state.sort = button.dataset.sort || "date_desc";
    els.sortLabel.textContent = button.dataset.label || button.textContent.trim();
    if (render) {
      state.page = 1;
      renderAll();
    }
  }

  async function postAction(url, reviewId) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ id: reviewId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Не удалось выполнить действие.");
    }
    return data;
  }

  function replaceReview(updatedReview) {
    reviews = reviews.map((review) => (String(review.id) === String(updatedReview.id) ? updatedReview : review));
  }

  function openDeleteModal(reviewId) {
    state.deletingId = reviewId;
    els.deleteModal.classList.add("open");
    els.deleteModal.setAttribute("aria-hidden", "false");
  }

  function closeDeleteModal() {
    state.deletingId = null;
    els.deleteModal.classList.remove("open");
    els.deleteModal.setAttribute("aria-hidden", "true");
  }

  function toast(message, type = "info") {
    const item = document.createElement("div");
    item.className = "toast";
    item.innerHTML = `<span class="toast-dot ${escHtml(type)}"></span>${escHtml(message)}`;
    els.toastContainer.appendChild(item);
    window.setTimeout(() => {
      item.classList.add("fade-out");
      window.setTimeout(() => item.remove(), 220);
    }, 2600);
  }

  root.addEventListener("click", async (event) => {
    const sortOption = event.target.closest(".sort-opt");
    if (sortOption) {
      setSortButton(sortOption);
      els.sortMenu.classList.remove("open");
      els.sortButton.setAttribute("aria-expanded", "false");
      return;
    }

    const tab = event.target.closest(".tab[data-filter]");
    if (tab) {
      document.querySelectorAll(".wa-reviews .tab").forEach((button) => button.classList.toggle("active", button === tab));
      state.filter = tab.dataset.filter || "all";
      state.page = 1;
      renderAll();
      return;
    }

    const ratingFilter = event.target.closest("[data-rating-filter]");
    if (ratingFilter) {
      state.rating = ratingFilter.dataset.ratingFilter || "all";
      state.page = 1;
      renderAll();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const reviewId = actionButton.dataset.reviewId;
    const action = actionButton.dataset.action;

    if (action === "expand") {
      const text = document.getElementById(`review-text-${reviewId}`);
      text?.classList.toggle("expanded");
      actionButton.textContent = text?.classList.contains("expanded") ? "Скрыть" : "Показать полностью";
      return;
    }

    if (action === "delete") {
      openDeleteModal(reviewId);
      return;
    }

    actionButton.disabled = true;
    try {
      const url = action === "verify" ? root.dataset.toggleVerifiedUrl : root.dataset.toggleVisibilityUrl;
      const data = await postAction(url, reviewId);
      replaceReview(data.review);
      renderAll();
      toast(action === "verify" ? "Статус проверки обновлён." : "Статус публикации обновлён.", "ok");
    } catch (error) {
      toast(error.message, "err");
      actionButton.disabled = false;
    }
  });

  els.search?.addEventListener("input", () => {
    state.page = 1;
    renderAll();
  });

  els.sortButton?.addEventListener("click", () => {
    const isOpen = els.sortMenu.classList.toggle("open");
    els.sortButton.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sort-menu-wrap")) {
      els.sortMenu?.classList.remove("open");
      els.sortButton?.setAttribute("aria-expanded", "false");
    }
  });

  els.prev?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderAll();
    }
  });

  els.next?.addEventListener("click", () => {
    state.page += 1;
    renderAll();
  });

  els.cancelDelete?.addEventListener("click", closeDeleteModal);
  els.deleteModal?.addEventListener("click", (event) => {
    if (event.target === els.deleteModal) closeDeleteModal();
  });

  els.confirmDelete?.addEventListener("click", async () => {
    const reviewId = state.deletingId;
    if (!reviewId) return;
    els.confirmDelete.disabled = true;
    try {
      await postAction(root.dataset.deleteUrl, reviewId);
      reviews = reviews.filter((review) => String(review.id) !== String(reviewId));
      closeDeleteModal();
      renderAll();
      toast("Отзыв удалён.", "ok");
    } catch (error) {
      toast(error.message, "err");
    } finally {
      els.confirmDelete.disabled = false;
    }
  });

  els.refresh?.addEventListener("click", () => {
    window.location.reload();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDeleteModal();
      els.sortMenu?.classList.remove("open");
    }
  });

  applySavedState();
  renderAll();
})();
