(function () {
  "use strict";

  const configElement = document.getElementById("sku-admin-config");
  const variantCatalogElement = document.getElementById("sku-variant-catalog");
  const recommendationProductCatalogElement = document.getElementById("sku-recommendation-product-catalog");
  const editProductElement = document.getElementById("sku-edit-product-data");

  window.SKU_ADMIN_CONFIG = {
    saveUrl: configElement?.dataset.saveUrl || "",
    productListUrl: configElement?.dataset.productListUrl || "",
    quickAddUrl: configElement?.dataset.quickAddUrl || "",
    mode: configElement?.dataset.mode || "create",
    productId: configElement?.dataset.productId || "",
    initialStep: Number(configElement?.dataset.initialStep) || 1,
    variantCatalog: JSON.parse(variantCatalogElement?.textContent || "[]"),
    recommendationProductCatalog: JSON.parse(recommendationProductCatalogElement?.textContent || "[]"),
    editProduct: JSON.parse(editProductElement?.textContent || "{}"),
  };
})();
