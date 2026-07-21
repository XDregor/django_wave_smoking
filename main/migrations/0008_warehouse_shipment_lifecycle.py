from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0007_warehouse_batch_items_and_price"),
    ]

    operations = [
        migrations.AlterField(
            model_name="warehouseshipmentorder",
            name="status",
            field=models.CharField(
                choices=[
                    ("created", "Created"),
                    ("ttn_assigned", "TTN assigned"),
                    ("shipped", "Shipped"),
                    ("received", "Received"),
                    ("return_open", "Return open"),
                    ("return_closed", "Return closed"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="created",
                max_length=16,
                verbose_name="Status",
            ),
        ),
        migrations.AddField(
            model_name="warehouseshipmentorder",
            name="received_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Received at"),
        ),
        migrations.AddField(
            model_name="warehouseshipmentorder",
            name="return_closed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Return closed at"),
        ),
        migrations.AddField(
            model_name="warehouseshipmentorder",
            name="return_opened_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Return opened at"),
        ),
    ]
