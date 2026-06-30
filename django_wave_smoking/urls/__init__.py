from django.conf import settings
from django.conf.urls.static import static

from .admin_panel import urlpatterns as admin_urlpatterns
from .site import urlpatterns as site_urlpatterns


urlpatterns = [*site_urlpatterns, *admin_urlpatterns]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
