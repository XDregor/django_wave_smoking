from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("main", "0012_productreview"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="productreview",
            name="cons",
        ),
        migrations.RemoveField(
            model_name="productreview",
            name="pros",
        ),
        migrations.RemoveField(
            model_name="productreview",
            name="unhelpful_count",
        ),
        migrations.CreateModel(
            name="ProductReviewHelpful",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("session_key", models.CharField(blank=True, db_index=True, max_length=40, verbose_name="Session key")),
                ("created", models.DateTimeField(auto_now_add=True)),
                (
                    "review",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="helpful_votes",
                        to="main.productreview",
                        verbose_name="Review",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="review_helpful_votes",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="User",
                    ),
                ),
            ],
            options={
                "verbose_name": "Review helpful vote",
                "verbose_name_plural": "Review helpful votes",
                "ordering": ("-created",),
            },
        ),
        migrations.AddConstraint(
            model_name="productreviewhelpful",
            constraint=models.UniqueConstraint(
                condition=Q(user__isnull=False),
                fields=("review", "user"),
                name="main_review_helpful_unique_user",
            ),
        ),
        migrations.AddConstraint(
            model_name="productreviewhelpful",
            constraint=models.UniqueConstraint(
                condition=Q(user__isnull=True) & ~Q(session_key=""),
                fields=("review", "session_key"),
                name="main_review_helpful_unique_session",
            ),
        ),
    ]
