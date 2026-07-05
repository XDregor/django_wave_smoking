from .shared import *

@admin.register(LogEntry)
class ActionHistoryAdmin(ModelAdmin):
    list_display = ("action_time", "user", "content_type", "object_repr", "action_flag")
    list_filter = ("action_flag", "content_type", "action_time")
    search_fields = ("object_repr", "change_message", "user__username")
    readonly_fields = (
        "action_time",
        "user",
        "content_type",
        "object_id",
        "object_repr",
        "action_flag",
        "change_message",
    )
    date_hierarchy = "action_time"
    ordering = ("-action_time",)
    retention_days = 30

    def get_urls(self):
        custom_urls = [
            path(
                "cleanup/",
                self.admin_site.admin_view(self.action_history_cleanup_view),
                name="admin_logentry_cleanup",
            ),
        ]
        return custom_urls + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        self.cleanup_expired_entries()
        entries = (
            LogEntry.objects.select_related("user", "content_type")
            .order_by("-action_time")[:1000]
        )
        now = timezone.now()
        cutoff = now - timedelta(days=self.retention_days)
        old_count = LogEntry.objects.filter(action_time__lt=cutoff).count()
        action_counts = LogEntry.objects.values("action_flag").annotate(total=Count("id"))
        action_stats = {str(item["action_flag"]): item["total"] for item in action_counts}
        context = {
            **self.admin_site.each_context(request),
            "title": "История действий",
            "history_payload": [self.serialize_action_entry(entry, now) for entry in entries],
            "cleanup_url": reverse("admin:admin_logentry_cleanup"),
            "retention_days": self.retention_days,
            "old_count": old_count,
            "action_stats": action_stats,
        }
        return TemplateResponse(request, "admin_panel/action_history/action_history_page.html", context)

    def cleanup_expired_entries(self):
        cutoff = timezone.now() - timedelta(days=self.retention_days)
        return LogEntry.objects.filter(action_time__lt=cutoff).delete()[0]

    def action_history_cleanup_view(self, request):
        if request.method != "POST":
            return JsonResponse({"success": False, "message": "Method not allowed"}, status=405)
        deleted = self.cleanup_expired_entries()
        return JsonResponse({"success": True, "deleted": deleted})

    def serialize_action_entry(self, entry, now=None):
        action_time = entry.action_time
        now = now or timezone.now()
        delta = now - action_time
        if delta.days > 0:
            relative = f"{delta.days} дн. назад"
        else:
            hours = delta.seconds // 3600
            minutes = (delta.seconds % 3600) // 60
            relative = f"{hours} ч. назад" if hours else f"{max(minutes, 1)} мин. назад"

        user = entry.user
        user_name = "Система"
        user_label = ""
        if user:
            full_name = user.get_full_name()
            user_name = full_name or user.get_username()
            user_label = user.email or user.get_username()

        action_key = self.get_action_key(entry.action_flag)
        return {
            "id": str(entry.pk),
            "time": action_time.strftime("%d.%m.%Y %H:%M"),
            "date": action_time.strftime("%d.%m.%Y"),
            "relative": relative,
            "timestamp": int(action_time.timestamp()),
            "user": user_name,
            "user_label": user_label,
            "model": entry.content_type.name if entry.content_type_id else "Система",
            "app": entry.content_type.app_label if entry.content_type_id else "",
            "object": entry.object_repr or "Объект удалён",
            "object_id": entry.object_id or "",
            "action": action_key,
            "action_label": self.get_action_label(entry.action_flag),
            "message": self.normalize_change_message(entry),
        }

    def get_action_key(self, action_flag):
        if action_flag == ADDITION:
            return "create"
        if action_flag == CHANGE:
            return "change"
        if action_flag == DELETION:
            return "delete"
        return "other"

    def get_action_label(self, action_flag):
        if action_flag == ADDITION:
            return "Создание"
        if action_flag == CHANGE:
            return "Изменение"
        if action_flag == DELETION:
            return "Удаление"
        return "Действие"

    def normalize_change_message(self, entry):
        message = entry.get_change_message() or entry.change_message or ""
        return strip_tags(str(message)).strip() or "Детали действия не указаны."

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
