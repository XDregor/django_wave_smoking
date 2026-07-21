from django.urls import path

from .. import views


urlpatterns = [
    path("", views.home, name="home"),
    path("catalog/", views.catalog, name="catalog"),
    path("reviews/", views.reviews, name="reviews"),
    path("products/", views.product_list, name="product_list"),
    path("products/<int:id>/like/", views.product_like, name="product_like"),
    path("products/<slug:category_slug>/", views.product_list, name="product_list_by_category"),
    path("products/<int:id>/<slug:slug>/", views.product_detail, name="product_detail"),
    path("<path:unmatched_path>", views.public_not_found, name="public_not_found"),
]
