from .shared import *
from .product_list import ProductListAdminMixin
from .product_media import ProductMediaAdminMixin
from .product_sku import ProductSkuAdminMixin

class ProductVariantInline(TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("variant", "image", "image_order", "stock", "available")
    autocomplete_fields = ("variant",)
    show_change_link = True


class ProductSKUInline(TabularInline):
    model = ProductSKU
    extra = 0
    fields = ("sku_code", "options_display", "price", "old_price", "stock", "available", "sort_order")
    readonly_fields = ("options_display",)
    show_change_link = True

    @admin.display(description="Options")
    def options_display(self, obj):
        if not obj.pk:
            return "-"
        return ", ".join(option.name for option in obj.options.all()) or "-"


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
class ProductAdmin(
    ProductListAdminMixin,
    ProductMediaAdminMixin,
    ProductSkuAdminMixin,
    BusinessAdminMixin,
    ModelAdmin,
):
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
        "likes_adjustment",
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
        ProductSKUInline,
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
            "fields": ("description",),
        }),
        ("Медиа", {
            "fields": ("image", "promo_video", "promo_video_poster"),
        }),
        ("Цены и остатки", {
            "description": "Если указан процент скидки, финальная цена пересчитается от базовой цены при сохранении.",
            "fields": ("old_price", "discount_percent", "price", "stock", "sku_root_old_price", "sku_root_price"),
        }),
        ("Публикация", {
            "fields": ("available",),
        }),
        ("Служебное", {
            "classes": ("collapse",),
            "fields": ("slug", "likes", "likes_adjustment", "created", "updated"),
        }),
    )
    actions = ("publish_products", "unpublish_products")

    def get_urls(self):
        custom_urls = [
            path(
                "products/",
                self.admin_site.admin_view(self.products_list_view),
                name="main_product_products_list",
            ),
            path(
                "products/bulk-draft/",
                self.admin_site.admin_view(self.products_bulk_draft_view),
                name="main_product_products_bulk_draft",
            ),
            path(
                "products/bulk-publish/",
                self.admin_site.admin_view(self.products_bulk_publish_view),
                name="main_product_products_bulk_publish",
            ),
            path(
                "products/bulk-delete/",
                self.admin_site.admin_view(self.products_bulk_delete_view),
                name="main_product_products_bulk_delete",
            ),
            path(
                "add/sku/",
                self.admin_site.admin_view(self.add_sku_view),
                name="main_product_add_sku",
            ),
            path(
                "<int:product_id>/sku/",
                self.admin_site.admin_view(self.edit_sku_view),
                name="main_product_edit_sku",
            ),
            path(
                "add/sku/quick-add/",
                self.admin_site.admin_view(self.quick_add_sku_reference_view),
                name="main_product_add_sku_quick_add",
            ),
            path(
                "media/",
                self.admin_site.admin_view(self.media_products_view),
                name="main_product_media_list",
            ),
            path(
                "media/<int:product_id>/",
                self.admin_site.admin_view(self.product_media_view),
                name="main_product_media_detail",
            ),
        ]
        return custom_urls + super().get_urls()

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
