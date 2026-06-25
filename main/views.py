import json
from decimal import Decimal

from django.http import JsonResponse
from django.db.models import Avg, Count, F, Prefetch, Q
from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import (
    Cart,
    CartItem,
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
        "variant__order",
        "variant__name",
    ),
)

product_sku_prefetch = Prefetch(
    "skus",
    queryset=ProductSKU.objects.prefetch_related("options").order_by("sort_order", "id"),
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
        "likes": product.likes,
        "is_liked": product.id in liked_product_ids,
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
        "helpful": review.helpful_count,
        "liked": review.id in liked_review_ids,
    }


def parse_json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return None


@ensure_csrf_cookie
def home(request):
    products = list(
        Product.objects.filter(available=True)
        .select_related("brand", "category")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)[:12]
    )
    mark_liked_products(products, get_liked_product_ids(request))
    return render(request, "main/main.html", {
        "products": products,
        "disable_header_cursor": True,
    })


@ensure_csrf_cookie
def catalog(request):
    products = list(
        Product.objects.filter(available=True)
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

    return render(request, "main/сatalog.html", {
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
        -int(product.likes or 0),
        product.name.lower(),
    ))

    return JsonResponse({
        "results": [serialize_search_product(product) for product in matched_products[:6]],
        "total": len(matched_products),
    })


@ensure_csrf_cookie
def reviews(request):
    reviews_qs = (
        ProductReview.objects
        .filter(is_approved=True)
        .select_related("product", "product__brand", "user")
        .order_by("-created")
    )
    reviews_list = list(reviews_qs)
    total_count = len(reviews_list)
    average_rating = reviews_qs.aggregate(value=Avg("rating"))["value"] or 0
    rating_counts_raw = dict(reviews_qs.values_list("rating").annotate(count=Count("id")))
    rating_counts = {rating: rating_counts_raw.get(rating, 0) for rating in range(1, 6)}
    verified_count = sum(1 for review in reviews_list if review.is_verified)
    rating_summary = {
        "total": total_count,
        "average": round(float(average_rating), 1) if total_count else 0.0,
        "counts": rating_counts,
        "count_1": rating_counts[1],
        "count_2": rating_counts[2],
        "count_3": rating_counts[3],
        "count_4": rating_counts[4],
        "count_5": rating_counts[5],
        "verified": verified_count,
    }
    liked_review_ids = get_liked_review_ids(request)
    products_for_review = list(
        Product.objects.filter(available=True)
        .select_related("brand", "category")
        .annotate(
            review_count=Count("reviews", filter=Q(reviews__is_approved=True)),
            average_rating=Avg("reviews__rating", filter=Q(reviews__is_approved=True)),
        )
        .order_by("name")
    )
    products_json = [
        {
            "id": product.id,
            "name": product.name,
            "brand": product.brand.name if product.brand else "",
            "code": f"{product.id:04d}",
            "review_count": product.review_count,
            "average_rating": round(float(product.average_rating), 1) if product.average_rating else 0,
        }
        for product in products_for_review
    ]
    return render(request, "main/reviews.html", {
        "reviews": reviews_list,
        "reviews_json": [serialize_review(review, liked_review_ids) for review in reviews_list],
        "products_for_review": products_for_review,
        "products_json": products_json,
        "rating_summary": rating_summary,
    })


def product_list(request, category_slug=None):
    categories = Category.objects.all()
    products_queryset = (
        Product.objects.filter(available=True)
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

    return render(request, "main/сatalog.html", {
        "category": category,
        "categories": categories,
        "products": products,
        "products_json": products_data,
        "categories_json": categories_data,
        "liked_product_ids": liked_product_ids,
    })


@ensure_csrf_cookie
def product_detail(request, id, slug):
    product = (
        Product.objects.select_related("category", "brand").prefetch_related(
            available_variant_prefetch,
            product_sku_prefetch,
            "additional_images",
            "specifications",
        )
        .filter(id=id, slug=slug, available=True)
        .first()
    )
    if not product:
        messages.info(request, "Товар больше недоступен.")
        return redirect("main:catalog")

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
        Product.objects.filter(also_chosen_for__product=product, available=True, stock__gt=0)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
        .exclude(id=product.id)
        .order_by("also_chosen_for__sort_order", "also_chosen_for__id")
    )
    also_chosen_products = [
        item for item in also_chosen_candidates
        if is_product_visible_in_recommendations(item)
    ][:5]
    also_chosen_product_ids = {item.id for item in also_chosen_products}

    related_candidates = list(
        Product.objects.filter(category=product.category, available=True, stock__gt=0)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch, product_sku_prefetch)
        .exclude(id=product.id)
    )
    related_products = [
        item for item in related_candidates
        if item.id not in also_chosen_product_ids and is_product_visible_in_recommendations(item)
    ][:5]
    mark_liked_products(also_chosen_products, liked_product_ids)
    mark_liked_products(related_products, liked_product_ids)

    return render(request, "main/includes/product_detail.html", {
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
        return JsonResponse({"liked": liked, "likes": product.likes})

    like = ProductLike.objects.filter(user=request.user, product=product).first()
    if like:
        like.delete()
        liked = False
    else:
        ProductLike.objects.create(user=request.user, product=product)
        liked = True

    product.refresh_from_db(fields=("likes",))
    return JsonResponse({"liked": liked, "likes": product.likes})


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


@require_GET
def api_cart(request):
    cart = get_or_create_cart(request)
    return JsonResponse(serialize_cart(cart))


@require_POST
def api_cart_add(request):
    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    product_id = payload.get("product_id")
    product_sku_id = payload.get("product_sku_id")
    variant_id = payload.get("variant_id")
    variant_ids = payload.get("variant_ids") or []
    if variant_id and variant_id not in variant_ids:
        variant_ids = [variant_id, *variant_ids]
    variant_ids = sorted({int(value) for value in variant_ids if value})
    quantity = int(payload.get("quantity") or 1)
    if quantity < 1:
        return JsonResponse({"error": "Quantity must be at least 1"}, status=400)

    product = get_object_or_404(
        Product.objects.prefetch_related(available_variant_prefetch, product_sku_prefetch),
        id=product_id,
        available=True,
    )
    if product.stock <= 0:
        return JsonResponse(
            {"success": False, "error": "out_of_stock", "message": "Товар закончился"},
            status=409,
        )

    product_variant = None
    product_sku = None
    selected_variant_ids = []
    if product.skus.exists():
        if not product_sku_id:
            return JsonResponse({"error": "Choose product SKU"}, status=400)
        product_sku = ProductSKU.objects.prefetch_related("options").filter(id=product_sku_id, product=product).first()
        if product_sku is None:
            return JsonResponse({"error": "Choose product SKU"}, status=400)
        if not product_sku.available or product_sku.stock <= 0:
            return JsonResponse(
                {"success": False, "error": "out_of_stock", "message": "Товар закончился"},
                status=409,
            )
        if quantity > product_sku.stock:
            return JsonResponse({"error": "Not enough stock"}, status=400)
        selected_variant_ids = [option.id for option in product_sku.options.all()]
    elif product.product_variants.exists():
        if not variant_ids:
            return JsonResponse({"error": "Choose product variant"}, status=400)
        selected_variants = list(
            ProductVariant.objects.select_related("product", "variant")
            .filter(id__in=variant_ids, product=product)
            .order_by("variant__group__order", "variant__group__name", "variant__order", "variant__name")
        )
        found_ids = {variant.id for variant in selected_variants}
        if found_ids != set(variant_ids):
            return JsonResponse({"error": "Selected variant is not available"}, status=400)
        selected_groups = [variant.variant.group_id or "default" for variant in selected_variants]
        if len(selected_groups) != len(set(selected_groups)):
            return JsonResponse({"error": "Choose only one option per variant group"}, status=400)
        for selected_variant in selected_variants:
            if not selected_variant.available or selected_variant.stock <= 0:
                return JsonResponse(
                    {"success": False, "error": "out_of_stock", "message": "Товар закончился"},
                    status=409,
                )
            if quantity > selected_variant.stock:
                return JsonResponse({"error": "Not enough stock"}, status=400)
        selected_variant_ids = [variant.id for variant in selected_variants]
        if len(selected_variants) == 1:
            product_variant = selected_variants[0]
    elif product.stock and quantity > product.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)

    cart = get_or_create_cart(request)
    item = CartItem.objects.filter(
        cart=cart,
        product=product,
        product_sku=product_sku,
        product_variant=product_variant,
        selected_variant_ids=selected_variant_ids,
    ).first()
    created = item is None
    if created:
        item = CartItem.objects.create(
            cart=cart,
            product=product,
            product_sku=product_sku,
            product_variant=product_variant,
            selected_variant_ids=selected_variant_ids,
            quantity=quantity,
            price=product_sku.price if product_sku else product.price,
        )
    else:
        next_quantity = item.quantity + quantity
        if product_sku and next_quantity > product_sku.stock:
            return JsonResponse({"error": "Not enough stock"}, status=400)
        if product_variant and next_quantity > product_variant.stock:
            return JsonResponse({"error": "Not enough stock"}, status=400)
        if selected_variant_ids:
            selected_variants = ProductVariant.objects.filter(id__in=selected_variant_ids)
            if any(next_quantity > selected_variant.stock for selected_variant in selected_variants):
                return JsonResponse({"error": "Not enough stock"}, status=400)
        item.quantity = next_quantity
        item.save(update_fields=("quantity", "updated"))

    return JsonResponse({"ok": True, "cart": serialize_cart(cart)})


@require_http_methods(["PATCH", "DELETE"])
def api_cart_item(request, item_id):
    cart = get_or_create_cart(request)
    item = get_object_or_404(CartItem, id=item_id, cart=cart)

    if request.method == "DELETE":
        item.delete()
        return JsonResponse({"ok": True, "cart": serialize_cart(cart)})

    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    quantity = int(payload.get("quantity") or 1)
    if quantity < 1:
        item.delete()
        return JsonResponse({"ok": True, "cart": serialize_cart(cart)})
    if item.product_sku_id and quantity > item.product_sku.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)
    if item.selected_variant_ids and not item.product_sku_id:
        selected_variants = ProductVariant.objects.filter(id__in=item.selected_variant_ids)
        if any(quantity > selected_variant.stock for selected_variant in selected_variants):
            return JsonResponse({"error": "Not enough stock"}, status=400)
    elif item.product_variant_id and quantity > item.product_variant.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)

    item.quantity = quantity
    item.save(update_fields=("quantity", "updated"))
    return JsonResponse({"ok": True, "cart": serialize_cart(cart)})


@require_POST
def api_cart_clear(request):
    cart = get_or_create_cart(request)
    cart.items.all().delete()
    return JsonResponse({"ok": True, "cart": serialize_cart(cart)})


@require_POST
def api_review_create(request):
    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    product_id = payload.get("product_id")
    author_name = (payload.get("author_name") or "").strip() or "Аноним"
    text = (payload.get("text") or "").strip()
    try:
        rating = int(payload.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0

    if rating < 1 or rating > 5:
        return JsonResponse({"error": "Rating must be from 1 to 5"}, status=400)
    if not text:
        return JsonResponse({"error": "Review text is required"}, status=400)
    product = get_object_or_404(Product, id=product_id, available=True)
    review = ProductReview.objects.create(
        product=product,
        user=request.user if request.user.is_authenticated else None,
        author_name=request.user.get_username() if request.user.is_authenticated and not author_name else author_name,
        rating=rating,
        text=text,
        is_verified=request.user.is_authenticated,
        is_approved=True,
    )
    return JsonResponse({"ok": True, "review": serialize_review(review, get_liked_review_ids(request))})


@require_POST
def api_review_vote(request, id):
    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    if payload.get("vote") not in (None, "up"):
        return JsonResponse({"error": "Invalid vote"}, status=400)

    review = get_object_or_404(ProductReview, id=id, is_approved=True)

    if request.user.is_authenticated:
        vote = ProductReviewHelpful.objects.filter(review=review, user=request.user).first()
        vote_defaults = {"review": review, "user": request.user, "session_key": ""}
    else:
        if not request.session.session_key:
            request.session.create()
        vote = ProductReviewHelpful.objects.filter(
            review=review,
            user__isnull=True,
            session_key=request.session.session_key,
        ).first()
        vote_defaults = {"review": review, "user": None, "session_key": request.session.session_key}

    if vote:
        vote.delete()
        ProductReview.objects.filter(id=review.id, helpful_count__gt=0).update(helpful_count=F("helpful_count") - 1)
        liked = False
    else:
        ProductReviewHelpful.objects.create(**vote_defaults)
        ProductReview.objects.filter(id=review.id).update(helpful_count=F("helpful_count") + 1)
        liked = True

    review.refresh_from_db(fields=("helpful_count",))
    return JsonResponse({
        "ok": True,
        "helpful": review.helpful_count,
        "liked": liked,
    })
