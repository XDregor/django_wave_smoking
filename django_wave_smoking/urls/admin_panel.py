from django.contrib import admin
from django.urls import path

from main.admin_panel.dashboard import dashboard_visits_view


urlpatterns = [
    path(
        "admin/dashboard/visits/",
        admin.site.admin_view(dashboard_visits_view),
        name="admin_dashboard_visits",
    ),
    path("admin/", admin.site.urls),
]
