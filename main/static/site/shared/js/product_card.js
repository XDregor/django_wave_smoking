(function () {
  if (window.__productCardComponentReady) return;
  window.__productCardComponentReady = true;

  function getCookie(name) {
    return document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.split("=")
      .slice(1)
      .join("=") || "";
  }

  function syncLikeButtons(productId, liked, likes) {
    document.querySelectorAll(`[data_product_card_like_id="${productId}"]`).forEach((button) => {
      button.setAttribute("data_product_card_liked_state", liked ? "true" : "false");
      button.classList.toggle("active", Boolean(liked));
      const counter = button.querySelector(".product_card_like_count_text");
      if (counter) counter.textContent = likes;
    });
  }

  async function toggleProductLike(button) {
    const productId = button.getAttribute("data_product_card_like_id");
    const likeUrl = button.getAttribute("data_product_card_like_url");
    if (!productId || !likeUrl || button.disabled) return;

    button.disabled = true;
    try {
      const response = await fetch(likeUrl, {
        method: "POST",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;

      syncLikeButtons(productId, Boolean(data.liked), Number(data.likes || 0));
      document.dispatchEvent(new CustomEvent("product-card:liked", {
        detail: {
          productId: Number(productId),
          liked: Boolean(data.liked),
          likes: Number(data.likes || 0),
        },
      }));
      window._shopPanel?.refreshFavorites?.();
    } finally {
      button.disabled = false;
    }
  }

  function openProductCard(card) {
    if (!card) return;
    const url = card.getAttribute("data_product_card_url");
    if (url) window.location.href = url;
  }

  function selectColorSwatch(button) {
    const card = button.closest(".product_card_component");
    const image = card?.querySelector(".product_card_image_element");
    if (!card || !image) return;

    card.querySelectorAll("[data-product-card-color-swatch]").forEach((swatch) => {
      const selected = swatch === button;
      swatch.classList.toggle("is-selected", selected);
      swatch.setAttribute("aria-pressed", String(selected));
    });

    const nextSource = button.getAttribute("data-product-card-color-image") || image.getAttribute("data-product-card-default-image");
    if (!nextSource || image.getAttribute("src") === nextSource) return;
    image.classList.add("is-changing");
    window.setTimeout(() => {
      image.setAttribute("src", nextSource);
      image.classList.remove("is-changing");
    }, 120);
  }

  async function handleCartAction(button) {
    const card = button.closest(".product_card_component");
    if (!card || button.disabled) return;

    if (card.getAttribute("data_product_card_requires_selection") === "true") {
      openProductCard(card);
      return;
    }

    const productId = Number(card.getAttribute("data_product_card_id"));
    const cartUrl = button.getAttribute("data_product_card_cart_url");
    if (!productId || !cartUrl) return;

    button.disabled = true;
    button.classList.add("is_loading");
    try {
      const response = await fetch(cartUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.error === "out_of_stock") {
          card.classList.add("product_card_unavailable_state");
          button.setAttribute("aria-disabled", "true");
          button.title = "Нет в наличии";
        }
        return;
      }

      button.classList.add("is_added");
      window.setTimeout(() => button.classList.remove("is_added"), 1200);
      window._shopPanel?.updateCartCounters?.(Number(data.cart?.total_quantity || 0));
      window._shopPanel?.refreshCart?.();
      document.dispatchEvent(new CustomEvent("product-card:cart-added", {
        detail: { productId, cart: data.cart || null },
      }));
    } finally {
      button.classList.remove("is_loading");
      if (!card.classList.contains("product_card_unavailable_state")) button.disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const colorSwatch = event.target.closest("[data-product-card-color-swatch]");
    if (colorSwatch) {
      event.preventDefault();
      event.stopPropagation();
      selectColorSwatch(colorSwatch);
      return;
    }

    const likeButton = event.target.closest(".product_card_like_button");
    if (likeButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleProductLike(likeButton);
      return;
    }

    const cartButton = event.target.closest(".product_card_cart_button");
    if (cartButton) {
      event.preventDefault();
      event.stopPropagation();
      handleCartAction(cartButton);
      return;
    }

    const card = event.target.closest(".product_card_component");
    if (!card) return;
    if (event.target.closest("a, button")) return;
    openProductCard(card);
  });
})();
