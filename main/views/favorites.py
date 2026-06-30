from .shared import *

@require_GET
def api_favorites(request):
    liked_ids = get_liked_product_ids(request)
    if not liked_ids:
        return JsonResponse({"items": [], "total_quantity": 0})

    products = (
        Product.objects.filter(id__in=liked_ids, available=True)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
        .order_by("name")
    )
    return JsonResponse({
        "items": [serialize_product(product, liked_ids) for product in products],
        "total_quantity": products.count(),
    })
