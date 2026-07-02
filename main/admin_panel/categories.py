from .shared import *

@admin.register(Category)
class CategoryAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "product_count")
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)

    def get_urls(self):
        custom_urls = [
            path(
                "save-category/",
                self.admin_site.admin_view(self.categories_save_view),
                name="main_category_save",
            ),
            path(
                "delete-category/",
                self.admin_site.admin_view(self.categories_delete_view),
                name="main_category_delete",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return self.categories_list_view(request)

    def categories_list_view(self, request):
        categories = Category.objects.annotate(admin_product_count=Count("products")).order_by("name")
        context = {
            **self.admin_site.each_context(request),
            "title": "Категории",
            "categories_payload": [self.serialize_admin_category(category) for category in categories],
            "save_url": reverse("admin:main_category_save"),
            "delete_url": reverse("admin:main_category_delete"),
        }
        return TemplateResponse(request, "admin_panel/categories/list.html", context)

    def categories_save_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        raw_id = request.POST.get("id")
        try:
            category_id = int(raw_id) if raw_id else None
        except (TypeError, ValueError):
            return JsonResponse({"success": False, "message": "Некорректная категория."}, status=400)

        category = Category.objects.filter(pk=category_id).first() if category_id else Category()
        if raw_id and not category:
            return JsonResponse({"success": False, "message": "Категория не найдена."}, status=404)

        name = (request.POST.get("name") or "").strip()
        if not name:
            return JsonResponse({"success": False, "message": "Введите название категории."}, status=400)
        if len(name) > Category._meta.get_field("name").max_length:
            return JsonResponse({"success": False, "message": "Название категории слишком длинное."}, status=400)

        duplicate = Category.objects.filter(name__iexact=name)
        if category.pk:
            duplicate = duplicate.exclude(pk=category.pk)
        if duplicate.exists():
            return JsonResponse({"success": False, "message": "Категория с таким названием уже существует."}, status=409)

        is_created = not bool(category.pk)
        category.name = name
        category.save()
        if is_created:
            self.log_addition(request, category, "Категория создана через кастомное меню.")
        else:
            self.log_change(request, category, "Категория обновлена через кастомное меню.")
        category.admin_product_count = category.products.count()
        return JsonResponse({"success": True, "category": self.serialize_admin_category(category)})

    def categories_delete_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
            category_id = int(payload.get("id"))
        except (json.JSONDecodeError, TypeError, ValueError):
            return JsonResponse({"success": False, "message": "Некорректная категория."}, status=400)

        category = Category.objects.filter(pk=category_id).annotate(admin_product_count=Count("products")).first()
        if not category:
            return JsonResponse({"success": False, "message": "Категория не найдена."}, status=404)
        if category.admin_product_count:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Нельзя удалить категорию, пока к ней привязаны товары.",
                },
                status=409,
            )

        deleted_id = category.pk
        self.log_deletions(request, Category.objects.filter(pk=category.pk))
        category.delete()
        return JsonResponse({"success": True, "deleted_id": str(deleted_id)})

    def serialize_admin_category(self, category):
        return {
            "id": str(category.pk),
            "name": category.name,
            "slug": category.slug,
            "product_count": getattr(category, "admin_product_count", category.products.count()),
        }

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_product_count=Count("products"))

    @admin.display(description="Товаров")
    def product_count(self, obj):
        return obj.admin_product_count
