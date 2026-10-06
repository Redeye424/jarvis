from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path("", views.index),
    path("apple-touch-icon.png", RedirectView.as_view(url="/static/icons/apple-touch-icon.png")),
    path("apple-touch-icon-precomposed.png", RedirectView.as_view(url="/static/icons/apple-touch-icon.png")),
    path("login", views.login),
    path("logout", views.logout),
    path("api/chat", views.chat),
    path("api/status", views.status),
]
