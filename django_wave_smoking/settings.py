from pathlib import Path
from django.templatetags.static import static
from django.urls import reverse_lazy

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def admin_link(name, query=""):
    return lambda request: f"{reverse_lazy(name)}{query}"


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-zt_vvemq-74_dts%s+%mgq!6)6epe=b-4-8gmx$joon5kjj99m'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = []


# Application definition

INSTALLED_APPS = [
    'unfold',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Local apps
    'main',
]

UNFOLD = {
    "SITE_TITLE": "WAVE Admin",
    "SITE_HEADER": "WAVE",
    "SITE_SUBHEADER": "Shop management",
    "SITE_ICON": lambda request: static("assets/img/mini_logo.png"),
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": True,
    "STYLES": [
        lambda request: static("admin/css/unfold_overrides.css"),
    ],
    "SCRIPTS": [
        lambda request: static("admin/js/unfold_overrides.js"),
    ],
    "COLORS": {
        "primary": {
            "50": "255 247 237",
            "100": "255 237 213",
            "200": "254 215 170",
            "300": "253 186 116",
            "400": "251 146 60",
            "500": "255 138 42",
            "600": "234 88 12",
            "700": "194 65 12",
            "800": "154 52 18",
            "900": "124 45 18",
            "950": "67 20 7",
        },
    },
    "SIDEBAR": {
        "show_search": False,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "АККАУНТЫ",
                "separator": False,
                "items": [
                    {
                        "title": "Администраторы",
                        "icon": "admin_panel_settings",
                        "link": admin_link("admin:auth_user_changelist", "?is_staff__exact=1"),
                    },
                    {
                        "title": "Клиенты",
                        "icon": "group",
                        "link": admin_link("admin:auth_user_changelist", "?is_staff__exact=0"),
                    },
                ],
            },
            {
                "title": "ТОВАРЫ",
                "separator": True,
                "items": [
                    {
                        "title": "Добавить товар",
                        "icon": "add_circle",
                        "link": reverse_lazy("admin:main_product_add_sku"),
                    },
                    {
                        "title": "Управление товарами",
                        "icon": "inventory_2",
                        "link": reverse_lazy("admin:main_product_products_list"),
                    },
                ],
            },
            {
                "title": "НАПОЛНЕНИЕ",
                "separator": True,
                "items": [
                    {
                        "title": "Категории",
                        "icon": "category",
                        "link": reverse_lazy("admin:main_category_changelist"),
                    },
                    {
                        "title": "Бренды",
                        "icon": "sell",
                        "link": reverse_lazy("admin:main_brand_changelist"),
                    },
                    {
                        "title": "Группы вариантов",
                        "icon": "tune",
                        "link": reverse_lazy("admin:main_variantgroup_changelist"),
                    },
                    {
                        "title": "Медиа",
                        "icon": "perm_media",
                        "link": reverse_lazy("admin:main_product_media_list"),
                    },
                ],
            },
            {
                "title": "ОТЗЫВЫ",
                "separator": True,
                "items": [
                    {
                        "title": "Отзывы",
                        "icon": "reviews",
                        "link": reverse_lazy("admin:main_productreview_changelist"),
                    },
                ],
            },
        ],
    },
}

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'django_wave_smoking.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'main' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.template.context_processors.media',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'django_wave_smoking.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'
STATICFILES_DIRS = [
    BASE_DIR / 'main' / 'templates' / 'main',
]

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
