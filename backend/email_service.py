"""Production email delivery — Resend primary, SMTP fallback."""
from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
import resend

# Load backend/.env before reading configuration (import order safe)
load_dotenv(Path(__file__).parent / ".env")

log = logging.getLogger("paperloop.email")

APP_ENV = os.environ.get("APP_ENV", "development")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
FROM_EMAIL = (
    os.environ.get("FROM_EMAIL", "").strip()
    or os.environ.get("SENDER_EMAIL", "").strip()
    or "Paper & Loop <noreply@paperloop.shop>"
)

SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER).strip()

BRAND_ORANGE = "#ff6b35"
BRAND_BLACK = "#0a0a0a"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def email_configured() -> bool:
    return bool(RESEND_API_KEY) or bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def _send_smtp(to: str, subject: str, html: str, text: str) -> dict:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(msg["From"], [to], msg.as_string())
    return {"status": "sent", "provider": "smtp"}


def _send_resend(to: str, subject: str, html: str, text: str) -> dict:
    params: dict[str, Any] = {
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    resp = resend.Emails.send(params)
    rid = resp.get("id") if isinstance(resp, dict) else getattr(resp, "id", None)
    return {"status": "sent", "provider": "resend", "id": rid}


def _otp_html(code: str, purpose: str) -> str:
    verb = {
        "registration": "verify your email",
        "password_reset": "reset your password",
        "login": "sign in",
    }.get(purpose, "verify your account")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Your Paper &amp; Loop code</title>
</head>
<body style="margin:0;padding:0;background:{BRAND_BLACK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{BRAND_BLACK};padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#141414;border:1px solid #2a2a2a;border-radius:4px;">
          <tr>
            <td style="padding:40px 32px 24px;text-align:center;">
              <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{BRAND_ORANGE};font-weight:600;">Paper &amp; Loop</div>
              <h1 style="margin:16px 0 8px;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">Your verification code</h1>
              <p style="margin:0;font-size:15px;color:#b8b8b4;line-height:1.5;">Use this code to {verb}.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 32px;">
              <div style="display:inline-block;background:{BRAND_BLACK};border:2px solid {BRAND_ORANGE};border-radius:8px;padding:20px 36px;">
                <span style="font-size:40px;font-weight:700;letter-spacing:14px;color:{BRAND_ORANGE};font-variant-numeric:tabular-nums;">{code}</span>
              </div>
              <p style="margin:24px 0 0;font-size:13px;color:#8a8a85;">Valid for 10 minutes</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#666660;line-height:1.6;">If you didn't request this code, you can safely ignore this email.<br/>Your account will remain secure.</p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:11px;color:#444440;">&copy; Paper &amp; Loop &middot; paperloop.shop</p>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _otp_text(code: str, purpose: str) -> str:
    verb = {
        "registration": "verify your email",
        "password_reset": "reset your password",
        "login": "sign in",
    }.get(purpose, "verify your account")
    return (
        f"Paper & Loop\n\n"
        f"Your verification code to {verb}:\n\n"
        f"  {code}\n\n"
        f"Valid for 10 minutes.\n\n"
        f"If you didn't request this, ignore this email.\n"
    )


def _order_confirmation_html(
    customer_name: str,
    order_number: str,
    total: float,
    items: list[dict],
) -> str:
    rows = "".join(
        f'<tr><td style="padding:8px 0;color:#b8b8b4;border-bottom:1px solid #2a2a2a;">'
        f'{it.get("name", "Item")} &times; {it.get("quantity", 1)}</td>'
        f'<td style="padding:8px 0;color:#fff;text-align:right;border-bottom:1px solid #2a2a2a;">'
        f'₹{it.get("line_total", 0):,.0f}</td></tr>'
        for it in items
    )
    return f"""<!DOCTYPE html>
<html lang="en"><body style="margin:0;background:{BRAND_BLACK};font-family:-apple-system,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" style="background:{BRAND_BLACK};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#141414;border:1px solid #2a2a2a;padding:32px;">
<tr><td>
<div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{BRAND_ORANGE};">Paper &amp; Loop</div>
<h1 style="color:#fff;font-size:24px;margin:12px 0 8px;">Order received</h1>
<p style="color:#b8b8b4;margin:0 0 24px;">Hi {customer_name}, your order <strong style="color:{BRAND_ORANGE};">{order_number}</strong> is placed. Complete UPI payment to lock it in.</p>
<table width="100%" style="margin-bottom:16px;">{rows}</table>
<p style="color:#fff;font-size:18px;text-align:right;">Total: <strong>₹{total:,.0f}</strong></p>
</td></tr></table>
</td></tr></table></body></html>"""


def _order_confirmation_text(customer_name: str, order_number: str, total: float) -> str:
    return (
        f"Paper & Loop — Order received\n\n"
        f"Hi {customer_name},\n\n"
        f"Order {order_number} is placed. Total: ₹{total:,.0f}\n"
        f"Complete UPI payment to lock it in.\n"
    )


def _admin_notification_html(subject_line: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en"><body style="margin:0;background:{BRAND_BLACK};font-family:-apple-system,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" style="background:{BRAND_BLACK};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#141414;border:1px solid #2a2a2a;padding:32px;">
<tr><td>
<div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{BRAND_ORANGE};">Paper &amp; Loop Admin</div>
<h1 style="color:#fff;font-size:22px;margin:12px 0 8px;">{subject_line}</h1>
<div style="color:#b8b8b4;line-height:1.6;">{body_html}</div>
</td></tr></table>
</td></tr></table></body></html>"""


class EmailService:
    """Reusable transactional email service (Resend + SMTP fallback)."""

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        text: Optional[str] = None,
    ) -> dict:
        to = (to or "").strip().lower()
        if not to:
            return {"status": "error", "error": "missing_recipient"}

        plain = text or ""
        errors: list[str] = []

        if RESEND_API_KEY:
            try:
                result = await asyncio.to_thread(_send_resend, to, subject, html, plain)
                log.info("Email sent via Resend to=%s id=%s", to, result.get("id"))
                return result
            except Exception as e:
                log.exception("Resend failed for to=%s: %s", to, e)
                errors.append(f"resend:{e}")

        if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
            try:
                result = await asyncio.to_thread(_send_smtp, to, subject, html, plain)
                log.info("Email sent via SMTP to=%s", to)
                return result
            except Exception as e:
                log.exception("SMTP failed for to=%s: %s", to, e)
                errors.append(f"smtp:{e}")

        if APP_ENV == "production":
            log.error("Email delivery failed in production to=%s: %s", to, errors or "no provider")
            return {"status": "error", "error": "; ".join(errors) or "no_email_provider"}

        log.warning("Email unconfigured — not delivered to=%s subject=%s", to, subject)
        return {"status": "unconfigured", "error": "; ".join(errors) or "no_email_provider"}

    async def send_otp_email(
        self,
        email: str,
        otp: str,
        purpose: str = "registration",
    ) -> dict:
        subject = "Your Paper & Loop verification code"
        html = _otp_html(otp, purpose)
        text = _otp_text(otp, purpose)
        return await self.send(email, subject, html, text)

    async def send_order_confirmation(
        self,
        email: str,
        customer_name: str,
        order_number: str,
        total: float,
        items: list[dict],
    ) -> dict:
        subject = f"Order received — {order_number}"
        html = _order_confirmation_html(customer_name, order_number, total, items)
        text = _order_confirmation_text(customer_name, order_number, total)
        return await self.send(email, subject, html, text)

    async def send_admin_notification(
        self,
        email: str,
        subject_line: str,
        body_html: str,
        body_text: Optional[str] = None,
    ) -> dict:
        subject = f"[Paper & Loop] {subject_line}"
        html = _admin_notification_html(subject_line, body_html)
        text = body_text or subject_line
        return await self.send(email, subject, html, text)

    async def send_test_email(self, email: str) -> dict:
        html = f"""<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:32px;background:{BRAND_BLACK};color:#fff;">
<h2 style="color:{BRAND_ORANGE};">Paper &amp; Loop</h2>
<p>Test email delivery is working.</p>
<p style="color:#888;">Sent from {FROM_EMAIL.split('<')[-1].rstrip('>') if '<' in FROM_EMAIL else FROM_EMAIL}</p>
</body></html>"""
        text = "Paper & Loop — Test email delivery is working."
        return await self.send(email, "Paper & Loop — Test Email", html, text)


# Module singleton + backward-compatible helpers
email_service = EmailService()


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    return await email_service.send(to, subject, html, text)


def otp_email_html(code: str, purpose: str) -> str:
    return _otp_html(code, purpose)
