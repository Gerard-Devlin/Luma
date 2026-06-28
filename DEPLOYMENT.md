# Deployment

This guide covers Docker, Docker Compose, Vercel, Cloudflare Workers, storage backends, and runtime environment variables for Luma.

## Supported Targets

Luma supports Docker, Vercel, and Cloudflare Workers. Storage backends other than localStorage support multi-account usage, synced watch history, synced favorites, and the admin panel.

| Storage Backend |     Docker     |     Vercel     | Cloudflare Workers |
| :-------------: | :------------: | :------------: | :----------------: |
|  localStorage   |   Supported    |   Supported    |     Supported      |
|      Redis      |   Supported    | Not applicable |   Not applicable   |
|  Cloudflare D1  | Not applicable | Not applicable |     Supported      |
|  Upstash Redis  |   Supported    |   Supported    |     Supported      |

## Vercel

1. Fork this repository to your GitHub account.
2. Open [Vercel](https://vercel.com/), choose **Add New Project**, and import the forked repository.
3. Set the `PASSWORD` environment variable. Setting `USERNAME` is also recommended.
4. Set `TMDB_API_KEY` if you want TMDB-enhanced metadata.
5. Keep the default build settings and deploy.
6. To use Upstash Redis, also set `NEXT_PUBLIC_STORAGE_TYPE=upstash`, `UPSTASH_URL`, and `UPSTASH_TOKEN`.

## Cloudflare Workers

This project uses the OpenNext Cloudflare runtime. The included `wrangler.jsonc` can be used as a reference configuration.

```bash
pnpm install --frozen-lockfile
pnpm run build:worker
pnpm run deploy:worker
```

When using Cloudflare D1:

1. Create a D1 database in the Cloudflare dashboard.
2. Run [D1_SCHEMA.md](D1_SCHEMA.md) against the database.
3. Bind the database in `wrangler.jsonc` and keep the binding name as `DB`.
4. Set `NEXT_PUBLIC_STORAGE_TYPE=d1`, `USERNAME`, and `PASSWORD`.
5. For captcha protection, set `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

## Docker

The single-container image includes the app and an embedded Redis instance, which is convenient for personal servers.

```bash
cp .env.docker.example .env.docker
docker build -f Dockerfile.single -t luma:single .
docker run -d --name luma -p 3000:3000 --env-file .env.docker -v luma_data:/data luma:single
```

Then open `http://SERVER_IP:3000`. Make sure port `3000` is allowed by your firewall or hosting provider.

## Docker Compose

The recommended path is to use the Compose files included in this repository.

```bash
cp .env.docker.example .env.docker
docker compose -f docker-compose.single.yml up -d
```

Single-container deployment with embedded Redis:

```yaml
services:
  luma:
    image: ${LUMA_IMAGE:-luma:single}
    container_name: luma
    restart: unless-stopped
    ports:
      - '3000:3000'
    env_file:
      - .env.docker
    environment:
      DOCKER_ENV: 'true'
      NEXT_PUBLIC_STORAGE_TYPE: redis
      REDIS_URL: redis://127.0.0.1:6379
    volumes:
      - redis-data-single:/data
```

Two-container deployment with a separate Redis service:

```bash
docker compose up -d
```

```yaml
services:
  luma:
    image: ${LUMA_IMAGE:-luma:multi}
    container_name: luma
    restart: unless-stopped
    ports:
      - '3000:3000'
    env_file:
      - .env.docker
    environment:
      NEXT_PUBLIC_STORAGE_TYPE: redis
      REDIS_URL: redis://luma-redis:6379
      DOCKER_ENV: 'true'
    depends_on:
      - luma-redis

  luma-redis:
    image: redis:7-alpine
    container_name: luma-redis
    restart: unless-stopped
    command: ['redis-server', '--appendonly', 'yes']
    volumes:
      - redis-data:/data
```

## Environment Variables

| Variable                         | Description                                     | Accepted Values                          | Default                |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------- | ---------------------- |
| `USERNAME`                       | Owner account for non-localStorage deployments  | Any string                               | Empty                  |
| `PASSWORD`                       | Access password or owner password               | Any string                               | Empty                  |
| `SITE_NAME`                      | Site name                                       | Any string                               | `Luma`                 |
| `ANNOUNCEMENT`                   | Site announcement                               | Any string                               | Built-in safety notice |
| `NEXT_PUBLIC_STORAGE_TYPE`       | Storage backend for favorites and watch history | `localstorage`, `redis`, `d1`, `upstash` | `localstorage`         |
| `REDIS_URL`                      | Redis connection URL                            | Redis URL                                | Empty                  |
| `UPSTASH_URL`                    | Upstash Redis REST URL                          | URL                                      | Empty                  |
| `UPSTASH_TOKEN`                  | Upstash Redis token                             | Token                                    | Empty                  |
| `NEXT_PUBLIC_ENABLE_REGISTER`    | Enable public registration                      | `true`, `false`                          | `false`                |
| `TMDB_API_KEY`                   | Server-side TMDB API key                        | TMDB key                                 | Empty                  |
| `NEXT_PUBLIC_TMDB_API_KEY`       | Client-side fallback TMDB API key               | TMDB key                                 | Empty                  |
| `TMDB_API_BASE_URL`              | TMDB API proxy base URL                         | URL                                      | Official TMDB API      |
| `TURNSTILE_SECRET_KEY`           | Cloudflare Turnstile server secret              | Secret key                               | Empty                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key                   | Site key                                 | Empty                  |

## Admin Panel

The admin panel is mainly intended for non-localStorage deployments. After setting `USERNAME` and `PASSWORD`, that account becomes the owner account.

Owners and admins can open `/admin` to manage:

- Users and permissions
- TMDB Discover categories and site settings
- Registration and announcements

## Security and Privacy

### Set a password and keep public registration closed

To reduce privacy and legal risk, set `PASSWORD` before deployment and keep `NEXT_PUBLIC_ENABLE_REGISTER=false` unless you explicitly need public registration.

- **Avoid public exposure**: An instance without a password may be accessible by anyone.
- **Protect personal data**: Watch history, favorites, and search history are personal data.
- **Reduce copyright risk**: A public video search service may receive complaints or be abused.
- **Follow local laws**: Make sure your deployment and usage comply with your local regulations.

### Important Notice

- This project is intended for learning, research, and personal use only.
- This project does not store video files. Metadata comes from TMDB, and playback uses the configured TMDB player embed.
- Do not use deployed instances for commercial services or public distribution.
- Users are responsible for any risk caused by deployment, sharing, or usage.
