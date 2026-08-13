from datetime import date
from decimal import Decimal
from datetime import datetime
from io import BytesIO
import re
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from .shared import *
from django.db.models import Q
from django.http import HttpResponse


ACTIVE_SHIPMENT_STATUSES = (
    WarehouseShipmentOrder.Status.CREATED,
    WarehouseShipmentOrder.Status.TTN_ASSIGNED,
)


class WarehouseCounterpartyCardInline(TabularInline):
    model = WarehouseCounterpartyCard
    extra = 0
    fields = ("number", "is_primary", "created")
    readonly_fields = ("created",)


@admin.register(WarehouseCounterparty)
class WarehouseCounterpartyAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("title", "primary_card_number", "cards_count", "orders_count", "created")
    search_fields = ("title", "cards__number", "contact_name", "note")
    readonly_fields = ("created", "updated")
    inlines = (WarehouseCounterpartyCardInline,)

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("cards")

    @admin.display(description="Основная карта")
    def primary_card_number(self, obj):
        primary_card = next((card for card in obj.cards.all() if card.is_primary), None)
        return primary_card.number if primary_card else "—"

    @admin.display(description="Карты")
    def cards_count(self, obj):
        return len(obj.cards.all())

    @admin.display(description="Заказы")
    def orders_count(self, obj):
        return obj.shipment_orders.count()


@admin.register(WarehouseShippingPhone)
class WarehouseShippingPhoneAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("phone", "label", "is_active", "used_limit_badge", "remaining_limit_badge", "created")
    search_fields = ("phone", "label", "note")
    list_filter = ("is_active",)
    readonly_fields = ("created", "updated")

    @admin.display(description="Использовано")
    def used_limit_badge(self, obj):
        return f"{obj.used_limit_amount} грн"

    @admin.display(description="Остаток лимита")
    def remaining_limit_badge(self, obj):
        return f"{obj.remaining_limit_amount} грн"


@admin.register(WarehouseBatch)
class WarehouseBatchAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("title", "arrived_at", "items_count", "total_quantity", "created")
    search_fields = ("title", "note")
    readonly_fields = ("created", "updated")

    @admin.display(description="Позиции")
    def items_count(self, obj):
        return obj.batch_items.count()

    @admin.display(description="Единицы")
    def total_quantity(self, obj):
        return obj.batch_items.aggregate(total=Sum("quantity"))["total"] or 0


@admin.register(WarehouseWriteOff)
class WarehouseWriteOffAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("id", "written_off_at", "items_count", "total_quantity", "created")
    search_fields = ("note", "items__item_name")
    readonly_fields = ("created", "updated")

    @admin.display(description="Позиции")
    def items_count(self, obj):
        return obj.items.count()

    @admin.display(description="Единицы")
    def total_quantity(self, obj):
        return obj.items.aggregate(total=Sum("quantity"))["total"] or 0


@admin.register(WarehouseShipmentOrder)
class WarehouseShipmentOrderAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("id", "recipient_full_name", "counterparty", "counterparty_card", "shipping_phone", "total_price", "status", "ttn", "created_at")
    search_fields = (
        "recipient_last_name",
        "recipient_first_name",
        "recipient_phone",
        "counterparty__title",
        "counterparty_card__number",
        "shipping_phone__phone",
        "ttn",
    )
    list_filter = ("status", "delivery_type", "counterparty", "counterparty_card", "shipping_phone")
    readonly_fields = (
        "created_at",
        "ttn_assigned_at",
        "shipped_at",
        "received_at",
        "return_opened_at",
        "return_closed_at",
        "cancelled_at",
        "updated",
    )

    def changelist_view(self, request, extra_context=None):
        return redirect("admin:main_warehouseshipmentorder_shipments")

    def get_urls(self):
        custom_urls = [
            path(
                "shipments/",
                self.admin_site.admin_view(self.shipments_view),
                name="main_warehouseshipmentorder_shipments",
            ),
            path(
                "shipments/create/",
                self.admin_site.admin_view(self.create_shipment_view),
                name="main_warehouseshipmentorder_create",
            ),
            path(
                "shipments/export/",
                self.admin_site.admin_view(self.export_shipments_view),
                name="main_warehouseshipmentorder_export",
            ),
            path(
                "shipments/points/close-week/",
                self.admin_site.admin_view(self.close_points_week_view),
                name="main_warehouseshipmentorder_close_points_week",
            ),
            path(
                "shipments/counterparties/create/",
                self.admin_site.admin_view(self.create_counterparty_view),
                name="main_warehouseshipmentorder_create_counterparty",
            ),
            path(
                "shipments/counterparties/<int:counterparty_id>/update/",
                self.admin_site.admin_view(self.update_counterparty_view),
                name="main_warehouseshipmentorder_update_counterparty",
            ),
            path(
                "shipments/counterparties/<int:counterparty_id>/delete/",
                self.admin_site.admin_view(self.delete_counterparty_view),
                name="main_warehouseshipmentorder_delete_counterparty",
            ),
            path(
                "shipments/counterparties/<int:counterparty_id>/cards/create/",
                self.admin_site.admin_view(self.create_counterparty_card_view),
                name="main_warehouseshipmentorder_create_counterparty_card",
            ),
            path(
                "shipments/counterparty-cards/<int:card_id>/update/",
                self.admin_site.admin_view(self.update_counterparty_card_view),
                name="main_warehouseshipmentorder_update_counterparty_card",
            ),
            path(
                "shipments/counterparty-cards/<int:card_id>/delete/",
                self.admin_site.admin_view(self.delete_counterparty_card_view),
                name="main_warehouseshipmentorder_delete_counterparty_card",
            ),
            path(
                "shipments/phones/create/",
                self.admin_site.admin_view(self.create_phone_view),
                name="main_warehouseshipmentorder_create_phone",
            ),
            path(
                "shipments/phones/<int:phone_id>/update/",
                self.admin_site.admin_view(self.update_phone_view),
                name="main_warehouseshipmentorder_update_phone",
            ),
            path(
                "shipments/phones/<int:phone_id>/delete/",
                self.admin_site.admin_view(self.delete_phone_view),
                name="main_warehouseshipmentorder_delete_phone",
            ),
            path(
                "shipments/<int:order_id>/ttn/",
                self.admin_site.admin_view(self.assign_ttn_view),
                name="main_warehouseshipmentorder_ttn",
            ),
            path(
                "shipments/<int:order_id>/ship/",
                self.admin_site.admin_view(self.ship_order_view),
                name="main_warehouseshipmentorder_ship",
            ),
            path(
                "shipments/<int:order_id>/receive/",
                self.admin_site.admin_view(self.receive_order_view),
                name="main_warehouseshipmentorder_receive",
            ),
            path(
                "shipments/<int:order_id>/return/open/",
                self.admin_site.admin_view(self.open_return_view),
                name="main_warehouseshipmentorder_return_open",
            ),
            path(
                "shipments/<int:order_id>/return/close/",
                self.admin_site.admin_view(self.close_return_view),
                name="main_warehouseshipmentorder_return_close",
            ),
            path(
                "shipments/<int:order_id>/delete/",
                self.admin_site.admin_view(self.delete_order_view),
                name="main_warehouseshipmentorder_delete_shipment",
            ),
        ]
        return custom_urls + super().get_urls()

    def shipments_view(self, request):
        self.ensure_single_active_phone()
        orders = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items", "items__warehouse_item")
            .order_by("-created_at", "-id")
        )
        warehouse_items = list(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id"))
        counterparties = list(self.counterparty_queryset())
        phones = list(self.phone_queryset())

        context = {
            **self.admin_site.each_context(request),
            "title": "Отправки со склада",
            "shipments_payload": {
                "orders": [self.serialize_order(order) for order in orders],
                "items": self.serialize_warehouse_items(warehouse_items),
                "counterparties": [self.serialize_counterparty(counterparty) for counterparty in counterparties],
                "phones": [self.serialize_phone(phone) for phone in phones],
                "pointsClosures": [self.serialize_points_closure(item) for item in WarehousePointsWeekClose.objects.order_by("-period_end", "-id")],
                "limitAmount": WarehouseShippingPhone.LIMIT_AMOUNT,
                "urls": {
                    "create": reverse("admin:main_warehouseshipmentorder_create"),
                    "export": reverse("admin:main_warehouseshipmentorder_export"),
                    "closePointsWeek": reverse("admin:main_warehouseshipmentorder_close_points_week"),
                    "createCounterparty": reverse("admin:main_warehouseshipmentorder_create_counterparty"),
                    "createPhone": reverse("admin:main_warehouseshipmentorder_create_phone"),
                    "warehouse": reverse("admin:main_warehouseitem_warehouse_list"),
                },
            },
        }
        return TemplateResponse(request, "admin_panel/warehouse/warehouse_shipments_page.html", context)

    def ensure_single_active_phone(self):
        active_ids = list(
            WarehouseShippingPhone.objects.filter(is_active=True).order_by("id").values_list("id", flat=True)
        )
        if len(active_ids) > 1:
            WarehouseShippingPhone.objects.filter(id__in=active_ids[1:]).update(is_active=False)
        if not active_ids:
            first_phone = WarehouseShippingPhone.objects.order_by("id").first()
            if first_phone:
                WarehouseShippingPhone.objects.filter(pk=first_phone.pk).update(is_active=True)

    def counterparty_queryset(self):
        return (
            WarehouseCounterparty.objects
            .prefetch_related("cards")
            .annotate(orders_total=Count("shipment_orders", distinct=True))
            .order_by("title", "id")
        )

    def serialize_counterparty_card(self, card):
        if not card:
            return None
        return {
            "id": card.id,
            "number": card.number,
            "isPrimary": card.is_primary,
            "urls": {
                "update": reverse("admin:main_warehouseshipmentorder_update_counterparty_card", args=(card.id,)),
                "delete": reverse("admin:main_warehouseshipmentorder_delete_counterparty_card", args=(card.id,)),
            },
        }

    def serialize_counterparty(self, counterparty):
        cards = sorted(counterparty.cards.all(), key=lambda card: card.id)
        primary_card = next((card for card in cards if card.is_primary), cards[0] if cards else None)
        orders_count = getattr(counterparty, "orders_total", None)
        if orders_count is None:
            orders_count = counterparty.shipment_orders.count()
        return {
            "id": counterparty.id,
            "title": counterparty.title,
            "cardNumber": primary_card.number if primary_card else "",
            "primaryCard": self.serialize_counterparty_card(primary_card),
            "cards": [self.serialize_counterparty_card(card) for card in cards],
            "ordersCount": orders_count,
            "urls": {
                "update": reverse("admin:main_warehouseshipmentorder_update_counterparty", args=(counterparty.id,)),
                "delete": reverse("admin:main_warehouseshipmentorder_delete_counterparty", args=(counterparty.id,)),
                "createCard": reverse("admin:main_warehouseshipmentorder_create_counterparty_card", args=(counterparty.id,)),
            },
        }

    def serialize_phone(self, phone):
        return {
            "id": phone.id,
            "label": phone.label,
            "phone": phone.phone,
            "pinCode": phone.pin_code,
            "isActive": phone.is_active,
            "usedLimit": float(phone.used_limit_amount),
            "remainingLimit": float(phone.remaining_limit_amount),
            "ordersCount": phone.shipment_orders.count(),
            "urls": {
                "update": reverse("admin:main_warehouseshipmentorder_update_phone", args=(phone.id,)),
                "delete": reverse("admin:main_warehouseshipmentorder_delete_phone", args=(phone.id,)),
            },
        }

    def phone_queryset(self):
        return sorted(
            WarehouseShippingPhone.objects.all(),
            key=lambda phone: ((phone.label or phone.phone or "").casefold(), phone.phone, phone.id),
        )

    def shipment_stage_label(self, order):
        if order.status in {WarehouseShipmentOrder.Status.CREATED, WarehouseShipmentOrder.Status.TTN_ASSIGNED}:
            return "Формирование"
        if order.status == WarehouseShipmentOrder.Status.SHIPPED:
            return "Отправлен"
        if order.status == WarehouseShipmentOrder.Status.RETURN_OPEN:
            return "Возврат"
        if order.status == WarehouseShipmentOrder.Status.RECEIVED:
            return "Получен"
        if order.status in {WarehouseShipmentOrder.Status.RETURN_CLOSED, WarehouseShipmentOrder.Status.CANCELLED}:
            return "Возврат закрыт"
        return order.get_status_display()

    def serialize_points_closure(self, closure):
        return {
            "id": closure.id,
            "periodMonth": closure.period_month,
            "periodStart": timezone.localtime(closure.period_start).strftime("%d.%m.%Y %H:%M"),
            "periodEnd": timezone.localtime(closure.period_end).strftime("%d.%m.%Y %H:%M"),
            "points": closure.points,
        }

    def points_month_bounds(self, month_key):
        try:
            year, month = [int(part) for part in str(month_key or "").split("-", 1)]
            period_start = timezone.make_aware(datetime(year, month, 1))
        except (TypeError, ValueError):
            today = timezone.localdate()
            year, month = today.year, today.month
            period_start = timezone.make_aware(datetime(year, month, 1))
            month_key = f"{year}-{month:02d}"
        next_year = year + 1 if month == 12 else year
        next_month = 1 if month == 12 else month + 1
        period_end = timezone.make_aware(datetime(next_year, next_month, 1))
        return str(month_key), period_start, period_end

    def count_points_orders(self, start_at, end_at):
        return WarehouseShipmentOrder.objects.filter(
            status__in=(
                WarehouseShipmentOrder.Status.SHIPPED,
                WarehouseShipmentOrder.Status.RECEIVED,
                WarehouseShipmentOrder.Status.RETURN_OPEN,
                WarehouseShipmentOrder.Status.RETURN_CLOSED,
                WarehouseShipmentOrder.Status.CANCELLED,
            ),
            shipped_at__gt=start_at,
            shipped_at__lte=end_at,
            points_closed_at__isnull=True,
        ).count()

    def xlsx_col(self, index):
        result = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            result = chr(65 + remainder) + result
        return result

    def worksheet_xml(self, rows):
        column_widths = []
        if rows:
            min_widths = {1: 6, 2: 24, 3: 18, 4: 34, 5: 28, 6: 18, 7: 18, 8: 18}
            max_widths = {4: 52, 5: 44}
            for col_index in range(1, max(len(row) for row in rows) + 1):
                values = [str(row[col_index - 1]) for row in rows if len(row) >= col_index]
                max_length = max((len(value) for value in values), default=10)
                min_width = min_widths.get(col_index, 12)
                max_width = max_widths.get(col_index, 32)
                column_widths.append(min(max_width, max(min_width, max_length + 3)))
        cols_xml = "".join(
            f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
            for index, width in enumerate(column_widths, start=1)
        )
        xml_rows = []
        for row_index, row in enumerate(rows, start=1):
            cells = []
            for col_index, value in enumerate(row, start=1):
                ref = f"{self.xlsx_col(col_index)}{row_index}"
                text = escape("" if value is None else str(value))
                style_id = 1 if row_index == 1 else 2
                cells.append(f'<c r="{ref}" s="{style_id}" t="inlineStr"><is><t>{text}</t></is></c>')
            row_height = ' ht="26" customHeight="1"' if row_index == 1 else ' ht="46" customHeight="1"'
            xml_rows.append(f'<row r="{row_index}"{row_height}>{"".join(cells)}</row>')
        dimension = f'A1:{self.xlsx_col(len(column_widths))}{max(1, len(rows))}' if column_widths else "A1"
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<dimension ref="{dimension}"/>'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<cols>{cols_xml}</cols>'
            "<sheetData>"
            f'{"".join(xml_rows)}'
            "</sheetData>"
            f'<autoFilter ref="{dimension}"/>'
            "</worksheet>"
        )

    def xlsx_styles_xml(self):
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2">'
            '<font><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/></font>'
            '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
            '</fonts>'
            '<fills count="3">'
            '<fill><patternFill patternType="none"/></fill>'
            '<fill><patternFill patternType="gray125"/></fill>'
            '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>'
            '</fills>'
            '<borders count="2">'
            '<border><left/><right/><top/><bottom/><diagonal/></border>'
            '<border>'
            '<left style="thin"><color rgb="FFD1D5DB"/></left>'
            '<right style="thin"><color rgb="FFD1D5DB"/></right>'
            '<top style="thin"><color rgb="FFD1D5DB"/></top>'
            '<bottom style="thin"><color rgb="FFD1D5DB"/></bottom>'
            '<diagonal/>'
            '</border>'
            '</borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="3">'
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
            '</cellXfs>'
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            '</styleSheet>'
        )

    def build_xlsx_response(self, filename, sheets):
        workbook_sheets = []
        workbook_rels = []
        buffer = BytesIO()
        with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                '<Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + "".join(
                    f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                    for index in range(1, len(sheets) + 1)
                )
                + "</Types>"
            ))
            archive.writestr("_rels/.rels", (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                "</Relationships>"
            ))
            for index, (title, rows) in enumerate(sheets, start=1):
                sheet_name = escape(title[:31])
                workbook_sheets.append(f'<sheet name="{sheet_name}" sheetId="{index}" r:id="rId{index}"/>')
                workbook_rels.append(
                    f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
                )
                archive.writestr(f"xl/worksheets/sheet{index}.xml", self.worksheet_xml(rows))
            archive.writestr("xl/workbook.xml", (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                f'<sheets>{"".join(workbook_sheets)}</sheets>'
                "</workbook>"
            ))
            archive.writestr("xl/_rels/workbook.xml.rels", (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                f'{"".join(workbook_rels)}'
                f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                "</Relationships>"
            ))
            archive.writestr("xl/styles.xml", self.xlsx_styles_xml())
        response = HttpResponse(
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def get_reserved_by_item(self):
        rows = (
            WarehouseShipmentOrderItem.objects.filter(order__status__in=ACTIVE_SHIPMENT_STATUSES)
            .values("warehouse_item_id")
            .annotate(total=Sum("quantity"))
        )
        return {row["warehouse_item_id"]: row["total"] or 0 for row in rows}

    def serialize_warehouse_items(self, items):
        reserved_by_item = self.get_reserved_by_item()
        payload = []
        for item in items:
            reserved = reserved_by_item.get(item.id, 0)
            available = max(0, item.quantity - reserved)
            payload.append({
                "id": item.id,
                "productId": item.product_id,
                "name": item.name,
                "image": item.image.url if item.image else "",
                "batch": item.batch.title if item.batch_id else "",
                "quantity": item.quantity,
                "reserved": reserved,
                "available": available,
                "price": float(item.price),
                "receivedAt": item.received_at.isoformat(),
            })
        return payload

    def serialize_order(self, order):
        return {
            "id": order.id,
            "status": order.status,
            "statusLabel": self.get_status_label(order.status),
            "counterparty": {
                "id": order.counterparty_id,
                "title": order.counterparty.title,
                "cardNumber": order.counterparty_card.number if order.counterparty_card else "",
            },
            "counterpartyCard": self.serialize_counterparty_card(order.counterparty_card),
            "phone": self.serialize_phone(order.shipping_phone),
            "recipientLastName": order.recipient_last_name,
            "recipientFirstName": order.recipient_first_name,
            "recipientPhone": order.recipient_phone,
            "recipientFullName": order.recipient_full_name,
            "deliveryType": order.delivery_type,
            "deliveryTypeLabel": self.get_delivery_label(order.delivery_type),
            "deliveryCity": order.delivery_city,
            "deliveryDestination": order.delivery_destination,
            "totalPrice": float(order.total_price),
            "ttn": order.ttn,
            "note": order.note,
            "createdAt": timezone.localtime(order.created_at).strftime("%d.%m.%Y %H:%M"),
            "ttnAssignedAt": timezone.localtime(order.ttn_assigned_at).strftime("%d.%m.%Y %H:%M") if order.ttn_assigned_at else "",
            "shippedAt": timezone.localtime(order.shipped_at).strftime("%d.%m.%Y %H:%M") if order.shipped_at else "",
            "receivedAt": timezone.localtime(order.received_at).strftime("%d.%m.%Y %H:%M") if order.received_at else "",
            "returnOpenedAt": timezone.localtime(order.return_opened_at).strftime("%d.%m.%Y %H:%M") if order.return_opened_at else "",
            "returnClosedAt": timezone.localtime(order.return_closed_at).strftime("%d.%m.%Y %H:%M") if order.return_closed_at else "",
            "cancelledAt": timezone.localtime(order.cancelled_at).strftime("%d.%m.%Y %H:%M") if order.cancelled_at else "",
            "pointsClosedAt": timezone.localtime(order.points_closed_at).strftime("%d.%m.%Y %H:%M") if order.points_closed_at else "",
            "items": [
                {
                    "id": line.id,
                    "warehouseItemId": line.warehouse_item_id,
                    "name": line.item_name,
                    "quantity": line.quantity,
                }
                for line in order.items.all()
            ],
            "urls": {
                "ttn": reverse("admin:main_warehouseshipmentorder_ttn", args=(order.id,)),
                "ship": reverse("admin:main_warehouseshipmentorder_ship", args=(order.id,)),
                "receive": reverse("admin:main_warehouseshipmentorder_receive", args=(order.id,)),
                "returnOpen": reverse("admin:main_warehouseshipmentorder_return_open", args=(order.id,)),
                "returnClose": reverse("admin:main_warehouseshipmentorder_return_close", args=(order.id,)),
                "delete": reverse("admin:main_warehouseshipmentorder_delete_shipment", args=(order.id,)),
            },
        }

    def get_status_label(self, status):
        labels = {
            WarehouseShipmentOrder.Status.CREATED: "Создан",
            WarehouseShipmentOrder.Status.TTN_ASSIGNED: "ТТН присвоена",
            WarehouseShipmentOrder.Status.SHIPPED: "Отправлен",
            WarehouseShipmentOrder.Status.RECEIVED: "Получен",
            WarehouseShipmentOrder.Status.RETURN_OPEN: "Возврат открыт",
            WarehouseShipmentOrder.Status.RETURN_CLOSED: "Возврат закрыт",
            WarehouseShipmentOrder.Status.CANCELLED: "Возврат закрыт",
        }
        return labels.get(status, status)

    def get_delivery_label(self, delivery_type):
        labels = {
            WarehouseShipmentOrder.DeliveryType.BRANCH: "Отделение",
            WarehouseShipmentOrder.DeliveryType.LOCKER: "Почтомат",
            WarehouseShipmentOrder.DeliveryType.COURIER: "Курьер",
        }
        return labels.get(delivery_type, delivery_type)

    def export_period_bounds(self, date_from_value, date_to_value):
        start_date = date.fromisoformat(date_from_value)
        end_date = date.fromisoformat(date_to_value)
        period_start = timezone.make_aware(datetime(start_date.year, start_date.month, start_date.day))
        next_day = end_date + timedelta(days=1)
        period_end = timezone.make_aware(datetime(next_day.year, next_day.month, next_day.day))
        return period_start, period_end

    def format_export_datetime(self, value):
        return timezone.localtime(value).strftime("%d.%m.%Y %H:%M") if value else ""

    def order_stage_events(self, order):
        return [
            ("Создана", order.created_at),
            ("ТТН присвоена", order.ttn_assigned_at),
            ("Отправлена", order.shipped_at),
            ("Возврат открыт", order.return_opened_at),
            ("Получена", order.received_at),
            ("Возврат закрыт", order.return_closed_at or order.cancelled_at),
            ("Неделя закрыта", order.points_closed_at),
        ]

    def order_stage_events_in_period(self, order, period_start, period_end):
        return [
            (label, value)
            for label, value in self.order_stage_events(order)
            if value and period_start <= value < period_end
        ]

    def build_stage_journal_rows(self, orders, period_start, period_end):
        rows = [[
            "№",
            "ID",
            "ФИО получателя",
            "Телефон",
            "Контрагент",
            "Карта",
            "Товар",
            "Цена",
            "ТТН",
            "Создана",
            "ТТН присвоена",
            "Отправлена",
            "Возврат открыт",
            "Получена",
            "Возврат закрыт",
            "Неделя закрыта",
            "Текущий статус",
            "Движение за период",
        ]]
        for index, order in enumerate(orders, start=1):
            movement = "; ".join(
                f"{label}: {self.format_export_datetime(value)}"
                for label, value in self.order_stage_events_in_period(order, period_start, period_end)
            )
            rows.append([
                index,
                order.id,
                order.recipient_full_name,
                order.recipient_phone,
                order.counterparty.title,
                order.counterparty_card.number if order.counterparty_card else "",
                ", ".join(f"{item.item_name} x{item.quantity}" for item in order.items.all()),
                "Оплачен заранее" if order.total_price == 0 else f"{order.total_price:g} грн",
                order.ttn,
                self.format_export_datetime(order.created_at),
                self.format_export_datetime(order.ttn_assigned_at),
                self.format_export_datetime(order.shipped_at),
                self.format_export_datetime(order.return_opened_at),
                self.format_export_datetime(order.received_at),
                self.format_export_datetime(order.return_closed_at or order.cancelled_at),
                self.format_export_datetime(order.points_closed_at),
                self.shipment_stage_label(order),
                movement,
            ])
        return rows

    def normalize_decimal(self, value):
        raw_value = str(value or "0").replace(",", ".").strip()
        try:
            return max(Decimal("0.00"), Decimal(raw_value)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return None

    def normalize_phone_value(self, value):
        compact = re.sub(r"\s+", "", strip_tags(str(value or "")))
        compact = re.sub(r"[^\d+]", "", compact)
        if compact.startswith("+"):
            return f"+{compact[1:].replace('+', '')}"
        return compact.replace("+", "")

    def normalize_card_number(self, value):
        return re.sub(r"\D+", "", strip_tags(str(value or "")))

    def parse_items_payload(self, request):
        try:
            rows = json.loads(request.POST.get("items") or "[]")
        except json.JSONDecodeError:
            return None, "Товары указаны неверно."

        items_by_id = {}
        for row in rows:
            try:
                item_id = int(row.get("id"))
                quantity = int(row.get("quantity"))
            except (TypeError, ValueError, AttributeError):
                return None, "Проверьте выбранные товары."
            if item_id > 0 and quantity > 0:
                items_by_id[item_id] = items_by_id.get(item_id, 0) + quantity
        items = [{"id": item_id, "quantity": quantity} for item_id, quantity in items_by_id.items()]
        if not items:
            return None, "Добавьте хотя бы один товар в отправку."
        return items, ""

    def aggregate_shipment_lines(self, lines):
        quantities = {}
        for line in lines:
            quantities[line.warehouse_item_id] = quantities.get(line.warehouse_item_id, 0) + line.quantity
        return quantities

    def get_selected_counterparty(self, request):
        counterparty_id = str(request.POST.get("counterparty_id") or "").strip()
        if not counterparty_id:
            return None, "Укажите контрагента."
        counterparty = WarehouseCounterparty.objects.filter(pk=counterparty_id).first()
        if not counterparty:
            return None, "Контрагент не найден."
        return counterparty, ""

    def get_selected_counterparty_card(self, request, counterparty):
        card_id = str(request.POST.get("counterparty_card_id") or "").strip()
        cards = counterparty.cards.all()
        if card_id:
            card = cards.filter(pk=card_id).first()
        else:
            card = cards.filter(is_primary=True).first()
        if not card:
            return None, "Выберите карту контрагента."
        return card, ""

    def get_selected_phone(self, request):
        phone_id = str(request.POST.get("shipping_phone_id") or "").strip()
        if not phone_id:
            return None, "Укажите номер отправки."
        phone = WarehouseShippingPhone.objects.filter(pk=phone_id, is_active=True).first()
        if not phone:
            return None, "Номер отправки не найден или отключен."
        return phone, ""

    def export_shipments_view(self, request):
        date_from_raw = str(request.GET.get("date_from") or "").strip()
        date_to_raw = str(request.GET.get("date_to") or "").strip()
        points_open_only = request.GET.get("points_open") == "on"
        include_stage_journal = request.GET.get("include_stage_journal") == "on"
        counterparty_ids = []
        for value in request.GET.getlist("counterparty_ids"):
            try:
                counterparty_ids.append(int(value))
            except (TypeError, ValueError):
                continue

        filters = {}
        if date_from_raw:
            try:
                filters["created_at__date__gte"] = date.fromisoformat(date_from_raw)
            except ValueError:
                return JsonResponse({"success": False, "message": "Дата начала указана неверно."}, status=400)
        if date_to_raw:
            try:
                filters["created_at__date__lte"] = date.fromisoformat(date_to_raw)
            except ValueError:
                return JsonResponse({"success": False, "message": "Дата окончания указана неверно."}, status=400)
        if (
            "created_at__date__gte" in filters
            and "created_at__date__lte" in filters
            and filters["created_at__date__gte"] > filters["created_at__date__lte"]
        ):
            return JsonResponse({"success": False, "message": "Дата начала не может быть позже даты окончания."}, status=400)
        if include_stage_journal and (not date_from_raw or not date_to_raw):
            return JsonResponse({"success": False, "message": "Для журнала стадий выберите дату начала и дату окончания."}, status=400)
        if counterparty_ids:
            filters["counterparty_id__in"] = counterparty_ids
        if points_open_only:
            filters["points_closed_at__isnull"] = True
            filters["status__in"] = (
                WarehouseShipmentOrder.Status.SHIPPED,
                WarehouseShipmentOrder.Status.RECEIVED,
                WarehouseShipmentOrder.Status.RETURN_OPEN,
                WarehouseShipmentOrder.Status.RETURN_CLOSED,
                WarehouseShipmentOrder.Status.CANCELLED,
            )
            filters["shipped_at__isnull"] = False

        orders = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items")
            .filter(**filters)
            .order_by("created_at", "id")
        )
        rows = [[
            "№",
            "ФИО получателя",
            "Телефон получателя",
            "Куда отправлен",
            "Товар",
            "Цена",
            "ТТН",
            "Статус",
        ]]
        for index, order in enumerate(orders, start=1):
            rows.append([
                index,
                order.recipient_full_name,
                order.recipient_phone,
                order.delivery_destination,
                ", ".join(f"{item.item_name} x{item.quantity}" for item in order.items.all()),
                "Оплачен заранее" if order.total_price == 0 else f"{order.total_price:g} грн",
                order.ttn,
                self.shipment_stage_label(order),
            ])

        sheets = [("Заказы", rows)]
        if request.GET.get("include_stock") == "on":
            stock_rows = [["№", "Товар", "Остаток"]]
            for index, item in enumerate(WarehouseItem.objects.order_by("name", "id"), start=1):
                stock_rows.append([index, item.name, item.quantity])
            sheets.append(("Остатки", stock_rows))

        if include_stage_journal:
            period_start, period_end = self.export_period_bounds(date_from_raw, date_to_raw)
            stage_event_filter = (
                Q(created_at__gte=period_start, created_at__lt=period_end)
                | Q(ttn_assigned_at__gte=period_start, ttn_assigned_at__lt=period_end)
                | Q(shipped_at__gte=period_start, shipped_at__lt=period_end)
                | Q(return_opened_at__gte=period_start, return_opened_at__lt=period_end)
                | Q(received_at__gte=period_start, received_at__lt=period_end)
                | Q(return_closed_at__gte=period_start, return_closed_at__lt=period_end)
                | Q(cancelled_at__gte=period_start, cancelled_at__lt=period_end)
                | Q(points_closed_at__gte=period_start, points_closed_at__lt=period_end)
            )
            journal_orders = (
                WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
                .prefetch_related("items")
                .filter(stage_event_filter)
                .order_by("created_at", "id")
            )
            if counterparty_ids:
                journal_orders = journal_orders.filter(counterparty_id__in=counterparty_ids)
            sheets.append(("Журнал стадий", self.build_stage_journal_rows(journal_orders, period_start, period_end)))

        return self.build_xlsx_response("warehouse_shipments_export.xlsx", sheets)

    def close_points_week_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        month_key, month_start, month_end = self.points_month_bounds(request.POST.get("period_month"))
        now = timezone.now()
        close_end = min(now, month_end)
        last_close = WarehousePointsWeekClose.objects.filter(period_month=month_key).order_by("-period_end", "-id").first()
        period_start = last_close.period_end if last_close else month_start
        with transaction.atomic():
            points_orders = WarehouseShipmentOrder.objects.select_for_update().filter(
                status__in=(
                    WarehouseShipmentOrder.Status.SHIPPED,
                    WarehouseShipmentOrder.Status.RECEIVED,
                    WarehouseShipmentOrder.Status.RETURN_OPEN,
                    WarehouseShipmentOrder.Status.RETURN_CLOSED,
                    WarehouseShipmentOrder.Status.CANCELLED,
                ),
                shipped_at__gt=period_start,
                shipped_at__lte=close_end,
                points_closed_at__isnull=True,
            )
            points_count = points_orders.count()
            points = points_count * 100
            if points_count <= 0:
                return JsonResponse({
                    "success": False,
                    "message": "Нет новых баллов для закрытия недели.",
                }, status=400)

            closure = WarehousePointsWeekClose.objects.create(
                period_month=month_key,
                period_start=period_start,
                period_end=close_end,
                points=points,
            )
            points_orders.update(points_closed_at=close_end)
        self.log_addition(request, closure, f"Закрыта неделя баллов: {points}.")
        return JsonResponse({
            "success": True,
            "message": f"Неделя закрыта: {points} баллов.",
            "orders": [
                self.serialize_order(order)
                for order in WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
                .prefetch_related("items", "items__warehouse_item")
                .order_by("-created_at", "-id")
            ],
            "pointsClosures": [
                self.serialize_points_closure(item)
                for item in WarehousePointsWeekClose.objects.order_by("-period_end", "-id")
            ],
        })

    def create_counterparty_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        title = strip_tags(str(request.POST.get("title") or "")).strip()
        card_number = self.normalize_card_number(request.POST.get("card_number"))
        if not title:
            return JsonResponse({"success": False, "message": "Укажите наименование контрагента."}, status=400)
        if not card_number:
            return JsonResponse({"success": False, "message": "Укажите номер карты."}, status=400)
        if WarehouseCounterpartyCard.objects.filter(number=card_number).exists():
            return JsonResponse({"success": False, "message": "Такая карта уже добавлена."}, status=400)
        with transaction.atomic():
            counterparty = WarehouseCounterparty.objects.create(title=title)
            WarehouseCounterpartyCard.objects.create(
                counterparty=counterparty,
                number=card_number,
                is_primary=True,
            )
        self.log_addition(request, counterparty, "Создан контрагент для отправок.")
        return JsonResponse({
            "success": True,
            "message": "Контрагент создан.",
            "counterparty": self.serialize_counterparty(self.counterparty_queryset().get(pk=counterparty.pk)),
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def update_counterparty_view(self, request, counterparty_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        counterparty = get_object_or_404(WarehouseCounterparty, pk=counterparty_id)
        title = strip_tags(str(request.POST.get("title") or "")).strip()
        if not title:
            return JsonResponse({"success": False, "message": "Укажите наименование контрагента."}, status=400)
        counterparty.title = title
        counterparty.save(update_fields=("title", "updated"))
        self.log_change(request, counterparty, "Контрагент обновлен.")
        return JsonResponse({
            "success": True,
            "message": "Контрагент сохранен.",
            "counterparty": self.serialize_counterparty(self.counterparty_queryset().get(pk=counterparty.pk)),
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def delete_counterparty_view(self, request, counterparty_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        counterparty = get_object_or_404(WarehouseCounterparty, pk=counterparty_id)
        if counterparty.shipment_orders.exists():
            return JsonResponse({
                "success": False,
                "message": "Контрагента нельзя удалить: он уже используется в отправках.",
            }, status=400)
        self.log_deletion(request, counterparty, str(counterparty))
        counterparty.delete()
        return JsonResponse({
            "success": True,
            "message": "Контрагент удален.",
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def create_counterparty_card_view(self, request, counterparty_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        counterparty = get_object_or_404(WarehouseCounterparty, pk=counterparty_id)
        card_number = self.normalize_card_number(request.POST.get("card_number"))
        if not card_number:
            return JsonResponse({"success": False, "message": "Укажите номер карты."}, status=400)
        if WarehouseCounterpartyCard.objects.filter(number=card_number).exists():
            return JsonResponse({"success": False, "message": "Такая карта уже добавлена."}, status=400)
        is_primary = not counterparty.cards.exists() or request.POST.get("is_primary") == "on"
        with transaction.atomic():
            if is_primary:
                counterparty.cards.update(is_primary=False)
            card = WarehouseCounterpartyCard.objects.create(
                counterparty=counterparty,
                number=card_number,
                is_primary=is_primary,
            )
        self.log_change(request, counterparty, f"Добавлена карта {card.number}.")
        return JsonResponse({
            "success": True,
            "message": "Карта добавлена.",
            "counterparty": self.serialize_counterparty(self.counterparty_queryset().get(pk=counterparty.pk)),
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def update_counterparty_card_view(self, request, card_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        card = get_object_or_404(WarehouseCounterpartyCard.objects.select_related("counterparty"), pk=card_id)
        card_number = self.normalize_card_number(request.POST.get("card_number"))
        if not card_number:
            return JsonResponse({"success": False, "message": "Укажите номер карты."}, status=400)
        if WarehouseCounterpartyCard.objects.exclude(pk=card.pk).filter(number=card_number).exists():
            return JsonResponse({"success": False, "message": "Такая карта уже добавлена."}, status=400)
        make_primary = request.POST.get("is_primary") == "on"
        with transaction.atomic():
            if make_primary:
                WarehouseCounterpartyCard.objects.filter(
                    counterparty=card.counterparty,
                ).exclude(pk=card.pk).update(is_primary=False)
                card.is_primary = True
            elif card.is_primary:
                return JsonResponse({
                    "success": False,
                    "message": "Сначала выберите другую основную карту.",
                }, status=400)
            card.number = card_number
            card.save(update_fields=("number", "is_primary", "updated"))
        self.log_change(request, card.counterparty, f"Карта {card.number} обновлена.")
        return JsonResponse({
            "success": True,
            "message": "Карта сохранена.",
            "counterparty": self.serialize_counterparty(self.counterparty_queryset().get(pk=card.counterparty_id)),
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def delete_counterparty_card_view(self, request, card_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        card = get_object_or_404(WarehouseCounterpartyCard.objects.select_related("counterparty"), pk=card_id)
        if card.shipment_orders.exists():
            return JsonResponse({
                "success": False,
                "message": "Карту нельзя удалить: она уже используется в отправках.",
            }, status=400)
        counterparty = card.counterparty
        was_primary = card.is_primary
        card_number = card.number
        with transaction.atomic():
            card.delete()
            if was_primary:
                replacement = counterparty.cards.order_by("id").first()
                if replacement:
                    replacement.is_primary = True
                    replacement.save(update_fields=("is_primary", "updated"))
        self.log_change(request, counterparty, f"Карта {card_number} удалена.")
        return JsonResponse({
            "success": True,
            "message": "Карта удалена.",
            "counterparty": self.serialize_counterparty(self.counterparty_queryset().get(pk=counterparty.pk)),
            "counterparties": [self.serialize_counterparty(item) for item in self.counterparty_queryset()],
        })

    def create_phone_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        phone_value = self.normalize_phone_value(request.POST.get("phone"))
        pin_code = strip_tags(str(request.POST.get("pin_code") or "")).strip()
        if not phone_value:
            return JsonResponse({"success": False, "message": "Укажите номер телефона."}, status=400)
        if not pin_code:
            return JsonResponse({"success": False, "message": "Укажите PIN-код номера."}, status=400)
        if WarehouseShippingPhone.objects.filter(phone=phone_value).exists():
            return JsonResponse({"success": False, "message": "Такой номер уже существует."}, status=400)
        is_active = str(request.POST.get("is_active") or "on") == "on"
        if not is_active and not WarehouseShippingPhone.objects.filter(is_active=True).exists():
            is_active = True
        if is_active:
            WarehouseShippingPhone.objects.update(is_active=False)
        phone = WarehouseShippingPhone.objects.create(
            phone=phone_value,
            pin_code=pin_code,
            label=strip_tags(str(request.POST.get("label") or "")).strip(),
            is_active=is_active,
        )
        self.log_addition(request, phone, "Создан номер телефона для отправок.")
        return JsonResponse({
            "success": True,
            "message": "Номер телефона создан.",
            "phone": self.serialize_phone(phone),
            "phones": [self.serialize_phone(item) for item in self.phone_queryset()],
        })

    def update_phone_view(self, request, phone_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        phone = get_object_or_404(WarehouseShippingPhone, pk=phone_id)
        phone_value = self.normalize_phone_value(request.POST.get("phone"))
        pin_code = strip_tags(str(request.POST.get("pin_code") or "")).strip()
        if not phone_value:
            return JsonResponse({"success": False, "message": "Укажите номер телефона."}, status=400)
        if not pin_code:
            return JsonResponse({"success": False, "message": "Укажите PIN-код номера."}, status=400)
        if WarehouseShippingPhone.objects.exclude(pk=phone.pk).filter(phone=phone_value).exists():
            return JsonResponse({"success": False, "message": "Такой номер уже существует."}, status=400)
        phone.phone = phone_value
        phone.pin_code = pin_code
        phone.label = strip_tags(str(request.POST.get("label") or "")).strip()
        phone.is_active = str(request.POST.get("is_active") or "") == "on"
        if not phone.is_active and not WarehouseShippingPhone.objects.exclude(pk=phone.pk).filter(is_active=True).exists():
            phone.is_active = True
        if phone.is_active:
            WarehouseShippingPhone.objects.exclude(pk=phone.pk).update(is_active=False)
        phone.save(update_fields=("phone", "pin_code", "label", "is_active", "updated"))
        self.log_change(request, phone, "Номер отправки обновлен.")
        return JsonResponse({
            "success": True,
            "message": "Номер сохранен.",
            "phone": self.serialize_phone(phone),
            "phones": [self.serialize_phone(item) for item in self.phone_queryset()],
        })

    def delete_phone_view(self, request, phone_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        phone = get_object_or_404(WarehouseShippingPhone, pk=phone_id)
        if phone.shipment_orders.exists():
            return JsonResponse({
                "success": False,
                "message": "Номер нельзя удалить: он уже используется в отправках.",
            }, status=400)
        self.log_deletion(request, phone, str(phone))
        phone.delete()
        return JsonResponse({
            "success": True,
            "message": "Номер удален.",
            "phones": [self.serialize_phone(item) for item in self.phone_queryset()],
        })

    def create_shipment_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        counterparty, error = self.get_selected_counterparty(request)
        if error:
            return JsonResponse({"success": False, "message": error}, status=400)
        counterparty_card, error = self.get_selected_counterparty_card(request, counterparty)
        if error:
            return JsonResponse({"success": False, "message": error}, status=400)
        phone, error = self.get_selected_phone(request)
        if error:
            return JsonResponse({"success": False, "message": error}, status=400)

        required_fields = {
            "recipient_phone": "Укажите номер получателя.",
            "delivery_destination": "Укажите место доставки.",
        }
        cleaned = {}
        for field, message in required_fields.items():
            cleaned[field] = strip_tags(str(request.POST.get(field) or "")).strip()
            if not cleaned[field]:
                return JsonResponse({"success": False, "message": message}, status=400)
        recipient_full_name = strip_tags(str(request.POST.get("recipient_full_name") or "")).strip()
        if not recipient_full_name:
            recipient_full_name = " ".join(
                part for part in (
                    strip_tags(str(request.POST.get("recipient_last_name") or "")).strip(),
                    strip_tags(str(request.POST.get("recipient_first_name") or "")).strip(),
                )
                if part
            )
        if not recipient_full_name:
            return JsonResponse({"success": False, "message": "Укажите ФИО получателя."}, status=400)
        cleaned["recipient_full_name"] = recipient_full_name
        cleaned["recipient_phone"] = self.normalize_phone_value(cleaned["recipient_phone"])
        if not cleaned["recipient_phone"]:
            return JsonResponse({"success": False, "message": "Укажите номер получателя."}, status=400)

        delivery_type = str(request.POST.get("delivery_type") or WarehouseShipmentOrder.DeliveryType.BRANCH).strip()
        if delivery_type not in dict(WarehouseShipmentOrder.DeliveryType.choices):
            return JsonResponse({"success": False, "message": "Тип доставки указан неверно."}, status=400)

        total_price = self.normalize_decimal(request.POST.get("total_price"))
        if total_price is None:
            return JsonResponse({"success": False, "message": "Цена заказа указана неверно."}, status=400)
        ttn = strip_tags(str(request.POST.get("ttn") or "")).strip()
        if ttn and WarehouseShipmentOrder.objects.filter(ttn=ttn).exists():
            return JsonResponse({"success": False, "message": "Такая ТТН уже используется в другой заявке."}, status=400)
        limit_overrun = max(Decimal("0.00"), total_price - phone.remaining_limit_amount)
        limit_warning = ""
        if limit_overrun > 0:
            limit_warning = f"Лимит номера перерасходован на {limit_overrun} грн."

        items_payload, error = self.parse_items_payload(request)
        if error:
            return JsonResponse({"success": False, "message": error}, status=400)

        with transaction.atomic():
            warehouse_items = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=[row["id"] for row in items_payload])
            }
            reserved_by_item = self.get_reserved_by_item()
            for row in items_payload:
                item = warehouse_items.get(row["id"])
                if not item:
                    return JsonResponse({"success": False, "message": "Один из товаров не найден."}, status=400)
                available = item.quantity - reserved_by_item.get(item.id, 0)
                if row["quantity"] > available:
                    return JsonResponse({
                        "success": False,
                        "message": f"Недостаточно остатка: {item.name}. Доступно {max(0, available)}.",
                    }, status=400)
            if ttn:
                for row in items_payload:
                    item = warehouse_items[row["id"]]
                    item.quantity -= row["quantity"]
                    item.save(update_fields=("quantity", "updated"))

            now = timezone.now()
            order = WarehouseShipmentOrder.objects.create(
                counterparty=counterparty,
                counterparty_card=counterparty_card,
                shipping_phone=phone,
                recipient_last_name=cleaned["recipient_full_name"],
                recipient_first_name="",
                recipient_phone=cleaned["recipient_phone"],
                delivery_type=delivery_type,
                delivery_city="",
                delivery_destination=cleaned["delivery_destination"],
                total_price=total_price,
                status=WarehouseShipmentOrder.Status.SHIPPED if ttn else WarehouseShipmentOrder.Status.CREATED,
                ttn=ttn,
                ttn_assigned_at=now if ttn else None,
                shipped_at=now if ttn else None,
                note=strip_tags(str(request.POST.get("note") or "")).strip(),
            )
            for row in items_payload:
                item = warehouse_items[row["id"]]
                WarehouseShipmentOrderItem.objects.create(
                    order=order,
                    warehouse_item=item,
                    item_name=item.name,
                    quantity=row["quantity"],
                )

        order = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items", "items__warehouse_item")
            .get(pk=order.pk)
        )
        self.log_addition(request, order, "Создана отправка со склада.")
        message = "Отправка создана. Заявка отправлена, остатки списаны." if order.status == WarehouseShipmentOrder.Status.SHIPPED else "Отправка создана. Товар зарезервирован."
        return JsonResponse({
            "success": True,
            "message": message,
            "warning": limit_warning,
            "order": self.serialize_order(order),
            "items": self.serialize_warehouse_items(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id")),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
            "counterparties": [self.serialize_counterparty(counterparty) for counterparty in self.counterparty_queryset()],
        })

    def assign_ttn_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ttn = strip_tags(str(request.POST.get("ttn") or "")).strip()
        if not ttn:
            return JsonResponse({"success": False, "message": "Укажите номер ТТН."}, status=400)

        with transaction.atomic():
            order = get_object_or_404(
                WarehouseShipmentOrder.objects.select_for_update(),
                pk=order_id,
            )
            if order.status == WarehouseShipmentOrder.Status.SHIPPED:
                return JsonResponse({"success": False, "message": "Отправленный заказ уже нельзя изменить."}, status=400)
            if order.status == WarehouseShipmentOrder.Status.CANCELLED:
                return JsonResponse({"success": False, "message": "Отмененный заказ нельзя отправить."}, status=400)
            if WarehouseShipmentOrder.objects.exclude(pk=order.pk).filter(ttn=ttn).exists():
                return JsonResponse({"success": False, "message": "Такая ТТН уже используется в другой заявке."}, status=400)

            lines = list(order.items.select_related("warehouse_item"))
            line_quantities = self.aggregate_shipment_lines(lines)
            warehouse_items = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=line_quantities.keys())
            }
            for item_id, quantity in line_quantities.items():
                item = warehouse_items[item_id]
                if item.quantity < quantity:
                    return JsonResponse({
                        "success": False,
                        "message": f"Недостаточно фактического остатка: {item.name}.",
                    }, status=400)
            for item_id, quantity in line_quantities.items():
                item = warehouse_items[item_id]
                item.quantity -= quantity
                item.save(update_fields=("quantity", "updated"))

            now = timezone.now()
            order.ttn = ttn
            order.status = WarehouseShipmentOrder.Status.SHIPPED
            order.ttn_assigned_at = order.ttn_assigned_at or now
            order.shipped_at = now
            order.save(update_fields=("ttn", "status", "ttn_assigned_at", "shipped_at", "updated"))

        order = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items", "items__warehouse_item")
            .get(pk=order.pk)
        )
        self.log_change(request, order, f"Присвоена ТТН: {ttn}. Заказ отмечен отправленным.")
        return JsonResponse({
            "success": True,
            "message": "ТТН сохранена. Заявка отправлена, остатки списаны.",
            "order": self.serialize_order(order),
            "items": self.serialize_warehouse_items(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id")),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })

    def ship_order_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        with transaction.atomic():
            order = get_object_or_404(
                WarehouseShipmentOrder.objects.select_for_update(),
                pk=order_id,
            )
            if order.status == WarehouseShipmentOrder.Status.SHIPPED:
                return JsonResponse({"success": False, "message": "Заказ уже отправлен."}, status=400)
            if order.status != WarehouseShipmentOrder.Status.TTN_ASSIGNED or not order.ttn:
                return JsonResponse({"success": False, "message": "Сначала присвойте ТТН."}, status=400)
            lines = list(order.items.select_related("warehouse_item"))
            line_quantities = self.aggregate_shipment_lines(lines)
            warehouse_items = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=line_quantities.keys())
            }
            for item_id, quantity in line_quantities.items():
                item = warehouse_items[item_id]
                if item.quantity < quantity:
                    return JsonResponse({
                        "success": False,
                        "message": f"Недостаточно фактического остатка: {item.name}.",
                    }, status=400)
            for item_id, quantity in line_quantities.items():
                item = warehouse_items[item_id]
                item.quantity -= quantity
                item.save(update_fields=("quantity", "updated"))

            order.status = WarehouseShipmentOrder.Status.SHIPPED
            order.shipped_at = timezone.now()
            order.save(update_fields=("status", "shipped_at", "updated"))

        order = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items", "items__warehouse_item")
            .get(pk=order.pk)
        )
        self.log_change(request, order, "Заказ отмечен отправленным, остатки списаны со склада.")
        return JsonResponse({
            "success": True,
            "message": "Заказ отправлен. Остатки списаны.",
            "order": self.serialize_order(order),
            "items": self.serialize_warehouse_items(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id")),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })

    def receive_order_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        order = get_object_or_404(
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone").prefetch_related("items", "items__warehouse_item"),
            pk=order_id,
        )
        if order.status != WarehouseShipmentOrder.Status.SHIPPED:
            return JsonResponse({"success": False, "message": "Полученной можно отметить только отправленную заявку."}, status=400)

        order.status = WarehouseShipmentOrder.Status.RECEIVED
        order.received_at = timezone.now()
        order.save(update_fields=("status", "received_at", "updated"))
        self.log_change(request, order, "Заявка отмечена полученной клиентом.")
        return JsonResponse({
            "success": True,
            "message": "Заявка получена клиентом.",
            "order": self.serialize_order(order),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })

    def open_return_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        order = get_object_or_404(
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone").prefetch_related("items", "items__warehouse_item"),
            pk=order_id,
        )
        if order.status != WarehouseShipmentOrder.Status.SHIPPED:
            return JsonResponse({"success": False, "message": "Возврат можно открыть только по отправленной заявке."}, status=400)

        order.status = WarehouseShipmentOrder.Status.RETURN_OPEN
        order.return_opened_at = timezone.now()
        order.save(update_fields=("status", "return_opened_at", "updated"))
        self.log_change(request, order, "По заявке открыт возврат.")
        return JsonResponse({
            "success": True,
            "message": "Возврат открыт.",
            "order": self.serialize_order(order),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })

    def close_return_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        with transaction.atomic():
            order = get_object_or_404(
                WarehouseShipmentOrder.objects.select_for_update(),
                pk=order_id,
            )
            if order.status != WarehouseShipmentOrder.Status.RETURN_OPEN:
                return JsonResponse({"success": False, "message": "Закрыть можно только открытый возврат."}, status=400)

            lines = list(order.items.select_related("warehouse_item"))
            line_quantities = self.aggregate_shipment_lines(lines)
            warehouse_items = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=line_quantities.keys())
            }
            for item_id, quantity in line_quantities.items():
                item = warehouse_items[item_id]
                item.quantity += quantity
                item.save(update_fields=("quantity", "updated"))

            order.status = WarehouseShipmentOrder.Status.RETURN_CLOSED
            order.return_closed_at = timezone.now()
            order.save(update_fields=("status", "return_closed_at", "updated"))

        order = (
            WarehouseShipmentOrder.objects.select_related("counterparty", "counterparty_card", "shipping_phone")
            .prefetch_related("items", "items__warehouse_item")
            .get(pk=order.pk)
        )
        self.log_change(request, order, "Возврат закрыт, товары возвращены на склад.")
        return JsonResponse({
            "success": True,
            "message": "Возврат закрыт. Товары возвращены на склад.",
            "order": self.serialize_order(order),
            "items": self.serialize_warehouse_items(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id")),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })

    def delete_order_view(self, request, order_id):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        order = get_object_or_404(
            WarehouseShipmentOrder.objects.prefetch_related("items"),
            pk=order_id,
        )
        if order.status not in {WarehouseShipmentOrder.Status.CREATED, WarehouseShipmentOrder.Status.TTN_ASSIGNED}:
            return JsonResponse({
                "success": False,
                "message": "Удалить можно только заявку на формировании.",
            }, status=400)

        order.delete()
        return JsonResponse({
            "success": True,
            "message": "Заявка удалена.",
            "orderId": order_id,
            "items": self.serialize_warehouse_items(WarehouseItem.objects.select_related("batch", "product").order_by("name", "id")),
            "phones": [self.serialize_phone(phone) for phone in self.phone_queryset()],
        })


@admin.register(WarehouseItem)
class WarehouseItemAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("preview", "name", "price", "quantity", "stock_state_badge", "product_link", "updated")
    search_fields = ("name", "product__name", "note", "batch_entries__batch__title")
    list_filter = ("updated",)
    readonly_fields = ("created", "updated")

    def changelist_view(self, request, extra_context=None):
        return redirect("admin:main_warehouseitem_warehouse_list")

    def get_urls(self):
        custom_urls = [
            path(
                "warehouse/",
                self.admin_site.admin_view(self.warehouse_list_view),
                name="main_warehouseitem_warehouse_list",
            ),
        ]
        return custom_urls + super().get_urls()

    def warehouse_list_view(self, request):
        if request.method == "POST":
            if request.POST.get("warehouse_action") == "batch":
                return self.create_warehouse_batch(request)
            if request.POST.get("warehouse_action") == "writeoff":
                return self.create_warehouse_writeoff(request)
            return self.create_warehouse_item(request)

        items = list(
            WarehouseItem.objects.select_related("product", "product__category", "product__brand")
            .order_by("name", "id")
        )
        batches = list(
            WarehouseBatch.objects.prefetch_related("batch_items", "batch_items__warehouse_item")
            .order_by("-arrived_at", "-id")[:20]
        )
        writeoffs = list(
            WarehouseWriteOff.objects.prefetch_related("items", "items__warehouse_item")
            .order_by("-written_off_at", "-id")[:20]
        )
        today = timezone.localdate()
        reserved_rows = (
            WarehouseShipmentOrderItem.objects.filter(order__status__in=ACTIVE_SHIPMENT_STATUSES)
            .values("warehouse_item_id")
            .annotate(total=Sum("quantity"))
        )
        reserved_by_item = {row["warehouse_item_id"]: row["total"] or 0 for row in reserved_rows}
        for item in items:
            item.reserved_quantity = reserved_by_item.get(item.id, 0)
            item.available_quantity = max(0, item.quantity - item.reserved_quantity)
            if item.available_quantity <= 0:
                item.display_stock_state = "out"
            elif item.available_quantity <= 3:
                item.display_stock_state = "low"
            else:
                item.display_stock_state = "ok"
        total_quantity = sum(item.available_quantity for item in items)
        out_count = sum(1 for item in items if item.available_quantity <= 0)
        low_count = sum(1 for item in items if 0 < item.available_quantity <= 3)
        context = {
            **self.admin_site.each_context(request),
            "title": "Управление складом",
            "items": items,
            "batches": batches,
            "writeoffs": writeoffs,
            "today": today.isoformat(),
            "today_display": today.strftime("%d.%m.%Y"),
            "total_items": len(items),
            "total_quantity": total_quantity,
            "out_count": out_count,
            "low_count": low_count,
            "batch_count": WarehouseBatch.objects.count(),
            "shipments_url": reverse("admin:main_warehouseshipmentorder_shipments"),
        }
        return TemplateResponse(request, "admin_panel/warehouse/warehouse_page.html", context)

    def build_batch_groups(self, items):
        groups = []
        index = {}
        for item in items:
            if item.batch_id:
                key = ("batch", item.batch_id)
                title = item.batch.title
                arrived_at = item.batch.arrived_at
                note = item.batch.note
            else:
                key = ("date", item.received_at)
                title = f"Приход от {item.received_at:%d.%m.%Y}"
                arrived_at = item.received_at
                note = ""

            if key not in index:
                index[key] = {
                    "title": title,
                    "arrived_at": arrived_at,
                    "note": note,
                    "items": [],
                    "total_quantity": 0,
                    "out_count": 0,
                }
                groups.append(index[key])

            group = index[key]
            group["items"].append(item)
            group["total_quantity"] += item.quantity
            if item.quantity <= 0:
                group["out_count"] += 1
        return groups

    def get_arrival_date(self, request):
        raw_value = str(request.POST.get("received_at") or "").strip()
        if not raw_value:
            return timezone.localdate()
        try:
            return date.fromisoformat(raw_value)
        except ValueError:
            messages.error(request, "Дата прихода указана неверно.")
            return None

    def get_batch(self, request, arrived_at):
        batch_id = str(request.POST.get("batch_id") or "").strip()
        batch_title = strip_tags(str(request.POST.get("batch_title") or "")).strip()
        if batch_id:
            batch = WarehouseBatch.objects.filter(pk=batch_id).first()
            if batch:
                return batch

        if not batch_title:
            batch_title = f"Партия от {arrived_at:%d.%m.%Y}"

        existing_batch = WarehouseBatch.objects.filter(title__iexact=batch_title).order_by("-arrived_at", "-id").first()
        if existing_batch:
            return existing_batch

        batch, created = WarehouseBatch.objects.get_or_create(
            title=batch_title,
            arrived_at=arrived_at,
            defaults={"note": ""},
        )
        return batch

    def normalize_decimal(self, value):
        raw_value = str(value or "0").replace(",", ".").strip()
        try:
            return max(Decimal("0.00"), Decimal(raw_value)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return None

    def create_warehouse_item(self, request):
        name = strip_tags(str(request.POST.get("name") or "")).strip()
        note = strip_tags(str(request.POST.get("note") or "")).strip()
        price = self.normalize_decimal(request.POST.get("price"))
        if price is None:
            messages.error(request, "Цена товара указана неверно.")
            return redirect("admin:main_warehouseitem_warehouse_list")

        if not name:
            messages.error(request, "Укажите название товара.")
            return redirect("admin:main_warehouseitem_warehouse_list")
        if WarehouseItem.objects.filter(name__iexact=name).exists():
            messages.error(request, "Такой товар уже есть на складе.")
            return redirect("admin:main_warehouseitem_warehouse_list")

        with transaction.atomic():
            warehouse_category, _ = Category.objects.get_or_create(name="Склад")
            product = Product.objects.create(
                name=name,
                category=warehouse_category,
                description="",
                old_price=Decimal("0.00"),
                price=price,
                stock=0,
                available=False,
            )
            if request.FILES.get("image"):
                product.image = request.FILES["image"]
                product.save(update_fields=("image", "slug", "updated"))

            item = WarehouseItem.objects.create(
                batch=None,
                product=product,
                name=name,
                image=product.image.name if product.image else "",
                price=price,
                quantity=0,
                note=note,
            )

        self.log_addition(request, item, "Складская сущность товара создана без остатка.")
        messages.success(request, "Товар создан. Остаток добавляется через партию.")
        return redirect("admin:main_warehouseitem_warehouse_list")

    def create_warehouse_batch(self, request):
        title = strip_tags(str(request.POST.get("batch_title") or "")).strip()
        note = strip_tags(str(request.POST.get("batch_note") or "")).strip()
        arrived_at = self.get_arrival_date(request)
        if arrived_at is None:
            return redirect("admin:main_warehouseitem_warehouse_list")
        if not title:
            title = f"Партия от {arrived_at:%d.%m.%Y}"

        rows = []
        for item in WarehouseItem.objects.order_by("name", "id"):
            try:
                quantity = max(0, int(request.POST.get(f"batch_quantity_{item.id}") or 0))
            except (TypeError, ValueError):
                quantity = 0
            if quantity > 0:
                rows.append((item.id, quantity))

        if not rows:
            messages.error(request, "Укажите количество хотя бы для одного товара.")
            return redirect("admin:main_warehouseitem_warehouse_list")

        with transaction.atomic():
            batch = WarehouseBatch.objects.create(title=title, arrived_at=arrived_at, note=note)
            items_by_id = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=[item_id for item_id, _ in rows])
            }
            for item_id, quantity in rows:
                item = items_by_id[item_id]
                WarehouseBatchItem.objects.create(
                    batch=batch,
                    warehouse_item=item,
                    item_name=item.name,
                    quantity=quantity,
                )
                item.quantity += quantity
                item.batch = batch
                item.received_at = batch.arrived_at
                item.save(update_fields=("quantity", "batch", "received_at", "updated"))

        self.log_addition(request, batch, f"Партия создана: {batch.title}.")
        messages.success(request, f"Партия #{batch.id} создана. Остатки обновлены.")
        return redirect("admin:main_warehouseitem_warehouse_list")

    def create_warehouse_writeoff(self, request):
        note = strip_tags(str(request.POST.get("writeoff_note") or "")).strip()
        written_off_at = timezone.localdate()

        rows = []
        for item in WarehouseItem.objects.order_by("name", "id"):
            try:
                quantity = max(0, int(request.POST.get(f"writeoff_quantity_{item.id}") or 0))
            except (TypeError, ValueError):
                quantity = 0
            if quantity > 0:
                rows.append((item.id, quantity))

        if not rows:
            messages.error(request, "Укажите количество хотя бы для одного товара.")
            return redirect("admin:main_warehouseitem_warehouse_list")

        with transaction.atomic():
            items_by_id = {
                item.id: item
                for item in WarehouseItem.objects.select_for_update().filter(id__in=[item_id for item_id, _ in rows])
            }
            reserved_rows = (
                WarehouseShipmentOrderItem.objects.filter(
                    order__status__in=ACTIVE_SHIPMENT_STATUSES,
                    warehouse_item_id__in=items_by_id.keys(),
                )
                .values("warehouse_item_id")
                .annotate(total=Sum("quantity"))
            )
            reserved_by_item = {row["warehouse_item_id"]: row["total"] or 0 for row in reserved_rows}
            for item_id, quantity in rows:
                item = items_by_id[item_id]
                available_quantity = max(0, item.quantity - reserved_by_item.get(item.id, 0))
                if available_quantity < quantity:
                    messages.error(request, f"Недостаточно остатка для списания: {item.name}.")
                    return redirect("admin:main_warehouseitem_warehouse_list")

            writeoff = WarehouseWriteOff.objects.create(written_off_at=written_off_at, note=note)
            for item_id, quantity in rows:
                item = items_by_id[item_id]
                WarehouseWriteOffItem.objects.create(
                    write_off=writeoff,
                    warehouse_item=item,
                    item_name=item.name,
                    quantity=quantity,
                )
                item.quantity -= quantity
                item.save(update_fields=("quantity", "updated"))

        self.log_addition(request, writeoff, f"Списание создано: #{writeoff.id}.")
        messages.success(request, f"Списание #{writeoff.id} создано. Остатки обновлены.")
        return redirect("admin:main_warehouseitem_warehouse_list")

    @admin.display(description="Фото")
    def preview(self, obj):
        if obj.image:
            try:
                return format_html('<img src="{}" style="width:42px;height:42px;object-fit:cover;border-radius:8px;" />', obj.image.url)
            except ValueError:
                pass
        return "—"

    @admin.display(description="Статус")
    def stock_state_badge(self, obj):
        labels = {"out": "Склад пуст", "low": "Мало", "ok": "В наличии"}
        return labels.get(obj.stock_state, "В наличии")

    @admin.display(description="Черновик")
    def product_link(self, obj):
        if not obj.product_id:
            return "—"
        url = reverse("admin:main_product_edit_sku", args=(obj.product_id,)) + "?step=6"
        return format_html('<a href="{}">Открыть товар</a>', url)

