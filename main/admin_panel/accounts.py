from .shared import *

try:
    admin.site.unregister(Group)
except admin.sites.NotRegistered:
    pass

try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class WaveUserAdmin(BusinessAdminMixin, BaseUserAdmin):
    list_display = ("username", "email", "is_active", "is_staff", "date_joined")
    list_filter = ("is_active", "is_staff", "is_superuser", "date_joined")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-date_joined",)

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        if request.user.is_superuser:
            return fieldsets
        return (
            (None, {"fields": ("username", "password")}),
            ("Клиент", {"fields": ("first_name", "last_name", "email", "is_active")}),
            ("Даты", {"fields": ("last_login", "date_joined")}),
        )

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if not request.user.is_superuser:
            readonly.extend(("last_login", "date_joined"))
        return tuple(readonly)
