from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from .models import Category, Product, ProductLike


def mark_liked_products(products, liked_product_ids):
    for product in products:
        product.is_liked = product.id in liked_product_ids
    return products


def get_liked_product_ids(request):
    if not request.user.is_authenticated:
        return set()
    return set(
        ProductLike.objects.filter(user=request.user).values_list("product_id", flat=True)
    )


def home(request):
    products = list(Product.objects.filter(available=True).select_related("brand", "category")[:12])
    mark_liked_products(products, get_liked_product_ids(request))
    return render(request, "main/main.html", {
        "products": products,
        "disable_header_cursor": True,
    })


def catalog(request):
    products = list(Product.objects.filter(available=True).select_related("category", "brand"))
    liked_product_ids = get_liked_product_ids(request)
    mark_liked_products(products, liked_product_ids)

    products_data = [
        {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "brand": p.brand.name if p.brand else "",
            "price": float(p.price),
            "old_price": float(p.old_price) if p.old_price else None,
            "discount_percent": p.get_discount_percent(),
            "stock": p.stock,
            "image_url": p.image.url if p.image else None,
            "badge": p.get_badge_data(),
            "likes": p.likes,
            "variants": p.variants or [],
            "available_variants": p.available_variants or [],
            "category": p.category.slug if p.category else None,
            "is_liked": p.id in liked_product_ids,
        }
        for p in products
    ]

    return render(request, "main/сatalog.html", {
        "products": products,
        "products_json": products_data,
        "liked_product_ids": liked_product_ids,
    })


def reviews(request):
    return render(request, "main/reviews.html")


def product_list(request, category_slug=None):
    categories = Category.objects.all()
    products = Product.objects.filter(available=True).select_related("category", "brand")

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


def product_detail(request, id, slug):
    product = get_object_or_404(
        Product.objects.select_related("category", "brand"),
        id=id,
        slug=slug,
        available=True,
    )
    liked_product_ids = get_liked_product_ids(request)
    product.is_liked = product.id in liked_product_ids
    product.badge_data = product.get_badge_data()

    related_products = list(
        Product.objects.filter(category=product.category, available=True)
        .select_related("category", "brand")
        .exclude(id=product.id)[:4]
    )
    mark_liked_products(related_products, liked_product_ids)

    return render(request, "main/product/detail.html", {
        "product": product,
        "related_products": related_products,
        "is_liked": product.is_liked,
        "badge": product.badge_data,
    })


@require_POST
def product_like(request, id):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required"}, status=401)

    product = get_object_or_404(Product, id=id, available=True)
    like = ProductLike.objects.filter(user=request.user, product=product).first()
    if like:
        like.delete()
        liked = False
    else:
        ProductLike.objects.create(user=request.user, product=product)
        liked = True

    product.refresh_from_db(fields=("likes",))
    return JsonResponse({"liked": liked, "likes": product.likes})
