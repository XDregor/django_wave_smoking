from .shared import *


class VariantOptionInline(TabularInline):
    model = VariantOption
    extra = 0
    fields = ("name", "filter_name", "color_hex", "slug", "order")
    readonly_fields = ("slug",)
    show_change_link = True


@admin.register(VariantGroup)
class VariantGroupAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = ("name", "slug", "order", "options_count")
    search_fields = ("name", "slug")
    readonly_fields = ("slug",)
    inlines = (VariantOptionInline,)

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_system_group:
            return False
        return super().has_delete_permission(request, obj)

    def get_urls(self):
        custom_urls = [
            path(
                "save-group/",
                self.admin_site.admin_view(self.variant_groups_save_view),
                name="main_variantgroup_save",
            ),
            path(
                "delete-group/",
                self.admin_site.admin_view(self.variant_groups_delete_view),
                name="main_variantgroup_delete",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return self.variant_groups_list_view(request)

    def variant_groups_list_view(self, request):
        option_queryset = VariantOption.objects.annotate(
            admin_product_count=Count("product_variants__product", distinct=True),
            admin_sku_count=Count("product_skus", distinct=True),
        ).order_by("order", "name")
        groups = VariantGroup.objects.prefetch_related(
            Prefetch("options", queryset=option_queryset, to_attr="admin_options")
        ).order_by("order", "name")
        context = {
            **self.admin_site.each_context(request),
            "title": "Группы вариантов",
            "variant_groups_payload": [self.serialize_admin_variant_group(group) for group in groups],
            "save_url": reverse("admin:main_variantgroup_save"),
            "delete_url": reverse("admin:main_variantgroup_delete"),
        }
        return TemplateResponse(request, "admin_panel/variant_groups/variant_groups_page.html", context)

    def variant_groups_save_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Некорректные данные."}, status=400)

        raw_group_id = payload.get("id")
        try:
            group_id = int(raw_group_id) if raw_group_id else None
        except (TypeError, ValueError):
            return JsonResponse({"success": False, "message": "Некорректная группа вариантов."}, status=400)

        group = VariantGroup.objects.filter(pk=group_id).first() if group_id else VariantGroup()
        if raw_group_id and not group:
            return JsonResponse({"success": False, "message": "Группа вариантов не найдена."}, status=404)

        name = strip_tags(str(payload.get("name") or "")).strip()
        if not name:
            return JsonResponse({"success": False, "message": "Введите название группы."}, status=400)
        if len(name) > VariantGroup._meta.get_field("name").max_length:
            return JsonResponse({"success": False, "message": "Название группы слишком длинное."}, status=400)
        if group.pk and group.is_system_group and name != group.name:
            return JsonResponse(
                {"success": False, "message": "Название системной группы изменить нельзя."},
                status=409,
            )
        duplicate_group = VariantGroup.objects.filter(name__iexact=name)
        if group.pk:
            duplicate_group = duplicate_group.exclude(pk=group.pk)
        if duplicate_group.exists():
            return JsonResponse({"success": False, "message": "Группа с таким названием уже существует."}, status=409)

        try:
            order = max(0, int(payload.get("order") or 0))
        except (TypeError, ValueError):
            order = 0
        if group.is_color_group:
            order = 0

        raw_options = payload.get("options") or []
        if not isinstance(raw_options, list):
            return JsonResponse({"success": False, "message": "Некорректный список вариантов."}, status=400)

        option_name_max = VariantOption._meta.get_field("name").max_length
        normalized_options = []
        seen_names = set()
        for index, item in enumerate(raw_options):
            if not isinstance(item, dict):
                return JsonResponse({"success": False, "message": "Некорректное значение варианта."}, status=400)
            option_name = strip_tags(str(item.get("name") or "")).strip()
            filter_name = strip_tags(str(item.get("filter_name") or option_name)).strip() or option_name
            color_hex = self.normalize_color_hex(item.get("color_hex")) if group.is_color_group else ""
            if group.is_color_group and not color_hex:
                return JsonResponse(
                    {"success": False, "message": f"Выберите физический цвет для варианта «{option_name or index + 1}»."},
                    status=400,
                )
            if not option_name:
                return JsonResponse({"success": False, "message": "Укажите название каждого варианта."}, status=400)
            if len(option_name) > option_name_max or len(filter_name) > option_name_max:
                return JsonResponse(
                    {"success": False, "message": f"Названия вариантов должны быть не длиннее {option_name_max} символов."},
                    status=400,
                )
            normalized_name = option_name.casefold()
            if normalized_name in seen_names:
                return JsonResponse({"success": False, "message": "Названия вариантов внутри группы не должны повторяться."}, status=409)
            seen_names.add(normalized_name)
            try:
                option_id = int(item.get("id")) if item.get("id") else None
            except (TypeError, ValueError):
                option_id = None
            normalized_options.append({
                "id": option_id,
                "name": option_name,
                "filter_name": filter_name,
                "color_hex": color_hex,
                "order": index,
            })

        existing_options = {option.pk: option for option in group.options.all()} if group.pk else {}
        submitted_existing_ids = {item["id"] for item in normalized_options if item["id"] in existing_options}
        removed_options = [option for option_id, option in existing_options.items() if option_id not in submitted_existing_ids]
        protected_removed = [
            option.name
            for option in removed_options
            if option.product_variants.exists() or option.product_skus.exists()
        ]
        if protected_removed:
            return JsonResponse(
                {
                    "success": False,
                    "message": "Нельзя удалить используемые варианты: " + ", ".join(protected_removed),
                },
                status=409,
            )

        is_created = not bool(group.pk)
        with transaction.atomic():
            group.name = name
            group.order = order
            group.save()

            for item in normalized_options:
                option = existing_options.get(item["id"])
                if option and option.name != item["name"]:
                    VariantOption.objects.filter(pk=option.pk).update(name=f"__wave_tmp_{option.pk}__")

            for item in normalized_options:
                option = existing_options.get(item["id"])
                if option is None:
                    option = VariantOption(group=group)
                option.name = item["name"]
                option.filter_name = item["filter_name"]
                option.color_hex = item["color_hex"]
                option.order = item["order"]
                option.save()

            for option in removed_options:
                option.delete()

        refreshed_group = VariantGroup.objects.prefetch_related(
            Prefetch(
                "options",
                queryset=VariantOption.objects.annotate(
                    admin_product_count=Count("product_variants__product", distinct=True),
                    admin_sku_count=Count("product_skus", distinct=True),
                ).order_by("order", "name"),
                to_attr="admin_options",
            )
        ).get(pk=group.pk)
        if is_created:
            self.log_addition(request, refreshed_group, "Группа вариантов создана через кастомное меню.")
        else:
            self.log_change(request, refreshed_group, "Группа вариантов обновлена через кастомное меню.")
        return JsonResponse({"success": True, "group": self.serialize_admin_variant_group(refreshed_group)})

    def variant_groups_delete_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
            group_id = int(payload.get("id"))
        except (json.JSONDecodeError, TypeError, ValueError):
            return JsonResponse({"success": False, "message": "Некорректная группа вариантов."}, status=400)

        group = VariantGroup.objects.filter(pk=group_id).first()
        if not group:
            return JsonResponse({"success": False, "message": "Группа вариантов не найдена."}, status=404)
        if group.is_system_group:
            return JsonResponse(
                {"success": False, "message": "Системную группу «Цвет» удалить нельзя."},
                status=409,
            )
        if ProductVariant.objects.filter(variant__group=group).exists() or ProductSKU.objects.filter(options__group=group).exists():
            return JsonResponse(
                {"success": False, "message": "Нельзя удалить группу, варианты которой используются товарами или SKU."},
                status=409,
            )

        deleted_id = group.pk
        self.log_deletions(request, VariantGroup.objects.filter(pk=group.pk))
        group.delete()
        return JsonResponse({"success": True, "deleted_id": str(deleted_id)})

    def serialize_admin_variant_group(self, group):
        options = group.admin_options if hasattr(group, "admin_options") else list(group.options.all())
        return {
            "id": str(group.pk),
            "name": group.name,
            "slug": group.slug,
            "order": group.order,
            "kind": group.kind,
            "is_system": group.is_system_group,
            "is_color": group.is_color_group,
            "options": [self.serialize_admin_variant_option(option) for option in options],
        }

    def normalize_color_hex(self, value):
        color_hex = str(value or "").strip().upper()
        if not color_hex:
            return ""
        if not color_hex.startswith("#"):
            color_hex = f"#{color_hex}"
        if len(color_hex) != 7:
            return ""
        try:
            int(color_hex[1:], 16)
        except ValueError:
            return ""
        return color_hex

    def serialize_admin_variant_option(self, option):
        product_count = getattr(option, "admin_product_count", None)
        if product_count is None:
            product_count = option.product_variants.values("product_id").distinct().count()
        sku_count = getattr(option, "admin_sku_count", None)
        if sku_count is None:
            sku_count = option.product_skus.count()
        return {
            "id": str(option.pk),
            "name": option.name,
            "filter_name": option.filter_name or option.name,
            "color_hex": option.color_hex,
            "order": option.order,
            "product_count": product_count,
            "sku_count": sku_count,
            "is_used": bool(product_count or sku_count),
        }

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(admin_options_count=Count("options"))

    @admin.display(description="Вариантов")
    def options_count(self, obj):
        return obj.admin_options_count

@admin.register(VariantOption)
class VariantOptionAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("name", "filter_name", "color_hex", "group", "order", "slug")
    list_filter = ("group",)
    search_fields = ("name", "filter_name", "group__name")
    autocomplete_fields = ("group",)
    readonly_fields = ("slug",)
    ordering = ("group__order", "group__name", "order", "name")


@admin.register(ProductVariant)
class ProductVariantAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "variant", "stock", "available")
    list_filter = ("available", "variant__group")
    search_fields = ("product__name", "variant__name", "variant__group__name")
    autocomplete_fields = ("product", "variant")
    fields = ("product", "variant", "image", "image_order", "stock", "available")


@admin.register(ProductSKU)
class ProductSKUAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("product", "sku_code", "price", "old_price", "stock", "available", "sort_order")
    list_filter = ("available", "product__category", "product__brand")
    search_fields = ("product__name", "sku_code", "options__name")
    autocomplete_fields = ("product", "options")
    fields = ("product", "options", "sku_code", "price", "old_price", "stock", "available", "image", "sort_order")
