from django.db import migrations, models
import django.db.models.deletion
from django.utils.text import slugify


def make_unique_slug(model, value):
    base_slug = slugify(value) or "item"
    slug = base_slug
    index = 2
    while model.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{index}"
        index += 1
    return slug


def migrate_variant_groups(apps, schema_editor):
    VariantGroup = apps.get_model("main", "VariantGroup")
    VariantOption = apps.get_model("main", "VariantOption")

    group_cache = {}
    for option in VariantOption.objects.all().order_by("group_name", "order", "name"):
        group_name = (option.group_name or "").strip() or "Без группы"
        variant_group = group_cache.get(group_name)
        if variant_group is None:
            variant_group, _ = VariantGroup.objects.get_or_create(
                name=group_name,
                defaults={
                    "slug": make_unique_slug(VariantGroup, group_name),
                    "order": len(group_cache),
                },
            )
            group_cache[group_name] = variant_group
        option.group_id = variant_group.id
        option.save(update_fields=("group",))


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0021_alter_variantoption_options_and_more"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="variantoption",
            name="main_variantoption_unique_group_name",
        ),
        migrations.CreateModel(
            name="VariantGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80, unique=True, verbose_name="Group name")),
                ("slug", models.SlugField(blank=True, max_length=100, unique=True)),
                ("order", models.PositiveIntegerField(default=0, verbose_name="Order")),
            ],
            options={
                "verbose_name": "Variant group",
                "verbose_name_plural": "Variant groups",
                "ordering": ("order", "name"),
            },
        ),
        migrations.RenameField(
            model_name="variantoption",
            old_name="group",
            new_name="group_name",
        ),
        migrations.AddField(
            model_name="variantoption",
            name="group",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="options",
                to="main.variantgroup",
                verbose_name="Group",
            ),
        ),
        migrations.RunPython(migrate_variant_groups, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="variantoption",
            name="group",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="options",
                to="main.variantgroup",
                verbose_name="Group",
            ),
        ),
        migrations.RemoveField(
            model_name="variantoption",
            name="group_name",
        ),
        migrations.AlterModelOptions(
            name="variantoption",
            options={
                "ordering": ("group__order", "group__name", "order", "name"),
                "verbose_name": "Variant option",
                "verbose_name_plural": "Variant options",
            },
        ),
        migrations.AddConstraint(
            model_name="variantoption",
            constraint=models.UniqueConstraint(fields=("group", "name"), name="main_variantoption_unique_group_name"),
        ),
        migrations.AlterModelOptions(
            name="productvariant",
            options={
                "ordering": ("variant__group__order", "variant__group__name", "variant__order", "variant__name"),
                "verbose_name": "Product variant",
                "verbose_name_plural": "Product variants",
            },
        ),
    ]
