from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0013_review_helpful_votes_cleanup"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductSpecification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, verbose_name="Name")),
                ("value", models.CharField(max_length=255, verbose_name="Value")),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Order")),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="specifications",
                        to="main.product",
                        verbose_name="Product",
                    ),
                ),
            ],
            options={
                "verbose_name": "Product specification",
                "verbose_name_plural": "Product specifications",
                "ordering": ("order", "id"),
            },
        ),
    ]
