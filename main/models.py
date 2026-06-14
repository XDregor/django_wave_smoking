from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q, Sum
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


class VariantOption(models.Model):
    category = models.ForeignKey(
        Category,
        related_name="variant_options",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="Category",
    )
    group = models.CharField(max_length=80, blank=True, verbose_name="Group")
    name = models.CharField(max_length=100, verbose_name="Name")
    slug = models.SlugField(max_length=120, blank=True, verbose_name="Slug")
    order = models.PositiveIntegerField(default=0, verbose_name="Order")

    class Meta:
        ordering = ("category__name", "group", "order", "name")
        verbose_name = "Variant option"
        verbose_name_plural = "Variant options"
        constraints = (
            models.UniqueConstraint(
                fields=("category", "name"),
                name="main_variantoption_unique_category_name",
            ),
            models.UniqueConstraint(
                fields=("name",),
                condition=Q(category__isnull=True),
                name="main_variantoption_unique_global_name",
            ),
        )

    def save(self, *args, **kwargs):
        if not self.slug:
            base = f"{self.category.slug}-{self.name}" if self.category_id else self.name
            self.slug = make_unique_slug(VariantOption, base, self.pk)
        super().save(*args, **kwargs)

    def __str__(self):
        prefix = f"{self.group}: " if self.group else ""
        return f"{prefix}{self.name}"


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
    promo_video = models.FileField(
        upload_to="products/videos/%Y/%m/%d/",
        blank=True,
        null=True,
        verbose_name="Promo video",
    )
    promo_video_poster = models.ImageField(
        upload_to="products/videos/posters/%Y/%m/%d/",
        blank=True,
        null=True,
        verbose_name="Promo video poster",
    )
    description = models.TextField(blank=True, verbose_name="Description")
    specifications_text = models.TextField(blank=True, verbose_name="Product specifications")
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

    @property
    def available_product_variants(self):
        variants = getattr(self, "_prefetched_objects_cache", {}).get("product_variants")
        if variants is None:
            variants = self.product_variants.select_related("variant").all()
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
                "name": item.variant.name,
                "slug": item.variant.slug,
                "group": item.variant.group,
                "image_url": item.image.url if item.image else "",
                "stock": item.stock,
                "available": True,
            }
            for item in self.available_product_variants
        ]

    @property
    def display_product_variants(self):
        product_variants = getattr(self, "_prefetched_objects_cache", {}).get("product_variants")
        if product_variants is None:
            product_variants = self.product_variants.select_related("variant").all()
        return [
            {
                "id": product_variant.id,
                "name": product_variant.variant.name,
                "slug": product_variant.variant.slug,
                "group": product_variant.variant.group,
                "image_url": product_variant.image.url if product_variant.image else "",
                "stock": product_variant.stock,
                "available": bool(product_variant.available and product_variant.stock > 0),
            }
            for product_variant in product_variants
        ]

    @property
    def display_variant_payload(self):
        return self.display_product_variants

    def sync_stock_from_variants(self):
        total = self.product_variants.aggregate(total=Sum("stock"))["total"]
        if total is not None:
            self.stock = total
            self.save(update_fields=("stock",))

    def __str__(self):
        return self.name


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
    image = models.ImageField(upload_to="products/variants/%Y/%m/%d/", blank=True, verbose_name="Variant image")
    stock = models.PositiveIntegerField(default=0, verbose_name="Stock")
    available = models.BooleanField(default=False, verbose_name="Available")

    class Meta:
        ordering = ("variant__group", "variant__order", "variant__name")
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


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="additional_images",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    image = models.ImageField(upload_to="products/additional/%Y/%m/%d/", verbose_name="Image")
    order = models.PositiveIntegerField(default=0, verbose_name="Order")
    alt_text = models.CharField(max_length=200, blank=True, verbose_name="Alt text")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("order", "id")
        verbose_name = "Дополнительное изображение"
        verbose_name_plural = "Дополнительные изображения"

    def __str__(self):
        return self.alt_text or f"{self.product} image {self.pk}"


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


class ProductReview(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="reviews",
        on_delete=models.CASCADE,
        verbose_name="Product",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="product_reviews",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="User",
    )
    author_name = models.CharField(max_length=80, verbose_name="Author name")
    rating = models.PositiveSmallIntegerField(
        validators=(MinValueValidator(1), MaxValueValidator(5)),
        verbose_name="Rating",
    )
    text = models.TextField(verbose_name="Review text")
    is_verified = models.BooleanField(default=False, verbose_name="Verified")
    is_approved = models.BooleanField(default=True, verbose_name="Approved")
    helpful_count = models.PositiveIntegerField(default=0, verbose_name="Helpful")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created",)
        verbose_name = "Product review"
        verbose_name_plural = "Product reviews"

    def clean(self):
        super().clean()
        if not self.user_id and not self.author_name.strip():
            raise ValidationError({"author_name": "Author name is required."})
        if not self.text.strip():
            raise ValidationError({"text": "Review text is required."})

    def save(self, *args, **kwargs):
        if self.user_id and not self.author_name:
            self.author_name = self.user.get_username()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.author_name} / {self.product} / {self.rating}"


class ProductReviewHelpful(models.Model):
    review = models.ForeignKey(
        ProductReview,
        related_name="helpful_votes",
        on_delete=models.CASCADE,
        verbose_name="Review",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="review_helpful_votes",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="User",
    )
    session_key = models.CharField(max_length=40, blank=True, db_index=True, verbose_name="Session key")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created",)
        verbose_name = "Review helpful vote"
        verbose_name_plural = "Review helpful votes"
        constraints = (
            models.UniqueConstraint(
                fields=("review", "user"),
                condition=Q(user__isnull=False),
                name="main_review_helpful_unique_user",
            ),
            models.UniqueConstraint(
                fields=("review", "session_key"),
                condition=Q(user__isnull=True) & ~Q(session_key=""),
                name="main_review_helpful_unique_session",
            ),
        )

    def clean(self):
        super().clean()
        if not self.user_id and not self.session_key:
            raise ValidationError("Review helpful vote must have either user or session key.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        owner = self.user or self.session_key
        return f"{owner} -> {self.review_id}"


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


class Cart(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="carts",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name="User",
    )
    session_key = models.CharField(max_length=40, blank=True, db_index=True, verbose_name="Session key")
    is_active = models.BooleanField(default=True, verbose_name="Active")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated",)
        verbose_name = "Cart"
        verbose_name_plural = "Carts"
        constraints = (
            models.UniqueConstraint(
                fields=("user",),
                condition=Q(is_active=True, user__isnull=False),
                name="main_cart_unique_active_user",
            ),
            models.UniqueConstraint(
                fields=("session_key",),
                condition=Q(is_active=True, user__isnull=True),
                name="main_cart_unique_active_session",
            ),
        )

    def clean(self):
        super().clean()
        if not self.user_id and not self.session_key:
            raise ValidationError("Cart must have either user or session key.")

    @property
    def total_quantity(self):
        return sum(item.quantity for item in self.items.all())

    @property
    def total_price(self):
        return sum((item.total_price for item in self.items.all()), Decimal("0.00"))

    def __str__(self):
        owner = self.user or self.session_key
        return f"Cart {self.pk or 'new'} / {owner}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE, verbose_name="Cart")
    product = models.ForeignKey(Product, related_name="cart_items", on_delete=models.CASCADE, verbose_name="Product")
    product_variant = models.ForeignKey(
        ProductVariant,
        related_name="cart_items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Product variant",
    )
    selected_variant_ids = models.JSONField(default=list, blank=True, verbose_name="Selected variant ids")
    quantity = models.PositiveIntegerField(default=1, verbose_name="Quantity")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Price")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated",)
        verbose_name = "Cart item"
        verbose_name_plural = "Cart items"
        constraints = (
            models.UniqueConstraint(
                fields=("cart", "product", "product_variant"),
                name="main_cartitem_unique_product_variant",
            ),
        )

    def save(self, *args, **kwargs):
        if not self.price:
            self.price = self.product.price
        super().save(*args, **kwargs)

    @property
    def total_price(self):
        return self.price * self.quantity

    def __str__(self):
        variant = f" / {self.product_variant.variant.name}" if self.product_variant_id else ""
        return f"{self.product}{variant} x {self.quantity}"
