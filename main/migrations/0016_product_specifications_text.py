from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0015_productvariant_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="specifications_text",
            field=models.TextField(blank=True, verbose_name="Product specifications"),
        ),
    ]
