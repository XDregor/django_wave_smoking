import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("firebase_uid", models.CharField(max_length=128, unique=True, verbose_name="Firebase UID")),
                ("provider", models.CharField(blank=True, max_length=40, verbose_name="Auth provider")),
                ("nickname", models.CharField(max_length=32, unique=True, verbose_name="Nickname")),
                ("birth_date", models.DateField(verbose_name="Birth date")),
                ("display_name", models.CharField(blank=True, max_length=120, verbose_name="Display name")),
                ("avatar_url", models.URLField(blank=True, verbose_name="Avatar URL")),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("updated", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="client_profile",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={
                "verbose_name": "Client profile",
                "verbose_name_plural": "Client profiles",
                "ordering": ("-updated",),
            },
        ),
    ]
