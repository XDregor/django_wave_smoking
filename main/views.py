import json
from decimal import Decimal

from django.http import Http404, JsonResponse
from django.db.models import F, Prefetch
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import Cart, CartItem, Category, Product, ProductLike, ProductVariant


available_variant_prefetch = Prefetch(
    "product_variants",
    queryset=ProductVariant.objects.select_related("variant").order_by(
        "variant__group",
        "variant__order",
        "variant__name",
    ),
)


def mark_liked_products(products, liked_product_ids):
    for product in products:
        product.is_liked = product.id in liked_product_ids
    return products


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


def serialize_cart_item(item):
    product = item.product
    selected_variant_ids = [int(value) for value in (item.selected_variant_ids or []) if value]
    if selected_variant_ids:
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
            "product_variant",
            "product_variant__variant",
        )
    )
    total_price = sum((item.total_price for item in items), Decimal("0.00"))
    total_quantity = sum(item.quantity for item in items)
    return {
        "items": [serialize_cart_item(item) for item in items],
        "total_price": float(total_price),
        "total_quantity": total_quantity,
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
        .prefetch_related(available_variant_prefetch)[:12]
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
        .prefetch_related(available_variant_prefetch)
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

    return render(request, "main/сatalog.html", {
        "products": products,
        "products_json": products_data,
        "categories_json": categories_data,
        "liked_product_ids": liked_product_ids,
    })


def reviews(request):
    return render(request, "main/reviews.html")


def product_list(request, category_slug=None):
    categories = Category.objects.all()
    products = (
        Product.objects.filter(available=True)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch)
    )

    category = None
    if category_slug:
        category = get_object_or_404(Category, slug=category_slug)
        products = products.filter(category=category)

    products = list(products)
    mark_liked_products(products, get_liked_product_ids(request))

    return render(request, "main/product/list.html", {
        "category": category,
        "categories": categories,
        "products": products,
    })


@ensure_csrf_cookie
def product_detail(request, id, slug):
    product = get_object_or_404(
        Product.objects.select_related("category", "brand").prefetch_related(
            available_variant_prefetch,
            "additional_images",
        ),
        id=id,
        slug=slug,
        available=True,
    )
    display_variants = product.display_product_variants
    available_variants = product.available_product_variants
    if product.stock <= 0 or (display_variants and not available_variants):
        raise Http404("Product is not available")

    liked_product_ids = get_liked_product_ids(request)
    product.is_liked = product.id in liked_product_ids
    product.badge_data = product.get_badge_data()
    additional_images = list(product.additional_images.all().order_by("order", "id"))

    related_products = list(
        Product.objects.filter(category=product.category, available=True)
        .select_related("category", "brand")
        .prefetch_related(available_variant_prefetch)
        .exclude(id=product.id)[:4]
    )
    mark_liked_products(related_products, liked_product_ids)

    return render(request, "main/product/detail.html", {
        "product": product,
        "related_products": related_products,
        "is_liked": product.is_liked,
        "badge": product.badge_data,
        "available_variants": available_variants,
        "display_variants": display_variants,
        "additional_images": additional_images,
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
        .prefetch_related(available_variant_prefetch)
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
    variant_id = payload.get("variant_id")
    variant_ids = payload.get("variant_ids") or []
    if variant_id and variant_id not in variant_ids:
        variant_ids = [variant_id, *variant_ids]
    variant_ids = sorted({int(value) for value in variant_ids if value})
    quantity = int(payload.get("quantity") or 1)
    if quantity < 1:
        return JsonResponse({"error": "Quantity must be at least 1"}, status=400)

    product = get_object_or_404(
        Product.objects.prefetch_related(available_variant_prefetch),
        id=product_id,
        available=True,
    )
    product_variant = None
    selected_variant_ids = []
    if product.product_variants.exists():
        if not variant_ids:
            return JsonResponse({"error": "Choose product variant"}, status=400)
        selected_variants = list(
            ProductVariant.objects.select_related("product", "variant")
            .filter(id__in=variant_ids, product=product)
            .order_by("variant__group", "variant__order", "variant__name")
        )
        found_ids = {variant.id for variant in selected_variants}
        if found_ids != set(variant_ids):
            return JsonResponse({"error": "Selected variant is not available"}, status=400)
        selected_groups = [variant.variant.group or "default" for variant in selected_variants]
        if len(selected_groups) != len(set(selected_groups)):
            return JsonResponse({"error": "Choose only one option per variant group"}, status=400)
        for selected_variant in selected_variants:
            if not selected_variant.available or selected_variant.stock <= 0:
                return JsonResponse({"error": "Selected variant is not available"}, status=400)
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
        product_variant=product_variant,
        selected_variant_ids=selected_variant_ids,
    ).first()
    created = item is None
    if created:
        item = CartItem.objects.create(
            cart=cart,
            product=product,
            product_variant=product_variant,
            selected_variant_ids=selected_variant_ids,
            quantity=quantity,
            price=product.price,
        )
    else:
        next_quantity = item.quantity + quantity
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
    if item.selected_variant_ids:
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
