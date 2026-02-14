#!/bin/bash
# Wrapper for launchd: ensure PATH includes common pnpm locations (Homebrew Intel/ARM, nvm, etc.)
export PATH="/usr/local/bin:/opt/homebrew/bin:${HOME}/.local/share/fnm/current/bin:${PATH}"
cd /Users/yzliu/work/tlvc && exec pnpm tlvc-api
