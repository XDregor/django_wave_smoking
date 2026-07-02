from .shared import *

class ProductSkuAdminMixin:
    def add_sku_view(self, request):
        if request.method == "POST":
            return self.save_sku_product(request)

        context = {
            **self.admin_site.each_context(request),
            "title": "Добавление товара",
            "content_title": "Добавление товара",
            "categories": Category.objects.order_by("name"),
            "brands": Brand.objects.order_by("name"),
            "variant_catalog": [
                {
                    "id": str(group.pk),
                    "name": group.name,
                    "options": [
                        {
                            "id": str(option.pk),
                            "name": option.name,
                            "filterName": option.filter_name or option.name,
                            "colorHex": option.color_hex,
                        }
                        for option in group.options.all()
                    ],
                }
                for group in VariantGroup.objects.prefetch_related("options").order_by("order", "name")
            ],
            "product_list_url": reverse("admin:main_product_changelist"),
            "quick_add_url": reverse("admin:main_product_add_sku_quick_add"),
        }
        return TemplateResponse(request, "admin_panel/products/form.html", context)

    def edit_sku_view(self, request, product_id):
        product = get_object_or_404(
            Product.objects.select_related("brand", "category").prefetch_related(
                "additional_images",
                "specifications",
                "product_variants__variant__group",
                "skus__options__group",
            ),
            pk=product_id,
        )
        if request.method == "POST":
            return self.save_sku_product(request, product=product)

        context = {
            **self.admin_site.each_context(request),
            "title": f"Редактирование: {product.name}",
            "content_title": "Редактирование товара",
            "categories": Category.objects.order_by("name"),
            "brands": Brand.objects.order_by("name"),
            "variant_catalog": [
                {
                    "id": str(group.pk),
                    "name": group.name,
                    "options": [
                        {
                            "id": str(option.pk),
                            "name": option.name,
                            "filterName": option.filter_name or option.name,
                            "colorHex": option.color_hex,
                        }
                        for option in group.options.all()
                    ],
                }
                for group in VariantGroup.objects.prefetch_related("options").order_by("order", "name")
            ],
            "product_list_url": reverse("admin:main_product_products_list"),
            "quick_add_url": reverse("admin:main_product_add_sku_quick_add"),
            "sku_admin_mode": "edit",
            "edit_product": product,
            "edit_product_payload": self.serialize_sku_edit_product(product),
        }
        return TemplateResponse(request, "admin_panel/products/form.html", context)

    def media_url(self, file_field):
        if not file_field:
            return ""
        try:
            return file_field.url
        except ValueError:
            return ""

    def serialize_sku_edit_product(self, product):
        root_price = product.sku_root_price or product.price
        root_old_price = product.sku_root_old_price
        if not root_old_price and product.old_price and product.old_price > product.price:
            root_old_price = product.old_price
        groups = []
        group_index = {}
        product_variants = list(
            product.product_variants.select_related("variant__group").order_by(
                "variant__group__order",
                "variant__group__name",
                "variant__order",
                "variant__name",
            )
        )
        selected_image_group = self.get_product_variant_image_group(product, product_variants)
        selected_image_group_id = selected_image_group.pk if selected_image_group else None
        for product_variant in product_variants:
            option = product_variant.variant
            group = option.group
            group_key = str(group.pk)
            if group_key not in group_index:
                group_index[group_key] = len(groups)
                groups.append({
                    "id": group_key,
                    "catalogGroupId": group_key,
                    "name": group.name,
                    "hasImages": group.pk == selected_image_group_id,
                    "variants": [],
                })
            image_url = self.media_url(product_variant.image)
            group_data = groups[group_index[group_key]]
            group_data["variants"].append({
                "id": str(option.pk),
                "catalogOptionId": str(option.pk),
                "name": option.name,
                "filterName": option.filter_name or option.name,
                "colorHex": option.color_hex,
                "imageUrl": image_url,
                "imageOrder": product_variant.image_order,
            })

        skus = []
        for sku in product.skus.prefetch_related("options__group").all().order_by("sort_order", "id"):
            option_ids = {str(option.pk) for option in sku.options.all()}
            path_values = []
            for group_data in groups:
                selected = next(
                    (variant for variant in group_data["variants"] if variant["catalogOptionId"] in option_ids),
                    None,
                )
                path_values.append(selected["name"] if selected else "")
            skus.append({
                "path": path_values,
                "price": float(sku.price),
                "old_price": float(sku.old_price) if sku.old_price and sku.old_price > sku.price else None,
                "stock": sku.stock,
                "available": bool(sku.available),
                "sort_order": sku.sort_order,
            })

        return {
            "id": product.pk,
            "name": product.name,
            "category": str(product.category_id or ""),
            "brand": str(product.brand_id or ""),
            "status": "published" if product.available else "draft",
            "badgeCodes": [product.badge_type] if product.badge_type else [],
            "likesReal": product.likes,
            "likesAdjustment": product.likes_adjustment,
            "likesTotal": product.display_likes,
            "descriptionHtml": product.description or "",
            "chars": [
                {"key": item.name, "value": item.value}
                for item in product.specifications.all().order_by("order", "id")
            ],
            "media": {
                "main": self.media_url(product.image),
                "extra": [self.media_url(image.image) for image in product.additional_images.all().order_by("order", "id")],
                "video": self.media_url(product.promo_video),
                "poster": self.media_url(product.promo_video_poster),
            },
            "groups": groups,
            "rootPricing": {
                "price": float(root_price) if root_price else None,
                "old_price": float(root_old_price) if root_old_price else None,
            },
            "skus": skus,
        }

    def quick_add_sku_reference_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Некорректные данные."}, status=400)

        reference_type = str(payload.get("type") or "").strip()
        name = str(payload.get("name") or "").strip()
        if reference_type not in {"category", "brand"}:
            return JsonResponse({"success": False, "message": "Неизвестный тип справочника."}, status=400)
        if not name:
            return JsonResponse({"success": False, "message": "Введите название."}, status=400)

        model = Category if reference_type == "category" else Brand
        item = model.objects.filter(name__iexact=name).first()
        created = False
        if item is None:
            item = model.objects.create(name=name)
            created = True

        return JsonResponse({
            "success": True,
            "created": created,
            "item": {
                "id": item.pk,
                "name": item.name,
                "slug": item.slug,
            },
        })

    def save_sku_product(self, request, product=None):
        try:
            payload = json.loads(request.POST.get("payload") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"success": False, "message": "Некорректные данные формы."}, status=400)

        errors = self.validate_sku_payload(payload, request.FILES, product=product)
        if errors:
            return JsonResponse({"success": False, "message": " ".join(errors), "errors": errors}, status=400)

        try:
            with transaction.atomic():
                if product is None:
                    product = self.create_sku_product(payload, request.FILES)
                    created = True
                else:
                    product = self.update_sku_product(product, payload, request.FILES)
                    created = False
        except (ObjectDoesNotExist, ValidationError, ValueError, InvalidOperation) as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return JsonResponse({"success": False, "message": message}, status=400)

        if created:
            self.log_addition(request, product, "Товар создан через карточный мастер.")
        else:
            self.log_change(request, product, "Товар обновлён через карточный мастер.")

        return JsonResponse(
            {
                "success": True,
                "product_id": product.pk,
                "redirect_url": reverse("admin:main_product_products_list"),
            }
        )

    def validate_sku_payload(self, payload, files, product=None):
        errors = []
        raw_product_name = str(payload.get("name") or "").strip()
        product_name = strip_tags(raw_product_name).strip()
        product_name_max_length = Product._meta.get_field("name").max_length
        if not product_name:
            errors.append("Заполните название товара.")
        elif product_name != raw_product_name:
            errors.append("Название товара не должно содержать HTML.")
        elif len(product_name) > product_name_max_length:
            errors.append(f"Название товара должно быть не длиннее {product_name_max_length} символов.")
        description_html = sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or "")
        if not strip_tags(description_html).strip():
            errors.append("Добавьте описание.")
        required = (
            ("category", "Выберите категорию."),
            ("brand", "Выберите бренд."),
        )
        for key, message in required:
            if not str(payload.get(key) or "").strip():
                errors.append(message)
        if not files.get("image") and not (product and product.image):
            errors.append("Загрузите основное изображение.")
        skus = payload.get("skus") or []
        if not skus:
            errors.append("Создайте хотя бы один SKU.")
        sku_prices = [self.sku_decimal(item.get("price")) for item in skus]
        if skus and any(price is None for price in sku_prices):
            errors.append("Укажите цену для каждого SKU.")
        if any(price is not None and price <= 0 for price in sku_prices):
            errors.append("Цена SKU должна быть больше нуля.")
        for sku, price in zip(skus, sku_prices):
            old_price = self.sku_decimal(sku.get("old_price"))
            if old_price is not None and price is not None and old_price < price:
                errors.append("Старая цена SKU не может быть ниже финальной.")
                break
        root_pricing = payload.get("rootPricing") or {}
        root_price = self.sku_decimal(root_pricing.get("price"))
        root_old_price = self.sku_decimal(root_pricing.get("old_price"))
        if root_pricing.get("price") not in (None, "") and root_price is None:
            errors.append("Некорректная root-цена SKU.")
        if root_price is not None and root_price <= 0:
            errors.append("Root-цена SKU должна быть больше нуля.")
        if root_old_price is not None and root_price is not None and root_old_price < root_price:
            errors.append("Root-старая цена SKU не может быть ниже финальной.")
        try:
            likes_adjustment = int(payload.get("likesAdjustment", 0) or 0)
        except (TypeError, ValueError):
            errors.append("Корректировка лайков должна быть целым числом.")
        else:
            if not -1_000_000 <= likes_adjustment <= 1_000_000:
                errors.append("Корректировка лайков должна быть от -1000000 до 1000000.")

        option_name_max = VariantOption._meta.get_field("name").max_length
        filter_name_max = VariantOption._meta.get_field("filter_name").max_length
        for group in payload.get("groups") or []:
            for value in group.get("values") or []:
                raw_name = str(value.get("name") or "").strip()
                name = strip_tags(raw_name).strip()
                raw_filter_name = str(
                    value.get("filter_name") or value.get("filterName") or name
                ).strip()
                filter_name = strip_tags(raw_filter_name).strip()
                if not name:
                    errors.append("У каждого варианта должно быть отображаемое название.")
                    break
                if name != raw_name or filter_name != raw_filter_name:
                    errors.append("Названия вариантов не должны содержать HTML.")
                    break
                if len(name) > option_name_max or len(filter_name) > filter_name_max:
                    errors.append(
                        f"Название варианта и значение фильтра должны быть не длиннее {option_name_max} символов."
                    )
                    break
            if errors and errors[-1].startswith(("У каждого варианта", "Названия вариантов", "Название варианта")):
                break

        specification_name_max = ProductSpecification._meta.get_field("name").max_length
        specification_value_max = ProductSpecification._meta.get_field("value").max_length
        for item in payload.get("chars") or []:
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if not name and not value:
                continue
            if not name or not value:
                errors.append("У каждой характеристики должны быть название и значение.")
                break
            if len(name) > specification_name_max or len(value) > specification_value_max:
                errors.append(
                    f"Характеристика превышает допустимую длину: название до {specification_name_max}, "
                    f"значение до {specification_value_max} символов."
                )
                break
        return errors

    def create_sku_product(self, payload, files):
        category = Category.objects.get(pk=payload["category"])
        brand = Brand.objects.get(pk=payload["brand"])
        skus = payload.get("skus") or []
        base_price, base_old_price, root_price, root_old_price = self.resolve_sku_catalog_prices(
            skus,
            payload.get("rootPricing") or {},
        )
        total_stock = sum(self.sku_int(item.get("stock", item.get("quantity"))) for item in skus if item.get("available", True))
        has_discount = bool(base_old_price and base_price and base_old_price > base_price)

        product = Product(
            category=category,
            brand=brand,
            name=strip_tags(str(payload.get("name", "") or "")).strip(),
            image=files["image"],
            promo_video=files.get("promo_video"),
            promo_video_poster=files.get("promo_video_poster"),
            description=sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or ""),
            old_price=base_old_price,
            price=base_price,
            sku_root_price=root_price,
            sku_root_old_price=root_old_price,
            discount_percent=None,
            stock=total_stock,
            available=payload.get("status", "published") == "published",
            badge_type="" if has_discount else self.resolve_badge_type(payload.get("badgeCodes") or []),
            likes_adjustment=int(payload.get("likesAdjustment", 0) or 0),
        )
        product.full_clean()
        product.save()

        for index, image in enumerate(files.getlist("extra_images")):
            ProductImage.objects.create(product=product, image=image, order=index, alt_text=product.name)

        for index, item in enumerate(payload.get("chars") or []):
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if name or value:
                ProductSpecification.objects.create(
                    product=product,
                    name=name or "Характеристика",
                    value=value,
                    order=index,
                )

        option_map = self.create_variant_options(payload.get("groups") or [])
        product.variant_image_group = self.resolve_variant_image_group(payload.get("groups") or [], option_map)
        product.save(update_fields=("variant_image_group", "updated"))
        image_order_map = self.variant_image_order_map(payload.get("groups") or [])
        option_stock = self.calculate_option_stock(payload.get("groups") or [], skus)
        for key, option in option_map.items():
            stock = option_stock.get(key, 0)
            ProductVariant.objects.create(
                product=product,
                variant=option,
                image=(
                    files.get(f"variant_image__{key[0]}__{key[1]}")
                    if option.group_id == product.variant_image_group_id
                    else None
                ),
                image_order=image_order_map.get(key, 0),
                stock=stock,
                available=stock > 0,
            )

        group_slots = self.build_group_slots(payload.get("groups") or [])
        for index, sku_data in enumerate(skus):
            option_ids = self.resolve_sku_option_ids(group_slots, option_map, sku_data)
            price = self.sku_decimal(sku_data.get("price"))
            if price is None:
                continue
            stock = self.sku_int(sku_data.get("stock", sku_data.get("quantity")))
            product_sku = ProductSKU.objects.create(
                product=product,
                sku_code=str(sku_data.get("sku_code") or sku_data.get("name") or "").strip(),
                price=price,
                old_price=self.sku_decimal(sku_data.get("old_price")),
                stock=stock,
                available=bool(sku_data.get("available", True) and stock > 0),
                sort_order=self.sku_int(sku_data.get("sort_order", index)),
            )
            product_sku.options.set(option_ids)

        product.sync_from_skus()
        return product

    def update_sku_product(self, product, payload, files):
        category = Category.objects.get(pk=payload["category"])
        brand = Brand.objects.get(pk=payload["brand"])
        skus = payload.get("skus") or []
        base_price, base_old_price, root_price, root_old_price = self.resolve_sku_catalog_prices(
            skus,
            payload.get("rootPricing") or {},
        )
        total_stock = sum(self.sku_int(item.get("stock", item.get("quantity"))) for item in skus if item.get("available", True))
        has_discount = bool(base_old_price and base_price and base_old_price > base_price)

        old_variant_images = {
            product_variant.variant_id: product_variant.image.name
            for product_variant in product.product_variants.select_related("variant")
            if product_variant.image
        }

        product.category = category
        product.brand = brand
        product.name = strip_tags(str(payload.get("name", "") or "")).strip()
        if files.get("image"):
            product.image = files["image"]
        if files.get("promo_video"):
            product.promo_video = files["promo_video"]
        if files.get("promo_video_poster"):
            product.promo_video_poster = files["promo_video_poster"]
        product.description = sanitize_product_description(payload.get("descriptionHtml") or payload.get("descriptionText") or "")
        product.old_price = base_old_price
        product.price = base_price
        product.sku_root_price = root_price
        product.sku_root_old_price = root_old_price
        product.discount_percent = None
        product.stock = total_stock
        product.available = payload.get("status", "published") == "published"
        product.badge_type = "" if has_discount else self.resolve_badge_type(payload.get("badgeCodes") or [])
        product.likes_adjustment = int(payload.get("likesAdjustment", 0) or 0)
        product.full_clean()
        product.save()

        uploaded_extra = files.getlist("extra_images")
        if uploaded_extra:
            ProductImage.objects.filter(product=product).delete()
            for index, image in enumerate(uploaded_extra):
                ProductImage.objects.create(product=product, image=image, order=index, alt_text=product.name)

        ProductSpecification.objects.filter(product=product).delete()
        for index, item in enumerate(payload.get("chars") or []):
            name = strip_tags(str(item.get("key") or "")).strip()
            value = strip_tags(str(item.get("value") or "")).strip()
            if name or value:
                ProductSpecification.objects.create(
                    product=product,
                    name=name or "Характеристика",
                    value=value,
                    order=index,
                )

        ProductSKU.objects.filter(product=product).delete()
        ProductVariant.objects.filter(product=product).delete()

        option_map = self.create_variant_options(payload.get("groups") or [])
        product.variant_image_group = self.resolve_variant_image_group(payload.get("groups") or [], option_map)
        product.save(update_fields=("variant_image_group", "updated"))
        image_order_map = self.variant_image_order_map(payload.get("groups") or [])
        option_stock = self.calculate_option_stock(payload.get("groups") or [], skus)
        for key, option in option_map.items():
            product_variant = ProductVariant(
                product=product,
                variant=option,
                image_order=image_order_map.get(key, 0),
                stock=option_stock.get(key, 0),
                available=option_stock.get(key, 0) > 0,
            )
            uploaded_image = files.get(f"variant_image__{key[0]}__{key[1]}")
            if uploaded_image and option.group_id == product.variant_image_group_id:
                product_variant.image = uploaded_image
            elif old_variant_images.get(option.pk) and option.group_id == product.variant_image_group_id:
                product_variant.image = old_variant_images[option.pk]
            product_variant.save()

        group_slots = self.build_group_slots(payload.get("groups") or [])
        for index, sku_data in enumerate(skus):
            option_ids = self.resolve_sku_option_ids(group_slots, option_map, sku_data)
            price = self.sku_decimal(sku_data.get("price"))
            if price is None:
                continue
            stock = self.sku_int(sku_data.get("stock", sku_data.get("quantity")))
            product_sku = ProductSKU.objects.create(
                product=product,
                sku_code=str(sku_data.get("sku_code") or sku_data.get("name") or "").strip(),
                price=price,
                old_price=self.sku_decimal(sku_data.get("old_price")),
                stock=stock,
                available=bool(sku_data.get("available", True) and stock > 0),
                sort_order=self.sku_int(sku_data.get("sort_order", index)),
            )
            product_sku.options.set(option_ids)

        product.sync_from_skus()
        return product

    def create_variant_options(self, groups):
        option_map = {}
        for group_index, group in enumerate(groups):
            group_name = str(group.get("name") or "").strip() or "Вариант"
            for value_index, value in enumerate(group.get("values") or []):
                value_name = str(value.get("name") or "").strip()
                if not value_name:
                    continue
                filter_name = str(
                    value.get("filter_name") or value.get("filterName") or value_name
                ).strip() or value_name
                variant_group, _ = VariantGroup.objects.get_or_create(
                    name=group_name,
                    defaults={"order": group_index},
                )
                option, created = VariantOption.objects.get_or_create(
                    group=variant_group,
                    name=value_name,
                    defaults={"order": value_index, "filter_name": filter_name},
                )
                if not created and option.filter_name != filter_name:
                    option.filter_name = filter_name
                    option.save(update_fields=("filter_name",))
                option_map[(str(group.get("id")), str(value.get("id")))] = option
        return option_map

    def resolve_variant_image_group(self, groups, option_map):
        image_group = next((group for group in groups if group.get("hasImages")), None)
        if not image_group:
            return None
        group_id = str(image_group.get("id"))
        for value in image_group.get("values") or []:
            option = option_map.get((group_id, str(value.get("id"))))
            if option:
                return option.group
        return None

    def variant_image_order_map(self, groups):
        result = {}
        for group in groups:
            group_id = str(group.get("id"))
            for index, value in enumerate(group.get("values") or []):
                try:
                    image_order = max(0, int(value.get("image_order", index)))
                except (TypeError, ValueError):
                    image_order = index
                result[(group_id, str(value.get("id")))] = image_order
        return result

    def calculate_option_stock(self, groups, skus):
        group_slots = self.build_group_slots(groups)
        stock = {}
        for sku in skus:
            if not sku.get("available", True):
                continue
            quantity = self.sku_int(sku.get("stock", sku.get("quantity")))
            for index, value_name in enumerate(sku.get("path") or []):
                if index >= len(group_slots):
                    continue
                group_id = group_slots[index]["group_id"]
                value_id = group_slots[index]["values"].get(str(value_name).strip())
                if value_id:
                    stock[(group_id, value_id)] = stock.get((group_id, value_id), 0) + quantity
        return stock

    def build_group_slots(self, groups):
        return [
            {
                "group_id": str(group.get("id")),
                "values": {str(value.get("name") or "").strip(): str(value.get("id")) for value in group.get("values") or []},
            }
            for group in groups
        ]

    def resolve_sku_option_ids(self, group_slots, option_map, sku_data):
        option_ids = []
        for index, value_name in enumerate(sku_data.get("path") or []):
            if index >= len(group_slots):
                continue
            group_id = group_slots[index]["group_id"]
            value_id = group_slots[index]["values"].get(str(value_name).strip())
            option = option_map.get((group_id, value_id))
            if option:
                option_ids.append(option.id)
        return option_ids

    def resolve_badge_type(self, badge_codes):
        for code in badge_codes:
            if code in {Product.BADGE_NEW, Product.BADGE_HIT, Product.BADGE_TOP}:
                return code
        return ""

    def sku_decimal(self, value):
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return None

    def sku_int(self, value):
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    def resolve_sku_catalog_prices(self, skus, root_pricing):
        root_price = self.sku_decimal((root_pricing or {}).get("price"))
        root_old_price = self.sku_decimal((root_pricing or {}).get("old_price"))
        if root_price:
            return (
                root_price,
                root_old_price if root_old_price and root_old_price > root_price else root_price,
                root_price,
                root_old_price if root_old_price and root_old_price > root_price else None,
            )

        priced_skus = [
            {
                "price": self.sku_decimal(item.get("price")),
                "old_price": self.sku_decimal(item.get("old_price")),
            }
            for item in skus
        ]
        priced_skus = [item for item in priced_skus if item["price"] is not None]
        if not priced_skus:
            raise ValidationError("Укажите цену хотя бы для одного SKU.")
        best = min(priced_skus, key=lambda item: item["price"])
        old_price = best["old_price"] if best["old_price"] and best["old_price"] > best["price"] else best["price"]
        return best["price"], old_price, None, None
