from django.urls import path
from . import views

app_name = 'main'

urlpatterns = [
    path('', views.home, name='home'),
    path('catalog/', views.catalog, name='catalog'),
    path('reviews/', views.reviews, name='reviews'),
    path('products/', views.product_list, name='product_list'),
    path('products/<slug:category_slug>/', views.product_list,
         name='product_list_by_category'),
    path('products/<int:id>/<slug:slug>/', views.product_detail,
         name='product_detail'),
]
