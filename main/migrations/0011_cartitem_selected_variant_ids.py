from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0010_productimage"),
    ]

    operations = [
        migrations.AddField(
            model_name="cartitem",
            name="selected_variant_ids",
            field=models.JSONField(blank=True, default=list, verbose_name="Selected variant ids"),
        ),
    ]
