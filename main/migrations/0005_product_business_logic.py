from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


def unique_slug(model, value):
    base_slug = slugify(value) or "item"
    slug = base_slug
    index = 2
    while model.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{index}"
        index += 1
    return slug


def migrate_product_data(apps, schema_editor):
    Brand = apps.get_model("main", "Brand")
    Product = apps.get_model("main", "Product")

    for product in Product.objects.all():
        brand_name = (getattr(product, "brand_name", "") or "").strip()
        if brand_name:
            brand, _ = Brand.objects.get_or_create(
                name=brand_name,
                defaults={"slug": unique_slug(Brand, brand_name)},
            )
            product.brand = brand

        product.variants = product.available_sizes or product.sizes or []

        if product.old_price is None:
            product.old_price = product.price

        if product.old_price and product.price and product.old_price > product.price:
            discount = (Decimal(1) - (product.price / product.old_price)) * Decimal(100)
            product.discount_percent = int(discount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

        badge = product.badge or {}
        badge_type = badge.get("type") if isinstance(badge, dict) else badge
        if badge_type in ("new", "hit") and not product.discount_percent:
            product.badge_type = badge_type

        product.save(update_fields=("brand", "variants", "old_price", "discount_percent", "badge_type"))


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("main", "0004_product_badge_product_brand_product_liked_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Brand",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
                ("slug", models.SlugField(blank=True, max_length=100, unique=True)),
            ],
            options={
                "verbose_name": "Brand",
                "verbose_name_plural": "Brands",
                "ordering": ("name",),
            },
        ),
        migrations.RenameField(
            model_name="product",
            old_name="brand",
            new_name="brand_name",
        ),
        migrations.AddField(
            model_name="product",
            name="brand",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="products", to="main.brand", verbose_name="Brand"),
        ),
        migrations.AddField(
            model_name="product",
            name="stock",
            field=models.PositiveIntegerField(default=0, verbose_name="Stock"),
        ),
        migrations.AddField(
            model_name="product",
            name="variants",
            field=models.JSONField(blank=True, default=list, verbose_name="Variants"),
        ),
        migrations.AddField(
            model_name="product",
            name="discount_percent",
            field=models.PositiveSmallIntegerField(blank=True, choices=[(value, f"{value}%") for value in range(0, 101, 5)], null=True, verbose_name="Discount percent"),
        ),
        migrations.AddField(
            model_name="product",
            name="badge_type",
            field=models.CharField(blank=True, choices=[("", "No badge"), ("new", "New"), ("hit", "Hit")], default="", max_length=10, verbose_name="Badge"),
        ),
        migrations.RunPython(migrate_product_data, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="product",
            name="brand_name",
        ),
        migrations.RemoveField(
            model_name="product",
            name="sizes",
        ),
        migrations.RemoveField(
            model_name="product",
            name="available_sizes",
        ),
        migrations.RemoveField(
            model_name="product",
            name="liked",
        ),
        migrations.RemoveField(
            model_name="product",
            name="badge",
        ),
        migrations.AlterField(
            model_name="product",
            name="old_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name="Base price"),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="product",
            name="likes",
            field=models.PositiveIntegerField(default=0, verbose_name="Likes"),
        ),
        migrations.AlterField(
            model_name="product",
            name="slug",
            field=models.SlugField(blank=True, max_length=100, unique=True),
        ),
        migrations.CreateModel(
            name="ProductLike",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="product_likes", to="main.product")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Product like",
                "verbose_name_plural": "Product likes",
                "unique_together": {("user", "product")},
            },
        ),
    ]
