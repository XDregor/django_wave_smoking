from .shared import *

@admin.register(ProductReview)
class ProductReviewAdmin(BusinessAdminMixin, ModelAdmin):
    list_display = (
        "author_name",
        "product",
        "rating_badge",
        "approval_badge",
        "is_verified",
        "helpful_count",
        "created",
    )
    list_filter = ("rating", "is_verified", "is_approved", "created", "product__brand")
    list_select_related = ("product", "product__brand", "user")
    search_fields = ("author_name", "product__name", "text", "user__username")
    list_editable = ("is_verified",)
    autocomplete_fields = ("product", "user")
    readonly_fields = ("created", "updated", "helpful_count")
    fields = (
        "product",
        "user",
        "author_name",
        "rating",
        "text",
        "is_verified",
        "is_approved",
        "helpful_count",
        "created",
        "updated",
    )
    actions = ("approve_reviews", "hide_reviews", "mark_verified")

    def get_urls(self):
        custom_urls = [
            path(
                "toggle-verified/",
                self.admin_site.admin_view(self.reviews_toggle_verified_view),
                name="main_productreview_toggle_verified",
            ),
            path(
                "toggle-visibility/",
                self.admin_site.admin_view(self.reviews_toggle_visibility_view),
                name="main_productreview_toggle_visibility",
            ),
            path(
                "delete-review/",
                self.admin_site.admin_view(self.reviews_delete_view),
                name="main_productreview_delete",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return self.reviews_list_view(request)

    def reviews_list_view(self, request):
        reviews = ProductReview.objects.select_related("product", "product__brand", "user").order_by("-created", "-id")
        context = {
            **self.admin_site.each_context(request),
            "title": "Отзывы",
            "reviews_payload": [self.serialize_admin_review(review) for review in reviews],
            "toggle_verified_url": reverse("admin:main_productreview_toggle_verified"),
            "toggle_visibility_url": reverse("admin:main_productreview_toggle_visibility"),
            "delete_url": reverse("admin:main_productreview_delete"),
        }
        return TemplateResponse(request, "admin_panel/reviews/list.html", context)

    def get_review_action_id(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None
        try:
            return int(payload.get("id"))
        except (TypeError, ValueError):
            return None

    def get_review_for_action(self, request):
        if request.method != "POST":
            return None, JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        review_id = self.get_review_action_id(request)
        if not review_id:
            return None, JsonResponse({"success": False, "message": "Отзыв не выбран."}, status=400)
        review = ProductReview.objects.select_related("product", "product__brand", "user").filter(pk=review_id).first()
        if not review:
            return None, JsonResponse({"success": False, "message": "Отзыв не найден."}, status=404)
        return review, None

    def reviews_toggle_verified_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review.is_verified = not review.is_verified
        review.save(update_fields=("is_verified", "updated"))
        self.log_change(request, review, "Статус проверки отзыва изменён.")
        return JsonResponse({"success": True, "review": self.serialize_admin_review(review)})

    def reviews_toggle_visibility_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review.is_approved = not review.is_approved
        review.save(update_fields=("is_approved", "updated"))
        self.log_change(request, review, "Видимость отзыва изменена.")
        return JsonResponse({"success": True, "review": self.serialize_admin_review(review)})

    def reviews_delete_view(self, request):
        review, error_response = self.get_review_for_action(request)
        if error_response:
            return error_response
        review_id = review.pk
        self.log_deletion(request, review, f"Отзыв удалён: {review}")
        review.delete()
        return JsonResponse({"success": True, "deleted_id": str(review_id)})

    def serialize_admin_review(self, review):
        author_name = review.author_name or (review.user.get_username() if review.user_id else "Аноним")
        initials = "".join(part[:1] for part in author_name.split()[:2]).upper() or "??"
        return {
            "id": str(review.pk),
            "author_name": author_name,
            "user_name": review.user.get_username() if review.user_id else "",
            "initials": initials[:2],
            "product_id": str(review.product_id) if review.product_id else "",
            "product_name": review.product.name if review.product_id else "",
            "rating": review.rating,
            "text": review.text,
            "is_verified": bool(review.is_verified),
            "is_published": bool(review.is_approved),
            "helpful_count": review.helpful_count,
            "created_label": review.created.strftime("%d.%m.%Y") if review.created else "",
            "created_ts": int(review.created.timestamp()) if review.created else 0,
        }

    @admin.display(description="Оценка", ordering="rating")
    def rating_badge(self, obj):
        return format_html('<span class="wave-admin-value">{} / 5</span>', obj.rating)

    @admin.display(description="Публикация", ordering="is_approved")
    def approval_badge(self, obj):
        if obj.is_approved:
            return format_html('<span class="wave-admin-pill wave-admin-pill-ok">Опубликован</span>')
        return format_html('<span class="wave-admin-pill">Скрыт</span>')

    @admin.action(description="Одобрить выбранные отзывы")
    def approve_reviews(self, request, queryset):
        updated = queryset.update(is_approved=True)
        self.message_user(request, f"Одобрено отзывов: {updated}")

    @admin.action(description="Скрыть выбранные отзывы")
    def hide_reviews(self, request, queryset):
        updated = queryset.update(is_approved=False)
        self.message_user(request, f"Скрыто отзывов: {updated}")

    @admin.action(description="Пометить как проверенные")
    def mark_verified(self, request, queryset):
        updated = queryset.update(is_verified=True)
        self.message_user(request, f"Помечено проверенными: {updated}")

@admin.register(ProductReviewHelpful)
class ProductReviewHelpfulAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("review", "user", "session_key", "created")
    search_fields = ("review__author_name", "review__product__name", "user__username", "session_key")
    autocomplete_fields = ("review", "user")
    readonly_fields = ("created",)
