from datetime import timedelta

from django.db import models
from django.db.models import Q, Sum
from django.utils import timezone

from . import warehouse_item_image_upload_to
from .product import Product


class WarehouseBatch(models.Model):
    title = models.CharField(max_length=120, db_index=True, verbose_name="Batch title")
    arrived_at = models.DateField(db_index=True, verbose_name="Arrival date")
    note = models.CharField(max_length=240, blank=True, verbose_name="Batch note")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-arrived_at", "-id")
        verbose_name = "Warehouse batch"
        verbose_name_plural = "Warehouse batches"

    def __str__(self):
        return f"{self.title} · {self.arrived_at:%d.%m.%Y}"


class WarehouseItem(models.Model):
    batch = models.ForeignKey(
        WarehouseBatch,
        related_name="items",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Warehouse batch",
    )
    product = models.OneToOneField(
        Product,
        related_name="warehouse_item",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Product draft",
    )
    name = models.CharField(max_length=140, db_index=True, verbose_name="Name")
    image = models.ImageField(upload_to=warehouse_item_image_upload_to, blank=True, verbose_name="Image")
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Warehouse price")
    quantity = models.PositiveIntegerField(default=0, verbose_name="Quantity")
    received_at = models.DateField(default=timezone.localdate, db_index=True, verbose_name="Arrival date")
    note = models.CharField(max_length=240, blank=True, verbose_name="Warehouse note")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-received_at", "name", "id")
        verbose_name = "Warehouse item"
        verbose_name_plural = "Warehouse items"

    @property
    def stock_state(self):
        if self.quantity <= 0:
            return "out"
        if self.quantity <= 3:
            return "low"
        return "ok"

    def sync_product_stock(self):
        if not self.product_id:
            return
        update_fields = ["stock", "price", "updated"]
        self.product.stock = self.quantity
        self.product.price = self.price
        if self.image and not self.product.image:
            self.product.image = self.image.name
            update_fields.append("image")
        if self.name and self.product.name != self.name:
            self.product.name = self.name
            update_fields.append("name")
        self.product.available = False
        update_fields.append("available")
        self.product.save(update_fields=update_fields)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.sync_product_stock()

    def __str__(self):
        return f"{self.name} x {self.quantity}"


class WarehouseBatchItem(models.Model):
    batch = models.ForeignKey(
        WarehouseBatch,
        related_name="batch_items",
        on_delete=models.CASCADE,
        verbose_name="Warehouse batch",
    )
    warehouse_item = models.ForeignKey(
        WarehouseItem,
        related_name="batch_entries",
        on_delete=models.PROTECT,
        verbose_name="Warehouse item",
    )
    item_name = models.CharField(max_length=140, verbose_name="Item name")
    quantity = models.PositiveIntegerField(default=0, verbose_name="Quantity")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("id",)
        verbose_name = "Warehouse batch item"
        verbose_name_plural = "Warehouse batch items"

    def save(self, *args, **kwargs):
        if not self.item_name and self.warehouse_item_id:
            self.item_name = self.warehouse_item.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"


class WarehouseWriteOff(models.Model):
    written_off_at = models.DateField(default=timezone.localdate, db_index=True, verbose_name="Write-off date")
    note = models.CharField(max_length=240, blank=True, verbose_name="Write-off note")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-written_off_at", "-id")
        verbose_name = "Warehouse write-off"
        verbose_name_plural = "Warehouse write-offs"

    def __str__(self):
        return f"Write-off #{self.pk or 'new'} · {self.written_off_at:%d.%m.%Y}"


class WarehouseWriteOffItem(models.Model):
    write_off = models.ForeignKey(
        WarehouseWriteOff,
        related_name="items",
        on_delete=models.CASCADE,
        verbose_name="Warehouse write-off",
    )
    warehouse_item = models.ForeignKey(
        WarehouseItem,
        related_name="write_off_entries",
        on_delete=models.PROTECT,
        verbose_name="Warehouse item",
    )
    item_name = models.CharField(max_length=140, verbose_name="Item name")
    quantity = models.PositiveIntegerField(default=0, verbose_name="Quantity")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("id",)
        verbose_name = "Warehouse write-off item"
        verbose_name_plural = "Warehouse write-off items"

    def save(self, *args, **kwargs):
        if not self.item_name and self.warehouse_item_id:
            self.item_name = self.warehouse_item.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"


class WarehouseCounterparty(models.Model):
    title = models.CharField(max_length=140, db_index=True, verbose_name="Counterparty")
    contact_name = models.CharField(max_length=140, blank=True, verbose_name="Contact name")
    note = models.CharField(max_length=240, blank=True, verbose_name="Note")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("title", "id")
        verbose_name = "Warehouse counterparty"
        verbose_name_plural = "Warehouse counterparties"

    def __str__(self):
        return self.title


class WarehouseCounterpartyCard(models.Model):
    counterparty = models.ForeignKey(
        WarehouseCounterparty,
        related_name="cards",
        on_delete=models.CASCADE,
        verbose_name="Counterparty",
    )
    number = models.CharField(max_length=64, unique=True, db_index=True, verbose_name="Card number")
    is_primary = models.BooleanField(default=False, db_index=True, verbose_name="Primary")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=("counterparty",),
                condition=Q(is_primary=True),
                name="unique_primary_card_per_warehouse_counterparty",
            ),
        ]
        verbose_name = "Warehouse counterparty card"
        verbose_name_plural = "Warehouse counterparty cards"

    def __str__(self):
        return f"{self.counterparty}: {self.number}"


class WarehouseShippingPhone(models.Model):
    LIMIT_AMOUNT = 30000
    LIMIT_WINDOW_DAYS = 31

    label = models.CharField(max_length=120, blank=True, verbose_name="Label")
    phone = models.CharField(max_length=32, unique=True, db_index=True, verbose_name="Phone")
    pin_code = models.CharField(max_length=64, verbose_name="PIN code")
    is_active = models.BooleanField(default=True, db_index=True, verbose_name="Active")
    note = models.CharField(max_length=240, blank=True, verbose_name="Note")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("phone", "id")
        verbose_name = "Warehouse shipping phone"
        verbose_name_plural = "Warehouse shipping phones"

    @property
    def used_limit_amount(self):
        limit_started_at = timezone.now() - timedelta(days=self.LIMIT_WINDOW_DAYS)
        total = (
            self.shipment_orders.exclude(status=WarehouseShipmentOrder.Status.CANCELLED)
            .filter(created_at__gte=limit_started_at)
            .aggregate(total=Sum("total_price"))["total"]
        )
        return total or 0

    @property
    def remaining_limit_amount(self):
        return max(0, self.LIMIT_AMOUNT - self.used_limit_amount)

    def __str__(self):
        return self.label or self.phone


class WarehouseShipmentOrder(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        TTN_ASSIGNED = "ttn_assigned", "TTN assigned"
        SHIPPED = "shipped", "Shipped"
        RECEIVED = "received", "Received"
        RETURN_OPEN = "return_open", "Return open"
        RETURN_CLOSED = "return_closed", "Return closed"
        CANCELLED = "cancelled", "Cancelled"

    class DeliveryType(models.TextChoices):
        BRANCH = "branch", "Branch"
        LOCKER = "locker", "Locker"
        COURIER = "courier", "Courier"

    counterparty = models.ForeignKey(
        WarehouseCounterparty,
        related_name="shipment_orders",
        on_delete=models.PROTECT,
        verbose_name="Counterparty",
    )
    counterparty_card = models.ForeignKey(
        WarehouseCounterpartyCard,
        related_name="shipment_orders",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name="Counterparty card",
    )
    shipping_phone = models.ForeignKey(
        WarehouseShippingPhone,
        related_name="shipment_orders",
        on_delete=models.PROTECT,
        verbose_name="Shipping phone",
    )
    recipient_last_name = models.CharField(max_length=80, db_index=True, verbose_name="Recipient last name")
    recipient_first_name = models.CharField(max_length=80, db_index=True, verbose_name="Recipient first name")
    recipient_phone = models.CharField(max_length=32, db_index=True, verbose_name="Recipient phone")
    delivery_type = models.CharField(
        max_length=16,
        choices=DeliveryType.choices,
        default=DeliveryType.BRANCH,
        db_index=True,
        verbose_name="Delivery type",
    )
    delivery_city = models.CharField(max_length=120, blank=True, verbose_name="Delivery city")
    delivery_destination = models.CharField(max_length=240, verbose_name="Delivery destination")
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Order price")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.CREATED,
        db_index=True,
        verbose_name="Status",
    )
    ttn = models.CharField(max_length=64, blank=True, db_index=True, verbose_name="TTN")
    note = models.CharField(max_length=240, blank=True, verbose_name="Note")
    created_at = models.DateTimeField(default=timezone.now, db_index=True, verbose_name="Created at")
    ttn_assigned_at = models.DateTimeField(null=True, blank=True, verbose_name="TTN assigned at")
    shipped_at = models.DateTimeField(null=True, blank=True, verbose_name="Shipped at")
    received_at = models.DateTimeField(null=True, blank=True, verbose_name="Received at")
    return_opened_at = models.DateTimeField(null=True, blank=True, verbose_name="Return opened at")
    return_closed_at = models.DateTimeField(null=True, blank=True, verbose_name="Return closed at")
    cancelled_at = models.DateTimeField(null=True, blank=True, verbose_name="Cancelled at")
    points_closed_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name="Points closed at")
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        constraints = [
            models.UniqueConstraint(
                fields=("ttn",),
                condition=~Q(ttn=""),
                name="unique_non_empty_warehouse_shipment_ttn",
            ),
        ]
        verbose_name = "Warehouse shipment order"
        verbose_name_plural = "Warehouse shipment orders"

    @property
    def is_reserved(self):
        return self.status in {self.Status.CREATED, self.Status.TTN_ASSIGNED}

    @property
    def recipient_full_name(self):
        return f"{self.recipient_last_name} {self.recipient_first_name}".strip()

    def __str__(self):
        return f"Shipment #{self.pk or 'new'} · {self.recipient_full_name}"


class WarehouseShipmentOrderItem(models.Model):
    order = models.ForeignKey(
        WarehouseShipmentOrder,
        related_name="items",
        on_delete=models.CASCADE,
        verbose_name="Shipment order",
    )
    warehouse_item = models.ForeignKey(
        WarehouseItem,
        related_name="shipment_order_items",
        on_delete=models.PROTECT,
        verbose_name="Warehouse item",
    )
    item_name = models.CharField(max_length=140, verbose_name="Item name")
    quantity = models.PositiveIntegerField(default=1, verbose_name="Quantity")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("id",)
        verbose_name = "Warehouse shipment item"
        verbose_name_plural = "Warehouse shipment items"

    def save(self, *args, **kwargs):
        if not self.item_name and self.warehouse_item_id:
            self.item_name = self.warehouse_item.name
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"


class WarehousePointsWeekClose(models.Model):
    period_month = models.CharField(max_length=7, db_index=True, verbose_name="Points month")
    period_start = models.DateTimeField(verbose_name="Period start")
    period_end = models.DateTimeField(verbose_name="Period end")
    points = models.PositiveIntegerField(default=0, verbose_name="Points")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-period_end", "-id")
        verbose_name = "Warehouse points week close"
        verbose_name_plural = "Warehouse points week closes"

    def __str__(self):
        return f"{self.period_month} · {self.points}"
