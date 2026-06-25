from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0024_remove_product_specifications_text"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="sku_root_old_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=10,
                null=True,
                verbose_name="SKU root base price",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="sku_root_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=10,
                null=True,
                verbose_name="SKU root final price",
            ),
        ),
    ]
