from .shared import *

@ensure_csrf_cookie
def home(request):
    products = list(
        with_product_card_review_stats(Product.objects.filter(available=True))
        .select_related("brand", "category")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch, product_specification_prefetch)
    )
    product_browser_context = build_product_browser_context(request, products)
    brand_carousel_items = [
        {"name": brand.name, "logo": brand.image.url, "slug": brand.slug}
        for brand in Brand.objects.filter(show_in_carousel=True)
        .exclude(image="")
        .order_by("name")
        if brand.image
    ]
    liked_review_ids = get_liked_review_ids(request)
    home_reviews = [
        serialize_review(review, liked_review_ids)
        for review in ProductReview.objects.filter(
            is_approved=True,
            is_verified=True,
            rating__gte=4,
        )
        .select_related("product")
        .order_by("-created")
    ]
    return render(request, "site/home/home_page.html", {
        **product_browser_context,
        "brand_carousel_items": brand_carousel_items,
        "home_reviews": home_reviews,
        "disable_header_cursor": True,
    })
