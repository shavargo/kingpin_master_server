# Kingpin master — multi-stage Linux image (hypov8 src/ layout)
# Ports: 27900/udp (KP), 27950/udp (KPQ3), 28900/tcp (GameSpy)

FROM debian:bookworm-slim AS builder

RUN apt-get update \
	&& apt-get install -y --no-install-recommends gcc make libc6-dev \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Makefile ./
COPY src/ ./src/
COPY config/ ./config/
RUN make && strip bin/master

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --gid 1000 kingpin \
	&& useradd --uid 1000 --gid 1000 --home-dir /data --shell /usr/sbin/nologin kingpin \
	&& mkdir -p /data \
	&& chown kingpin:kingpin /data

COPY --from=builder /build/bin/master /usr/local/bin/kingpin-master
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY config/ip_ignore.txt config/ip_offline.txt config/ip_rename.txt \
	config/ip_weblist.txt config/ip_weblist_gs.txt /data/

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
	&& chmod 755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/kingpin-master \
	&& chown kingpin:kingpin /data/*

WORKDIR /data
USER kingpin

EXPOSE 27900/udp 27950/udp 28900/tcp

ENV VERBOSE=3

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
