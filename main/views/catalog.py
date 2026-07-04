from .shared import *

@ensure_csrf_cookie
def catalog(request):
    catalog_search_query = request.GET.get("q", "").strip()
    products = list(
        with_product_card_review_stats(Product.objects.filter(available=True))
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
    )
    product_browser_context = build_product_browser_context(request, products)

    return render(request, "site/catalog/catalog_search_page.html", {
        **product_browser_context,
        "catalog_search_query": catalog_search_query,
        "catalog_search_mode": bool(catalog_search_query or request.GET.get("search")),
    })


@require_GET
def api_search_products(request):
    query = request.GET.get("q", "").strip()
    normalized_query = normalize_product_search(query)
    if len(normalized_query) < 2 and not normalized_query.isdigit():
        return JsonResponse({"results": [], "total": 0})

    products = list(
        Product.objects.filter(available=True)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
    )
    matched_products = [
        product
        for product in products
        if product_matches_search(product, normalized_query)
    ]
    matched_products.sort(key=lambda product: (
        0 if is_product_available_for_purchase(product) else 1,
        get_product_search_rank(product, normalized_query),
        -int(product.display_likes),
        product.name.lower(),
    ))

    return JsonResponse({
        "results": [serialize_search_product(product) for product in matched_products[:6]],
        "total": len(matched_products),
    })

def product_list(request, category_slug=None):
    categories = Category.objects.all()
    products_queryset = (
        with_product_card_review_stats(Product.objects.filter(available=True))
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
    )

    category = None
    if category_slug:
        category = get_object_or_404(Category, slug=category_slug)
        products_queryset = products_queryset.filter(category=category)

    products = list(products_queryset)
    product_browser_context = build_product_browser_context(request, products)

    return render(request, "site/catalog/catalog_search_page.html", {
        **product_browser_context,
        "category": category,
        "categories": categories,
    })
