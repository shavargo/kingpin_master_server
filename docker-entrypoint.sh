#!/bin/sh
set -e

# Map env → existing kingpin-master CLI flags (no invented config format).
# Extra args after "--" (or Compose command) are appended as-is.

ARGS=""

if [ -n "${LISTEN_ADDR:-}" ]; then
	ARGS="$ARGS -l $LISTEN_ADDR"
fi
if [ -n "${PORT_KP:-}" ]; then
	ARGS="$ARGS -p $PORT_KP"
fi
if [ -n "${PORT_KPQ3:-}" ]; then
	ARGS="$ARGS -q $PORT_KPQ3"
fi
if [ -n "${VERBOSE:-}" ]; then
	ARGS="$ARGS -v $VERBOSE"
fi
if [ -n "${MAX_SERVERS:-}" ]; then
	ARGS="$ARGS -n $MAX_SERVERS"
fi
if [ -n "${HASH_SIZE:-}" ]; then
	ARGS="$ARGS -H $HASH_SIZE"
fi
if [ -n "${STATIC_IP:-}" ]; then
	case "$STATIC_IP" in
		1|true|TRUE|yes|YES|on|ON) ARGS="$ARGS -s" ;;
	esac
fi
if [ -n "${MAP_ADDR:-}" ]; then
	# shellcheck disable=SC2086
	for m in $MAP_ADDR; do
		ARGS="$ARGS -m $m"
	done
fi

# shellcheck disable=SC2086
exec /usr/local/bin/kingpin-master $ARGS "$@"
