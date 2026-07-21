import os
from pathlib import Path
from django.templatetags.static import static
from django.urls import reverse_lazy

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def load_local_env():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()


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
    'daphne',
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
    "SITE_ICON": lambda request: static("site/shared/img/mini_logo.png"),
    "SITE_FAVICONS": [
        {
            "rel": "icon",
            "href": lambda request: static("site/shared/img/mini_logo.png"),
            "type": "image/png",
        },
        {
            "rel": "apple-touch-icon",
            "href": lambda request: static("site/shared/img/mini_logo.png"),
            "type": "image/png",
        },
    ],
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": True,
    "STYLES": [
        lambda request: f"{static('admin_panel/shared/css/unfold_overrides.css')}?v=admin-controls6",
        lambda request: f"{static('admin_panel/shared/css/responsive.css')}?v=responsive2",
    ],
    "SCRIPTS": [
        lambda request: f"{static('admin_panel/shared/js/unfold_overrides.js')}?v=dark-only1",
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
                "title": "\u0422\u041e\u0412\u0410\u0420\u042b",
                "separator": False,
                "items": [
                    {
                        "title": "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0442\u043e\u0432\u0430\u0440",
                        "icon": "add_circle",
                        "link": reverse_lazy("admin:main_product_add_sku"),
                    },
                    {
                        "title": "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u0430\u043c\u0438",
                        "icon": "inventory_2",
                        "link": reverse_lazy("admin:main_product_products_list"),
                    },
                ],
            },
            {
                "title": "\u041d\u0410\u041f\u041e\u041b\u041d\u0415\u041d\u0418\u0415",
                "separator": True,
                "items": [
                    {
                        "title": "\u0411\u0440\u0435\u043d\u0434\u044b",
                        "icon": "sell",
                        "link": reverse_lazy("admin:main_brand_changelist"),
                    },
                    {
                        "title": "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438",
                        "icon": "category",
                        "link": reverse_lazy("admin:main_category_changelist"),
                    },
                    {
                        "title": "\u0413\u0440\u0443\u043f\u043f\u044b \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u043e\u0432",
                        "icon": "tune",
                        "link": reverse_lazy("admin:main_variantgroup_changelist"),
                    },
                    {
                        "title": "\u041c\u0435\u0434\u0438\u0430",
                        "icon": "perm_media",
                        "link": reverse_lazy("admin:main_product_media_list"),
                    },
                ],
            },
            {
                "title": "\u0421\u043a\u043b\u0430\u0434",
                "separator": True,
                "items": [
                    {
                        "title": "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0441\u043a\u043b\u0430\u0434\u043e\u043c",
                        "icon": "warehouse",
                        "link": reverse_lazy("admin:main_warehouseitem_warehouse_list"),
                    },
                ],
            },
            {
                "title": "\u041e\u0422\u0417\u042b\u0412\u042b",
                "separator": True,
                "items": [
                    {
                        "title": "\u041e\u0442\u0437\u044b\u0432\u044b",
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
    'main.middleware.PublicNotFoundRateLimitMiddleware',
    'main.middleware.SiteVisitMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'django_wave_smoking.urls'

TEMPLATE_LOADERS = [
    'django.template.loaders.filesystem.Loader',
    'django.template.loaders.app_directories.Loader',
]
if not DEBUG:
    TEMPLATE_LOADERS = [
        ('django.template.loaders.cached.Loader', TEMPLATE_LOADERS),
    ]

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'main' / 'templates'],
        'APP_DIRS': False,
        'OPTIONS': {
            'loaders': TEMPLATE_LOADERS,
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
ASGI_APPLICATION = 'django_wave_smoking.asgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'wave_smoking'),
        'USER': os.environ.get('POSTGRES_USER', 'wave_user'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        'CONN_MAX_AGE': int(os.environ.get('POSTGRES_CONN_MAX_AGE', '60')),
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

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

PUBLIC_404_RATE_LIMIT_MAX = int(os.environ.get("PUBLIC_404_RATE_LIMIT_MAX", "35"))
PUBLIC_404_RATE_LIMIT_WINDOW = int(os.environ.get("PUBLIC_404_RATE_LIMIT_WINDOW", "300"))

