from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F
from django.utils.text import slugify


def make_unique_slug(model_class, value, instance_pk=None):
    base_slug = slugify(value) or "item"
    slug = base_slug
    index = 2
    queryset = model_class.objects.all()
    if instance_pk:
        queryset = queryset.exclude(pk=instance_pk)
    while queryset.filter(slug=slug).exists():
        slug = f"{base_slug}-{index}"
        index += 1
    return slug


class Category(models.Model):
    name = models.CharField(max_length=100, db_index=True)
    slug = models.SlugField(max_length=100, unique=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Category"
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Brand"
        verbose_name_plural = "Brands"

    def save(self, *args, **kwargs):
        self.slug = make_unique_slug(Brand, self.name, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Product(models.Model):
    BADGE_NEW = "new"
    BADGE_HIT = "hit"
    BADGE_CHOICES = (
        ("", "No badge"),
        (BADGE_NEW, "New"),
        (BADGE_HIT, "Hit"),
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
    name = models.CharField(max_length=100, db_index=True, verbose_name="Name")
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    image = models.ImageField(upload_to="products/%Y/%m/%d", blank=True, verbose_name="Image")
    description = models.TextField(blank=True, verbose_name="Description")
    old_price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Base price")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Final price")
    discount_percent = models.PositiveSmallIntegerField(
        choices=DISCOUNT_CHOICES,
        blank=True,
        null=True,
        verbose_name="Discount percent",
    )
    stock = models.PositiveIntegerField(default=0, verbose_name="Stock")
    available = models.BooleanField(default=True, verbose_name="Available")
    variants = models.JSONField(default=list, blank=True, verbose_name="All variants")
    available_variants = models.JSONField(default=list, blank=True, verbose_name="Available variants")
    likes = models.PositiveIntegerField(default=0, verbose_name="Likes")
    badge_type = models.CharField(
        max_length=10,
        choices=BADGE_CHOICES,
        blank=True,
        default="",
        verbose_name="Badge",
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
        if self.variants and self.available_variants:
            variants = {str(value) for value in self.variants}
            invalid = [value for value in self.available_variants if str(value) not in variants]
            if invalid:
                raise ValidationError({
                    "available_variants": "Available variants must be a subset of all variants."
                })

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
        return None

    def __str__(self):
        return self.name


class ProductLike(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="product_likes", on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (("user", "product"),)
        verbose_name = "Product like"
        verbose_name_plural = "Product likes"

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            Product.objects.filter(pk=self.product_id).update(likes=F("likes") + 1)

    def delete(self, *args, **kwargs):
        product_id = self.product_id
        result = super().delete(*args, **kwargs)
        Product.objects.filter(pk=product_id, likes__gt=0).update(likes=F("likes") - 1)
        return result

    def __str__(self):
        return f"{self.user} -> {self.product}"
