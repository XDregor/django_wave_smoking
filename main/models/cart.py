from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .product import Product, ProductSKU, ProductVariant

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
    product_sku = models.ForeignKey(
        ProductSKU,
        related_name="cart_items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Product SKU",
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
            models.UniqueConstraint(
                fields=("cart", "product", "product_sku"),
                name="main_cartitem_unique_product_sku",
            ),
        )

    def save(self, *args, **kwargs):
        if not self.price:
            self.price = self.product_sku.price if self.product_sku_id else self.product.price
        super().save(*args, **kwargs)

    @property
    def total_price(self):
        return self.price * self.quantity

    def __str__(self):
        if self.product_sku_id:
            variant = " / " + ", ".join(option.name for option in self.product_sku.options.all())
        else:
            variant = f" / {self.product_variant.variant.name}" if self.product_variant_id else ""
        return f"{self.product}{variant} x {self.quantity}"
