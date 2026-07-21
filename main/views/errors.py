from django.shortcuts import render


def _public_error_context(
    *,
    code,
    title,
    description,
    tone="accent",
    robots="noindex, follow",
    primary_text="На главную",
    primary_url_name="main:home",
):
    return {
        "error_code": code,
        "error_title": title,
        "error_description": description,
        "error_tone": tone,
        "error_robots": robots,
        "error_primary_text": primary_text,
        "error_primary_url_name": primary_url_name,
        "disable_header_cursor": False,
    }


def public_not_found(request, exception=None, unmatched_path=None):
    return render(
        request,
        "site/errors/error_page.html",
        _public_error_context(
            code="404",
            title="Здесь пока пусто",
            description=(
                "Похоже, эта страница испарилась как облако пара. "
                "Возможно, ссылка устарела или адрес введен неправильно. "
                "Проверьте адрес или вернитесь на главную."
            ),
            primary_text="На главную",
            primary_url_name="main:home",
        ),
        status=404,
    )


def public_server_error(request):
    return render(
        request,
        "site/errors/error_page.html",
        _public_error_context(
            code="500",
            title="Что-то пошло не так",
            description=(
                "Сервер споткнулся при обработке запроса. "
                "Попробуйте обновить страницу через пару минут или вернитесь на главную."
            ),
            tone="danger",
            robots="noindex, nofollow",
            primary_text="На главную",
        ),
        status=500,
    )


def public_too_many_not_found(request):
    return render(
        request,
        "site/errors/error_page.html",
        _public_error_context(
            code="429",
            title="Слишком много неверных адресов",
            description=(
                "Мы временно ограничили переходы по несуществующим страницам. "
                "Вернитесь на главную или попробуйте снова немного позже."
            ),
            robots="noindex, nofollow",
            primary_text="На главную",
        ),
        status=429,
    )
