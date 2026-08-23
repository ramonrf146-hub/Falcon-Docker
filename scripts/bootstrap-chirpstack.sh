#!/bin/sh
# Idempotent ChirpStack bootstrap.
#
# Logs in via gRPC InternalService.Login (the only auth path that takes
# user/password without a pre-existing API key), obtains a JWT, then uses
# the REST gateway for the remaining tenant/profile/app/gateway/device ops.
#
# Resources created (all idempotent):
#   - Tenant (CHIRPSTACK_TENANT_NAME, default: ChirpStack)
#   - Application (CHIRPSTACK_APPLICATION_NAME, default: Guardian-app)
#   - Default device profile (DEVICE_PROFILE_NAME) — used as fallback for
#     devices that don't declare one in their CSV row
#   - Device profiles from /scripts/device-profiles.csv (with codecs from /codecs)
#   - Gateway (LPS8_GATEWAY_EUI / LPS8_GATEWAY_NAME)
#   - Devices from /scripts/devices.csv (each may reference a profile by name)

set -eu

API_GRPC="${CHIRPSTACK_GRPC:-chirpstack:8080}"
API_HTTP="${CHIRPSTACK_REST_API:-http://chirpstack-rest-api:8090}"
ADMIN_EMAIL="${CHIRPSTACK_ADMIN_USER:-admin}"
ADMIN_PASS="${CHIRPSTACK_ADMIN_PASS:-admin}"
TENANT_NAME="${CHIRPSTACK_TENANT_NAME:-ChirpStack}"
APPLICATION_NAME="${CHIRPSTACK_APPLICATION_NAME:-Guardian-app}"
DEFAULT_DP_NAME="${DEVICE_PROFILE_NAME:-US915-Class-A-OTAA}"
GW_EUI="${LPS8_GATEWAY_EUI:?LPS8_GATEWAY_EUI is required}"
GW_NAME="${LPS8_GATEWAY_NAME:-LPS8-${GW_EUI}}"
DEVICES_CSV="${DEVICES_CSV:-/scripts/devices.csv}"
DEVICE_PROFILES_CSV="${DEVICE_PROFILES_CSV:-/scripts/device-profiles.csv}"
CODECS_DIR="${CODECS_DIR:-/codecs}"
GRPCURL_VERSION="${GRPCURL_VERSION:-1.9.1}"

GW_EUI=$(printf '%s' "$GW_EUI" | tr 'A-F' 'a-f' | tr -d '[:space:]')

log()  { printf '[chirpstack-init] %s\n' "$*" >&2; }
fail() { printf '[chirpstack-init] FAIL: %s\n' "$*" >&2; exit 1; }

# Install deps.
apk add --no-cache curl jq ca-certificates wget tar >/dev/null 2>&1 \
  || fail "could not install curl/jq/wget"

# Download grpcurl if not present.
if ! command -v grpcurl >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) GA=x86_64 ;;
    aarch64|arm64) GA=arm64 ;;
    *) fail "unsupported arch $ARCH" ;;
  esac
  log "Downloading grpcurl v$GRPCURL_VERSION ($GA)"
  wget -qO- "https://github.com/fullstorydev/grpcurl/releases/download/v${GRPCURL_VERSION}/grpcurl_${GRPCURL_VERSION}_linux_${GA}.tar.gz" \
    | tar -xzC /usr/local/bin grpcurl
  chmod +x /usr/local/bin/grpcurl
fi

# Wait for gRPC.
log "Waiting for ChirpStack gRPC at $API_GRPC"
i=0
while [ "$i" -lt 60 ]; do
  if grpcurl -plaintext "$API_GRPC" list >/dev/null 2>&1; then break; fi
  sleep 2
  i=$((i + 1))
done
[ "$i" -lt 60 ] || fail "ChirpStack gRPC not ready"

# Wait for REST.
log "Waiting for ChirpStack REST at $API_HTTP"
i=0
while [ "$i" -lt 60 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$API_HTTP/" 2>/dev/null || echo 000)
  case "$code" in 200|404|301|302) break ;; esac
  sleep 2
  i=$((i + 1))
done
[ "$i" -lt 60 ] || fail "ChirpStack REST not ready"

# Login via gRPC.
log "Authenticating as $ADMIN_EMAIL"
LOGIN_RESP=$(grpcurl -plaintext \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  "$API_GRPC" api.InternalService/Login 2>&1) \
  || fail "login call failed: $LOGIN_RESP"
JWT=$(printf '%s' "$LOGIN_RESP" | jq -r '.jwt' 2>/dev/null)
[ -n "$JWT" ] && [ "$JWT" != 'null' ] || fail "login returned empty JWT (check admin password)"

# REST helpers.
api_get() {
  curl -sf -X GET "$API_HTTP$1" \
    -H "Grpc-Metadata-Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json'
}
api_get_or_empty() {
  tmp_out=/tmp/resp.$$
  code=$(curl -s -o "$tmp_out" -w '%{http_code}' -X GET "$API_HTTP$1" \
    -H "Grpc-Metadata-Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json')
  body=$(cat "$tmp_out" 2>/dev/null || true)
  rm -f "$tmp_out"
  if [ "$code" = "200" ]; then printf '%s' "$body"; else printf ''; fi
}
api_post() {
  curl -sf -X POST "$API_HTTP$1" \
    -H "Grpc-Metadata-Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' \
    --data-binary "@$2"
}
api_put() {
  curl -sf -X PUT "$API_HTTP$1" \
    -H "Grpc-Metadata-Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' \
    --data-binary "@$2"
}

# Tenant.
log "Looking up tenant '$TENANT_NAME'"
TENANT_ID=$(api_get "/api/tenants?limit=100" \
  | jq -r --arg n "$TENANT_NAME" '.result[] | select(.name == $n) | .id' \
  | head -n1)
if [ -z "$TENANT_ID" ]; then
  log "Creating tenant '$TENANT_NAME'"
  TMP=/tmp/payload.$$
  jq -n --arg n "$TENANT_NAME" \
    '{tenant:{name:$n,canHaveGateways:true,maxGatewayCount:0,maxDeviceCount:0}}' \
    > "$TMP"
  TENANT_ID=$(api_post "/api/tenants" "$TMP" | jq -r '.id')
  rm -f "$TMP"
fi
[ -n "$TENANT_ID" ] && [ "$TENANT_ID" != 'null' ] || fail "could not get tenant id"
log "Tenant ID: $TENANT_ID"

# Gateway.
log "Looking up gateway $GW_EUI"
GW_RESP=$(api_get_or_empty "/api/gateways/$GW_EUI")
if [ -z "$GW_RESP" ] || ! printf '%s' "$GW_RESP" | jq -e '.gateway' >/dev/null 2>&1; then
  log "Creating gateway $GW_EUI ($GW_NAME)"
  TMP=/tmp/payload.$$
  jq -n --arg id "$GW_EUI" --arg n "$GW_NAME" --arg t "$TENANT_ID" \
    '{gateway:{gatewayId:$id,name:$n,description:"Auto-registered by guardian-docker bootstrap",tenantId:$t,statsInterval:30,metadata:{}}}' \
    > "$TMP"
  api_post "/api/gateways" "$TMP" >/dev/null || fail "could not create gateway"
  rm -f "$TMP"
else
  log "Gateway $GW_EUI already exists, skipping"
fi

# Helper: create or update one device profile.
# args: name, mac_version, reg_params, class, is_otaa(true/false), codec_path(may be empty)
upsert_device_profile() {
  dp_name="$1"
  dp_mac="$2"
  dp_reg="$3"
  dp_class="$4"
  dp_otaa="$5"
  dp_codec="$6"

  supports_class_b=false
  supports_class_c=false
  case "$dp_class" in
    B) supports_class_b=true ;;
    C) supports_class_c=true ;;
  esac

  payload_codec_runtime=NONE
  payload_codec_script=""
  if [ -n "$dp_codec" ] && [ -f "$CODECS_DIR/$dp_codec" ]; then
    payload_codec_runtime=JS
    payload_codec_script=$(cat "$CODECS_DIR/$dp_codec")
  elif [ -n "$dp_codec" ]; then
    log "  WARN codec file not found: $CODECS_DIR/$dp_codec — profile will have no codec"
  fi

  TMP=/tmp/payload.$$
  jq -n \
    --arg t "$TENANT_ID" \
    --arg n "$dp_name" \
    --arg mac "$dp_mac" \
    --arg reg "$dp_reg" \
    --argjson otaa "$dp_otaa" \
    --argjson cb "$supports_class_b" \
    --argjson cc "$supports_class_c" \
    --arg codecRuntime "$payload_codec_runtime" \
    --arg codecScript "$payload_codec_script" \
    '{deviceProfile:{
        tenantId:$t,
        name:$n,
        description:"Auto-managed by guardian-docker bootstrap",
        region:"US915",
        macVersion:$mac,
        regParamsRevision:$reg,
        adrAlgorithmId:"default",
        flushQueueOnActivate:true,
        uplinkInterval:3600,
        supportsOtaa:$otaa,
        supportsClassB:$cb,
        supportsClassC:$cc,
        payloadCodecRuntime:$codecRuntime,
        payloadCodecScript:$codecScript
      }}' > "$TMP"

  EXISTING_ID=$(api_get "/api/device-profiles?tenantId=$TENANT_ID&limit=100" \
    | jq -r --arg n "$dp_name" '.result[] | select(.name == $n) | .id' \
    | head -n1)

  if [ -z "$EXISTING_ID" ]; then
    NEW_ID=$(api_post "/api/device-profiles" "$TMP" | jq -r '.id')
    log "  + Created device profile '$dp_name' (codec=$payload_codec_runtime)"
    rm -f "$TMP"
    printf '%s' "$NEW_ID"
  else
    # PUT requires id in body and URL.
    TMP2=/tmp/payload2.$$
    jq --arg id "$EXISTING_ID" '.deviceProfile.id = $id' "$TMP" > "$TMP2"
    api_put "/api/device-profiles/$EXISTING_ID" "$TMP2" >/dev/null \
      && log "  ~ Updated device profile '$dp_name' (codec=$payload_codec_runtime)" \
      || log "  ! Failed to update device profile '$dp_name'"
    rm -f "$TMP" "$TMP2"
    printf '%s' "$EXISTING_ID"
  fi
}

# Default device profile (no codec, used as fallback if a device row has no DeviceProfile).
log "Ensuring default device profile '$DEFAULT_DP_NAME'"
DEFAULT_DP_ID=$(upsert_device_profile "$DEFAULT_DP_NAME" "LORAWAN_1_0_3" "RP002_1_0_3" "A" "true" "")
[ -n "$DEFAULT_DP_ID" ] || fail "could not ensure default device profile"
log "Default device profile ID: $DEFAULT_DP_ID"

# Device profiles CSV (optional).
DP_NAMES_TMP=/tmp/dpnames.$$
DP_IDS_TMP=/tmp/dpids.$$
: > "$DP_NAMES_TMP"
: > "$DP_IDS_TMP"
# Seed with the default.
printf '%s\n' "$DEFAULT_DP_NAME" >> "$DP_NAMES_TMP"
printf '%s\n' "$DEFAULT_DP_ID" >> "$DP_IDS_TMP"

if [ -f "$DEVICE_PROFILES_CSV" ]; then
  log "Processing device profiles from $DEVICE_PROFILES_CSV"
  while IFS=',' read -r DP_NAME DP_MAC DP_REG DP_CLASS DP_OTAA DP_CODEC _; do
    DP_NAME=$(printf '%s' "$DP_NAME" | sed 's/^[[:space:]]*//;s/[[:space:]\r]*$//')
    DP_MAC=$(printf '%s' "$DP_MAC" | tr -d '[:space:]\r')
    DP_REG=$(printf '%s' "$DP_REG" | tr -d '[:space:]\r')
    DP_CLASS=$(printf '%s' "$DP_CLASS" | tr -d '[:space:]\r')
    DP_OTAA=$(printf '%s' "$DP_OTAA" | tr -d '[:space:]\r')
    DP_CODEC=$(printf '%s' "$DP_CODEC" | tr -d '[:space:]\r')

    [ -z "$DP_NAME" ] && continue
    case "$DP_NAME" in
      \#*) continue ;;
      Name|name|NAME) continue ;;
    esac

    [ -z "$DP_MAC" ] && DP_MAC=LORAWAN_1_0_3
    [ -z "$DP_REG" ] && DP_REG=RP002_1_0_3
    [ -z "$DP_CLASS" ] && DP_CLASS=A
    [ -z "$DP_OTAA" ] && DP_OTAA=true

    DP_ID=$(upsert_device_profile "$DP_NAME" "$DP_MAC" "$DP_REG" "$DP_CLASS" "$DP_OTAA" "$DP_CODEC")
    printf '%s\n' "$DP_NAME" >> "$DP_NAMES_TMP"
    printf '%s\n' "$DP_ID"   >> "$DP_IDS_TMP"
  done < "$DEVICE_PROFILES_CSV"
else
  log "No device-profiles CSV at $DEVICE_PROFILES_CSV, skipping extra profiles"
fi

# Look up profile id by name (resolves from the seeded mapping files).
profile_id() {
  paste -d'|' "$DP_NAMES_TMP" "$DP_IDS_TMP" \
    | awk -F'|' -v n="$1" '$1 == n {print $2; exit}'
}

# Application.
log "Looking up application '$APPLICATION_NAME'"
APP_ID=$(api_get "/api/applications?tenantId=$TENANT_ID&limit=100" \
  | jq -r --arg n "$APPLICATION_NAME" '.result[] | select(.name == $n) | .id' \
  | head -n1)
if [ -z "$APP_ID" ]; then
  log "Creating application '$APPLICATION_NAME'"
  TMP=/tmp/payload.$$
  jq -n --arg t "$TENANT_ID" --arg n "$APPLICATION_NAME" \
    '{application:{tenantId:$t,name:$n,description:"Auto-created by guardian-docker bootstrap"}}' \
    > "$TMP"
  APP_ID=$(api_post "/api/applications" "$TMP" | jq -r '.id')
  rm -f "$TMP"
fi
[ -n "$APP_ID" ] && [ "$APP_ID" != 'null' ] || fail "could not get application id"
log "Application ID: $APP_ID"

# Devices CSV.
if [ -f "$DEVICES_CSV" ]; then
  log "Processing devices from $DEVICES_CSV"
  CREATED=0; SKIPPED=0; ERRORED=0
  while IFS=',' read -r DEV_EUI DEV_NAME APP_KEY DEV_DP _; do
    DEV_EUI=$(printf '%s' "$DEV_EUI" | tr -d '[:space:]\r')
    DEV_NAME=$(printf '%s' "$DEV_NAME" | sed 's/^[[:space:]]*//;s/[[:space:]\r]*$//')
    APP_KEY=$(printf '%s' "$APP_KEY" | tr -d '[:space:]\r')
    DEV_DP=$(printf '%s' "$DEV_DP" | sed 's/^[[:space:]]*//;s/[[:space:]\r]*$//')

    [ -z "$DEV_EUI" ] && continue
    case "$DEV_EUI" in
      \#*) continue ;;
      DevEUI|deveui|DEVEUI) continue ;;
    esac

    DEV_EUI=$(printf '%s' "$DEV_EUI" | tr 'A-F' 'a-f')
    APP_KEY=$(printf '%s' "$APP_KEY" | tr 'a-f' 'A-F')

    if [ "${#DEV_EUI}" -ne 16 ] || [ "${#APP_KEY}" -ne 32 ]; then
      log "  SKIP malformed line: DevEUI=$DEV_EUI AppKey=$APP_KEY"
      ERRORED=$((ERRORED + 1))
      continue
    fi

    # Resolve device profile.
    if [ -z "$DEV_DP" ]; then
      DEV_DP_ID="$DEFAULT_DP_ID"
      DEV_DP_DISPLAY="$DEFAULT_DP_NAME (default)"
    else
      DEV_DP_ID=$(profile_id "$DEV_DP")
      if [ -z "$DEV_DP_ID" ]; then
        log "  SKIP $DEV_EUI: device profile '$DEV_DP' not found"
        ERRORED=$((ERRORED + 1))
        continue
      fi
      DEV_DP_DISPLAY="$DEV_DP"
    fi

    EXISTING=$(api_get_or_empty "/api/devices/$DEV_EUI")
    if [ -n "$EXISTING" ] && printf '%s' "$EXISTING" | jq -e '.device' >/dev/null 2>&1; then
      log "  $DEV_EUI ($DEV_NAME) already exists, skipping"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    log "  Creating device $DEV_EUI ($DEV_NAME) profile=$DEV_DP_DISPLAY"
    TMP=/tmp/payload.$$
    jq -n \
      --arg eui "$DEV_EUI" \
      --arg n "$DEV_NAME" \
      --arg app "$APP_ID" \
      --arg dp "$DEV_DP_ID" \
      '{device:{devEui:$eui,name:$n,description:"",applicationId:$app,deviceProfileId:$dp,isDisabled:false,skipFcntCheck:false,variables:{},tags:{}}}' \
      > "$TMP"
    api_post "/api/devices" "$TMP" >/dev/null || { log "  ERROR creating $DEV_EUI"; rm -f "$TMP"; ERRORED=$((ERRORED+1)); continue; }
    rm -f "$TMP"

    log "  Setting AppKey for $DEV_EUI"
    TMP=/tmp/payload.$$
    jq -n --arg eui "$DEV_EUI" --arg k "$APP_KEY" \
      '{deviceKeys:{devEui:$eui,nwkKey:$k,appKey:$k}}' > "$TMP"
    api_post "/api/devices/$DEV_EUI/keys" "$TMP" >/dev/null \
      || log "  WARN failed to set keys for $DEV_EUI"
    rm -f "$TMP"

    CREATED=$((CREATED + 1))
  done < "$DEVICES_CSV"
  log "Devices: created=$CREATED skipped=$SKIPPED errors=$ERRORED"
else
  log "No devices CSV at $DEVICES_CSV, skipping device registration"
fi

rm -f "$DP_NAMES_TMP" "$DP_IDS_TMP"

log "Bootstrap complete."
