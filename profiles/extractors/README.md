# Extractor profiles

Versioned extractor profiles for Step2 HTML parsing. Each JSON file defines CSS selectors and value extraction rules for message container, sender, timestamp, and text.

- **telegram_export_v1.json**: Default profile for Telegram Desktop export DOM (div.message, div.from_name, div.pull_right.date.details title/text, div.text).

Profiles are used by:
- **CLI**: `tlvc preprocess ... --profile profiles/extractors/telegram_export_v1.json`
- **TLVC Studio**: Select profile in UI for preview and Run Step2.
