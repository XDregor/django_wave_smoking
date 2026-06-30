from .shared import *

class CartItemInline(TabularInline):
    model = CartItem
    extra = 0
    autocomplete_fields = ("product", "product_variant")
    readonly_fields = ("selected_variant_ids", "created", "updated")
    fields = ("product", "product_variant", "quantity", "price", "selected_variant_ids", "created", "updated")


@admin.register(Cart)
class CartAdmin(SuperuserOnlyAdminMixin, ModelAdmin):
    list_display = ("id", "user", "is_active", "total_quantity", "total_price", "updated")
    list_filter = ("is_active", "created", "updated")
    search_fields = ("user__username", "session_key")
    readonly_fields = ("created", "updated", "session_key", "total_quantity", "total_price")
    inlines = (CartItemInline,)


@admin.register(CartItem)
class CartItemAdmin(SuperuserOnlyAdminMixin, ModelAdmin):
    list_display = ("cart", "product", "product_variant", "quantity", "price", "updated")
    search_fields = ("product__name", "product_variant__variant__name")
    autocomplete_fields = ("cart", "product", "product_variant")
    readonly_fields = ("selected_variant_ids", "created", "updated")
