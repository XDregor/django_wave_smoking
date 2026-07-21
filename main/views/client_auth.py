import json
import re
from datetime import date, datetime

from django.contrib.auth import get_user_model, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from ..models import ClientProfile


FIREBASE_APP = None
NICKNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{2,31}$")


def get_firebase_auth():
    global FIREBASE_APP

    try:
        import firebase_admin
        from firebase_admin import auth, credentials
    except ImportError as exc:
        raise RuntimeError("Firebase Admin SDK is not installed.") from exc

    if not FIREBASE_APP:
        FIREBASE_APP = firebase_admin.initialize_app()
    return auth


def normalize_nickname(value):
    nickname = str(value or "").strip().replace("@", "")
    return nickname


def suggested_nickname_from_token(decoded_token):
    email = str(decoded_token.get("email") or "").strip()
    if email and "@" in email:
        base = email.split("@", 1)[0]
    else:
        base = str(decoded_token.get("name") or decoded_token.get("uid") or "wave").strip()
    base = re.sub(r"[^A-Za-z0-9_]+", "_", base).strip("_")
    if not base or not base[0].isalpha():
        base = f"wave_{base}" if base else "wave_user"
    return base[:32]


def parse_birth_date(value):
    raw_value = str(value or "").strip()
    for date_format in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw_value, date_format).date()
        except ValueError:
            continue
    return None


def is_adult(birth_date):
    today = date.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age >= 18


def serialize_client_profile(profile):
    return {
        "nickname": profile.nickname,
        "displayName": profile.display_name,
        "birthDate": profile.birth_date.isoformat(),
        "avatarUrl": profile.avatar_url,
        "provider": profile.provider,
        "ordersCount": 0,
        "reviewsCount": profile.user.product_reviews.count() if hasattr(profile.user, "product_reviews") else 0,
    }


@ensure_csrf_cookie
@require_POST
def api_client_firebase_auth(request):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "Некорректные данные входа."}, status=400)

    id_token = str(payload.get("idToken") or "").strip()
    if not id_token:
        return JsonResponse({"success": False, "message": "Firebase token не передан."}, status=400)

    try:
        decoded_token = get_firebase_auth().verify_id_token(id_token)
    except RuntimeError as exc:
        return JsonResponse({"success": False, "message": str(exc)}, status=503)
    except Exception:
        return JsonResponse({"success": False, "message": "Не удалось проверить Firebase token."}, status=401)

    firebase_uid = str(decoded_token.get("uid") or "").strip()
    if not firebase_uid:
        return JsonResponse({"success": False, "message": "Firebase не вернул UID пользователя."}, status=401)

    provider = ""
    firebase_data = decoded_token.get("firebase") or {}
    identities = firebase_data.get("identities") or {}
    sign_in_provider = str(firebase_data.get("sign_in_provider") or "")
    if sign_in_provider:
        provider = sign_in_provider
    elif "google.com" in identities:
        provider = ClientProfile.PROVIDER_GOOGLE
    elif "apple.com" in identities:
        provider = ClientProfile.PROVIDER_APPLE

    existing_profile = ClientProfile.objects.select_related("user").filter(firebase_uid=firebase_uid).first()
    if existing_profile:
        login(request, existing_profile.user)
        return JsonResponse({
            "success": True,
            "needsOnboarding": False,
            "profile": serialize_client_profile(existing_profile),
        })

    nickname = normalize_nickname(payload.get("nickname"))
    birth_date = parse_birth_date(payload.get("birthDate"))
    display_name = str(payload.get("displayName") or decoded_token.get("name") or "").strip()[:120]
    avatar_url = str(payload.get("avatarUrl") or decoded_token.get("picture") or "").strip()

    if not nickname or not birth_date:
        return JsonResponse({
            "success": True,
            "needsOnboarding": True,
            "suggestedNickname": suggested_nickname_from_token(decoded_token),
            "displayName": display_name,
            "avatarUrl": avatar_url,
        })

    if not NICKNAME_RE.match(nickname):
        return JsonResponse({
            "success": False,
            "message": "Ник должен быть на английском: 3-32 символа, буквы, цифры и _.",
        }, status=400)

    if not is_adult(birth_date):
        return JsonResponse({"success": False, "message": "Карта клиента доступна только пользователям 18+."}, status=400)

    if ClientProfile.objects.filter(nickname__iexact=nickname).exists():
        return JsonResponse({"success": False, "message": "Этот ник уже занят."}, status=409)

    UserModel = get_user_model()
    email = str(decoded_token.get("email") or "").strip()
    username = f"firebase_{firebase_uid[:24]}"
    user = UserModel.objects.create_user(
        username=username,
        email=email,
        first_name=display_name,
        password=None,
    )
    user.set_unusable_password()
    user.save(update_fields=("password",))

    profile = ClientProfile.objects.create(
        user=user,
        firebase_uid=firebase_uid,
        provider=provider,
        nickname=nickname,
        birth_date=birth_date,
        display_name=display_name,
        avatar_url=avatar_url[:200],
    )
    login(request, user)

    return JsonResponse({
        "success": True,
        "needsOnboarding": False,
        "profile": serialize_client_profile(profile),
    })


@require_POST
def api_client_logout(request):
    logout(request)
    return JsonResponse({"success": True})
