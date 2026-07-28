#!/usr/bin/env bash
# Serve the app over Wi-Fi so the dev build installed on your phone can load it.
#
#   npm run phone            # start Metro on the LAN
#   npm run phone -- --clear # same, but reset the Metro cache first
#
# On the phone (same Wi-Fi), open MELLO. If it shows a red "could not connect"
# screen, shake the device → Dev menu → set the bundler host to the IP printed
# below, port 8081.
set -e
cd "$(dirname "$0")/.."

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "<your-Mac-IP>")

printf '\n  📱  Open MELLO on your iPhone (same Wi-Fi).\n'
printf '      If it can'\''t connect: shake → Dev menu → bundler host =\n\n'
printf '          %s:8081\n\n' "$IP"

# --host lan advertises the LAN IP (not localhost) so Wi-Fi devices can reach it.
exec npx expo start --host lan "$@"
