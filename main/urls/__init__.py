from .api import urlpatterns as api_urlpatterns
from .site import urlpatterns as site_urlpatterns

app_name = "main"

urlpatterns = [*api_urlpatterns, *site_urlpatterns]
