"""Message template model for reusable text templates."""
from typing import Optional

from sqlalchemy import String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from models.base import BaseModel


class MessageTemplate(BaseModel):
    """
    Message template model for storing reusable text templates.
    
    All user-facing texts should be stored here for easy editing.
    Supports variable substitution with placeholders.
    """
    
    __tablename__ = "message_templates"
    
    # Template identification
    key: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
        comment="Unique template key (e.g., 'welcome', 'subscription_success')"
    )
    
    # Content
    body: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Template body with placeholders (supports HTML/Markdown)"
    )
    
    # Supported variables
    variables: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="List of supported placeholder variables (e.g., ['first_name', 'discount_code'])"
    )
    
    # Description for admin panel
    description: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Description of template purpose"
    )
    
    def __repr__(self) -> str:
        """String representation."""
        return f"<MessageTemplate(id={self.id}, key='{self.key}')>"
    
    def render(self, **context) -> str:
        """
        Render template with provided context.
        
        Supported placeholders:
        - {{first_name}} - User's first name
        - {{last_name}} - User's last name
        - {{display_name}} - User's display name
        - {{discount_code}} - Discount code
        - {{discount_expires_at}} - Discount expiration date
        - {{discount_value}} - Discount value
        - {{channel_link}} - Telegram channel link
        
        Args:
            **context: Variables to substitute in template
        
        Returns:
            Rendered template string
        """
        rendered = self.body
        
        # Replace all provided variables
        for key, value in context.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in rendered:
                rendered = rendered.replace(placeholder, str(value))
        
        return rendered
    
    @classmethod
    def get_default_templates(cls) -> list[dict]:
        """
        Get list of default templates to seed database.
        
        Returns:
            List of template dictionaries
        """
        return [
            {
                "key": "welcome",
                "body": "👋 Привет, {{first_name}}!\n\nДобро пожаловать в систему лояльности «Мармеладный Дворик».",
                "variables": ["first_name"],
                "description": "Welcome message for new users"
            },
            {
                "key": "subscription_prompt",
                "body": "📢 Подпишитесь на наш канал {{channel_link}} и получите скидку!",
                "variables": ["channel_link"],
                "description": "Prompt to subscribe to channel"
            },
            {
                "key": "subscription_success",
                "body": "✅ Отлично! Вы подписаны на канал.\n\n🎁 Ваш код скидки: <code>{{discount_code}}</code>\nДействителен до: {{discount_expires_at}}",
                "variables": ["discount_code", "discount_expires_at"],
                "description": "Success message after subscription"
            },
            {
                "key": "birthday_greeting",
                "body": "🎉 С Днём Рождения, {{first_name}}!\n\n🎁 Специально для вас скидка: <code>{{discount_code}}</code>\nДействительна до: {{discount_expires_at}}",
                "variables": ["first_name", "discount_code", "discount_expires_at"],
                "description": "Birthday greeting with discount"
            },
            {
                "key": "discount_redeemed",
                "body": "✅ Ваша скидка <code>{{discount_code}}</code> успешно использована.\n\nСпасибо за покупку!",
                "variables": ["discount_code"],
                "description": "Notification when discount is redeemed"
            },
            {
                "key": "discount_issued",
                "body": "🎁 Вам выдана новая скидка!\n\nКод: <code>{{discount_code}}</code>\nСкидка: {{discount_value}}\nДействительна до: {{discount_expires_at}}",
                "variables": ["discount_code", "discount_value", "discount_expires_at"],
                "description": "Notification when new discount is issued"
            },
            {
                "key": "cashier_welcome",
                "body": "👋 Добро пожаловать в систему погашения скидок!\n\nОтправьте мне код скидки для проверки.",
                "variables": [],
                "description": "Welcome message for cashiers"
            },
            {
                "key": "cashier_not_active",
                "body": "⚠️ Ваша учётная запись кассира не активирована.\n\nОбратитесь к администратору.",
                "variables": [],
                "description": "Message when cashier is not activated"
            },
            {
                "key": "code_not_found",
                "body": "❌ Код <code>{{code}}</code> не найден.\n\nПроверьте правильность ввода.",
                "variables": ["code"],
                "description": "Message when discount code is not found"
            },
            {
                "key": "code_expired",
                "body": "❌ Код <code>{{code}}</code> истёк.\n\nСрок действия истёк: {{expires_at}}",
                "variables": ["code", "expires_at"],
                "description": "Message when discount code is expired"
            },
            {
                "key": "code_already_used",
                "body": "❌ Код <code>{{code}}</code> уже использован.\n\nИспользован: {{used_at}}",
                "variables": ["code", "used_at"],
                "description": "Message when discount code was already used"
            },
        ]

