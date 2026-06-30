from .shared import *

@admin.register(ProductImage)
class ProductImageAdmin(HiddenFromMenuAdminMixin, ModelAdmin):
    list_display = ("preview", "product", "order", "alt_text", "file_link", "created")
    search_fields = ("product__name", "alt_text")
    fields = ("preview", "image", "order", "alt_text", "file_link", "created")
    readonly_fields = ("preview", "file_link", "created")

    def has_add_permission(self, request):
        return False

    @admin.display(description="Превью")
    def preview(self, obj):
        if not obj.pk or not obj.image:
            return "-"
        return format_html('<img src="{}" style="height:64px;border-radius:8px;object-fit:cover;" alt="">', obj.image.url)

    @admin.display(description="Ссылка")
    def file_link(self, obj):
        if not obj.pk or not obj.image:
            return "-"
        return format_html('<a href="{}" target="_blank" rel="noopener">Открыть</a>', obj.image.url)
