FROM alpine:3.22
RUN apk add --no-cache openssh-client
COPY deployment/edge-link.sh /edge-link.sh
ENTRYPOINT ["sh", "/edge-link.sh"]
