FROM alpine AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add libgcc libstdc++ ripgrep

FROM base AS build-amd64
COPY dist/@stratacode/cli-linux-x64-baseline-musl/bin/strata /usr/local/bin/strata

FROM base AS build-arm64
COPY dist/@stratacode/cli-linux-arm64-musl/bin/strata /usr/local/bin/strata

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN strata --version
ENTRYPOINT ["strata"]
