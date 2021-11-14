#!/usr/bin/env sh

echo "Set env vars"
URL=https://localhost:3978/ping

echo "Call url"
if [ $(curl -L --insecure $URL -o /dev/null -w '%{http_code}\n' -s) == "401" ]
then exit 0
else exit 1
fi
