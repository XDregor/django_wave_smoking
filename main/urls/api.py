from django.urls import path

from .. import views


urlpatterns = [
    path("api/favorites/", views.api_favorites, name="api_favorites"),
    path("api/cart/", views.api_cart, name="api_cart"),
    path("api/cart/add/", views.api_cart_add, name="api_cart_add"),
    path("api/cart/<int:item_id>/", views.api_cart_item, name="api_cart_item"),
    path("api/cart/clear/", views.api_cart_clear, name="api_cart_clear"),
    path("api/client/auth/firebase/", views.api_client_firebase_auth, name="api_client_firebase_auth"),
    path("api/client/logout/", views.api_client_logout, name="api_client_logout"),
    path("api/search/products/", views.api_search_products, name="api_search_products"),
    path("api/reviews/create/", views.api_review_create, name="api_review_create"),
    path("api/reviews/<int:id>/vote/", views.api_review_vote, name="api_review_vote"),
]
