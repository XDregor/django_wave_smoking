from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0005_warehouse_shipments"),
    ]

    operations = [
        migrations.AddField(
            model_name="warehousecounterparty",
            name="card_number",
            field=models.CharField(blank=True, max_length=64, verbose_name="Card number"),
        ),
    ]
