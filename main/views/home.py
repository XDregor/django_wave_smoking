from .shared import *

@ensure_csrf_cookie
def home(request):
    products = list(
        with_product_card_review_stats(Product.objects.filter(available=True))
        .select_related("brand", "category")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)[:12]
    )
    mark_liked_products(products, get_liked_product_ids(request))
    brand_carousel_items = [
        {"name": brand.name, "logo": brand.image.url, "slug": brand.slug}
        for brand in Brand.objects.filter(show_in_carousel=True)
        .exclude(image="")
        .order_by("name")
        if brand.image
    ]
    home_reviews = [
        serialize_review(review)
        for review in ProductReview.objects.filter(
            is_approved=True,
            is_verified=True,
            rating__gte=4,
        )
        .select_related("product")
        .order_by("-created")
    ]
    return render(request, "site/home/index.html", {
        "products": products,
        "brand_carousel_items": brand_carousel_items,
        "home_reviews": home_reviews,
        "disable_header_cursor": True,
    })
