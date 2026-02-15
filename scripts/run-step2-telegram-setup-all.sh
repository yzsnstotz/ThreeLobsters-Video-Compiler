#!/usr/bin/env bash
# Run Step2 Telegram setup for ao000, ao001, ao002. Requires sudo password.
set -e
for u in ao000 ao001 ao002; do
  echo "========== Setting up $u =========="
  sudo bash "$(dirname "$0")/tlvc-step2-telegram-setup.sh" "$u"
done
echo "========== All done. See docs/TLVC-Step2-Telegram-Delivery-Report.md =========="
