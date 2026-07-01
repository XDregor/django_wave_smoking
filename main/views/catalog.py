from .shared import *

@ensure_csrf_cookie
def catalog(request):
    products = list(
        with_product_card_review_stats(Product.objects.filter(available=True))
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
    )
    liked_product_ids = get_liked_product_ids(request)
    mark_liked_products(products, liked_product_ids)

    products_data = []
    for p in products:
        item = serialize_product(p, liked_product_ids)
        item.update({
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else "",
            "brand_id": p.brand_id,
            "brand_slug": p.brand.slug if p.brand else "",
            "brand": p.brand.name if p.brand else "",
            "stock": p.stock,
            "created": p.created.isoformat() if p.created else "",
        })
        products_data.append(item)

    categories_data = [
        {"id": category.id, "name": category.name, "slug": category.slug}
        for category in Category.objects.all()
    ]

    catalog_search_query = request.GET.get("q", "").strip()

    return render(request, "site/catalog/index.html", {
        "products": products,
        "products_json": products_data,
        "categories_json": categories_data,
        "liked_product_ids": liked_product_ids,
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
    liked_product_ids = get_liked_product_ids(request)
    mark_liked_products(products, liked_product_ids)

    products_data = []
    for p in products:
        item = serialize_product(p, liked_product_ids)
        item.update({
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else "",
            "brand_id": p.brand_id,
            "brand_slug": p.brand.slug if p.brand else "",
            "brand": p.brand.name if p.brand else "",
            "stock": p.stock,
            "created": p.created.isoformat() if p.created else "",
        })
        products_data.append(item)

    categories_data = [
        {"id": item.id, "name": item.name, "slug": item.slug}
        for item in categories
    ]

    return render(request, "site/catalog/index.html", {
        "category": category,
        "categories": categories,
        "products": products,
        "products_json": products_data,
        "categories_json": categories_data,
        "liked_product_ids": liked_product_ids,
    })
