from .shared import *

@admin.register(Brand)
class BrandAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "show_in_carousel", "product_count")
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)
    fields = ("name", "slug", "image", "show_in_carousel")

    def get_urls(self):
        custom_urls = [
            path(
                "save-brand/",
                self.admin_site.admin_view(self.brands_save_view),
                name="main_brand_save",
            ),
            path(
                "delete-brand/",
                self.admin_site.admin_view(self.brands_delete_view),
                name="main_brand_delete",
            ),
            path(
                "toggle-carousel/",
                self.admin_site.admin_view(self.brands_toggle_carousel_view),
                name="main_brand_toggle_carousel",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return self.brands_list_view(request)

    def brands_list_view(self, request):
        brands = Brand.objects.annotate(admin_product_count=Count("products")).order_by("name")
        context = {
            **self.admin_site.each_context(request),
            "title": "Бренды",
            "brands_payload": [self.serialize_admin_brand(brand) for brand in brands],
            "save_url": reverse("admin:main_brand_save"),
            "delete_url": reverse("admin:main_brand_delete"),
            "toggle_carousel_url": reverse("admin:main_brand_toggle_carousel"),
        }
        return TemplateResponse(request, "admin_panel/brands/brands_page.html", context)

    def get_brand_action_id(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None, {}
        try:
            return int(payload.get("id")), payload
        except (TypeError, ValueError):
            return None, payload

    def brands_save_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        raw_id = request.POST.get("id")
        try:
            brand_id = int(raw_id) if raw_id else None
        except (TypeError, ValueError):
            return JsonResponse({"success": False, "message": "Некорректный бренд."}, status=400)
        brand = Brand.objects.filter(pk=brand_id).first() if brand_id else Brand()
        if raw_id and not brand:
            return JsonResponse({"success": False, "message": "Бренд не найден."}, status=404)
        name = (request.POST.get("name") or "").strip()
        if not name:
            return JsonResponse({"success": False, "message": "Введите название бренда."}, status=400)
        duplicate = Brand.objects.filter(name__iexact=name)
        if brand.pk:
            duplicate = duplicate.exclude(pk=brand.pk)
        if duplicate.exists():
            return JsonResponse({"success": False, "message": "Бренд с таким названием уже существует."}, status=409)
        is_created = not bool(brand.pk)
        brand.name = name
        brand.show_in_carousel = request.POST.get("show_in_carousel") == "1"
        if request.FILES.get("image"):
            brand.image = request.FILES["image"]
        brand.save()
        if is_created:
            self.log_addition(request, brand, "Бренд создан через кастомное меню.")
        else:
            self.log_change(request, brand, "Бренд обновлён через кастомное меню.")
        brand.admin_product_count = brand.products.count()
        return JsonResponse({"success": True, "brand": self.serialize_admin_brand(brand)})

    def brands_delete_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        brand_id, _payload = self.get_brand_action_id(request)
        brand = Brand.objects.filter(pk=brand_id).first() if brand_id else None
        if not brand:
            return JsonResponse({"success": False, "message": "Бренд не найден."}, status=404)
        brand_id = brand.pk
        self.log_deletions(request, Brand.objects.filter(pk=brand.pk))
        brand.delete()
        return JsonResponse({"success": True, "deleted_id": str(brand_id)})

    def brands_toggle_carousel_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        brand_id, payload = self.get_brand_action_id(request)
        brand = Brand.objects.filter(pk=brand_id).first() if brand_id else None
        if not brand:
            return JsonResponse({"success": False, "message": "Бренд не найден."}, status=404)
        brand.show_in_carousel = bool(payload.get("show_in_carousel"))
        brand.save(update_fields=("show_in_carousel",))
        self.log_change(request, brand, "Участие бренда в карусели изменено.")
        brand.admin_product_count = brand.products.count()
        return JsonResponse({"success": True, "brand": self.serialize_admin_brand(brand)})

    def get_brand_image_url(self, brand):
        if not brand.image:
            return ""
        try:
            return brand.image.url
        except ValueError:
            return ""

    def serialize_admin_brand(self, brand):
        return {
            "id": str(brand.pk),
            "name": brand.name,
            "slug": brand.slug,
            "image": self.get_brand_image_url(brand),
            "in_carousel": bool(brand.show_in_carousel),
            "product_count": getattr(brand, "admin_product_count", brand.products.count()),
        }

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_product_count=Count("products"))

    @admin.display(description="Товаров")
    def product_count(self, obj):
        return obj.admin_product_count
