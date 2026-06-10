from django.contrib import admin

from .models import Brand, Category, Product, ProductLike, ProductVariant, VariantOption


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
    inlines = (ProductVariantInline,)
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


@admin.register(ProductLike)
class ProductLikeAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created")
    list_filter = ("created",)
    search_fields = ("user__username", "product__name")
    readonly_fields = ("created",)
