from django.conf import settings
from django.core.cache import cache

from main.views.errors import public_not_found, public_too_many_not_found


class PublicNotFoundRateLimitMiddleware:
    EXCLUDED_PREFIXES = ("/admin", "/api", "/static", "/media")
    EXCLUDED_PATHS = ("/favicon.ico", "/robots.txt")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self.should_check(request) and self.is_limited(request):
            response = public_too_many_not_found(request)
            response["Retry-After"] = str(self.limit_window)
            return response

        response = self.get_response(request)

        if self.should_count(request, response):
            self.increment(request)
            if self.should_replace_technical_404(response):
                return public_not_found(request)

        return response

    def should_check(self, request):
        if request.method not in {"GET", "HEAD"}:
            return False
        if request.path in self.EXCLUDED_PATHS:
            return False
        if request.path.startswith(self.EXCLUDED_PREFIXES):
            return False
        return self.limit_max > 0 and self.limit_window > 0

    def should_count(self, request, response):
        if not self.should_check(request):
            return False
        if response.status_code != 404:
            return False
        return response.get("Content-Type", "").lower().startswith("text/html")

    def should_replace_technical_404(self, response):
        content = getattr(response, "content", b"")
        return b"data-site-content" not in content

    def is_limited(self, request):
        return int(cache.get(self.cache_key(request), 0) or 0) >= self.limit_max

    def increment(self, request):
        key = self.cache_key(request)
        if cache.add(key, 1, self.limit_window):
            return
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, self.limit_window)

    def cache_key(self, request):
        return f"public404:{self.get_client_ip(request)}"

    def get_client_ip(self, request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip()
        return request.META.get("REMOTE_ADDR", "") or "unknown"

    @property
    def limit_max(self):
        return int(getattr(settings, "PUBLIC_404_RATE_LIMIT_MAX", 35))

    @property
    def limit_window(self):
        return int(getattr(settings, "PUBLIC_404_RATE_LIMIT_WINDOW", 300))
