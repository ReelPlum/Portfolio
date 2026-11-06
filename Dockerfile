# Builds the website server into a small image.
FROM rust:1-slim-bookworm AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN cargo build --release -p server

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/server /app/server
COPY --from=build /src/crates/server/static /app/static
ENV STATIC_DIR=/app/static \
    BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
USER nonroot
ENTRYPOINT ["/app/server"]
