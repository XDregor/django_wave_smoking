from django.shortcuts import get_object_or_404, render
from .models import Category, Product


def home(request):
    return render(request, 'main/main.html')


def catalog(request):
    return render(request, 'main/сatalog.html')


def reviews(request):
    return render(request, 'main/reviews.html')


def product_list(request, category_slug=None):
    categories = Category.objects.all()
    products = Product.objects.filter(available=True)

    category = None
    if category_slug:
        category = get_object_or_404(Category, slug=category_slug)
        products = products.filter(category=category)
    
    return render(request, 'main/product/list.html',
                  {'category': category,
                   'categories': categories,
                   'products': products})


def product_detail(request, id, slug):
    product = get_object_or_404(Product, id=id, slug=slug, available=True)
    related_products = Product.objects.filter(category=product.category,
                                              available=True).exclude(id=product.id)[:4]

    return render(request, 'main/product/detail.html',
                  {'product': product,
                   'related_products': related_products})
