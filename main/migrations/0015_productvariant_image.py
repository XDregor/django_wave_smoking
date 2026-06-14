from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0014_productspecification"),
    ]

    operations = [
        migrations.AddField(
            model_name="productvariant",
            name="image",
            field=models.ImageField(blank=True, upload_to="products/variants/%Y/%m/%d/", verbose_name="Variant image"),
        ),
    ]
