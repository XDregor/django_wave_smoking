from .shared import *

@ensure_csrf_cookie
def reviews(request):
    reviews_qs = (
        ProductReview.objects
        .filter(is_approved=True)
        .select_related("product", "product__brand", "user")
        .order_by("-created")
    )
    reviews_list = list(reviews_qs)
    total_count = len(reviews_list)
    average_rating = reviews_qs.aggregate(value=Avg("rating"))["value"] or 0
    rating_counts_raw = dict(reviews_qs.values_list("rating").annotate(count=Count("id")))
    rating_counts = {rating: rating_counts_raw.get(rating, 0) for rating in range(1, 6)}
    verified_count = sum(1 for review in reviews_list if review.is_verified)
    rating_summary = {
        "total": total_count,
        "average": round(float(average_rating), 1) if total_count else 0.0,
        "counts": rating_counts,
        "count_1": rating_counts[1],
        "count_2": rating_counts[2],
        "count_3": rating_counts[3],
        "count_4": rating_counts[4],
        "count_5": rating_counts[5],
        "verified": verified_count,
    }
    liked_review_ids = get_liked_review_ids(request)
    products_for_review = list(
        Product.objects.filter(available=True)
        .select_related("brand", "category")
        .annotate(
            review_count=Count("reviews", filter=Q(reviews__is_approved=True)),
            average_rating=Avg("reviews__rating", filter=Q(reviews__is_approved=True)),
        )
        .order_by("name")
    )
    products_json = [
        {
            "id": product.id,
            "name": product.name,
            "brand": product.brand.name if product.brand else "",
            "code": f"{product.id:04d}",
            "review_count": product.review_count,
            "average_rating": round(float(product.average_rating), 1) if product.average_rating else 0,
            "likes": product.display_likes,
        }
        for product in products_for_review
    ]
    return render(request, "site/reviews/index.html", {
        "reviews": reviews_list,
        "reviews_json": [serialize_review(review, liked_review_ids) for review in reviews_list],
        "products_for_review": products_for_review,
        "products_json": products_json,
        "rating_summary": rating_summary,
    })


@require_POST
def api_review_create(request):
    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    product_id = payload.get("product_id")
    author_name = (payload.get("author_name") or "").strip() or "Аноним"
    text = (payload.get("text") or "").strip()
    try:
        rating = int(payload.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0

    if rating < 1 or rating > 5:
        return JsonResponse({"error": "Rating must be from 1 to 5"}, status=400)
    if not text:
        return JsonResponse({"error": "Review text is required"}, status=400)
    product = get_object_or_404(Product, id=product_id, available=True)
    review = ProductReview.objects.create(
        product=product,
        user=request.user if request.user.is_authenticated else None,
        author_name=request.user.get_username() if request.user.is_authenticated and not author_name else author_name,
        rating=rating,
        text=text,
        is_verified=request.user.is_authenticated,
        is_approved=True,
    )
    return JsonResponse({"ok": True, "review": serialize_review(review, get_liked_review_ids(request))})


@require_POST
def api_review_vote(request, id):
    payload = parse_json_body(request)
    if payload is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    if payload.get("vote") not in (None, "up"):
        return JsonResponse({"error": "Invalid vote"}, status=400)

    review = get_object_or_404(ProductReview, id=id, is_approved=True)

    if request.user.is_authenticated:
        vote = ProductReviewHelpful.objects.filter(review=review, user=request.user).first()
        vote_defaults = {"review": review, "user": request.user, "session_key": ""}
    else:
        if not request.session.session_key:
            request.session.create()
        vote = ProductReviewHelpful.objects.filter(
            review=review,
            user__isnull=True,
            session_key=request.session.session_key,
        ).first()
        vote_defaults = {"review": review, "user": None, "session_key": request.session.session_key}

    if vote:
        vote.delete()
        ProductReview.objects.filter(id=review.id, helpful_count__gt=0).update(helpful_count=F("helpful_count") - 1)
        liked = False
    else:
        ProductReviewHelpful.objects.create(**vote_defaults)
        ProductReview.objects.filter(id=review.id).update(helpful_count=F("helpful_count") + 1)
        liked = True

    review.refresh_from_db(fields=("helpful_count",))
    return JsonResponse({
        "ok": True,
        "helpful": review.display_helpful_count,
        "liked": liked,
    })
