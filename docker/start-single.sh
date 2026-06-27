#!/bin/sh
set -eu

# Single-container mode always uses internal Redis.
export NEXT_PUBLIC_STORAGE_TYPE=redis
export REDIS_URL=redis://127.0.0.1:6379

mkdir -p /data

# Start Redis in background (appendonly for persistence).
redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --appendonly yes \
  --dir /data \
  --save 60 1000 &

# Wait for Redis ready.
i=0
until redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Redis failed to start within 30s."
    exit 1
  fi
  sleep 1
done

exec node start.js
