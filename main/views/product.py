from .shared import *
from django.http import Http404

@ensure_csrf_cookie
def product_detail(request, id, slug):
    product = (
        Product.objects.select_related("category", "brand").prefetch_related(
            available_variant_prefetch,
            product_sku_prefetch,
            "additional_images",
            "specifications",
        )
        .filter(id=id, available=True)
        .first()
    )
    if not product:
        raise Http404("Product not found")

    if product.slug != slug:
        return redirect("main:product_detail", id=product.id, slug=product.slug, permanent=True)

    display_variants = product.display_product_variants
    sku_payload = product.sku_payload
    available_variants = product.available_product_variants
    requested_variant_ids = set(request.GET.getlist("variant_id"))
    requested_variant_ids.update(
        value for value in (request.GET.get("variant_ids") or "").split(",") if value
    )
    display_variant_groups = []
    for product_variant in display_variants:
        group_name = product_variant.get("group") or "Вариант"
        if not display_variant_groups or display_variant_groups[-1]["name"] != group_name:
            display_variant_groups.append({
                "name": group_name,
                "variants": [],
                "has_images": False,
            })
        display_variant_groups[-1]["variants"].append(product_variant)
        if product_variant.get("image_url"):
            display_variant_groups[-1]["has_images"] = True
    is_product_available = (
        any(item["available"] for item in sku_payload)
        if sku_payload
        else product.stock > 0 and (not display_variants or bool(available_variants))
    )

    liked_product_ids = get_liked_product_ids(request)
    liked_review_ids = get_liked_review_ids(request)
    product.is_liked = product.id in liked_product_ids
    product.badge_data = product.get_badge_data()
    product_price_saving = None
    if product.old_price and product.price and product.old_price > product.price:
        product_price_saving = product.old_price - product.price
    additional_images = list(product.additional_images.all().order_by("order", "id"))
    image_variants = [product_variant for product_variant in available_variants if product_variant.image]
    initial_gallery_variant = next(
        (
            product_variant for product_variant in image_variants
            if str(product_variant.id) in requested_variant_ids
        ),
        image_variants[0] if image_variants else None,
    )
    if initial_gallery_variant:
        gallery_start_image_url = get_image_original_url(initial_gallery_variant.image)
        gallery_start_image_alt = initial_gallery_variant.variant.name
    elif additional_images:
        first_gallery_image = additional_images[0]
        gallery_start_image_url = get_image_original_url(first_gallery_image.image)
        gallery_start_image_alt = first_gallery_image.alt_text or product.name
    elif product.image:
        gallery_start_image_url = get_image_original_url(product.image)
        gallery_start_image_alt = product.name
    else:
        gallery_start_image_url = ""
        gallery_start_image_alt = ""
    product_reviews = list(
        ProductReview.objects.filter(product=product, is_approved=True)
        .select_related("user")
        .order_by("-created")
    )
    product_reviews_count = len(product_reviews)
    product_average_rating = None
    if product_reviews_count:
      product_average_rating = round(
          sum(review.rating for review in product_reviews) / product_reviews_count,
          1,
      )
    product_rating_summary = {
        "count": product_reviews_count,
        "average": product_average_rating,
    }
    product_specifications = list(product.specifications.all().order_by("order", "id"))

    also_chosen_candidates = list(
        with_product_card_review_stats(Product.objects.filter(
            also_chosen_for__product=product,
            available=True,
            stock__gt=0,
        ))
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch, product_specification_prefetch)
        .exclude(id=product.id)
        .order_by("also_chosen_for__sort_order", "also_chosen_for__id")
    )
    also_chosen_products = [
        item for item in also_chosen_candidates
        if is_product_visible_in_recommendations(item)
    ][:5]
    also_chosen_product_ids = {item.id for item in also_chosen_products}

    related_candidates = list(
        with_product_card_review_stats(Product.objects.filter(
            category=product.category,
            available=True,
            stock__gt=0,
        ))
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch, product_specification_prefetch)
        .exclude(id=product.id)
    )
    related_products = [
        item for item in related_candidates
        if item.id not in also_chosen_product_ids and is_product_visible_in_recommendations(item)
    ][:5]
    mark_liked_products(also_chosen_products, liked_product_ids)
    mark_liked_products(related_products, liked_product_ids)

    return render(request, "site/product_detail/product_detail_page.html", {
        "product": product,
        "product_price_saving": product_price_saving,
        "is_product_available": is_product_available,
        "also_chosen_products": also_chosen_products,
        "related_products": related_products,
        "is_liked": product.is_liked,
        "badge": product.badge_data,
        "available_variants": available_variants,
        "display_variants": display_variants,
        "sku_payload_json": json.dumps(sku_payload),
        "has_product_skus": bool(sku_payload),
        "display_variant_groups": display_variant_groups,
        "initial_gallery_variant": initial_gallery_variant,
        "gallery_start_image_url": gallery_start_image_url,
        "gallery_start_image_alt": gallery_start_image_alt,
        "additional_images": additional_images,
        "product_reviews": product_reviews,
        "product_reviews_count": product_reviews_count,
        "product_average_rating": product_average_rating,
        "product_rating_summary": product_rating_summary,
        "product_specifications": product_specifications,
        "liked_review_ids": liked_review_ids,
    })


@require_POST
def product_like(request, id):
    product = get_object_or_404(Product, id=id, available=True)
    if not request.user.is_authenticated:
        liked_ids = set(request.session.get("liked_product_ids", []))
        if product.id in liked_ids:
            liked_ids.remove(product.id)
            liked = False
            Product.objects.filter(pk=product.id, likes__gt=0).update(likes=F("likes") - 1)
        else:
            liked_ids.add(product.id)
            liked = True
            Product.objects.filter(pk=product.id).update(likes=F("likes") + 1)
        request.session["liked_product_ids"] = list(liked_ids)
        request.session.modified = True
        product.refresh_from_db(fields=("likes",))
        return JsonResponse({"liked": liked, "likes": product.display_likes})

    like = ProductLike.objects.filter(user=request.user, product=product).first()
    if like:
        like.delete()
        liked = False
    else:
        ProductLike.objects.create(user=request.user, product=product)
        liked = True

    product.refresh_from_db(fields=("likes",))
    return JsonResponse({"liked": liked, "likes": product.display_likes})
