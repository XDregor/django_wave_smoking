from django.db import transaction

from .shared import *


def normalize_cart_variant_ids(values):
    return tuple(sorted({int(value) for value in (values or []) if value}))


def get_cart_item_identity(item):
    variant_ids = normalize_cart_variant_ids(item.selected_variant_ids)
    if item.product_sku_id:
        return ("sku", item.product_id, item.product_sku_id)
    if variant_ids:
        return ("variants", item.product_id, variant_ids)
    if item.product_variant_id:
        return ("variant", item.product_id, item.product_variant_id)
    return ("product", item.product_id)


def build_cart_item_identity(product, product_sku, product_variant, selected_variant_ids):
    variant_ids = normalize_cart_variant_ids(selected_variant_ids)
    if product_sku:
        return ("sku", product.id, product_sku.id)
    if variant_ids:
        return ("variants", product.id, variant_ids)
    if product_variant:
        return ("variant", product.id, product_variant.id)
    return ("product", product.id)


def get_canonical_selected_variant_ids(item):
    if item.product_sku_id:
        return list(normalize_cart_variant_ids(option.id for option in item.product_sku.options.all()))
    if item.selected_variant_ids:
        return list(normalize_cart_variant_ids(item.selected_variant_ids))
    if item.product_variant_id:
        return [item.product_variant_id]
    return []


def merge_duplicate_cart_items(cart):
    items = list(
        CartItem.objects.select_for_update()
        .prefetch_related("product_sku__options")
        .filter(cart=cart)
        .order_by("product_id", "product_sku_id", "product_variant_id", "id")
    )
    grouped_items = {}
    for item in items:
        grouped_items.setdefault(get_cart_item_identity(item), []).append(item)

    for duplicates in grouped_items.values():
        primary = duplicates[0]
        canonical_variant_ids = get_canonical_selected_variant_ids(primary)
        if len(duplicates) < 2:
            if list(primary.selected_variant_ids or []) != canonical_variant_ids:
                primary.selected_variant_ids = canonical_variant_ids
                primary.save(update_fields=("selected_variant_ids", "updated"))
            continue
        extra_items = duplicates[1:]
        primary.quantity = sum(item.quantity for item in duplicates)
        primary.selected_variant_ids = canonical_variant_ids
        primary.save(update_fields=("quantity", "selected_variant_ids", "updated"))
        CartItem.objects.filter(id__in=[item.id for item in extra_items]).delete()


def get_matching_cart_items(cart, product, product_sku, product_variant, selected_variant_ids):
    expected_identity = build_cart_item_identity(product, product_sku, product_variant, selected_variant_ids)
    candidates = CartItem.objects.select_for_update().filter(
        cart=cart,
        product=product,
    )
    return [
        item
        for item in candidates
        if get_cart_item_identity(item) == expected_identity
    ]


def validate_cart_item_stock(product_sku, product_variant, selected_variant_ids, quantity):
    if product_sku and quantity > product_sku.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)
    if product_variant and quantity > product_variant.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)
    if selected_variant_ids and not product_sku:
        selected_variants = ProductVariant.objects.filter(id__in=selected_variant_ids)
        if any(quantity > selected_variant.stock for selected_variant in selected_variants):
            return JsonResponse({"error": "Not enough stock"}, status=400)
    return None

@require_GET
def api_cart(request):
    cart = get_or_create_cart(request)
    with transaction.atomic():
        Cart.objects.select_for_update().get(pk=cart.pk)
        merge_duplicate_cart_items(cart)
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
    variant_ids = list(normalize_cart_variant_ids(variant_ids))
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
        selected_variant_ids = list(normalize_cart_variant_ids(option.id for option in product_sku.options.all()))
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
        selected_variant_ids = list(normalize_cart_variant_ids(variant.id for variant in selected_variants))
        if len(selected_variants) == 1:
            product_variant = selected_variants[0]
    elif product.stock and quantity > product.stock:
        return JsonResponse({"error": "Not enough stock"}, status=400)

    cart = get_or_create_cart(request)
    with transaction.atomic():
        Cart.objects.select_for_update().get(pk=cart.pk)
        matching_items = get_matching_cart_items(cart, product, product_sku, product_variant, selected_variant_ids)
        if not matching_items:
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
            item, *duplicates = matching_items
            next_quantity = sum(cart_item.quantity for cart_item in matching_items) + quantity
            stock_error = validate_cart_item_stock(product_sku, product_variant, selected_variant_ids, next_quantity)
            if stock_error:
                return stock_error
            item.quantity = next_quantity
            item.selected_variant_ids = selected_variant_ids
            item.save(update_fields=("quantity", "selected_variant_ids", "updated"))
            if duplicates:
                CartItem.objects.filter(id__in=[cart_item.id for cart_item in duplicates]).delete()

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
