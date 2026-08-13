from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


def migrate_counterparty_cards(apps, schema_editor):
    Counterparty = apps.get_model("main", "WarehouseCounterparty")
    CounterpartyCard = apps.get_model("main", "WarehouseCounterpartyCard")
    ShipmentOrder = apps.get_model("main", "WarehouseShipmentOrder")

    counterparties = list(Counterparty.objects.order_by("id"))
    for counterparty in counterparties:
        card_number = (counterparty.card_number or "").strip()
        if not card_number:
            continue
        card = CounterpartyCard.objects.create(
            counterparty_id=counterparty.id,
            number=card_number,
            is_primary=True,
        )
        ShipmentOrder.objects.filter(counterparty_id=counterparty.id).update(
            counterparty_card_id=card.id,
        )

    groups = {}
    for counterparty in counterparties:
        normalized_title = " ".join((counterparty.title or "").split()).casefold()
        groups.setdefault(normalized_title, []).append(counterparty.id)

    for counterparty_ids in groups.values():
        if len(counterparty_ids) < 2:
            continue
        canonical_id = counterparty_ids[0]
        duplicate_ids = counterparty_ids[1:]
        ShipmentOrder.objects.filter(counterparty_id__in=duplicate_ids).update(
            counterparty_id=canonical_id,
        )
        CounterpartyCard.objects.filter(counterparty_id__in=duplicate_ids).update(
            counterparty_id=canonical_id,
            is_primary=False,
        )
        Counterparty.objects.filter(id__in=duplicate_ids).delete()

    for counterparty in Counterparty.objects.order_by("id"):
        cards = CounterpartyCard.objects.filter(counterparty_id=counterparty.id).order_by("id")
        primary_card = cards.first()
        cards.update(is_primary=False)
        if primary_card:
            CounterpartyCard.objects.filter(pk=primary_card.pk).update(is_primary=True)


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("main", "0012_warehouseshipmentorder_points_closed_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="WarehouseCounterpartyCard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.CharField(db_index=True, max_length=64, unique=True, verbose_name="Card number")),
                ("is_primary", models.BooleanField(db_index=True, default=False, verbose_name="Primary")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "counterparty",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cards",
                        to="main.warehousecounterparty",
                        verbose_name="Counterparty",
                    ),
                ),
            ],
            options={
                "verbose_name": "Warehouse counterparty card",
                "verbose_name_plural": "Warehouse counterparty cards",
                "ordering": ("-is_primary", "id"),
            },
        ),
        migrations.AddField(
            model_name="warehouseshipmentorder",
            name="counterparty_card",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="shipment_orders",
                to="main.warehousecounterpartycard",
                verbose_name="Counterparty card",
            ),
        ),
        migrations.RunPython(migrate_counterparty_cards, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="warehousecounterparty",
            name="card_number",
        ),
        migrations.AddConstraint(
            model_name="warehousecounterpartycard",
            constraint=models.UniqueConstraint(
                condition=Q(("is_primary", True)),
                fields=("counterparty",),
                name="unique_primary_card_per_warehouse_counterparty",
            ),
        ),
    ]
