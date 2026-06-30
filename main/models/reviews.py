from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q

from .product import Product

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
