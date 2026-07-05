"""Django admin autodiscovery entry point."""

from django.contrib import admin

from .admin_panel import accounts  # noqa: F401
from .admin_panel import action_history  # noqa: F401
from .admin_panel import brands  # noqa: F401
from .admin_panel import cart  # noqa: F401
from .admin_panel import categories  # noqa: F401
from .admin_panel import media  # noqa: F401
from .admin_panel import products  # noqa: F401
from .admin_panel import reviews  # noqa: F401
from .admin_panel import variant_groups  # noqa: F401


admin.site.index_template = "admin/admin_dashboard_page.html"
admin.site.login_template = "admin/admin_login_page.html"
