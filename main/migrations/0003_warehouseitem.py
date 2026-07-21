import django.db.models.deletion
import main.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0002_clientprofile"),
    ]

    operations = [
        migrations.CreateModel(
            name="WarehouseItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(db_index=True, max_length=140, verbose_name="Name")),
                ("image", models.ImageField(blank=True, upload_to=main.models.warehouse_item_image_upload_to, verbose_name="Image")),
                ("quantity", models.PositiveIntegerField(default=0, verbose_name="Quantity")),
                ("note", models.CharField(blank=True, max_length=240, verbose_name="Warehouse note")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "product",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="warehouse_item",
                        to="main.product",
                        verbose_name="Product draft",
                    ),
                ),
            ],
            options={
                "verbose_name": "Warehouse item",
                "verbose_name_plural": "Warehouse items",
                "ordering": ("name", "id"),
            },
        ),
    ]
