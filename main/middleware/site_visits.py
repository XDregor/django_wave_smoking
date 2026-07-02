from django.db import DatabaseError
from django.utils import timezone
from django.utils.crypto import salted_hmac

from ..models import SiteVisit


class SiteVisitMiddleware:
    EXCLUDED_PREFIXES = ("/admin", "/api", "/static", "/media")
    EXCLUDED_PATHS = ("/favicon.ico", "/robots.txt")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if self.should_track(request, response):
            self.record_visit(request)
        return response

    def should_track(self, request, response):
        if request.method != "GET" or response.status_code >= 400:
            return False
        if request.path in self.EXCLUDED_PATHS:
            return False
        if request.path.startswith(self.EXCLUDED_PREFIXES):
            return False
        return response.get("Content-Type", "").lower().startswith("text/html")

    def record_visit(self, request):
        visited_on = timezone.localdate()
        session_marker = f"wave_site_visit:{visited_on.isoformat()}"
        if request.session.get(session_marker):
            return

        if request.user.is_authenticated:
            identity = f"user:{request.user.pk}"
        else:
            if not request.session.session_key:
                request.session.create()
            identity = f"session:{request.session.session_key}"

        visitor_key = salted_hmac("main.site-visit", identity).hexdigest()
        try:
            SiteVisit.objects.get_or_create(
                visited_on=visited_on,
                visitor_key=visitor_key,
            )
        except DatabaseError:
            return
        request.session[session_marker] = True
