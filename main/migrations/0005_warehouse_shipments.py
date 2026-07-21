from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0004_warehousebatch_alter_warehouseitem_options_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="WarehouseCounterparty",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(db_index=True, max_length=140, verbose_name="Counterparty")),
                ("contact_name", models.CharField(blank=True, max_length=140, verbose_name="Contact name")),
                ("note", models.CharField(blank=True, max_length=240, verbose_name="Note")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Warehouse counterparty",
                "verbose_name_plural": "Warehouse counterparties",
                "ordering": ("title", "id"),
            },
        ),
        migrations.CreateModel(
            name="WarehouseShippingPhone",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(blank=True, max_length=120, verbose_name="Label")),
                ("phone", models.CharField(db_index=True, max_length=32, unique=True, verbose_name="Phone")),
                ("pin_code", models.CharField(max_length=64, verbose_name="PIN code")),
                ("is_active", models.BooleanField(db_index=True, default=True, verbose_name="Active")),
                ("note", models.CharField(blank=True, max_length=240, verbose_name="Note")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Warehouse shipping phone",
                "verbose_name_plural": "Warehouse shipping phones",
                "ordering": ("phone", "id"),
            },
        ),
        migrations.CreateModel(
            name="WarehouseShipmentOrder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient_last_name", models.CharField(db_index=True, max_length=80, verbose_name="Recipient last name")),
                ("recipient_first_name", models.CharField(db_index=True, max_length=80, verbose_name="Recipient first name")),
                ("recipient_phone", models.CharField(db_index=True, max_length=32, verbose_name="Recipient phone")),
                ("delivery_type", models.CharField(choices=[("branch", "Branch"), ("locker", "Locker"), ("courier", "Courier")], db_index=True, default="branch", max_length=16, verbose_name="Delivery type")),
                ("delivery_city", models.CharField(blank=True, max_length=120, verbose_name="Delivery city")),
                ("delivery_destination", models.CharField(max_length=240, verbose_name="Delivery destination")),
                ("total_price", models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name="Order price")),
                ("status", models.CharField(choices=[("created", "Created"), ("ttn_assigned", "TTN assigned"), ("shipped", "Shipped"), ("cancelled", "Cancelled")], db_index=True, default="created", max_length=16, verbose_name="Status")),
                ("ttn", models.CharField(blank=True, db_index=True, max_length=64, verbose_name="TTN")),
                ("note", models.CharField(blank=True, max_length=240, verbose_name="Note")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now, verbose_name="Created at")),
                ("ttn_assigned_at", models.DateTimeField(blank=True, null=True, verbose_name="TTN assigned at")),
                ("shipped_at", models.DateTimeField(blank=True, null=True, verbose_name="Shipped at")),
                ("cancelled_at", models.DateTimeField(blank=True, null=True, verbose_name="Cancelled at")),
                ("updated", models.DateTimeField(auto_now=True)),
                ("counterparty", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="shipment_orders", to="main.warehousecounterparty", verbose_name="Counterparty")),
                ("shipping_phone", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="shipment_orders", to="main.warehouseshippingphone", verbose_name="Shipping phone")),
            ],
            options={
                "verbose_name": "Warehouse shipment order",
                "verbose_name_plural": "Warehouse shipment orders",
                "ordering": ("-created_at", "-id"),
            },
        ),
        migrations.CreateModel(
            name="WarehouseShipmentOrderItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_name", models.CharField(max_length=140, verbose_name="Item name")),
                ("quantity", models.PositiveIntegerField(default=1, verbose_name="Quantity")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="main.warehouseshipmentorder", verbose_name="Shipment order")),
                ("warehouse_item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="shipment_order_items", to="main.warehouseitem", verbose_name="Warehouse item")),
            ],
            options={
                "verbose_name": "Warehouse shipment item",
                "verbose_name_plural": "Warehouse shipment items",
                "ordering": ("id",),
            },
        ),
    ]
