from .shared import *

class ProductListAdminMixin:
    def changelist_view(self, request, extra_context=None):
        return redirect("admin:main_product_products_list")

    def products_list_view(self, request):
        products = (
            Product.objects.select_related("brand", "category")
            .prefetch_related("skus__options", "specifications")
            .order_by("-created", "-id")
        )
        context = {
            **self.admin_site.each_context(request),
            "title": "Управление товарами",
            "products_payload": [self.serialize_admin_product(product) for product in products],
            "add_product_url": reverse("admin:main_product_add_sku"),
            "products_list_url": reverse("admin:main_product_products_list"),
            "bulk_draft_url": reverse("admin:main_product_products_bulk_draft"),
            "bulk_publish_url": reverse("admin:main_product_products_bulk_publish"),
            "bulk_delete_url": reverse("admin:main_product_products_bulk_delete"),
        }
        return TemplateResponse(request, "admin_panel/products/list.html", context)

    def get_products_bulk_ids(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return []
        raw_ids = payload.get("ids") or []
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        return ids

    def products_bulk_draft_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "Не выбраны товары."}, status=400)
        products = list(Product.objects.filter(pk__in=ids))
        updated = Product.objects.filter(pk__in=ids).update(available=False)
        for product in products:
            self.log_change(request, product, "Товар отправлен в черновик через массовое действие.")
        return JsonResponse({"success": True, "updated": updated, "ids": [str(pk) for pk in ids]})

    def products_bulk_publish_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "No products selected."}, status=400)
        products = list(Product.objects.filter(pk__in=ids))
        updated = Product.objects.filter(pk__in=ids).update(available=True)
        for product in products:
            self.log_change(request, product, "Товар опубликован через массовое действие.")
        return JsonResponse({"success": True, "updated": updated, "ids": [str(pk) for pk in ids]})

    def products_bulk_delete_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        ids = self.get_products_bulk_ids(request)
        if not ids:
            return JsonResponse({"success": False, "message": "Не выбраны товары."}, status=400)
        products = Product.objects.filter(pk__in=ids)
        for product in products:
            self.log_deletion(request, product, f"Товар удалён через массовое действие: {product}")
        deleted_ids = [str(pk) for pk in products.values_list("pk", flat=True)]
        deleted_count, _ = products.delete()
        return JsonResponse({"success": True, "deleted": deleted_count, "ids": deleted_ids})

    def serialize_admin_product(self, product):
        badge = product.get_badge_data()
        skus = list(product.skus.all())
        image_url = ""
        if product.image:
            try:
                image_url = product.image.url
            except ValueError:
                image_url = ""
        return {
            "id": str(product.pk),
            "code": f"654{str(product.pk).zfill(4)}",
            "name": product.name,
            "category": product.category.name if product.category_id else "",
            "brand": product.brand.name if product.brand_id else "",
            "status": "published" if product.available else "draft",
            "badge": badge["type"] if badge else "",
            "badge_label": badge["label"] if badge else "",
            "price": float(product.price),
            "old_price": float(product.old_price) if product.is_on_sale else None,
            "stock": product.stock,
            "skus": [
                {
                    "name": ", ".join(option.name for option in sku.options.all()) or sku.sku_code or "SKU",
                    "qty": sku.stock,
                    "price": float(sku.price),
                    "available": bool(sku.available and sku.stock > 0),
                }
                for sku in skus
            ] or [
                {
                    "name": product.name,
                    "qty": product.stock,
                    "price": float(product.price),
                    "available": bool(product.available and product.stock > 0),
                }
            ],
            "chars": [
                {"k": specification.name, "v": specification.value}
                for specification in product.specifications.all()
            ],
            "description": strip_tags(product.description or ""),
            "img": image_url,
            "created_ts": int(product.created.timestamp()) if product.created else 0,
            "edit_url": reverse("admin:main_product_edit_sku", args=(product.pk,)),
        }
