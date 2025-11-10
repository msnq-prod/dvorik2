import os
import requests
from telegram import Update
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

# States for conversation
(
    FIRST_NAME,
    LAST_NAME,
    BIRTH_DATE,
    GENDER,
) = range(4)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Starts the conversation and asks for the user's first name."""
    await update.message.reply_text(
        "Welcome! Let's register you. Please tell me your first name."
    )
    return FIRST_NAME


async def first_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Stores the first name and asks for the last name."""
    context.user_data["first_name"] = update.message.text
    await update.message.reply_text("Great! Now, please tell me your last name.")
    return LAST_NAME


async def last_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Stores the last name and asks for the birth date."""
    context.user_data["last_name"] = update.message.text
    await update.message.reply_text("Got it. Now, please enter your birth date in DD.MM.YYYY format.")
    return BIRTH_DATE


async def birth_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Stores the birth date and asks for the gender."""
    context.user_data["birth_date"] = update.message.text
    await update.message.reply_text("Thanks. Finally, what is your gender (male/female)?")
    return GENDER


async def gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Stores the gender and ends the conversation."""
    context.user_data["gender"] = update.message.text

    # Here, you would call your API to save the user
    user_data = {
        "telegram_id": update.effective_user.id,
        "first_name": context.user_data["first_name"],
        "last_name": context.user_data["last_name"],
        "birth_date": context.user_data["birth_date"], # You'll need to parse this in the backend
        "gender": context.user_data["gender"],
    }

    try:
        # NOTE: Using service name "backend" from docker-compose
        response = requests.post("http://backend:8000/api/users/", json=user_data)
        response.raise_for_status() # Raise an exception for bad status codes
        await update.message.reply_text("Registration successful! Thank you.")
    except requests.exceptions.RequestException as e:
        print(f"API call failed: {e}")
        await update.message.reply_text("Sorry, there was an error with your registration. Please try again later.")


    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancels and ends the conversation."""
    await update.message.reply_text("Registration canceled.")
    return ConversationHandler.END


def main() -> None:
    """Run the bot."""
    TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")
    application = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            FIRST_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, first_name)],
            LAST_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, last_name)],
            BIRTH_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, birth_date)],
            GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, gender)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    application.add_handler(conv_handler)
    application.run_polling()


if __name__ == "__main__":
    main()
