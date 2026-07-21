from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def migrate_existing_stock_to_initial_batch(apps, schema_editor):
    WarehouseBatch = apps.get_model("main", "WarehouseBatch")
    WarehouseItem = apps.get_model("main", "WarehouseItem")
    WarehouseBatchItem = apps.get_model("main", "WarehouseBatchItem")

    items = list(WarehouseItem.objects.filter(quantity__gt=0).order_by("received_at", "id"))
    if not items:
        return

    first_date = min((item.received_at for item in items if item.received_at), default=django.utils.timezone.localdate())
    batch, _ = WarehouseBatch.objects.get_or_create(
        title="Первое поступление",
        defaults={
            "arrived_at": first_date,
            "note": "Автоматически создано из существующих остатков склада.",
        },
    )

    for item in items:
        if WarehouseBatchItem.objects.filter(batch=batch, warehouse_item=item).exists():
            continue
        WarehouseBatchItem.objects.create(
            batch=batch,
            warehouse_item=item,
            item_name=item.name,
            quantity=item.quantity,
        )
        if not item.batch_id:
            item.batch_id = batch.id
            item.received_at = batch.arrived_at
            item.save(update_fields=("batch", "received_at", "updated"))


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0006_warehousecounterparty_card_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="warehouseitem",
            name="price",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=10, verbose_name="Warehouse price"),
        ),
        migrations.CreateModel(
            name="WarehouseBatchItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_name", models.CharField(max_length=140, verbose_name="Item name")),
                ("quantity", models.PositiveIntegerField(default=0, verbose_name="Quantity")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("batch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="batch_items", to="main.warehousebatch", verbose_name="Warehouse batch")),
                ("warehouse_item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="batch_entries", to="main.warehouseitem", verbose_name="Warehouse item")),
            ],
            options={
                "verbose_name": "Warehouse batch item",
                "verbose_name_plural": "Warehouse batch items",
                "ordering": ("id",),
            },
        ),
        migrations.RunPython(migrate_existing_stock_to_initial_batch, migrations.RunPython.noop),
    ]
