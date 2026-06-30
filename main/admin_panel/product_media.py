from .shared import *

class ProductMediaAdminMixin:
    def media_products_view(self, request):
        products = list(
            Product.objects.select_related("brand", "category")
            .prefetch_related("additional_images", "product_variants")
            .order_by("name")
        )
        context = {
            **self.admin_site.each_context(request),
            "title": "Медиа товаров",
            "media_products_payload": [self.serialize_media_product(product) for product in products],
        }
        return TemplateResponse(request, "admin_panel/media/list.html", context)

    def get_media_product_code(self, product):
        return f"654{str(product.id).zfill(4)}"

    def normalize_media_search(self, value):
        return "".join(str(value or "").lower().replace("#", "").split())

    def serialize_media_product(self, product):
        variant_image_count = sum(1 for item in product.product_variants.all() if item.image)
        additional_count = len(product.additional_images.all())
        return {
            "id": str(product.pk),
            "name": product.name,
            "code": self.get_media_product_code(product),
            "brand": product.brand.name if product.brand else "",
            "category": product.category.name if product.category else "",
            "image": self.media_url(product.image),
            "media_count": sum((bool(product.image), bool(product.promo_video), bool(product.promo_video_poster)))
            + additional_count
            + variant_image_count,
            "variant_image_count": variant_image_count,
            "url": reverse("admin:main_product_media_detail", args=(product.pk,)),
        }

    def product_media_view(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related("brand", "category", "variant_image_group").prefetch_related(
                "additional_images",
                Prefetch(
                    "product_variants",
                    queryset=ProductVariant.objects.select_related("variant", "variant__group").order_by(
                        "variant__group__order",
                        "variant__group__name",
                        "image_order",
                        "variant__order",
                        "variant__name",
                    ),
                ),
            ),
            pk=product_id,
        )
        if request.method == "POST":
            self.save_product_media(product, request.POST, request.FILES)
            self.log_change(request, product, "Медиа товара обновлены.")
            return redirect("admin:main_product_media_list")

        product_variants = list(product.product_variants.all())
        variant_image_group = self.get_product_variant_image_group(product, product_variants)
        image_group_variants = [
            item for item in product_variants
            if variant_image_group and item.variant.group_id == variant_image_group.pk
        ]
        context = {
            **self.admin_site.each_context(request),
            "title": f"Медиа: {product.name}",
            "product": product,
            "additional_images": product.additional_images.all().order_by("order", "id"),
            "variant_image_group": variant_image_group,
            "product_variants": image_group_variants,
            "has_product_variants": bool(product_variants),
            "media_list_url": reverse("admin:main_product_media_list"),
        }
        return TemplateResponse(request, "admin_panel/media/detail.html", context)

    def save_product_media(self, product, post_data, files):
        product_update_fields = []
        for field_name in ("image", "promo_video", "promo_video_poster"):
            if post_data.get(f"delete_{field_name}"):
                current_file = getattr(product, field_name)
                if current_file:
                    current_file.delete(save=False)
                setattr(product, field_name, "")
                product_update_fields.append(field_name)
            uploaded_file = files.get(field_name)
            if uploaded_file:
                setattr(product, field_name, uploaded_file)
                if field_name not in product_update_fields:
                    product_update_fields.append(field_name)
        if product_update_fields:
            product_update_fields.append("updated")
            product.save(update_fields=product_update_fields)

        for image in ProductImage.objects.filter(product=product).order_by("order", "id"):
            if post_data.get(f"delete_image_{image.id}"):
                image.delete()
                continue

            update_fields = []
            replacement = files.get(f"replace_image_{image.id}")
            if replacement:
                if image.image:
                    image.image.delete(save=False)
                image.image = replacement
                update_fields.append("image")
            alt_text = post_data.get(f"alt_text_{image.id}", image.alt_text)
            if alt_text != image.alt_text:
                image.alt_text = alt_text
                update_fields.append("alt_text")

            raw_order = post_data.get(f"order_{image.id}")
            try:
                order = max(0, int(raw_order))
            except (TypeError, ValueError):
                order = image.order
            if order != image.order:
                image.order = order
                update_fields.append("order")

            if update_fields:
                image.save(update_fields=update_fields)

        variant_image_group = self.get_product_variant_image_group(product)
        variant_images = ProductVariant.objects.filter(product=product).select_related("variant")
        if variant_image_group:
            variant_images = variant_images.filter(variant__group=variant_image_group)
        else:
            variant_images = variant_images.none()
        for product_variant in variant_images:
            update_variant_fields = []
            if post_data.get(f"delete_variant_image_{product_variant.id}"):
                if product_variant.image:
                    product_variant.image.delete(save=False)
                product_variant.image = ""
                update_variant_fields.append("image")
            uploaded_variant_image = files.get(f"variant_image_{product_variant.id}")
            if uploaded_variant_image:
                if product_variant.image:
                    product_variant.image.delete(save=False)
                product_variant.image = uploaded_variant_image
                if "image" not in update_variant_fields:
                    update_variant_fields.append("image")
            raw_image_order = post_data.get(f"image_order_{product_variant.id}")
            try:
                image_order = max(0, int(raw_image_order))
            except (TypeError, ValueError):
                image_order = product_variant.image_order
            if image_order != product_variant.image_order:
                product_variant.image_order = image_order
                update_variant_fields.append("image_order")
            if update_variant_fields:
                product_variant.save(update_fields=tuple(update_variant_fields))

        max_order = ProductImage.objects.filter(product=product).aggregate(value=Max("order"))["value"] or 0
        for index, uploaded_file in enumerate(files.getlist("new_images"), start=1):
            ProductImage.objects.create(
                product=product,
                image=uploaded_file,
                order=max_order + index,
                alt_text=product.name,
            )

    def get_product_variant_image_group(self, product, product_variants=None):
        if product.variant_image_group_id:
            return product.variant_image_group

        variants = list(product_variants) if product_variants is not None else list(
            product.product_variants.select_related("variant__group").all()
        )
        image_variant = next((item for item in variants if item.image), None)
        if image_variant:
            return image_variant.variant.group

        groups = {item.variant.group_id: item.variant.group for item in variants}
        return next(iter(groups.values())) if len(groups) == 1 else None
