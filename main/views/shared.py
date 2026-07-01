import json
from decimal import Decimal

from django.http import JsonResponse
from django.db.models import Avg, Count, F, Prefetch, Q
from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from ..models import (
    Cart,
    CartItem,
    Brand,
    Category,
    Product,
    ProductLike,
    ProductReview,
    ProductReviewHelpful,
    ProductSKU,
    ProductVariant,
)


available_variant_prefetch = Prefetch(
    "product_variants",
    queryset=ProductVariant.objects.select_related("variant", "variant__group").order_by(
        "variant__group__order",
        "variant__group__name",
        "image_order",
        "variant__order",
        "variant__name",
    ),
)

product_sku_prefetch = Prefetch(
    "skus",
    queryset=ProductSKU.objects.prefetch_related("options").order_by("sort_order", "id"),
)


def with_product_card_review_stats(queryset):
    return queryset.annotate(
        card_review_count=Count(
            "reviews",
            filter=Q(reviews__is_approved=True),
            distinct=True,
        ),
        card_average_rating=Avg(
            "reviews__rating",
            filter=Q(reviews__is_approved=True),
        ),
    )


def mark_liked_products(products, liked_product_ids):
    for product in products:
        product.is_liked = product.id in liked_product_ids
    return products


def is_product_visible_in_recommendations(product):
    skus = product.sku_payload
    if skus:
        return any(item["available"] for item in skus)
    product_variants = product.display_product_variants
    available_variants = product.available_product_variants
    return product.stock > 0 and (not product_variants or bool(available_variants))


def get_image_original_url(image):
    if not image:
        return ""
    try:
        return image.url
    except ValueError:
        return ""


def get_image_thumbnail_url(owner, image):
    thumbnail_url = getattr(owner, "thumbnail_url", "") if owner is not None else ""
    return thumbnail_url or get_image_original_url(image)


def get_liked_product_ids(request):
    if not request.user.is_authenticated:
        return set(request.session.get("liked_product_ids", []))
    return set(
        ProductLike.objects.filter(user=request.user).values_list("product_id", flat=True)
    )


def get_or_create_cart(request):
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user, is_active=True, defaults={"session_key": ""})
        return cart

    if not request.session.session_key:
        request.session.create()
    cart, _ = Cart.objects.get_or_create(
        session_key=request.session.session_key,
        user=None,
        is_active=True,
    )
    return cart


def serialize_badge(product):
    return product.get_badge_data()


def serialize_product(product, liked_product_ids=None):
    liked_product_ids = liked_product_ids or set()
    review_count = int(getattr(product, "card_review_count", 0) or 0)
    average_rating = getattr(product, "card_average_rating", None)
    requires_selection = bool(product.sku_payload or product.display_product_variants)
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "brand_name": product.brand.name if product.brand else "",
        "category": product.category.slug if product.category else "",
        "price": float(product.price),
        "old_price": float(product.old_price) if product.old_price else None,
        "discount_percent": product.get_discount_percent(),
        "badge": serialize_badge(product),
        "image_url": product.image.url if product.image else None,
        "variant_options": product.variant_payload,
        "display_variant_options": product.display_variant_payload,
        "likes": product.display_likes,
        "is_liked": product.id in liked_product_ids,
        "review_count": review_count,
        "average_rating": round(float(average_rating), 1) if average_rating is not None else None,
        "requires_selection": requires_selection,
        "is_available": is_product_available_for_purchase(product),
        "detail_url": f"/products/{product.id}/{product.slug}/",
    }


def get_product_search_code(product):
    return f"654{str(product.id).zfill(4)}"


def normalize_product_search(value):
    return " ".join(str(value or "").lower().strip().split())


def product_matches_search(product, query):
    normalized_query = normalize_product_search(query)
    if not normalized_query:
        return True

    fields = [
        product.name,
        product.brand.name if product.brand else "",
        product.brand.slug if product.brand else "",
        product.category.name if product.category else "",
        product.category.slug if product.category else "",
        get_product_search_code(product),
        product.id,
    ]
    for product_variant in product.display_product_variants:
        fields.extend((
            product_variant.get("name"),
            product_variant.get("slug"),
            product_variant.get("group"),
        ))

    return any(normalized_query in normalize_product_search(field) for field in fields if field)


def get_product_search_rank(product, query):
    normalized_query = normalize_product_search(query)
    if not normalized_query:
        return 99

    code = normalize_product_search(get_product_search_code(product))
    name = normalize_product_search(product.name)
    brand = normalize_product_search(product.brand.name if product.brand else "")
    variant_values = [
        normalize_product_search(value)
        for product_variant in product.display_product_variants
        for value in (
            product_variant.get("name"),
            product_variant.get("slug"),
            product_variant.get("group"),
        )
        if value
    ]

    if code == normalized_query:
        return 0
    if name == normalized_query:
        return 1
    if name.startswith(normalized_query):
        return 2
    if normalized_query in brand:
        return 3
    if any(normalized_query in value for value in variant_values):
        return 4
    return 5


def is_product_available_for_purchase(product):
    skus = product.sku_payload
    if skus:
        return any(item["available"] for item in skus)
    display_variants = product.display_product_variants
    available_variants = product.available_product_variants
    return product.stock > 0 and (not display_variants or bool(available_variants))


def serialize_search_product(product):
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand.name if product.brand else "",
        "price": float(product.price),
        "image_url": product.image.url if product.image else "",
        "url": f"/products/{product.id}/{product.slug}/",
        "available": is_product_available_for_purchase(product),
        "code": get_product_search_code(product),
    }


def serialize_cart_item(item):
    product = item.product
    selected_variant_ids = [int(value) for value in (item.selected_variant_ids or []) if value]
    if item.product_sku_id:
        selected_options = list(item.product_sku.options.all())
        selected_variant_ids = [option.id for option in selected_options]
        variant_name = ", ".join(option.name for option in selected_options)
    elif selected_variant_ids:
        variants_by_id = {
            variant.id: variant
            for variant in ProductVariant.objects.select_related("variant").filter(
                id__in=selected_variant_ids,
                product=product,
            )
        }
        variant_name = ", ".join(
            variants_by_id[variant_id].variant.name
            for variant_id in selected_variant_ids
            if variant_id in variants_by_id
        )
    else:
        variant_name = item.product_variant.variant.name if item.product_variant_id else ""
    return {
        "id": item.id,
        "product_id": product.id,
        "product_name": product.name,
        "product_slug": product.slug,
        "product_url": f"/products/{product.id}/{product.slug}/",
        "brand_name": product.brand.name if product.brand else "",
        "price": float(item.price),
        "old_price": float(product.old_price) if product.old_price else None,
        "badge": serialize_badge(product),
        "image_url": product.image.url if product.image else None,
        "product_sku_id": item.product_sku_id,
        "variant_id": item.product_variant_id,
        "variant_ids": selected_variant_ids,
        "variant_name": variant_name,
        "quantity": item.quantity,
        "total_price": float(item.total_price),
    }


def serialize_cart(cart):
    items = list(
        cart.items.select_related(
            "product",
            "product__brand",
            "product__category",
            "product_sku",
            "product_variant",
            "product_variant__variant",
        ).prefetch_related("product_sku__options")
    )
    total_price = sum((item.total_price for item in items), Decimal("0.00"))
    total_quantity = sum(item.quantity for item in items)
    return {
        "items": [serialize_cart_item(item) for item in items],
        "total_price": float(total_price),
        "total_quantity": total_quantity,
    }


def review_initials(name):
    parts = [part for part in name.split() if part]
    if not parts:
        return "?"
    return "".join(part[0] for part in parts[:2]).upper()


def get_liked_review_ids(request):
    if request.user.is_authenticated:
        return set(
            ProductReviewHelpful.objects.filter(user=request.user).values_list("review_id", flat=True)
        )
    if not request.session.session_key:
        return set()
    return set(
        ProductReviewHelpful.objects.filter(
            user__isnull=True,
            session_key=request.session.session_key,
        ).values_list("review_id", flat=True)
    )


def serialize_review(review, liked_review_ids=None):
    liked_review_ids = liked_review_ids or set()
    return {
        "id": review.id,
        "name": review.author_name,
        "avatar": review_initials(review.author_name),
        "rating": review.rating,
        "date": review.created.strftime("%d.%m.%Y"),
        "verified": review.is_verified,
        "product_id": review.product_id,
        "product": review.product.name,
        "product_url": f"/products/{review.product.id}/{review.product.slug}/",
        "text": review.text,
        "helpful": review.display_helpful_count,
        "liked": review.id in liked_review_ids,
    }


def parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return None
