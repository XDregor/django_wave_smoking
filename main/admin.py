from django.contrib import admin

from .models import Brand, Category, Product, ProductLike


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


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
        ("Variants", {
            "description": 'All variants example: ["0mg", "3mg", "6mg"]. Available variants must be a subset.',
            "fields": ("variants", "available_variants"),
        }),
        ("Badges and likes", {
            "fields": ("badge_type", "likes"),
        }),
        ("Dates", {
            "classes": ("collapse",),
            "fields": ("created", "updated"),
        }),
    )


@admin.register(ProductLike)
class ProductLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created")
    list_filter = ("created",)
    search_fields = ("user__username", "product__name")
    readonly_fields = ("created",)
