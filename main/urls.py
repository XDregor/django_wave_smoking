from django.urls import path
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.home, name='home'),
    path('catalog/', views.catalog, name='catalog'),
    path('reviews/', views.reviews, name='reviews'),
    path('products/', views.product_list, name='product_list'),
    path('products/<int:id>/like/', views.product_like, name='product_like'),
    path('api/favorites/', views.api_favorites, name='api_favorites'),
    path('api/cart/', views.api_cart, name='api_cart'),
    path('api/cart/add/', views.api_cart_add, name='api_cart_add'),
    path('api/cart/<int:item_id>/', views.api_cart_item, name='api_cart_item'),
    path('api/cart/clear/', views.api_cart_clear, name='api_cart_clear'),
    path('api/reviews/create/', views.api_review_create, name='api_review_create'),
    path('api/reviews/<int:id>/vote/', views.api_review_vote, name='api_review_vote'),
    path('products/<slug:category_slug>/', views.product_list,
         name='product_list_by_category'),
    path('products/<int:id>/<slug:slug>/', views.product_detail,
         name='product_detail'),
]
