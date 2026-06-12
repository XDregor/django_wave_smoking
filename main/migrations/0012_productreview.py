import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0011_cartitem_selected_variant_ids"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductReview",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("author_name", models.CharField(max_length=80, verbose_name="Author name")),
                (
                    "rating",
                    models.PositiveSmallIntegerField(
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(5),
                        ],
                        verbose_name="Rating",
                    ),
                ),
                ("text", models.TextField(verbose_name="Review text")),
                ("pros", models.CharField(blank=True, max_length=300, verbose_name="Pros")),
                ("cons", models.CharField(blank=True, max_length=300, verbose_name="Cons")),
                ("is_verified", models.BooleanField(default=False, verbose_name="Verified")),
                ("is_approved", models.BooleanField(default=True, verbose_name="Approved")),
                ("helpful_count", models.PositiveIntegerField(default=0, verbose_name="Helpful")),
                ("unhelpful_count", models.PositiveIntegerField(default=0, verbose_name="Unhelpful")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reviews",
                        to="main.product",
                        verbose_name="Product",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="product_reviews",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={
                "verbose_name": "Product review",
                "verbose_name_plural": "Product reviews",
                "ordering": ("-created",),
            },
        ),
    ]
