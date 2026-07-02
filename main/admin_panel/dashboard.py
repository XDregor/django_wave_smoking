from datetime import timedelta

from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone

from ..models import SiteVisit


CHART_DAYS = 14


def dashboard_visits_view(request):
    today = timezone.localdate()
    chart_start = today - timedelta(days=CHART_DAYS - 1)
    comparison_start = today - timedelta(days=13)

    visits = {
        item["visited_on"]: item["total"]
        for item in SiteVisit.objects.filter(visited_on__gte=comparison_start)
        .values("visited_on")
        .annotate(total=Count("id"))
    }
    points = []
    for offset in range(CHART_DAYS):
        day = chart_start + timedelta(days=offset)
        points.append(
            {
                "date": day.isoformat(),
                "label": day.strftime("%d.%m"),
                "value": visits.get(day, 0),
            }
        )

    current_week = sum(point["value"] for point in points[-7:])
    previous_week = sum(point["value"] for point in points[:7])
    if previous_week:
        trend = round(((current_week - previous_week) / previous_week) * 100)
    else:
        trend = None

    return JsonResponse(
        {
            "points": points,
            "today": visits.get(today, 0),
            "week": current_week,
            "peak": max((point["value"] for point in points), default=0),
            "trend": trend,
            "updated_at": timezone.localtime().strftime("%H:%M"),
        }
    )
