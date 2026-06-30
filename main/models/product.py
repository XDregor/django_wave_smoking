from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q, Sum
from django.utils.html import strip_tags

from . import (
    make_unique_slug,
    product_gallery_image_upload_to,
    product_main_image_upload_to,
    product_variant_image_upload_to,
    product_video_poster_upload_to,
    product_video_upload_to,
    sanitize_product_description,
)
from .catalog import Brand, Category, VariantGroup, VariantOption

class Product(models.Model):
    BADGE_NEW = "new"
    BADGE_HIT = "hit"
    BADGE_TOP = "top"
    BADGE_CHOICES = (
        ("", "No badge"),
        (BADGE_NEW, "New"),
        (BADGE_HIT, "Hit"),
        (BADGE_TOP, "Top"),
    )
    DISCOUNT_CHOICES = tuple((value, f"{value}%") for value in range(0, 101, 5))

    category = models.ForeignKey(
        Category,
        related_name="products",
        on_delete=models.CASCADE,
        verbose_name="Category",
    )
    brand = models.ForeignKey(
        Brand,
        related_name="products",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Brand",
    )
    variant_image_group = models.ForeignKey(
        VariantGroup,
        related_name="image_products",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Variant image group",
    )
    name = models.CharField(max_length=100, db_index=True, verbose_name="Name")
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    image = models.ImageField(upload_to=product_main_image_upload_to, blank=True, verbose_name="Image")
    promo_video = models.FileField(
        upload_to=product_video_upload_to,
        blank=True,
        null=True,
        verbose_name="Promo video",
    )
    promo_video_poster = models.ImageField(
        upload_to=product_video_poster_upload_to,
        blank=True,
        null=True,
        verbose_name="Promo video poster",
    )
    description = models.TextField(blank=True, verbose_name="Description")
    old_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Base price")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Final price")
    sku_root_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        verbose_name="SKU root final price",
    )
    sku_root_old_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        verbose_name="SKU root base price",
    )
    discount_percent = models.PositiveSmallIntegerField(
        choices=DISCOUNT_CHOICES,
        blank=True,
        null=True,
        verbose_name="Discount percent",
    )
    stock = models.PositiveIntegerField(default=0, verbose_name="Stock")
    available = models.BooleanField(default=True, verbose_name="Available")
    likes = models.PositiveIntegerField(default=0, verbose_name="Likes")
    badge_type = models.CharField(
        max_length=10,
        choices=BADGE_CHOICES,
        blank=True,
        default="",
        verbose_name="Badge",
    )
    also_chosen_products = models.ManyToManyField(
        "self",
        through="ProductAlsoChosen",
        symmetrical=False,
        related_name="chosen_with_products",
        blank=True,
        verbose_name="Также выбирают",
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Product"
        verbose_name_plural = "Products"

    def save(self, *args, **kwargs):
        self.slug = make_unique_slug(Product, self.name, self.pk)
        self.clean()
        if self.discount_percent is not None:
            discount = Decimal(100 - self.discount_percent) / Decimal(100)
            self.price = (self.old_price * discount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        raw_name = str(self.name or "").strip()
        if strip_tags(raw_name) != raw_name:
            raise ValidationError({"name": "Название товара не должно содержать HTML."})
        self.name = raw_name
        if not self.name:
            raise ValidationError({"name": "Заполните название товара."})
        max_length = self._meta.get_field("name").max_length
        if len(self.name) > max_length:
            raise ValidationError({"name": f"Название товара должно быть не длиннее {max_length} символов."})
        self.description = sanitize_product_description(self.description)
        if self.sku_root_price is not None and self.sku_root_price <= 0:
            raise ValidationError({"sku_root_price": "SKU root price must be greater than zero."})
        if (
            self.sku_root_old_price is not None
            and self.sku_root_price is not None
            and self.sku_root_old_price < self.sku_root_price
        ):
            raise ValidationError({"sku_root_old_price": "SKU root base price cannot be lower than final price."})
        if self.get_discount_percent():
            self.badge_type = ""

    def get_discount_percent(self):
        if self.discount_percent is not None and self.discount_percent > 0:
            return self.discount_percent
        if self.old_price and self.price and self.old_price > self.price:
            value = (Decimal(1) - (self.price / self.old_price)) * Decimal(100)
            return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return None

    @property
    def is_on_sale(self):
        return bool(self.old_price and self.price and self.old_price > self.price)

    def get_badge_data(self):
        discount = self.get_discount_percent()
        if discount:
            return {"type": "sale", "label": f"-{discount}%"}
        if self.badge_type == self.BADGE_NEW:
            return {"type": "new", "label": "Новинка"}
        if self.badge_type == self.BADGE_HIT:
            return {"type": "hit", "label": "Хит"}
        if self.badge_type == self.BADGE_TOP:
            return {"type": "top", "label": "Топ"}
        return None

    @property
    def available_product_variants(self):
        if hasattr(self, "skus") and self.skus.exists():
            option_ids = set(
                VariantOption.objects.filter(
                    product_skus__product=self,
                    product_skus__available=True,
                    product_skus__stock__gt=0,
                ).values_list("id", flat=True)
            )
            variants = getattr(self, "_prefetched_objects_cache", {}).get("product_variants")
            if variants is None:
                variants = self.product_variants.select_related("variant", "variant__group").all()
            return [
                product_variant
                for product_variant in variants
                if product_variant.variant_id in option_ids
            ]
        variants = getattr(self, "_prefetched_objects_cache", {}).get("product_variants")
        if variants is None:
            variants = self.product_variants.select_related("variant", "variant__group").all()
        return [
            product_variant
            for product_variant in variants
            if product_variant.available and product_variant.stock > 0
        ]

    @property
    def variant_labels(self):
        return [item.variant.name for item in self.available_product_variants]

    @property
    def variant_payload(self):
        return [
            {
                "id": item.id,
                "option_id": item.variant_id,
                "name": item.variant.name,
                "slug": item.variant.slug,
                "filter_name": item.variant.filter_name or item.variant.name,
                "filter_slug": item.variant.filter_slug,
                "group": item.variant.group.name if item.variant.group_id else "",
                "image_url": item.image.url if item.image else "",
                "thumbnail_url": item.thumbnail_url,
                "stock": item.stock,
                "available": True,
            }
            for item in self.available_product_variants
        ]

    @property
    def display_product_variants(self):
        product_variants = getattr(self, "_prefetched_objects_cache", {}).get("product_variants")
        if product_variants is None:
            product_variants = self.product_variants.select_related("variant", "variant__group").all()
        return [
            {
                "id": product_variant.id,
                "option_id": product_variant.variant_id,
                "name": product_variant.variant.name,
                "slug": product_variant.variant.slug,
                "filter_name": product_variant.variant.filter_name or product_variant.variant.name,
                "filter_slug": product_variant.variant.filter_slug,
                "group": product_variant.variant.group.name if product_variant.variant.group_id else "",
                "image_url": product_variant.image.url if product_variant.image else "",
                "thumbnail_url": product_variant.thumbnail_url,
                "stock": product_variant.stock,
                "available": bool(product_variant.available and product_variant.stock > 0),
            }
            for product_variant in product_variants
        ]

    @property
    def sku_payload(self):
        skus = getattr(self, "_prefetched_objects_cache", {}).get("skus")
        if skus is None:
            skus = self.skus.prefetch_related("options").all()
        return [
            {
                "id": sku.id,
                "option_ids": [option.id for option in sku.options.all()],
                "price": float(sku.price),
                "old_price": float(sku.old_price) if sku.old_price else None,
                "stock": sku.stock,
                "available": bool(sku.available and sku.stock > 0),
                "sku_code": sku.sku_code,
                "image_url": sku.image.url if sku.image else "",
            }
            for sku in skus
        ]

    @property
    def display_variant_payload(self):
        return self.display_product_variants

    def sync_stock_from_variants(self):
        if hasattr(self, "skus") and self.skus.exists():
            self.sync_from_skus()
            return
        total = self.product_variants.aggregate(total=Sum("stock"))["total"]
        if total is not None:
            self.stock = total
            self.save(update_fields=("stock",))

    def sync_from_skus(self):
        skus = list(self.skus.all())
        if not skus:
            return

        available_skus = [sku for sku in skus if sku.available and sku.stock > 0]
        stock = sum(sku.stock for sku in available_skus)
        price_source = available_skus or skus
        if self.sku_root_price:
            catalog_price = self.sku_root_price
            catalog_old_price = (
                self.sku_root_old_price
                if self.sku_root_old_price and self.sku_root_old_price > self.sku_root_price
                else self.sku_root_price
            )
        else:
            best_sku = min(price_source, key=lambda sku: sku.price)
            catalog_price = best_sku.price
            catalog_old_price = (
                best_sku.old_price
                if best_sku.old_price and best_sku.old_price > best_sku.price
                else best_sku.price
            )
        update_values = {
            "stock": stock,
            "price": catalog_price,
            "old_price": catalog_old_price,
        }
        if catalog_old_price and catalog_price and catalog_old_price > catalog_price:
            update_values["badge_type"] = ""

        Product.objects.filter(pk=self.pk).update(**update_values)
        self.stock = stock
        self.price = catalog_price
        self.old_price = catalog_old_price
        if "badge_type" in update_values:
            self.badge_type = ""

    def __str__(self):
        return self.name


class ProductAlsoChosen(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="also_chosen_relations",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    recommended_product = models.ForeignKey(
        Product,
        related_name="also_chosen_for",
        on_delete=models.CASCADE,
        verbose_name="Recommended product",
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sort order")

    class Meta:
        ordering = ("sort_order", "id")
        constraints = (
            models.UniqueConstraint(
                fields=("product", "recommended_product"),
                name="unique_product_also_chosen_product",
            ),
            models.CheckConstraint(
                condition=~Q(product=F("recommended_product")),
                name="product_also_chosen_not_self",
            ),
        )
        verbose_name = "Also chosen product"
        verbose_name_plural = "Also chosen products"

    def clean(self):
        super().clean()
        if self.product_id and self.recommended_product_id and self.product_id == self.recommended_product_id:
            raise ValidationError("Product cannot recommend itself.")

    def __str__(self):
        return f"{self.product} -> {self.recommended_product}"


class ProductVariant(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="product_variants",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    variant = models.ForeignKey(
        VariantOption,
        related_name="product_variants",
        on_delete=models.CASCADE,
        verbose_name="Variant",
    )
    image = models.ImageField(upload_to=product_variant_image_upload_to, blank=True, verbose_name="Variant image")
    image_order = models.PositiveIntegerField(default=0, verbose_name="Image order")
    stock = models.PositiveIntegerField(default=0, verbose_name="Stock")
    available = models.BooleanField(default=False, verbose_name="Available")

    class Meta:
        ordering = (
            "variant__group__order",
            "variant__group__name",
            "image_order",
            "variant__order",
            "variant__name",
        )
        unique_together = (("product", "variant"),)
        verbose_name = "Product variant"
        verbose_name_plural = "Product variants"

    def clean(self):
        super().clean()

    def save(self, *args, **kwargs):
        self.clean()
        if self.stock <= 0:
            self.available = False
        super().save(*args, **kwargs)
        self.product.sync_stock_from_variants()

    def delete(self, *args, **kwargs):
        product = self.product
        result = super().delete(*args, **kwargs)
        product.sync_stock_from_variants()
        return result

    def __str__(self):
        return f"{self.product} / {self.variant}"

    @property
    def thumbnail_url(self):
        thumbnail_url = getattr(self.image, "thumbnail_url", "")
        if thumbnail_url:
            return thumbnail_url
        return self.image.url if self.image else ""


class ProductSKU(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="skus",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    options = models.ManyToManyField(
        VariantOption,
        related_name="product_skus",
        verbose_name="Options",
    )
    sku_code = models.CharField(max_length=120, blank=True, db_index=True, verbose_name="SKU code")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Final price")
    old_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        verbose_name="Base price",
    )
    stock = models.PositiveIntegerField(default=0, verbose_name="Stock")
    available = models.BooleanField(default=True, verbose_name="Available")
    image = models.ImageField(upload_to=product_variant_image_upload_to, blank=True, verbose_name="SKU image")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Sort order")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("product", "sort_order", "id")
        verbose_name = "Product SKU"
        verbose_name_plural = "Product SKUs"

    def save(self, *args, **kwargs):
        if self.stock <= 0:
            self.available = False
        super().save(*args, **kwargs)
        self.product.sync_from_skus()

    def delete(self, *args, **kwargs):
        product = self.product
        result = super().delete(*args, **kwargs)
        product.sync_from_skus()
        return result

    def __str__(self):
        options = ", ".join(option.name for option in self.options.all())
        return f"{self.product.name} — {options}" if options else self.product.name


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="additional_images",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    image = models.ImageField(upload_to=product_gallery_image_upload_to, verbose_name="Image")
    order = models.PositiveIntegerField(default=0, verbose_name="Order")
    alt_text = models.CharField(max_length=200, blank=True, verbose_name="Alt text")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("order", "id")
        verbose_name = "Дополнительное изображение"
        verbose_name_plural = "Дополнительные изображения"

    def __str__(self):
        return self.alt_text or f"{self.product} image {self.pk}"

    @property
    def thumbnail_url(self):
        thumbnail_url = getattr(self.image, "thumbnail_url", "")
        if thumbnail_url:
            return thumbnail_url
        return self.image.url if self.image else ""


class ProductSpecification(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="specifications",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    name = models.CharField(max_length=120, verbose_name="Name")
    value = models.CharField(max_length=255, verbose_name="Value")
    order = models.PositiveIntegerField(default=0, verbose_name="Order")

    class Meta:
        ordering = ("order", "id")
        verbose_name = "Product specification"
        verbose_name_plural = "Product specifications"

    def __str__(self):
        return f"{self.product} / {self.name}: {self.value}"
