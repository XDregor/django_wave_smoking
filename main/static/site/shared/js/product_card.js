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

  function openProductCardVariant(button) {
    if (button.disabled) return;
    const card = button.closest(".product_card_component");
    if (!card) return;

    const url = card.getAttribute("data_product_card_url");
    const variantId = button.getAttribute("data_product_variant_id");
    if (!url || !variantId) return;

    const detailUrl = new URL(url, window.location.origin);
    detailUrl.searchParams.set("variant_id", variantId);
    window.location.href = detailUrl.toString();
  }

  function openProductCard(card) {
    if (!card) return;
    const url = card.getAttribute("data_product_card_url");
    if (url) window.location.href = url;
  }

  document.addEventListener("click", (event) => {
    const likeButton = event.target.closest(".product_card_like_button");
    if (likeButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleProductLike(likeButton);
      return;
    }

    const variantButton = event.target.closest(".product_card_variant_option_button");
    if (variantButton) {
      event.preventDefault();
      event.stopPropagation();
      openProductCardVariant(variantButton);
      return;
    }

    const card = event.target.closest(".product_card_component");
    if (!card) return;
    if (event.target.closest("a, button")) return;
    openProductCard(card);
  });
})();
