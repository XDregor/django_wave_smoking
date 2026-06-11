from django.contrib import admin

from .models import Brand, Cart, CartItem, Category, Product, ProductImage, ProductLike, ProductVariant, VariantOption


class VariantOptionInline(admin.TabularInline):
    model = VariantOption
    extra = 1
    fields = ("group", "name", "slug", "order")
    prepopulated_fields = {"slug": ("name",)}


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1
    fields = ("variant", "stock", "available")
    autocomplete_fields = ("variant",)


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "order", "alt_text")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = (VariantOptionInline,)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "brand",
        "stock",
        "old_price",
        "price",
        "discount_percent",
        "available",
        "likes",
    )
    list_filter = ("brand", "badge_type", "available", "category", "created", "updated")
    list_editable = ("available", "likes")
    readonly_fields = ("slug", "created", "updated")
    search_fields = ("name", "brand__name", "category__name")
    inlines = (ProductVariantInline, ProductImageInline)
    fieldsets = (
        ("Main", {
            "fields": ("category", "brand", "name", "slug", "image", "description"),
        }),
        ("Price and discount", {
            "description": "If discount percent is set, final price is recalculated from base price on save.",
            "fields": ("old_price", "price", "discount_percent"),
        }),
        ("Availability", {
            "fields": ("stock", "available"),
        }),
        ("Badges and likes", {
            "fields": ("badge_type", "likes"),
        }),
        ("Dates", {
            "classes": ("collapse",),
            "fields": ("created", "updated"),
        }),
    )

@admin.register(VariantOption)
class VariantOptionAdmin(admin.ModelAdmin):
    list_display = ("name", "group", "category", "order", "slug")
    list_filter = ("category", "group")
    search_fields = ("name", "group", "category__name")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("category__name", "group", "order", "name")


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "variant", "stock", "available")
    list_filter = ("available", "variant__category", "variant__group")
    search_fields = ("product__name", "variant__name", "variant__group")
    autocomplete_fields = ("product", "variant")


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "order", "alt_text", "created")
    list_filter = ("created",)
    search_fields = ("product__name", "alt_text")
    autocomplete_fields = ("product",)
    readonly_fields = ("created",)


@admin.register(ProductLike)
class ProductLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created")
    list_filter = ("created",)
    search_fields = ("user__username", "product__name")
    readonly_fields = ("created",)


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    autocomplete_fields = ("product", "product_variant")
    readonly_fields = ("selected_variant_ids", "created", "updated")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "session_key", "is_active", "created", "updated")
    list_filter = ("is_active", "created", "updated")
    search_fields = ("user__username", "session_key")
    readonly_fields = ("created", "updated")
    inlines = (CartItemInline,)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("cart", "product", "product_variant", "selected_variant_ids", "quantity", "price", "updated")
    list_filter = ("created", "updated")
    search_fields = ("product__name", "product_variant__variant__name")
    autocomplete_fields = ("cart", "product", "product_variant")
    readonly_fields = ("created", "updated")
