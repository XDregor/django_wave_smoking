# Project architecture

The `main` Django app keeps stable public imports while implementation is grouped by domain.

## Python

```text
main/
  models/
    catalog.py
    product.py
    reviews.py
    cart.py
  views/
    home.py
    catalog.py
    product.py
    reviews.py
    favorites.py
    cart.py
    shared.py
  urls/
    site.py
    api.py
  admin_panel/
    products.py
    product_list.py
    product_media.py
    product_sku.py
    brands.py
    categories.py
    reviews.py
    media.py
    variant_groups.py
    accounts.py
    cart.py
    action_history.py
    shared.py
```

`main.models`, `main.views`, and `main.admin` remain compatibility entry points. Existing imports, model app labels, migrations, URL names, and Django admin autodiscovery therefore remain stable.

Root URL configuration is split between `django_wave_smoking/urls/site.py` and `django_wave_smoking/urls/admin_panel.py`.

## Templates

```text
main/templates/
  site/
    home/
    catalog/
    product_detail/
    reviews/
    shared/
  admin_panel/
    products/
    brands/
    categories/
    reviews/
    media/
    variant_groups/
    action_history/
  admin/             # Django template overrides
  unfold/helpers/    # Unfold contract overrides
```

Files under `admin/` and `unfold/helpers/` must keep their framework-defined paths. Custom business screens belong under `admin_panel/`.

## Static files

```text
main/static/
  site/
    home/
    catalog/
    product_detail/
    reviews/
    shared/
  admin_panel/
    products/
    brands/
    categories/
    reviews/
    media/
    variant_groups/
    action_history/
    shared/
```

Each feature owns its CSS and JavaScript. Shared components and images live in the corresponding `shared/` directory. Templates must not contain CSS or executable inline script blocks.

## Extension rules

1. Add new public pages under `templates/site/<feature>` and `static/site/<feature>`.
2. Add new custom admin screens under `templates/admin_panel/<feature>` and `static/admin_panel/<feature>`.
3. Put domain models, views, and routes in the matching Python module and re-export public symbols from the package `__init__.py` when compatibility is required.
4. Keep API routes in `main/urls/api.py`; keep browser routes in `main/urls/site.py`.
5. Do not place generated uploads, source assets, CSS, or JavaScript under `templates/`.
