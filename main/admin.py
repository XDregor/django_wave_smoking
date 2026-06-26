import json
from decimal import Decimal, InvalidOperation

from django import forms
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Sum
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html, strip_tags

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
    ProductSKU,
    ProductSpecification,
    ProductVariant,
    VariantGroup,
    VariantOption,
    sanitize_product_description,
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


class ProductVariantInline(TabularInline):
    model = ProductVariant
    extra = 0
    fields = ("variant", "image", "stock", "available")
    autocomplete_fields = ("variant",)
    show_change_link = True


class VariantOptionInline(TabularInline):
    model = VariantOption
    extra = 0
    fields = ("name", "slug", "order")
    readonly_fields = ("slug",)
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
            "fields": ("slug", "likes", "created", "updated"),
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

    def changelist_view(self, request, extra_context=None):
        return redirect("admin:main_product_products_list")

    def products_list_view(self, request):
        products = (
            Product.objects.select_related("brand", "category")
            .prefetch_related("skus__options", "specifications")
            .order_by("-created", "-id")
        )
        context = {
            **self.admin_site.each_context(request),
            "title": "Управление товарами",
            "products_payload": [self.serialize_admin_product(product) for product in products],
            "add_product_url": reverse("admin:main_product_add_sku"),
            "products_list_url": reverse("admin:main_product_products_list"),
            "bulk_draft_url": reverse("admin:main_product_products_bulk_draft"),
            "bulk_publish_url": reverse("admin:main_product_products_bulk_publish"),
            "bulk_delete_url": reverse("admin:main_product_products_bulk_delete"),
        }
        return TemplateResponse(request, "unfold/helpers/admin_products_list.html", context)

    def get_products_bulk_ids(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return []
        raw_ids = payload.get("ids") or []
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        return ids

    def products_bulk_draft_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "Не выбраны товары."}, status=400)
        updated = Product.objects.filter(pk__in=ids).update(available=False)
        return JsonResponse({"success": True, "updated": updated, "ids": [str(pk) for pk in ids]})

    def products_bulk_publish_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "No products selected."}, status=400)
        updated = Product.objects.filter(pk__in=ids).update(available=True)
        return JsonResponse({"success": True, "updated": updated, "ids": [str(pk) for pk in ids]})

    def products_bulk_delete_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "Не выбраны товары."}, status=400)
        products = Product.objects.filter(pk__in=ids)
        deleted_ids = [str(pk) for pk in products.values_list("pk", flat=True)]
        deleted_count, _ = products.delete()
        return JsonResponse({"success": True, "deleted": deleted_count, "ids": deleted_ids})

    def serialize_admin_product(self, product):
        badge = product.get_badge_data()
        skus = list(product.skus.all())
        image_url = ""
        if product.image:
            try:
                image_url = product.image.url
            except ValueError:
                image_url = ""
        return {
            "id": str(product.pk),
            "code": f"654{str(product.pk).zfill(4)}",
            "name": product.name,
            "category": product.category.name if product.category_id else "",
            "brand": product.brand.name if product.brand_id else "",
            "status": "published" if product.available else "draft",
            "badge": badge["type"] if badge else "",
            "badge_label": badge["label"] if badge else "",
            "price": float(product.price),
            "old_price": float(product.old_price) if product.is_on_sale else None,
            "stock": product.stock,
            "skus": [
                {
                    "name": ", ".join(option.name for option in sku.options.all()) or sku.sku_code or "SKU",
                    "qty": sku.stock,
                    "price": float(sku.price),
                    "available": bool(sku.available and sku.stock > 0),
                }
                for sku in skus
            ] or [
                {
                    "name": product.name,
                    "qty": product.stock,
                    "price": float(product.price),
                    "available": bool(product.available and product.stock > 0),
                }
            ],
            "chars": [
                {"k": specification.name, "v": specification.value}
                for specification in product.specifications.all()
            ],
            "description": strip_tags(product.description or ""),
            "img": image_url,
            "created_ts": int(product.created.timestamp()) if product.created else 0,
            "edit_url": reverse("admin:main_product_edit_sku", args=(product.pk,)),
        }

    def media_products_view(self, request):
        query = (request.GET.get("q") or "").strip()
        products = list(
            Product.objects.select_related("brand", "category")
            .annotate(admin_media_count=Count("additional_images"))
            .order_by("name")
        )
        if query:
            normalized_query = self.normalize_media_search(query)
            products = [
                product for product in products
                if normalized_query in self.normalize_media_search(product.name)
                or normalized_query in self.normalize_media_search(self.get_media_product_code(product))
                or normalized_query == str(product.id)
            ]
        context = {
            **self.admin_site.each_context(request),
            "title": "Медиа товаров",
            "products": products,
            "media_search_query": query,
        }
        return TemplateResponse(request, "unfold/helpers/product_media_list.html", context)

    def get_media_product_code(self, product):
        return f"654{str(product.id).zfill(4)}"

    def normalize_media_search(self, value):
        return "".join(str(value or "").lower().replace("#", "").split())

    def product_media_view(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related("brand", "category").prefetch_related("additional_images"),
            pk=product_id,
        )
        if request.method == "POST":
            self.save_product_media(product, request.POST, request.FILES)
            self.message_user(request, f"Медиа товара «{product.name}» обновлены.", messages.SUCCESS)
            return redirect("admin:main_product_media_detail", product_id=product.pk)

        context = {
            **self.admin_site.each_context(request),
            "title": f"Медиа: {product.name}",
            "product": product,
            "additional_images": product.additional_images.all().order_by("order", "id"),
            "media_list_url": reverse("admin:main_product_media_list"),
        }
        return TemplateResponse(request, "unfold/helpers/product_media_detail.html", context)

    def save_product_media(self, product, post_data, files):
        product_update_fields = []
        for field_name in ("image", "promo_video", "promo_video_poster"):
            uploaded_file = files.get(field_name)
            if uploaded_file:
                setattr(product, field_name, uploaded_file)
                product_update_fields.append(field_name)
        if product_update_fields:
            product_update_fields.append("updated")
            product.save(update_fields=product_update_fields)

        for image in ProductImage.objects.filter(product=product).order_by("order", "id"):
            if post_data.get(f"delete_image_{image.id}"):
                image.delete()
                continue

            update_fields = []
            alt_text = post_data.get(f"alt_text_{image.id}", image.alt_text)
            if alt_text != image.alt_text:
                image.alt_text = alt_text
                update_fields.append("alt_text")

            raw_order = post_data.get(f"order_{image.id}")
            try:
                order = max(0, int(raw_order))
            except (TypeError, ValueError):
                order = image.order
            if order != image.order:
                image.order = order
                update_fields.append("order")

            if update_fields:
                image.save(update_fields=update_fields)

        max_order = ProductImage.objects.filter(product=product).aggregate(value=Max("order"))["value"] or 0
        for index, uploaded_file in enumerate(files.getlist("new_images"), start=1):
            ProductImage.objects.create(
                product=product,
                image=uploaded_file,
                order=max_order + index,
                alt_text=product.name,
            )

    def add_sku_view(self, request):
        if request.method == "POST":
            return self.save_sku_product(request)

        context = {
            **self.admin_site.each_context(request),
            "title": "Добавление товара",
            "content_title": "Добавление товара",
            "categories": Category.objects.order_by("name"),
            "brands": Brand.objects.order_by("name"),
            "variant_catalog": [
                {
                    "id": str(group.pk),
                    "name": group.name,
                    "options": [
                        {"id": str(option.pk), "name": option.name}
                        for option in group.options.all()
                    ],
                }
                for group in VariantGroup.objects.prefetch_related("options").order_by("order", "name")
            ],
            "product_list_url": reverse("admin:main_product_changelist"),
            "quick_add_url": reverse("admin:main_product_add_sku_quick_add"),
        }
        return TemplateResponse(request, "unfold/helpers/admin_product_sku.html", context)

    def edit_sku_view(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related("brand", "category").prefetch_related(
                "additional_images",
                "specifications",
                "product_variants__variant__group",
                "skus__options__group",
            ),
            pk=product_id,
        )
        if request.method == "POST":
            return self.save_sku_product(request, product=product)

        context = {
            **self.admin_site.each_context(request),
            "title": f"Редактирование: {product.name}",
            "content_title": "Редактирование товара",
            "categories": Category.objects.order_by("name"),
            "brands": Brand.objects.order_by("name"),
            "variant_catalog": [
                {
                    "id": str(group.pk),
                    "name": group.name,
                    "options": [
                        {"id": str(option.pk), "name": option.name}
                        for option in group.options.all()
                    ],
                }
                for group in VariantGroup.objects.prefetch_related("options").order_by("order", "name")
            ],
            "product_list_url": reverse("admin:main_product_products_list"),
            "quick_add_url": reverse("admin:main_product_add_sku_quick_add"),
            "sku_admin_mode": "edit",
            "edit_product": product,
            "edit_product_payload": self.serialize_sku_edit_product(product),
        }
        return TemplateResponse(request, "unfold/helpers/admin_product_sku.html", context)

    def media_url(self, file_field):
        if not file_field:
            return ""
        try:
            return file_field.url
        except ValueError:
            return ""

    def serialize_sku_edit_product(self, product):
        root_price = product.sku_root_price or product.price
        root_old_price = product.sku_root_old_price
        if not root_old_price and product.old_price and product.old_price > product.price:
            root_old_price = product.old_price
        groups = []
        group_index = {}
        product_variants = product.product_variants.select_related("variant__group").order_by(
            "variant__group__order",
            "variant__group__name",
            "variant__order",
            "variant__name",
        )
        for product_variant in product_variants:
            option = product_variant.variant
            group = option.group
            group_key = str(group.pk)
            if group_key not in group_index:
                group_index[group_key] = len(groups)
                groups.append({
                    "id": group_key,
                    "catalogGroupId": group_key,
                    "name": group.name,
                    "hasImages": False,
                    "variants": [],
                })
            image_url = self.media_url(product_variant.image)
            group_data = groups[group_index[group_key]]
            group_data["hasImages"] = group_data["hasImages"] or bool(image_url)
            group_data["variants"].append({
                "id": str(option.pk),
                "catalogOptionId": str(option.pk),
                "name": option.name,
                "imageUrl": image_url,
            })

        skus = []
        for sku in product.skus.prefetch_related("options__group").all().order_by("sort_order", "id"):
            option_ids = {str(option.pk) for option in sku.options.all()}
            path_values = []
            for group_data in groups:
                selected = next(
                    (variant for variant in group_data["variants"] if variant["catalogOptionId"] in option_ids),
                    None,
                )
                path_values.append(selected["name"] if selected else "")
            skus.append({
                "path": path_values,
                "price": float(sku.price),
                "old_price": float(sku.old_price) if sku.old_price and sku.old_price > sku.price else None,
                "stock": sku.stock,
                "available": bool(sku.available),
                "sort_order": sku.sort_order,
            })

        return {
            "id": product.pk,
            "name": product.name,
            "category": str(product.category_id or ""),
            "brand": str(product.brand_id or ""),
            "status": "published" if product.available else "draft",
            "badgeCodes": [product.badge_type] if product.badge_type else [],
            "descriptionHtml": product.description or "",
            "chars": [
                {"key": item.name, "value": item.value}
                for item in product.specifications.all().order_by("order", "id")
            ],
            "media": {
                "main": self.media_url(product.image),
                "extra": [self.media_url(image.image) for image in product.additional_images.all().order_by("order", "id")],
                "video": self.media_url(product.promo_video),
                "poster": self.media_url(product.promo_video_poster),
            },
            "groups": groups,
            "rootPricing": {
                "price": float(root_price) if root_price else None,
                "old_price": float(root_old_price) if root_old_price else None,
            },
            "skus": skus,
        }

    def quick_add_sku_reference_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Некорректные данные."}, status=400)

        reference_type = str(payload.get("type") or "").strip()
        name = str(payload.get("name") or "").strip()
        if reference_type not in {"category", "brand"}:
            return JsonResponse({"success": False, "message": "Неизвестный тип справочника."}, status=400)
        if not name:
            return JsonResponse({"success": False, "message": "Введите название."}, status=400)

        model = Category if reference_type == "category" else Brand
        item = model.objects.filter(name__iexact=name).first()
        created = False
        if item is None:
            item = model.objects.create(name=name)
            created = True

        return JsonResponse({
            "success": True,
            "created": created,
            "item": {
                "id": item.pk,
                "name": item.name,
                "slug": item.slug,
            },
        })

    def save_sku_product(self, request, product=None):
        try:
            payload = json.loads(request.POST.get("payload") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Некорректные данные формы."}, status=400)

        errors = self.validate_sku_payload(payload, request.FILES, product=product)
        if errors:
            return JsonResponse({"success": False, "message": " ".join(errors), "errors": errors}, status=400)

        try:
            with transaction.atomic():
                if product is None:
                    product = self.create_sku_product(payload, request.FILES)
                    created = True
                else:
                    product = self.update_sku_product(product, payload, request.FILES)
                    created = False
        except (ObjectDoesNotExist, ValidationError, ValueError, InvalidOperation) as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return JsonResponse({"success": False, "message": message}, status=400)

        return JsonResponse(
            {
                "success": True,
                "product_id": product.pk,
                "redirect_url": reverse("admin:main_product_products_list"),
            }
        )

    def validate_sku_payload(self, payload, files, product=None):
        errors = []
        raw_product_name = str(payload.get("name") or "").strip()
        product_name = strip_tags(raw_product_name).strip()
        product_name_max_length = Product._meta.get_field("name").max_length
        if not product_name:
            errors.append("Заполните название товара.")
        elif product_name != raw_product_name:
            errors.append("Название товара не должно содержать HTML.")
        elif len(product_name) > product_name_max_length:
            errors.append(f"Название товара должно быть не длиннее {product_name_max_length} символов.")
        description_html = sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or "")
        if not strip_tags(description_html).strip():
            errors.append("Добавьте описание.")
        required = (
            ("category", "Выберите категорию."),
            ("brand", "Выберите бренд."),
        )
        for key, message in required:
            if not str(payload.get(key) or "").strip():
                errors.append(message)
        if not files.get("image") and not (product and product.image):
            errors.append("Загрузите основное изображение.")
        skus = payload.get("skus") or []
        if not skus:
            errors.append("Создайте хотя бы один SKU.")
        sku_prices = [self.sku_decimal(item.get("price")) for item in skus]
        if skus and any(price is None for price in sku_prices):
            errors.append("Укажите цену для каждого SKU.")
        if any(price is not None and price <= 0 for price in sku_prices):
            errors.append("Цена SKU должна быть больше нуля.")
        for sku, price in zip(skus, sku_prices):
            old_price = self.sku_decimal(sku.get("old_price"))
            if old_price is not None and price is not None and old_price < price:
                errors.append("Старая цена SKU не может быть ниже финальной.")
                break
        root_pricing = payload.get("rootPricing") or {}
        root_price = self.sku_decimal(root_pricing.get("price"))
        root_old_price = self.sku_decimal(root_pricing.get("old_price"))
        if root_pricing.get("price") not in (None, "") and root_price is None:
            errors.append("Некорректная root-цена SKU.")
        if root_price is not None and root_price <= 0:
            errors.append("Root-цена SKU должна быть больше нуля.")
        if root_old_price is not None and root_price is not None and root_old_price < root_price:
            errors.append("Root-старая цена SKU не может быть ниже финальной.")

        specification_name_max = ProductSpecification._meta.get_field("name").max_length
        specification_value_max = ProductSpecification._meta.get_field("value").max_length
        for item in payload.get("chars") or []:
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if not name and not value:
                continue
            if not name or not value:
                errors.append("У каждой характеристики должны быть название и значение.")
                break
            if len(name) > specification_name_max or len(value) > specification_value_max:
                errors.append(
                    f"Характеристика превышает допустимую длину: название до {specification_name_max}, "
                    f"значение до {specification_value_max} символов."
                )
                break
        return errors

    def create_sku_product(self, payload, files):
        category = Category.objects.get(pk=payload["category"])
        brand = Brand.objects.get(pk=payload["brand"])
        skus = payload.get("skus") or []
        base_price, base_old_price, root_price, root_old_price = self.resolve_sku_catalog_prices(
            skus,
            payload.get("rootPricing") or {},
        )
        total_stock = sum(self.sku_int(item.get("stock", item.get("quantity"))) for item in skus if item.get("available", True))
        has_discount = bool(base_old_price and base_price and base_old_price > base_price)

        product = Product(
            category=category,
            brand=brand,
            name=strip_tags(str(payload.get("name", "") or "")).strip(),
            image=files["image"],
            promo_video=files.get("promo_video"),
            promo_video_poster=files.get("promo_video_poster"),
            description=sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or ""),
            old_price=base_old_price,
            price=base_price,
            sku_root_price=root_price,
            sku_root_old_price=root_old_price,
            discount_percent=None,
            stock=total_stock,
            available=payload.get("status", "published") == "published",
            badge_type="" if has_discount else self.resolve_badge_type(payload.get("badgeCodes") or []),
        )
        product.full_clean()
        product.save()

        for index, image in enumerate(files.getlist("extra_images")):
            ProductImage.objects.create(product=product, image=image, order=index, alt_text=product.name)

        for index, item in enumerate(payload.get("chars") or []):
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if name or value:
                ProductSpecification.objects.create(
                    product=product,
                    name=name or "Характеристика",
                    value=value,
                    order=index,
                )

        option_map = self.create_variant_options(payload.get("groups") or [])
        option_stock = self.calculate_option_stock(payload.get("groups") or [], skus)
        for key, option in option_map.items():
            stock = option_stock.get(key, 0)
            ProductVariant.objects.create(
                product=product,
                variant=option,
                image=files.get(f"variant_image__{key[0]}__{key[1]}"),
                stock=stock,
                available=stock > 0,
            )

        group_slots = self.build_group_slots(payload.get("groups") or [])
        for index, sku_data in enumerate(skus):
            option_ids = self.resolve_sku_option_ids(group_slots, option_map, sku_data)
            price = self.sku_decimal(sku_data.get("price"))
            if price is None:
                continue
            stock = self.sku_int(sku_data.get("stock", sku_data.get("quantity")))
            product_sku = ProductSKU.objects.create(
                product=product,
                sku_code=str(sku_data.get("sku_code") or sku_data.get("name") or "").strip(),
                price=price,
                old_price=self.sku_decimal(sku_data.get("old_price")),
                stock=stock,
                available=bool(sku_data.get("available", True) and stock > 0),
                sort_order=self.sku_int(sku_data.get("sort_order", index)),
            )
            product_sku.options.set(option_ids)

        product.sync_from_skus()
        return product

    def update_sku_product(self, product, payload, files):
        category = Category.objects.get(pk=payload["category"])
        brand = Brand.objects.get(pk=payload["brand"])
        skus = payload.get("skus") or []
        base_price, base_old_price, root_price, root_old_price = self.resolve_sku_catalog_prices(
            skus,
            payload.get("rootPricing") or {},
        )
        total_stock = sum(self.sku_int(item.get("stock", item.get("quantity"))) for item in skus if item.get("available", True))
        has_discount = bool(base_old_price and base_price and base_old_price > base_price)

        old_variant_images = {
            product_variant.variant_id: product_variant.image.name
            for product_variant in product.product_variants.select_related("variant")
            if product_variant.image
        }

        product.category = category
        product.brand = brand
        product.name = strip_tags(str(payload.get("name", "") or "")).strip()
        if files.get("image"):
            product.image = files["image"]
        if files.get("promo_video"):
            product.promo_video = files["promo_video"]
        if files.get("promo_video_poster"):
            product.promo_video_poster = files["promo_video_poster"]
        product.description = sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or "")
        product.old_price = base_old_price
        product.price = base_price
        product.sku_root_price = root_price
        product.sku_root_old_price = root_old_price
        product.discount_percent = None
        product.stock = total_stock
        product.available = payload.get("status", "published") == "published"
        product.badge_type = "" if has_discount else self.resolve_badge_type(payload.get("badgeCodes") or [])
        product.full_clean()
        product.save()

        uploaded_extra = files.getlist("extra_images")
        if uploaded_extra:
            ProductImage.objects.filter(product=product).delete()
            for index, image in enumerate(uploaded_extra):
                ProductImage.objects.create(product=product, image=image, order=index, alt_text=product.name)

        ProductSpecification.objects.filter(product=product).delete()
        for index, item in enumerate(payload.get("chars") or []):
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if name or value:
                ProductSpecification.objects.create(
                    product=product,
                    name=name or "Характеристика",
                    value=value,
                    order=index,
                )

        ProductSKU.objects.filter(product=product).delete()
        ProductVariant.objects.filter(product=product).delete()

        option_map = self.create_variant_options(payload.get("groups") or [])
        option_stock = self.calculate_option_stock(payload.get("groups") or [], skus)
        for key, option in option_map.items():
            product_variant = ProductVariant(
                product=product,
                variant=option,
                stock=option_stock.get(key, 0),
                available=option_stock.get(key, 0) > 0,
            )
            uploaded_image = files.get(f"variant_image__{key[0]}__{key[1]}")
            if uploaded_image:
                product_variant.image = uploaded_image
            elif old_variant_images.get(option.pk):
                product_variant.image = old_variant_images[option.pk]
            product_variant.save()

        group_slots = self.build_group_slots(payload.get("groups") or [])
        for index, sku_data in enumerate(skus):
            option_ids = self.resolve_sku_option_ids(group_slots, option_map, sku_data)
            price = self.sku_decimal(sku_data.get("price"))
            if price is None:
                continue
            stock = self.sku_int(sku_data.get("stock", sku_data.get("quantity")))
            product_sku = ProductSKU.objects.create(
                product=product,
                sku_code=str(sku_data.get("sku_code") or sku_data.get("name") or "").strip(),
                price=price,
                old_price=self.sku_decimal(sku_data.get("old_price")),
                stock=stock,
                available=bool(sku_data.get("available", True) and stock > 0),
                sort_order=self.sku_int(sku_data.get("sort_order", index)),
            )
            product_sku.options.set(option_ids)

        product.sync_from_skus()
        return product

    def create_variant_options(self, groups):
        option_map = {}
        for group_index, group in enumerate(groups):
            group_name = str(group.get("name") or "").strip() or "Вариант"
            for value_index, value in enumerate(group.get("values") or []):
                value_name = str(value.get("name") or "").strip()
                if not value_name:
                    continue
                variant_group, _ = VariantGroup.objects.get_or_create(
                    name=group_name,
                    defaults={"order": group_index},
                )
                option, _ = VariantOption.objects.get_or_create(
                    group=variant_group,
                    name=value_name,
                    defaults={"order": value_index},
                )
                option_map[(str(group.get("id")), str(value.get("id")))] = option
        return option_map

    def calculate_option_stock(self, groups, skus):
        group_slots = self.build_group_slots(groups)
        stock = {}
        for sku in skus:
            if not sku.get("available", True):
                continue
            quantity = self.sku_int(sku.get("stock", sku.get("quantity")))
            for index, value_name in enumerate(sku.get("path") or []):
                if index >= len(group_slots):
                    continue
                group_id = group_slots[index]["group_id"]
                value_id = group_slots[index]["values"].get(str(value_name).strip())
                if value_id:
                    stock[(group_id, value_id)] = stock.get((group_id, value_id), 0) + quantity
        return stock

    def build_group_slots(self, groups):
        return [
            {
                "group_id": str(group.get("id")),
                "values": {str(value.get("name") or "").strip(): str(value.get("id")) for value in group.get("values") or []},
            }
            for group in groups
        ]

    def resolve_sku_option_ids(self, group_slots, option_map, sku_data):
        option_ids = []
        for index, value_name in enumerate(sku_data.get("path") or []):
            if index >= len(group_slots):
                continue
            group_id = group_slots[index]["group_id"]
            value_id = group_slots[index]["values"].get(str(value_name).strip())
            option = option_map.get((group_id, value_id))
            if option:
                option_ids.append(option.id)
        return option_ids

    def resolve_badge_type(self, badge_codes):
        for code in badge_codes:
            if code in {Product.BADGE_NEW, Product.BADGE_HIT, Product.BADGE_TOP}:
                return code
        return ""

    def sku_decimal(self, value):
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return None

    def sku_int(self, value):
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    def resolve_sku_catalog_prices(self, skus, root_pricing):
        root_price = self.sku_decimal((root_pricing or {}).get("price"))
        root_old_price = self.sku_decimal((root_pricing or {}).get("old_price"))
        if root_price:
            return (
                root_price,
                root_old_price if root_old_price and root_old_price > root_price else root_price,
                root_price,
                root_old_price if root_old_price and root_old_price > root_price else None,
            )

        priced_skus = [
            {
                "price": self.sku_decimal(item.get("price")),
                "old_price": self.sku_decimal(item.get("old_price")),
            }
            for item in skus
        ]
        priced_skus = [item for item in priced_skus if item["price"] is not None]
        if not priced_skus:
            raise ValidationError("Укажите цену хотя бы для одного SKU.")
        best = min(priced_skus, key=lambda item: item["price"])
        old_price = best["old_price"] if best["old_price"] and best["old_price"] > best["price"] else best["price"]
        return best["price"], old_price, None, None

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
    readonly_fields = ("slug",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_product_count=Count("products"))

    @admin.display(description="Товаров")
    def product_count(self, obj):
        return obj.admin_product_count


@admin.register(Brand)
class BrandAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "product_count")
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)

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

    def get_urls(self):
        custom_urls = [
            path(
                "toggle-verified/",
                self.admin_site.admin_view(self.reviews_toggle_verified_view),
                name="main_productreview_toggle_verified",
            ),
            path(
                "toggle-visibility/",
                self.admin_site.admin_view(self.reviews_toggle_visibility_view),
                name="main_productreview_toggle_visibility",
            ),
            path(
                "delete-review/",
                self.admin_site.admin_view(self.reviews_delete_view),
                name="main_productreview_delete",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return self.reviews_list_view(request)

    def reviews_list_view(self, request):
        reviews = ProductReview.objects.select_related("product", "product__brand", "user").order_by("-created", "-id")
        context = {
            **self.admin_site.each_context(request),
            "title": "Отзывы",
            "reviews_payload": [self.serialize_admin_review(review) for review in reviews],
            "toggle_verified_url": reverse("admin:main_productreview_toggle_verified"),
            "toggle_visibility_url": reverse("admin:main_productreview_toggle_visibility"),
            "delete_url": reverse("admin:main_productreview_delete"),
        }
        return TemplateResponse(request, "unfold/helpers/admin_reviews_list.html", context)

    def get_review_action_id(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None
        try:
            return int(payload.get("id"))
        except (TypeError, ValueError):
            return None

    def get_review_for_action(self, request):
        if request.method != "POST":
            return None, JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        review_id = self.get_review_action_id(request)
        if not review_id:
            return None, JsonResponse({"success": False, "message": "Отзыв не выбран."}, status=400)
        review = ProductReview.objects.select_related("product", "product__brand", "user").filter(pk=review_id).first()
        if not review:
            return None, JsonResponse({"success": False, "message": "Отзыв не найден."}, status=404)
        return review, None

    def reviews_toggle_verified_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review.is_verified = not review.is_verified
        review.save(update_fields=("is_verified", "updated"))
        return JsonResponse({"success": True, "review": self.serialize_admin_review(review)})

    def reviews_toggle_visibility_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review.is_approved = not review.is_approved
        review.save(update_fields=("is_approved", "updated"))
        return JsonResponse({"success": True, "review": self.serialize_admin_review(review)})

    def reviews_delete_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review_id = review.pk
        review.delete()
        return JsonResponse({"success": True, "deleted_id": str(review_id)})

    def serialize_admin_review(self, review):
        author_name = review.author_name or (review.user.get_username() if review.user_id else "Аноним")
        initials = "".join(part[:1] for part in author_name.split()[:2]).upper() or "??"
        return {
            "id": str(review.pk),
            "author_name": author_name,
            "user_name": review.user.get_username() if review.user_id else "",
            "initials": initials[:2],
            "product_id": str(review.product_id) if review.product_id else "",
            "product_name": review.product.name if review.product_id else "",
            "rating": review.rating,
            "text": review.text,
            "is_verified": bool(review.is_verified),
            "is_published": bool(review.is_approved),
            "helpful_count": review.helpful_count,
            "created_label": review.created.strftime("%d.%m.%Y") if review.created else "",
            "created_ts": int(review.created.timestamp()) if review.created else 0,
        }

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


@admin.register(VariantGroup)
class VariantGroupAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "order", "options_count")
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)
    inlines = (VariantOptionInline,)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_options_count=Count("options"))

    @admin.display(description="Вариантов")
    def options_count(self, obj):
        return obj.admin_options_count


@admin.register(VariantOption)
class VariantOptionAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("name", "group", "order", "slug")
    list_filter = ("group",)
    search_fields = ("name", "group__name")
    autocomplete_fields = ("group",)
    readonly_fields = ("slug",)
    ordering = ("group__order", "group__name", "order", "name")


@admin.register(ProductVariant)
class ProductVariantAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "variant", "stock", "available")
    list_filter = ("available", "variant__group")
    search_fields = ("product__name", "variant__name", "variant__group__name")
    autocomplete_fields = ("product", "variant")
    fields = ("product", "variant", "image", "stock", "available")


@admin.register(ProductSKU)
class ProductSKUAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "sku_code", "price", "old_price", "stock", "available", "sort_order")
    list_filter = ("available", "product__category", "product__brand")
    search_fields = ("product__name", "sku_code", "options__name")
    autocomplete_fields = ("product", "options")
    fields = ("product", "options", "sku_code", "price", "old_price", "stock", "available", "image", "sort_order")


@admin.register(ProductImage)
class ProductImageAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("preview", "product", "order", "alt_text", "file_link", "created")
    search_fields = ("product__name", "alt_text")
    fields = ("preview", "image", "order", "alt_text", "file_link", "created")
    readonly_fields = ("preview", "file_link", "created")

    def has_add_permission(self, request):
        return False

    @admin.display(description="Превью")
    def preview(self, obj):
        if not obj.pk or not obj.image:
            return "-"
        return format_html('<img src="{}" style="height:64px;border-radius:8px;object-fit:cover;" alt="">', obj.image.url)

    @admin.display(description="Ссылка")
    def file_link(self, obj):
        if not obj.pk or not obj.image:
            return "-"
        return format_html('<a href="{}" target="_blank" rel="noopener">Открыть</a>', obj.image.url)


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
