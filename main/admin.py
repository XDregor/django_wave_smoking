from django import forms
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db.models import Avg, Count, Sum
from django.utils.html import format_html

try:
    from unfold.admin import ModelAdmin, TabularInline
except ImportError:  # Keeps local checks usable when django-unfold is not installed.
    from django.contrib.admin import ModelAdmin, TabularInline

from .models import (
    Brand,
    Cart,
    CartItem,
    Category,
    Product,
    ProductAlsoChosen,
    ProductImage,
    ProductLike,
    ProductReview,
    ProductReviewHelpful,
    ProductSpecification,
    ProductVariant,
    VariantOption,
)


User = get_user_model()


class BusinessAdminMixin:
    save_on_top = True


class HiddenFromMenuAdminMixin:
    def has_module_permission(self, request):
        return False


class SuperuserOnlyAdminMixin:
    def has_module_permission(self, request):
        return bool(request.user and request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)

    def has_add_permission(self, request):
        return bool(request.user and request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_superuser)


class VariantOptionInline(TabularInline):
    model = VariantOption
    extra = 0
    fields = ("group", "name", "slug", "order")
    prepopulated_fields = {"slug": ("name",)}
    show_change_link = True


class ProductVariantInline(TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("variant", "image", "stock", "available")
    autocomplete_fields = ("variant",)
    show_change_link = True


class ProductImageInline(TabularInline):
    model = ProductImage
    extra = 0
    fields = ("image", "order", "alt_text")
    show_change_link = True


class ProductSpecificationInline(TabularInline):
    model = ProductSpecification
    extra = 0
    fields = ("name", "value", "order")
    show_change_link = True


class ProductAlsoChosenInline(TabularInline):
    model = ProductAlsoChosen
    fk_name = "product"
    extra = 0
    fields = ("recommended_product", "sort_order")
    autocomplete_fields = ("recommended_product",)
    show_change_link = True


class ProductAdminForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        if not cleaned_data.get("available"):
            return cleaned_data

        missing_fields = []
        for field_name, label in (
            ("name", "название"),
            ("category", "категория"),
            ("brand", "бренд"),
            ("description", "описание"),
            ("image", "основное изображение"),
            ("old_price", "цена"),
        ):
            if not cleaned_data.get(field_name):
                missing_fields.append(label)

        if missing_fields:
            raise ValidationError(
                "Нельзя публиковать товар без обязательных данных: "
                + ", ".join(missing_fields)
                + "."
            )
        return cleaned_data


@admin.register(Product)
class ProductAdmin(BusinessAdminMixin, ModelAdmin):
    form = ProductAdminForm
    list_display = (
        "preview",
        "name",
        "brand",
        "category",
        "stock_badge",
        "price_badge",
        "discount_badge",
        "publication_badge",
        "likes",
        "created",
    )
    list_filter = ("available", "brand", "category", "badge_type", "created", "updated")
    list_select_related = ("brand", "category")
    search_fields = ("name", "brand__name", "category__name", "product_variants__variant__name")
    readonly_fields = (
        "slug",
        "created",
        "updated",
        "likes",
        "computed_stock",
        "review_summary",
        "product_state_summary",
    )
    autocomplete_fields = ("brand", "category")
    inlines = (
        ProductImageInline,
        ProductSpecificationInline,
        ProductVariantInline,
        ProductAlsoChosenInline,
    )
    fieldsets = (
        ("Обзор", {
            "fields": ("product_state_summary", "computed_stock", "review_summary"),
        }),
        ("Основное", {
            "fields": ("name", "category", "brand", "badge_type"),
        }),
        ("Описание", {
            "fields": ("description", "specifications_text"),
        }),
        ("Медиа", {
            "fields": ("image", "promo_video", "promo_video_poster"),
        }),
        ("Цены и остатки", {
            "description": "Если указан процент скидки, финальная цена пересчитается от базовой цены при сохранении.",
            "fields": ("old_price", "discount_percent", "price", "stock"),
        }),
        ("Публикация", {
            "fields": ("available",),
        }),
        ("Служебное", {
            "classes": ("collapse",),
            "fields": ("slug", "likes", "created", "updated"),
        }),
    )
    actions = ("publish_products", "unpublish_products")

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .select_related("brand", "category")
            .annotate(
                admin_review_count=Count("reviews"),
                admin_average_rating=Avg("reviews__rating"),
                admin_variant_stock=Sum("product_variants__stock"),
            )
        )

    @admin.display(description="Превью")
    def preview(self, obj):
        if not obj.image:
            return format_html('<span class="wave-admin-muted">Нет фото</span>')
        return format_html(
            '<img class="wave-admin-product-thumb" src="{}" alt="">',
            obj.image.url,
        )

    @admin.display(description="Остаток", ordering="stock")
    def stock_badge(self, obj):
        value = int(obj.stock or 0)
        state = "ok" if value > 0 else "empty"
        return format_html('<span class="wave-admin-pill wave-admin-pill-{}">{}</span>', state, value)

    @admin.display(description="Цена", ordering="price")
    def price_badge(self, obj):
        return format_html('<span class="wave-admin-value">{} ₴</span>', obj.price)

    @admin.display(description="Скидка")
    def discount_badge(self, obj):
        discount = obj.get_discount_percent()
        if not discount:
            return format_html('<span class="wave-admin-muted">-</span>')
        return format_html('<span class="wave-admin-pill wave-admin-pill-accent">-{}%</span>', discount)

    @admin.display(description="Статус", ordering="available")
    def publication_badge(self, obj):
        if obj.available:
            return format_html('<span class="wave-admin-pill wave-admin-pill-ok">Опубликован</span>')
        return format_html('<span class="wave-admin-pill">Черновик</span>')

    @admin.display(description="Суммарный остаток")
    def computed_stock(self, obj):
        variant_stock = getattr(obj, "admin_variant_stock", None)
        if variant_stock is None:
            variant_stock = obj.product_variants.aggregate(total=Sum("stock"))["total"]
        return variant_stock if variant_stock is not None else obj.stock

    @admin.display(description="Отзывы")
    def review_summary(self, obj):
        count = getattr(obj, "admin_review_count", None)
        average = getattr(obj, "admin_average_rating", None)
        if count is None:
            reviews = obj.reviews.all()
            count = reviews.count()
            average = reviews.aggregate(value=Avg("rating"))["value"]
        if not count:
            return "Отзывов пока нет"
        return f"{count} отзывов, средняя оценка {round(float(average or 0), 1)}"

    @admin.display(description="Состояние товара")
    def product_state_summary(self, obj):
        parts = [
            f"Категория: {obj.category or '-'}",
            f"Бренд: {obj.brand or '-'}",
            f"Остаток: {obj.stock}",
            f"Цена: {obj.price} ₴",
        ]
        return format_html('<div class="wave-admin-summary">{}</div>', " · ".join(parts))

    @admin.action(description="Опубликовать выбранные товары")
    def publish_products(self, request, queryset):
        updated = queryset.update(available=True)
        self.message_user(request, f"Опубликовано товаров: {updated}")

    @admin.action(description="Снять выбранные товары с публикации")
    def unpublish_products(self, request, queryset):
        updated = queryset.update(available=False)
        self.message_user(request, f"Снято с публикации товаров: {updated}")


@admin.register(Category)
class CategoryAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "product_count")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = (VariantOptionInline,)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_product_count=Count("products"))

    @admin.display(description="Товаров")
    def product_count(self, obj):
        return obj.admin_product_count


@admin.register(Brand)
class BrandAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "product_count")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_product_count=Count("products"))

    @admin.display(description="Товаров")
    def product_count(self, obj):
        return obj.admin_product_count


@admin.register(ProductReview)
class ProductReviewAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = (
        "author_name",
        "product",
        "rating_badge",
        "approval_badge",
        "is_verified",
        "helpful_count",
        "created",
    )
    list_filter = ("rating", "is_verified", "is_approved", "created", "product__brand")
    list_select_related = ("product", "product__brand", "user")
    search_fields = ("author_name", "product__name", "text", "user__username")
    list_editable = ("is_verified",)
    autocomplete_fields = ("product", "user")
    readonly_fields = ("created", "updated", "helpful_count")
    fields = (
        "product",
        "user",
        "author_name",
        "rating",
        "text",
        "is_verified",
        "is_approved",
        "helpful_count",
        "created",
        "updated",
    )
    actions = ("approve_reviews", "hide_reviews", "mark_verified")

    @admin.display(description="Оценка", ordering="rating")
    def rating_badge(self, obj):
        return format_html('<span class="wave-admin-value">{} / 5</span>', obj.rating)

    @admin.display(description="Публикация", ordering="is_approved")
    def approval_badge(self, obj):
        if obj.is_approved:
            return format_html('<span class="wave-admin-pill wave-admin-pill-ok">Опубликован</span>')
        return format_html('<span class="wave-admin-pill">Скрыт</span>')

    @admin.action(description="Одобрить выбранные отзывы")
    def approve_reviews(self, request, queryset):
        updated = queryset.update(is_approved=True)
        self.message_user(request, f"Одобрено отзывов: {updated}")

    @admin.action(description="Скрыть выбранные отзывы")
    def hide_reviews(self, request, queryset):
        updated = queryset.update(is_approved=False)
        self.message_user(request, f"Скрыто отзывов: {updated}")

    @admin.action(description="Пометить как проверенные")
    def mark_verified(self, request, queryset):
        updated = queryset.update(is_verified=True)
        self.message_user(request, f"Помечено проверенными: {updated}")


@admin.register(VariantOption)
class VariantOptionAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("name", "group", "category", "order", "slug")
    list_filter = ("category", "group")
    search_fields = ("name", "group", "category__name")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("category__name", "group", "order", "name")


@admin.register(ProductVariant)
class ProductVariantAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "variant", "stock", "available")
    list_filter = ("available", "variant__category", "variant__group")
    search_fields = ("product__name", "variant__name", "variant__group")
    autocomplete_fields = ("product", "variant")
    fields = ("product", "variant", "image", "stock", "available")


@admin.register(ProductImage)
class ProductImageAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "order", "alt_text", "created")
    search_fields = ("product__name", "alt_text")
    autocomplete_fields = ("product",)
    readonly_fields = ("created",)


@admin.register(ProductSpecification)
class ProductSpecificationAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "name", "value", "order")
    search_fields = ("product__name", "name", "value")
    autocomplete_fields = ("product",)
    ordering = ("product__name", "order", "id")


@admin.register(ProductAlsoChosen)
class ProductAlsoChosenAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "recommended_product", "sort_order")
    search_fields = ("product__name", "recommended_product__name")
    autocomplete_fields = ("product", "recommended_product")


@admin.register(ProductLike)
class ProductLikeAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("user", "product", "created")
    search_fields = ("user__username", "product__name")
    readonly_fields = ("created",)


@admin.register(ProductReviewHelpful)
class ProductReviewHelpfulAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("review", "user", "session_key", "created")
    search_fields = ("review__author_name", "review__product__name", "user__username", "session_key")
    autocomplete_fields = ("review", "user")
    readonly_fields = ("created",)


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


try:
    admin.site.unregister(Group)
except admin.sites.NotRegistered:
    pass

try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class WaveUserAdmin(BusinessAdminMixin, BaseUserAdmin):
    list_display = ("username", "email", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff", "is_superuser", "date_joined")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-date_joined",)

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        if request.user.is_superuser:
            return fieldsets
        return (
            (None, {"fields": ("username", "password")}),
            ("Клиент", {"fields": ("first_name", "last_name", "email", "is_active")}),
            ("Даты", {"fields": ("last_login", "date_joined")}),
        )

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            readonly.extend(("last_login", "date_joined"))
        return tuple(readonly)


@admin.register(LogEntry)
class ActionHistoryAdmin(ModelAdmin):
    list_display = ("action_time", "user", "content_type", "object_repr", "action_flag")
    list_filter = ("action_flag", "content_type", "action_time")
    search_fields = ("object_repr", "change_message", "user__username")
    readonly_fields = (
        "action_time",
        "user",
        "content_type",
        "object_id",
        "object_repr",
        "action_flag",
        "change_message",
    )
    date_hierarchy = "action_time"
    ordering = ("-action_time",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
