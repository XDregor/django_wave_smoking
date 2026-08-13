from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0013_counterparty_cards"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="warehousecounterpartycard",
            options={
                "ordering": ("id",),
                "verbose_name": "Warehouse counterparty card",
                "verbose_name_plural": "Warehouse counterparty cards",
            },
        ),
    ]
