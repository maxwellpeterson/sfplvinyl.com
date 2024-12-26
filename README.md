# sfplvinyl.com

Find your top Spotify tracks on vinyl at the San Francisco Public Library.

## Usage

**Note:** A Spotify account is required to use this application.

1. Visit [sfplvinyl.com](https://sfplvinyl.com)
2. Click the "Connect to Spotify" button
3. Grant Spotify permissions (permission scope is limited to just one API endpoint)
4. You will be redirected to [sfplvinyl.com/search](https://sfplvinyl.com/search) and should see your results appear shortly

## How It Works

This application is built with [Remix](https://remix.run/) and deployed with [Cloudflare Workers](https://workers.cloudflare.com/). It uses [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Workflows](https://developers.cloudflare.com/workflows/), [Workers AI](https://developers.cloudflare.com/workers-ai/), and [Vectorize](https://developers.cloudflare.com/vectorize/) to continuously collect, index, and search all of the LPs available at the San Francisco Public Library (currently about 6,000 distinct titles).

## Local Development

You'll need to create and configure your own [Spotify OAuth app](https://developer.spotify.com/documentation/web-api/concepts/apps) before running this application locally. Make sure to add `http://localhost:5173/oauth/callback` as a redirect URI and add the email address associated with your Spotify account to the authorized user list.

After cloning the repository and running `npm install`, copy `.dev.vars.template` to `.dev.vars` and open `.dev.vars` for editing. Set `OAUTH_CLIENT_SECRET` to the client secret found in the Spotify developer dashboard, and set `SESSION_SIGNING_SECRET` to some random string, such as the output of `openssl rand -hex 16`. At this point you can run `npm run dev`, open up a browser, and begin hacking.
