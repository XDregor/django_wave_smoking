from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from main.models import Product, ProductImage, ProductSKU, ProductVariant


class Command(BaseCommand):
    help = "Move product media to media/products/<product-id>/<kind>/ and update database paths."

    def add_arguments(self, parser):
        parser.add_argument("--write", action="store_true", help="Actually move files and update database paths.")
        parser.add_argument("--product-id", type=int, help="Normalize only one product.")

    def handle(self, *args, **options):
        write = options["write"]
        product_id = options.get("product_id")
        updates = []
        planned_names = set()

        products = Product.objects.all().order_by("id")
        if product_id:
            products = products.filter(pk=product_id)

        for product in products:
            updates.extend(self.collect_product_updates(product, planned_names))

        if not updates:
            self.stdout.write("No product media paths need normalization.")
            return

        for update in updates:
            marker = "MOVE" if write else "DRY "
            self.stdout.write(f"{marker} {update['old']} -> {update['new']}")

        if not write:
            self.stdout.write("\nNo files changed. Add --write to normalize product media.")
            return

        with transaction.atomic():
            for update in updates:
                self.apply_update(update)

        self.stdout.write(self.style.SUCCESS(f"Normalized {len(updates)} product media files."))

    def collect_product_updates(self, product, planned_names):
        updates = []
        self.add_field_update(updates, product, "image", "main", "main-original", planned_names)
        self.add_field_update(updates, product, "promo_video", "video", "promo-video", planned_names)
        self.add_field_update(updates, product, "promo_video_poster", "video", "video-poster-original", planned_names)

        for variant in ProductVariant.objects.select_related("variant").filter(product=product).order_by("id"):
            suffix = f"variant-{variant.variant_id}-{self.slug(variant.variant.name)}-original"
            self.add_field_update(updates, variant, "image", "variants", suffix, planned_names)

        for sku in ProductSKU.objects.prefetch_related("options").filter(product=product).order_by("id"):
            options_slug = self.slug("-".join(option.name for option in sku.options.all()) or sku.sku_code or sku.pk)
            self.add_field_update(updates, sku, "image", "skus", f"sku-{sku.pk}-{options_slug}-original", planned_names)

        for image in ProductImage.objects.filter(product=product).order_by("order", "id"):
            order = (image.order or 0) + 1
            self.add_field_update(updates, image, "image", "gallery", f"gallery-{order:02d}-{image.pk}-original", planned_names)

        return updates

    def add_field_update(self, updates, instance, field_name, kind, suffix, planned_names):
        file_field = getattr(instance, field_name)
        if not file_field:
            return

        old_name = file_field.name
        if not old_name or self.is_normalized(old_name, instance.product if hasattr(instance, "product") else instance, kind):
            return
        if not default_storage.exists(old_name):
            self.stderr.write(f"MISS  {old_name}")
            return

        product = instance.product if hasattr(instance, "product") else instance
        extension = Path(old_name).suffix.lower() or ".webp"
        product_slug = self.slug(product.slug or product.name or product.pk)
        new_name = f"products/{product.pk}/{kind}/product-{product.pk}-{product_slug}-{suffix}{extension}"
        new_name = self.unique_storage_name(new_name, planned_names)
        planned_names.add(new_name)
        updates.append({
            "instance": instance,
            "field_name": field_name,
            "old": old_name,
            "new": new_name,
        })

    def is_normalized(self, name, product, kind):
        return name.startswith(f"products/{product.pk}/{kind}/")

    def apply_update(self, update):
        old_name = update["old"]
        new_name = update["new"]
        old_path = Path(settings.MEDIA_ROOT, old_name)
        new_path = Path(settings.MEDIA_ROOT, new_name)
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.replace(new_path)
        setattr(update["instance"], update["field_name"], new_name)
        update["instance"].save(update_fields=(update["field_name"],))

    def unique_storage_name(self, name, planned_names):
        if name not in planned_names and not default_storage.exists(name):
            return name
        path = Path(name)
        index = 2
        while True:
            candidate = str(path.with_name(f"{path.stem}-{index}{path.suffix}")).replace("\\", "/")
            if candidate not in planned_names and not default_storage.exists(candidate):
                return candidate
            index += 1

    def slug(self, value):
        return slugify(str(value or "").strip()) or "item"
